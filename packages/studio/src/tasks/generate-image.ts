// Per-model child task fanned out by "generate-request". Owns one RunPod job
// end to end: submit (webhook-armed) -> wait for the webhook or a 10m timeout
// -> re-read the authoritative status from RunPod either way (the webhook
// body itself is never trusted) -> post-process -> persist. Moved from
// trigger/generate-image.ts.
//
// maxAttempts is pinned to 1: a Trigger.dev-driven retry would resubmit a
// fresh RunPod job (new job id, new spend) on top of one that may still be
// running or already billed. Every failure path below fails the row and
// refunds explicitly instead of throwing, so a retry is never needed for
// normal failures; onFailure is only the safety net for an actual crash.

import { logger, metadata, schemaTask, wait } from "@trigger.dev/sdk";
import { z } from "zod";
import { RATIO_KEYS, type StudioConfig } from "../config/types";
import type { TaskGenerationQueries } from "./generation-queries";
import type { NotifyGenerationTask } from "./notify-generation";
import { postProcessImages, type RunpodImage } from "./post-process";
import { RATIO_TO_ASPECT_RATIO, submitRun } from "./runpod-client";
import {
  createRunpodStatusHelpers,
  type RunpodStatusBase,
  TERMINAL_FAILURES,
} from "./runpod-status";

export const generateImagePayloadSchema = z.object({
  requestId: z.uuid(),
  generationId: z.uuid(),
  userId: z.string(),
  modelId: z.string(),
  prompt: z.string().min(1),
  originalPrompt: z.string().optional(),
  moderationAction: z.enum(["allow", "rewrite"]),
  moderatedPrompt: z.string().optional(),
  seed: z.number().int(),
  priceCoins: z.number().int().nonnegative(),
  ratio: z.enum(RATIO_KEYS),
  loras: z.array(z.string()).default([]),
  // Pose bytes always arrive via poseImageKey; posePreset additionally
  // carries the preset's public path so the row displays it instead of the
  // staged copy's URL.
  posePreset: z.string().optional(),
  poseImageKey: z.string().optional(),
  referenceImageKey: z.string().optional(),
  // Row's createdAt (ISO string) — keeps the post-processed image keys
  // identical to the pre-migration naming.
  createdAt: z.string(),
  traceHeaders: z.record(z.string(), z.string()).default({}),
});

export type GenerateImagePayload = z.infer<typeof generateImagePayloadSchema>;

interface RunpodStatus extends RunpodStatusBase {
  output?: { images?: RunpodImage[] };
}

export function createGenerateImageTask(
  config: StudioConfig,
  queries: TaskGenerationQueries,
  notifyGeneration: NotifyGenerationTask
) {
  const { readTerminalStatus, failRun } = createRunpodStatusHelpers(
    config,
    queries
  );

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one RunPod job's linear submit -> wait -> status -> post-process lifecycle with early-return failure branches at each step; splitting it would scatter that single sequence across multiple functions for no safety benefit.
  async function runGenerateImage(
    payload: GenerateImagePayload
  ): Promise<void> {
    logger.info("generate-image received", { ...payload });

    // The client subscribes with payload/output skipped, so the row this run
    // belongs to is exposed through metadata (drives the live step overlay).
    metadata.set("generationId", payload.generationId);

    // A cancel from the UI can land before this child run even exists (the
    // fan-out hasn't happened yet), so there is no run to cancel and only the
    // row records it. Re-read the row and bail before any submit/charge.
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

    const model = config.models.find((m) => m.id === payload.modelId);
    if (!model) {
      logger.error("unknown model", { modelId: payload.modelId });
      metadata.set("step", "failed").set("failReason", "unknown_model");
      await queries.markFailed(
        payload.userId,
        payload.generationId,
        "unknown_model"
      );
      return;
    }
    metadata.set("step", "downloading-inputs");
    const [poseImage, referenceImage] = await logger.trace(
      "download-control-inputs",
      async (span) => {
        const images = await Promise.all([
          payload.poseImageKey
            ? config.storage.getBase64(payload.poseImageKey)
            : Promise.resolve(undefined),
          payload.referenceImageKey
            ? config.storage.getBase64(payload.referenceImageKey)
            : Promise.resolve(undefined),
        ]);
        span.setAttribute("pose.bytes", images[0]?.length ?? 0);
        span.setAttribute("reference.bytes", images[1]?.length ?? 0);
        return images;
      }
    );

    const token = await wait.createToken({ timeout: "10m" });

    metadata.set("step", "submitting");
    let submitted: Awaited<ReturnType<typeof submitRun>>;
    try {
      submitted = await logger.trace("runpod-submit", async (span) => {
        span.setAttribute("modelId", payload.modelId);
        span.setAttribute("input.prompt", payload.prompt);
        span.setAttribute("input.seed", payload.seed);
        span.setAttribute(
          "input.aspectRatio",
          RATIO_TO_ASPECT_RATIO[payload.ratio]
        );
        span.setAttribute("input.loras", payload.loras.join(","));
        span.setAttribute("input.hasPoseImage", Boolean(poseImage));
        span.setAttribute("input.hasReferenceImage", Boolean(referenceImage));
        const result = await submitRun(
          config.runpod,
          payload.modelId,
          model.workflow,
          {
            prompt: payload.prompt,
            seed: payload.seed,
            poseImage,
            referenceImage,
            loras: payload.loras,
            aspect_ratio: RATIO_TO_ASPECT_RATIO[payload.ratio],
          },
          token.url
        );
        span.setAttribute("output.jobId", result.id);
        return result;
      });
    } catch (err) {
      logger.error("runpod submit failed", {
        err,
        modelId: payload.modelId,
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

    // Persist the job id (and control-input previews) *before* spending coins:
    // onFailure's refund path only knows to refund a crash by reading the row's
    // runpodJobId back from the DB, so that column must already be durably
    // attached by the time the charge lands — otherwise a crash between the
    // charge and the attach would spend coins onFailure can never find and
    // refund. billing.refund is itself a no-op when nothing was actually
    // charged, so attaching first never risks a phantom refund.
    // Control-input previews: the API route staged these bytes at their final
    // key inside the generation's folder, so the row just records the public
    // URL — no re-upload. A preset pose displays its public path instead.
    const referenceImageUrl = payload.referenceImageKey
      ? config.storage.publicUrl(payload.referenceImageKey)
      : undefined;
    const customPoseUrl = payload.poseImageKey
      ? config.storage.publicUrl(payload.poseImageKey)
      : undefined;

    await queries.attachRunpodJob(payload.userId, payload.generationId, {
      runpodJobId: jobId,
      prompt: payload.prompt,
      originalPrompt: payload.originalPrompt,
      moderationAction: payload.moderationAction,
      moderatedPrompt: payload.moderatedPrompt,
      referenceImageUrl,
      pose: payload.posePreset ?? customPoseUrl,
    });
    // Set only after the DB attach above: the client invalidates its generation
    // list when this metadata appears, and the refetch must see the row's
    // runpodJobId (the "Queued…" → "Generating…" flip).
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

    // The webhook is a signal only, its body is never read: whether it fires
    // (ok: true) or the token times out (ok: false), the real state is always
    // re-read from RunPod below.
    metadata.set("step", "generating");
    const waited = await wait.forToken(token);
    logger.info("wait resolved", { webhookFired: waited.ok, jobId });

    let status: RunpodStatus;
    try {
      status = await readTerminalStatus<RunpodStatus>(
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
      // Still non-terminal once the wait resolved: either the 10m token timed
      // out (expected case) or the webhook fired ahead of an eventually-
      // consistent status read. Either way, don't hold the task open further —
      // fail and refund rather than poll indefinitely.
      await failRun(payload, jobId, "timed_out", {
        runpodStatus: status.status,
        delayTimeMs: status.delayTime,
        executionTimeMs: status.executionTime,
        workerId: status.workerId,
      });
      return;
    }

    metadata.set("step", "post-processing");
    const urls = await logger.trace("post-process", async (span) => {
      const rawImages = status.output?.images ?? [];
      span.setAttribute("input.imageCount", rawImages.length);
      const images = await postProcessImages(
        config,
        rawImages,
        payload.generationId,
        new Date(payload.createdAt)
      );
      const uploaded = images
        .map((img) => img.url)
        .filter((url): url is string => Boolean(url));
      span.setAttribute("output.urls", uploaded.join(","));
      return uploaded;
    });
    if (urls.length === 0) {
      await failRun(payload, jobId, "no_images", {
        runpodStatus: status.status,
        delayTimeMs: status.delayTime,
        executionTimeMs: status.executionTime,
        workerId: status.workerId,
      });
      return;
    }

    const completed = await queries.markCompleted(
      payload.userId,
      payload.generationId,
      urls,
      {
        runpodStatus: status.status,
        delayTimeMs: status.delayTime,
        executionTimeMs: status.executionTime,
        workerId: status.workerId,
      }
    );
    // Flushed the moment the row is written: the client treats this step as
    // terminal, so it refetches now instead of waiting out the notify tail
    // below and the run record's own completion. A flush failure is
    // non-fatal — the run finishing delivers the same signal moments later.
    metadata.set("step", "completed");
    await metadata
      .flush()
      .catch((err) => logger.warn("metadata flush failed", { err }));
    if (completed) {
      // Fire-and-forget: only the trigger call is awaited — the notify
      // sidecar (email lookup + image re-upload) runs in its own task so the
      // UI, which watches this run for completion, isn't delayed by it.
      await notifyGeneration.trigger({
        generationId: payload.generationId,
        userId: payload.userId,
        modelId: payload.modelId,
        priceCoins: payload.priceCoins,
        kind: "image",
        resultUrls: urls,
        executionTimeMs: status.executionTime,
      });
    }
    logger.info("generation completed", {
      generationId: payload.generationId,
      jobId,
      urls,
      executionTimeMs: status.executionTime,
      delayTimeMs: status.delayTime,
    });
  }

  return schemaTask({
    id: "generate-image",
    schema: generateImagePayloadSchema,
    retry: { maxAttempts: 1 },
    run: runGenerateImage,
    onFailure: async ({ payload, error }) => {
      logger.error("generate-image task failed", {
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

export type GenerateImageTask = ReturnType<typeof createGenerateImageTask>;
