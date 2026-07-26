// Fire-and-forget sidecar for image and video requests: generates the 2-4 word
// gallery title from the user's typed prompt and stamps it on the request's
// rows whenever it's ready. Nothing waits on the generated title — a slow or
// failed title never delays or fails the generation pipeline. Moved from
// trigger/generate-title.ts.

import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import type { StudioConfig } from "../config/types";
import type { TaskGenerationQueries } from "./generation-queries";

export const generateTitlePayloadSchema = z.object({
  userId: z.string(),
  generationIds: z.array(z.uuid()).min(1),
  prompt: z.string().min(1),
  traceHeaders: z.record(z.string(), z.string()).default({}),
});

export type GenerateTitlePayload = z.infer<typeof generateTitlePayloadSchema>;

const EXCERPT_WORD_COUNT = 4;
const WHITESPACE_RE = /\s+/;

// Fallback when promptRunner.title isn't configured: a short
// excerpt of the typed prompt instead of an LLM call.
function excerptTitle(prompt: string): string {
  return prompt
    .trim()
    .split(WHITESPACE_RE)
    .slice(0, EXCERPT_WORD_COUNT)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function createGenerateTitleTask(
  config: StudioConfig,
  queries: TaskGenerationQueries
) {
  return schemaTask({
    id: "generate-title",
    schema: generateTitlePayloadSchema,
    machine: "micro",
    retry: { maxAttempts: 2 },
    run: async (payload) => {
      const title = await logger.trace("title-llm", async (span) => {
        span.setAttribute("input.prompt", payload.prompt);
        const out = config.promptRunner?.title
          ? await config.promptRunner.title(payload.prompt)
          : excerptTitle(payload.prompt);
        span.setAttribute("output.title", out ?? "");
        return out;
      });
      if (title) {
        await queries.setTitles(payload.userId, payload.generationIds, title);
      }
      logger.info("title saved", {
        title,
        generationIds: payload.generationIds,
      });
    },
  });
}

export type GenerateTitleTask = ReturnType<typeof createGenerateTitleTask>;
