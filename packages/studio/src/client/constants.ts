// Generic display constants sliced out of the host app's catalog module (plan
// §1): aspect ratios, resolution tiers, and the control-image upload cap
// apply to any host, unlike the model/LoRA/pose catalog itself (which stays
// host-side and is threaded through StudioClientConfig instead).

import type { RatioKey } from "../config/types";

export interface AspectRatio {
  key: RatioKey;
  /** Glyph dimensions (px) used to draw the proportion preview. */
  w: number;
  h: number;
}

export interface Resolution {
  key: "Standard" | "High" | "Ultra";
  sub: string;
}

export const ASPECT_RATIOS: AspectRatio[] = [
  { key: "1:1", w: 18, h: 18 },
  { key: "16:9", w: 22, h: 12 },
  { key: "9:16", w: 12, h: 22 },
  { key: "4:3", w: 20, h: 15 },
  { key: "3:4", w: 15, h: 20 },
  { key: "21:9", w: 24, h: 11 },
];

export const RESOLUTIONS: Resolution[] = [
  { key: "Standard", sub: "1K resolution" },
  { key: "High", sub: "2K resolution" },
  { key: "Ultra", sub: "4K resolution" },
];

// Largest raw control image. RunPod-style backends commonly cap request
// bodies around 10MiB and base64 inflates ~33%, so 7MB of file is a safe
// default for the largest control image that still fits alongside the
// prompt and the other control image.
export const MAX_CONTROL_IMAGE_BYTES = 7 * 1024 * 1024;

// Largest seed most ComfyUI-style workflows' seed nodes accept (2^50).
export const MAX_SEED = 1_125_899_906_842_624;

// Snaps arbitrary image dimensions to the closest supported ratio. Ratios are
// compared in log space so wide and tall shapes deviate symmetrically.
export function nearestRatio(width: number, height: number): RatioKey {
  const target = Math.log(width / height);
  let best: RatioKey = "1:1";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const { key } of ASPECT_RATIOS) {
    const [w = 1, h = 1] = key.split(":").map(Number);
    const distance = Math.abs(Math.log(w / h) - target);
    if (distance < bestDistance) {
      best = key;
      bestDistance = distance;
    }
  }
  return best;
}
