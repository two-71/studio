// Image-to-video child task, triggered directly by the "generate/video" route
// (no orchestrator: a video run has no enhance/moderate pipeline and no
// fan-out). Owns one RunPod job end to end, mirroring generate-image: submit
// (webhook-armed) -> wait for the webhook or timeout -> re-read the
// authoritative status -> upload the mp4 -> persist. Moved from
// trigger/generate-video.ts (spec §10 A2.3).
//
// maxAttempts is pinned to 1 for the same reason as generate-image: a retry
// would resubmit a fresh RunPod job (new job id, new spend) on top of one that
// may still be running or already billed.

import { logger, metadata, schemaTask, wait } from "@trigger.dev/sdk";
import { z } from "zod";
import type { StudioConfig } from "../config/types";
import type { TaskGenerationQueries } from "./generation-queries";
import type { NotifyGenerationTask } from "./notify-generation";
import { submitVideoRun } from "./runpod-client";
import {
  createRunpodStatusHelpers,
  type RunpodStatusBase,
  TERMINAL_FAILURES,
} from "./runpod-status";

export const generateVideoPayloadSchema = z.object({
  requestId: z.uuid(),
  generationId: z.uuid(),
  userId: z.string(),
  modelId: z.string(),
  prompt: z.string().min(1),
  seed: z.number().int(),
  priceCoins: z.number().int().nonnegative(),
  durationSeconds: z.number().int().positive(),
  // Storage keys of the source image, tried in order: the clean
  // (unwatermarked) copy first, then the public copy for legacy rows without
  // a clean sibling.
  sourceImageKeys: z.array(z.string()).min(1),
  // Row's createdAt (ISO string) — used for the result mp4 key, mirroring the
  // image result naming.
  createdAt: z.string(),
});

export type GenerateVideoPayload = z.infer<typeof generateVideoPayloadSchema>;

interface RunpodVideoStatus extends RunpodStatusBase {
  output?: { videos?: Array<{ data?: string; filename?: string }> };
}

// First key that resolves wins; every candidate failing throws the last error.
async function downloadSourceImage(
  config: StudioConfig,
  keys: string[]
): Promise<string> {
  let lastError: unknown;
  for (const key of keys) {
    try {
      return await config.storage.getBase64(key);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export function createGenerateVideoTask(
  config: StudioConfig,
  queries: TaskGenerationQueries,
  notifyGeneration: NotifyGenerationTask
) {
  const { readTerminalStatus, failRun } = createRunpodStatusHelpers(
    config,
    queries
  );

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one RunPod job's linear submit -> wait -> status -> upload lifecycle with early-return failure branches at each step; splitting it would scatter that single sequence across multiple functions for no safety benefit.
  async function runGenerateVideo(
    payload: GenerateVideoPayload
  ): Promise<void> {
    logger.info("generate-video received", { ...payload });

    // The client subscribes with payload/output skipped, so the row this run
    // belongs to is exposed through metadata (drives the live step overlay).
    metadata.set("generationId", payload.generationId);

    // A cancel can land before this run starts; bail before any submit/charge.
    const existing = await queries.findGeneration(
      payload.userId,
      payload.generationId
    );
    if (!existing || existing.status !== "pending" || existing.deletedAt) {
      logger.info("generation no longer pending, skipping", {
        generationId: payload.generationId,
        status: existing?.status,
      });
      metadata.set("step", "skipped");
      return;
    }

    const video = config.video;
    if (!video) {
      logger.error("video not configured", { modelId: payload.modelId });
      metadata.set("step", "failed").set("failReason", "unknown_model");
      await queries.markFailed(
        payload.userId,
        payload.generationId,
        "unknown_model"
      );
      return;
    }

    metadata.set("step", "downloading-inputs");
    let sourceImage: string;
    try {
      sourceImage = await downloadSourceImage(config, payload.sourceImageKeys);
    } catch (err) {
      logger.error("source image download failed", {
        err,
        keys: payload.sourceImageKeys,
      });
      metadata.set("step", "failed").set("failReason", "source_missing");
      await queries.markFailed(
        payload.userId,
        payload.generationId,
        "source_missing"
      );
      return;
    }

    // Video runs take minutes (≈4.5m of GPU for a 15s clip), so the webhook
    // window is wider than the image task's 10m.
    const token = await wait.createToken({ timeout: "20m" });

    metadata.set("step", "submitting");
    let submitted: Awaited<ReturnType<typeof submitVideoRun>>;
    try {
      submitted = await logger.trace("runpod-submit", async (span) => {
        span.setAttribute("modelId", payload.modelId);
        span.setAttribute("input.prompt", payload.prompt);
        span.setAttribute("input.seed", payload.seed);
        span.setAttribute("input.durationSeconds", payload.durationSeconds);
        const result = await submitVideoRun(
          config.runpod,
          payload.modelId,
          video.workflow,
          {
            prompt: payload.prompt,
            seed: payload.seed,
            sourceImage,
            frames: payload.durationSeconds * video.fps,
          },
          token.url
        );
        span.setAttribute("output.jobId", result.id);
        return result;
      });
    } catch (err) {
      logger.error("runpod video submit failed", {
        err,
        generationId: payload.generationId,
      });
      metadata.set("step", "failed").set("failReason", "submit_failed");
      await queries.markFailed(
        payload.userId,
        payload.generationId,
        "submit_failed"
      );
      return;
    }
    const jobId = submitted.id;

    // Attach before spending, for the same crash-refund reasoning as
    // generate-image (onFailure finds the charge through the row's runpodJobId).
    await queries.attachRunpodJob(payload.userId, payload.generationId, {
      runpodJobId: jobId,
      prompt: payload.prompt,
      moderationAction: "allow",
    });
    // Set only after the DB attach: the client's refetch on this metadata must
    // see the row's runpodJobId (the "Queued…" → "Generating…" flip).
    metadata.set("runpodJobId", jobId);

    const charged = await config.billing.charge(
      payload.userId,
      payload.priceCoins,
      jobId
    );
    if (charged !== "ok") {
      logger.error("coin spend failed", {
        generationId: payload.generationId,
        jobId,
        priceCoins: payload.priceCoins,
      });
      metadata.set("step", "failed").set("failReason", "insufficient_coins");
      await queries.markFailed(
        payload.userId,
        payload.generationId,
        "insufficient_coins"
      );
      return;
    }
    logger.info("coins charged, waiting for runpod webhook", {
      jobId,
      priceCoins: payload.priceCoins,
      tokenId: token.id,
    });

    // The webhook is a signal only; the real state is re-read from RunPod.
    metadata.set("step", "generating");
    const waited = await wait.forToken(token);
    logger.info("wait resolved", { webhookFired: waited.ok, jobId });

    let status: RunpodVideoStatus;
    try {
      status = await readTerminalStatus<RunpodVideoStatus>(
        payload.modelId,
        jobId,
        waited.ok
      );
    } catch (err) {
      logger.error("runpod status check failed", { err, jobId });
      await failRun(payload, jobId, "status_check_failed");
      return;
    }

    if (TERMINAL_FAILURES.has(status.status ?? "")) {
      const reason =
        status.error || `run_${(status.status ?? "").toLowerCase()}`;
      await failRun(payload, jobId, reason, {
        runpodStatus: status.status,
        delayTimeMs: status.delayTime,
        executionTimeMs: status.executionTime,
        workerId: status.workerId,
      });
      return;
    }

    if (status.status !== "COMPLETED") {
      await failRun(payload, jobId, "timed_out", {
        runpodStatus: status.status,
        delayTimeMs: status.delayTime,
        executionTimeMs: status.executionTime,
        workerId: status.workerId,
      });
      return;
    }

    metadata.set("step", "post-processing");
    const videoOutput = status.output?.videos?.find((v) => v.data);
    if (!videoOutput?.data) {
      await failRun(payload, jobId, "no_videos", {
        runpodStatus: status.status,
        delayTimeMs: status.delayTime,
        executionTimeMs: status.executionTime,
        workerId: status.workerId,
      });
      return;
    }
    // No watermark pass for video (PoC) — the mp4 is uploaded as-is, named like
    // the image results.
    const url = await logger.trace("upload-video", async (span) => {
      const stem = `${new Date(payload.createdAt).getTime()}-1`;
      const key = `${payload.generationId}/${stem}.mp4`;
      await config.storage.upload(
        key,
        Buffer.from(videoOutput.data ?? "", "base64"),
        "video/mp4"
      );
      const uploaded = config.storage.publicUrl(key);
      span.setAttribute("output.url", uploaded);
      return uploaded;
    });

    const completed = await queries.markCompleted(
      payload.userId,
      payload.generationId,
      [url],
      {
        runpodStatus: status.status,
        delayTimeMs: status.delayTime,
        executionTimeMs: status.executionTime,
        workerId: status.workerId,
      }
    );
    // Flushed the moment the row is written: the client treats this step as
    // terminal, so it refetches now instead of waiting out the notify tail
    // below and the run record's own completion. A flush failure is non-fatal —
    // the run finishing delivers the same signal moments later.
    metadata.set("step", "completed");
    await metadata
      .flush()
      .catch((err) => logger.warn("metadata flush failed", { err }));
    if (completed) {
      // Fire-and-forget: only the trigger call is awaited — the notify
      // sidecar (email lookup + mp4 re-upload) runs in its own task so the
      // UI, which watches this run for completion, isn't delayed by it.
      await notifyGeneration.trigger({
        generationId: payload.generationId,
        userId: payload.userId,
        modelId: payload.modelId,
        priceCoins: payload.priceCoins,
        kind: "video",
        resultUrls: [url],
        executionTimeMs: status.executionTime,
      });
    }
    logger.info("video generation completed", {
      generationId: payload.generationId,
      jobId,
      url,
      executionTimeMs: status.executionTime,
      delayTimeMs: status.delayTime,
    });
  }

  return schemaTask({
    id: "generate-video",
    schema: generateVideoPayloadSchema,
    retry: { maxAttempts: 1 },
    run: runGenerateVideo,
    onFailure: async ({ payload, error }) => {
      logger.error("generate-video task failed", {
        error,
        generationId: payload.generationId,
      });
      const won = await queries.markFailed(
        payload.userId,
        payload.generationId,
        "task_failed"
      );
      if (won?.runpodJobId) {
        await config.billing.refund(payload.userId, won.runpodJobId);
      }
    },
  });
}

export type GenerateVideoTask = ReturnType<typeof createGenerateVideoTask>;
