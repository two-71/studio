// Fire-and-forget sidecar to "generate-image" / "generate-video": runs
// config.notify off the critical path, so the parent run — which the UI
// watches for completion — never waits on it. Moved from
// trigger/notify-generation.ts.

import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import type { StudioConfig } from "../config/types";

export const notifyGenerationPayloadSchema = z.object({
  generationId: z.uuid(),
  userId: z.string(),
  modelId: z.string(),
  priceCoins: z.number().int().nonnegative(),
  kind: z.enum(["image", "video"]).default("image"),
  resultUrls: z.array(z.string()).min(1),
  executionTimeMs: z.number().optional(),
});

export type NotifyGenerationPayload = z.infer<
  typeof notifyGenerationPayloadSchema
>;

export function createNotifyGenerationTask(config: StudioConfig) {
  return schemaTask({
    id: "notify-generation",
    schema: notifyGenerationPayloadSchema,
    machine: "micro",
    retry: { maxAttempts: 2 },
    run: async (payload) => {
      await config.notify?.({
        type: "completed",
        generation: {
          id: payload.generationId,
          userId: payload.userId,
          modelId: payload.modelId,
          mediaType: payload.kind,
          priceCoins: payload.priceCoins,
          resultUrls: payload.resultUrls,
          executionTimeMs: payload.executionTimeMs,
        },
      });
    },
  });
}

export type NotifyGenerationTask = ReturnType<
  typeof createNotifyGenerationTask
>;
