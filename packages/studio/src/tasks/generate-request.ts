// Orchestrator triggered once per Studio "Generate" click. Runs the shared
// prompt pipeline (enhance -> moderate, fail-closed) once, then fans one
// "generate-image" child out per requested model/row. Each child owns its
// own RunPod job, coin spend, and terminal write independently — this task's
// only job is the shared prompt work and the fan-out. Moved from
// trigger/generate-request.ts.

import { logger, metadata, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { runEnhance } from "../ai/prompt-runners";
import { RATIO_KEYS, type StudioConfig } from "../config/types";
import type { GenerateImagePayload, GenerateImageTask } from "./generate-image";
import type { GenerateTitleTask } from "./generate-title";
import type { TaskGenerationQueries } from "./generation-queries";

const generationRowSchema = z.object({
  generationId: z.uuid(),
  modelId: z.string(),
  seed: z.number().int(),
  priceCoins: z.number().int().nonnegative(),
  // Row's createdAt (ISO string), returned by createGeneration at insert
  // time — threaded through to each child for its result image keys.
  createdAt: z.string(),
});

export const generateRequestPayloadSchema = z.object({
  requestId: z.uuid(),
  userId: z.string(),
  prompt: z.string().min(1),
  enhance: z.boolean().default(false),
  ratio: z.enum(RATIO_KEYS),
  loras: z.array(z.string()).default([]),
  posePreset: z.string().optional(),
  // Storage object keys the route staged the control images under (too large
  // for a Trigger.dev payload) — e.g. "<generationId>/pose.png".
  poseImageKey: z.string().optional(),
  referenceImageKey: z.string().optional(),
  generations: z.array(generationRowSchema).min(1),
  traceHeaders: z.record(z.string(), z.string()).default({}),
});

export type GenerateRequestPayload = z.infer<
  typeof generateRequestPayloadSchema
>;

export function createGenerateRequestTask(
  config: StudioConfig,
  queries: TaskGenerationQueries,
  generateImage: GenerateImageTask,
  generateTitle: GenerateTitleTask
) {
  async function runRequest(payload: GenerateRequestPayload): Promise<void> {
    const ids = payload.generations.map((row) => row.generationId);

    logger.info("generate-request received", { ...payload });

    // Fire-and-forget: the title generates and saves itself in a sidecar task,
    // concurrent with enhance/moderation. Only the trigger call is awaited —
    // the pipeline never waits for the title itself.
    const titleHandle = await generateTitle.trigger({
      userId: payload.userId,
      generationIds: ids,
      prompt: payload.prompt,
      traceHeaders: {},
    });
    logger.info("generate-title triggered", { runId: titleHandle.id });

    // The control images are only consumed by the enhancer below (the children
    // download their own copies), so skip the multi-MB fetches when enhancement
    // is off.
    metadata.set("step", "downloading-inputs");
    const [poseImage, referenceImage] = payload.enhance
      ? await logger.trace("download-control-inputs", async (span) => {
          const images = await Promise.all([
            payload.poseImageKey
              ? config.storage.getBase64(payload.poseImageKey)
              : undefined,
            payload.referenceImageKey
              ? config.storage.getBase64(payload.referenceImageKey)
              : undefined,
          ]);
          span.setAttribute("pose.bytes", images[0]?.length ?? 0);
          span.setAttribute("reference.bytes", images[1]?.length ?? 0);
          return images;
        })
      : [undefined, undefined];

    // Enhance and moderate run concurrently, both over the user's typed
    // prompt; the pipeline waits for both before fanning out. Moderation
    // therefore gates the user's intent, not the enhancer's output — the
    // enhancer is our own constrained system prompt over an already-moderated
    // intent. On "rewrite" the enhancement is discarded: it was built from a
    // prompt moderation said needed rewriting.
    metadata.set("step", "processing-prompt");
    const enhanceSpec = config.prompts?.enhance;
    const enhancePromise: Promise<string> =
      payload.enhance && enhanceSpec
        ? logger.trace("enhance-prompt", async (span) => {
            span.setAttribute("input.prompt", payload.prompt);
            // Searched across every configured model's loras (not just one
            // "control" model) since the config carries no explicit notion of
            // which model a lora id belongs to — mirrors the flat LORAS
            // lookup this replaces.
            const triggerWords = config.models
              .flatMap((model) => model.loras ?? [])
              .filter((lora) => payload.loras.includes(lora.id))
              .map((lora) => lora.triggerWords)
              .filter((words): words is string => Boolean(words));
            const out = await runEnhance(enhanceSpec, payload.prompt, {
              referenceImage,
              poseImage,
              triggerWords,
            });
            span.setAttribute("output.prompt", out);
            span.setAttribute("output.changed", out !== payload.prompt);
            return out;
          })
        : Promise.resolve(payload.prompt);
    const moderatePromise = logger.trace("moderate-prompt", async (span) => {
      span.setAttribute("input.prompt", payload.prompt);
      const result = await config.moderation.check({
        prompt: payload.prompt,
        userId: payload.userId,
      });
      span.setAttribute("output.action", result.action);
      if (result.action === "allow" && result.rewritten) {
        span.setAttribute("output.rewritten", result.rewritten);
      }
      if (result.action === "block" && result.reason) {
        span.setAttribute("output.reason", result.reason);
      }
      return result;
    });

    // enhance is best-effort and falls back to the original prompt when
    // unset, so a rejection here is the fail-closed moderation path.
    let enhanced: string;
    let moderated: Awaited<ReturnType<typeof config.moderation.check>>;
    try {
      [enhanced, moderated] = await Promise.all([
        enhancePromise,
        moderatePromise,
      ]);
    } catch (err) {
      logger.error("prompt moderation failed", { err, prompt: payload.prompt });
      metadata
        .set("step", "failed")
        .set("failReason", "moderation_unavailable");
      await queries.markManyFailed(
        payload.userId,
        ids,
        "moderation_unavailable"
      );
      return;
    }

    if (moderated.action === "block") {
      logger.warn("prompt blocked by moderation", { prompt: payload.prompt });
      metadata.set("step", "failed").set("failReason", "content_policy");
      // Block audit is the moderation provider's responsibility,
      // so this task doesn't record it directly.
      await queries.markManyFailed(payload.userId, ids, "content_policy");
      return;
    }

    const finalPrompt = moderated.rewritten ?? enhanced;
    const originalPrompt =
      finalPrompt === payload.prompt ? undefined : payload.prompt;
    const moderationAction: "allow" | "rewrite" = moderated.rewritten
      ? "rewrite"
      : "allow";
    const moderatedPrompt = moderated.rewritten;

    const childItems = payload.generations.map((row) => ({
      payload: {
        requestId: payload.requestId,
        generationId: row.generationId,
        userId: payload.userId,
        modelId: row.modelId,
        prompt: finalPrompt,
        originalPrompt,
        moderationAction,
        moderatedPrompt,
        seed: row.seed,
        priceCoins: row.priceCoins,
        ratio: payload.ratio,
        loras: payload.loras,
        posePreset: payload.posePreset,
        poseImageKey: payload.poseImageKey,
        referenceImageKey: payload.referenceImageKey,
        createdAt: row.createdAt,
        traceHeaders: {},
      } satisfies GenerateImagePayload,
      // The per-row gen_ tag lets the cancel endpoint find and cancel a single
      // child run without storing its run id.
      options: {
        tags: [`req_${payload.requestId}`, `gen_${row.generationId}`],
      },
    }));

    metadata.set("step", "fanning-out");
    logger.info("final prompt resolved", {
      finalPrompt,
      moderationAction,
      moderatedPrompt,
      originalPrompt,
    });

    const batchHandle = await generateImage.batchTrigger(childItems);

    // Stamped after the batch trigger so the cards flip to "Queued…" when this
    // run's completion invalidates the client's generation list.
    await queries.markManyQueued(payload.userId, ids);

    logger.info("children triggered", {
      batchId: batchHandle.batchId,
      runCount: batchHandle.runCount,
      generationIds: ids,
    });
    metadata.set("step", "generating");
  }

  return schemaTask({
    id: "generate-request",
    schema: generateRequestPayloadSchema,
    // A retry would re-run enhance/moderate (harmless) but re-batch-trigger
    // children that may already be running their own RunPod jobs (double
    // submit). Every failure path above fails the batch explicitly instead of
    // throwing, so a single attempt is enough.
    retry: { maxAttempts: 1 },
    run: runRequest,
    onFailure: async ({ payload, error }) => {
      logger.error("generate-request task failed", {
        error,
        requestId: payload.requestId,
      });
      await queries.markManyFailed(
        payload.userId,
        payload.generations.map((row) => row.generationId),
        "task_failed"
      );
    },
  });
}

export type GenerateRequestTask = ReturnType<typeof createGenerateRequestTask>;
