// The package's own enhance/title LLM calls, run through the Vercel AI SDK.
// A host supplies only a `LanguageModel` (which already carries the provider,
// model name, base URL and API key) plus an optional system prompt override —
// the call itself, including the enhancer's multimodal message assembly, lives
// here.
//
// Both runners are best-effort: a provider error can never fail a generation,
// so they fall back to the original prompt (enhance) or null (title). This is
// the opposite of the moderation seam, which stays fail-closed.

import { type FilePart, generateText, type TextPart } from "ai";
import type { PromptSpec } from "../config/types";
import {
  ENHANCE_SYSTEM,
  LORA_BLOCK,
  POSE_BLOCK,
  REFERENCE_BLOCK,
  TITLE_SYSTEM,
} from "./prompts";

// Per-request context the enhancer folds into its system prompt and message:
// the request's control images (pure base64, no data-URL prefix) and the
// trigger words of the LoRAs it enabled. Resolved by the orchestrator against
// the configured models — internal to the package.
export interface EnhanceContext {
  referenceImage?: string;
  poseImage?: string;
  triggerWords?: string[];
}

// Function replacements sidestep `$&`-style substitution patterns in block
// text being interpreted by String.replaceAll.
function fillPlaceholder(
  text: string,
  placeholder: string,
  value: string
): string {
  return text.replaceAll(placeholder, () => value);
}

function buildEnhanceSystem(
  base: string,
  { referenceImage, poseImage, triggerWords = [] }: EnhanceContext
): string {
  const loraBlock =
    triggerWords.length > 0
      ? fillPlaceholder(
          LORA_BLOCK,
          "{{TRIGGER_WORDS}}",
          triggerWords.map((words) => `"${words.trim()}"`).join("; ")
        )
      : "";

  let system = fillPlaceholder(
    base,
    "{{REFERENCE_BLOCK}}",
    referenceImage ? REFERENCE_BLOCK : ""
  );
  system = fillPlaceholder(
    system,
    "{{POSE_BLOCK}}",
    poseImage ? POSE_BLOCK : ""
  );
  return fillPlaceholder(system, "{{LORA_BLOCK}}", loraBlock);
}

// Rewrites the typed prompt through the enhancement model. Any failure falls
// back to the original prompt so enhancement can never block a generation.
export async function runEnhance(
  spec: PromptSpec,
  prompt: string,
  context: EnhanceContext = {}
): Promise<string> {
  const system = buildEnhanceSystem(spec.system ?? ENHANCE_SYSTEM, context);

  const content: Array<TextPart | FilePart> = [];
  if (context.referenceImage) {
    content.push(
      { type: "text", text: "Reference image:" },
      { type: "file", mediaType: "image", data: context.referenceImage }
    );
  }
  if (context.poseImage) {
    content.push(
      { type: "text", text: "Pose depth map:" },
      { type: "file", mediaType: "image", data: context.poseImage }
    );
  }
  content.push({ type: "text", text: prompt });

  try {
    const { text } = await generateText({
      model: spec.model,
      system,
      messages: [{ role: "user", content }],
    });
    return text.trim() || prompt;
  } catch (err) {
    console.error("prompt enhancement failed", err);
    return prompt;
  }
}

// Best-effort short gallery title. Returns null on any failure or empty output
// so the caller can fall back to a prompt excerpt.
export async function runTitle(
  spec: PromptSpec,
  prompt: string
): Promise<string | null> {
  try {
    const { text } = await generateText({
      model: spec.model,
      system: spec.system ?? TITLE_SYSTEM,
      prompt,
    });
    return text.trim() || null;
  } catch (err) {
    console.error("title generation failed", err);
    return null;
  }
}
