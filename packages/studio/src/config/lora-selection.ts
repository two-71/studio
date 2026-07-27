// Shared codec for a user's LoRA selection. A selection travels as a plain
// string — "id" or "id@strength" when the weight differs from the LoRA's
// default — so the DB column (text[]) and the task payloads keep their
// pre-slider string shape. Pure module: imported by route handlers, trigger
// tasks and client components alike.

import type { LoraSpec } from "./types";

export interface LoraSelection {
  id: string;
  // Absent = use the LoRA's default strength.
  strength?: number;
}

export function decodeLoraSelection(value: string): LoraSelection {
  const at = value.lastIndexOf("@");
  if (at === -1) {
    return { id: value };
  }
  const strength = Number(value.slice(at + 1));
  return Number.isFinite(strength)
    ? { id: value.slice(0, at), strength }
    : { id: value };
}

export function encodeLoraSelection(selection: LoraSelection): string {
  return selection.strength === undefined
    ? selection.id
    : `${selection.id}@${selection.strength}`;
}

export function defaultLoraStrength(lora: LoraSpec): number {
  return lora.strengthRange?.default ?? lora.strength ?? 1;
}

// The strength actually sent to the workflow: sliders clamp the requested
// value to their range; fixed-weight LoRAs ignore the request entirely.
export function resolveLoraStrength(
  lora: LoraSpec,
  requested?: number
): number {
  if (lora.strengthRange && requested !== undefined) {
    return Math.min(
      lora.strengthRange.max,
      Math.max(lora.strengthRange.min, requested)
    );
  }
  return defaultLoraStrength(lora);
}
