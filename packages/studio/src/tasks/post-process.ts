// Turns RunPod's raw base64 output images into published storage URLs.
// Moved from the host app's post-process module: uploads go
// through `config.storage` instead of a direct R2 caller. Both the watermark
// and PNG-metadata steps are the package's own server-side helpers (already
// generic, moved in the A2 mechanical reorg).
//
// This must happen after applyWatermarks — resvg re-renders the PNG, which
// would drop any chunk added before it. Embed failures never block the
// upload.

import type { StudioConfig } from "../config/types";
import { embedPngText } from "../server/png-metadata";
import { applyWatermarks } from "../server/watermark";

export interface RunpodImage {
  data?: string;
  filename?: string;
  type?: string;
  url?: string;
}

function tag(png: Buffer, generationId: string): Buffer {
  try {
    return embedPngText(png, { "studio:generation": generationId });
  } catch (err) {
    console.error("png metadata embed failed", err);
    return png;
  }
}

async function uploadAndPublish(
  config: StudioConfig,
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  await config.storage.upload(key, body, contentType);
  return config.storage.publicUrl(key);
}

// Decodes each base64 image, uploads a watermarked copy to a deterministic
// key (so re-runs overwrite the same object) under the public key, and keeps
// the clean original alongside it under `.clean.png` (never exposed to the
// client). A watermark failure falls back to publishing the clean image
// rather than blocking the generation. Images with no `data` (already a URL)
// pass through unchanged.
export async function postProcessImages(
  config: StudioConfig,
  images: RunpodImage[],
  generationId: string,
  createdAt: Date
): Promise<RunpodImage[]> {
  return await Promise.all(
    images.map(async (img, index) => {
      if (!img.data) {
        return img;
      }
      const clean = Buffer.from(img.data, "base64");
      // config.watermark is the on/off switch (config/types.ts: "omit = no
      // watermark") — applyWatermarks must not run for hosts that never set
      // it, since its badge path requires assets (logo, fonts) a host with
      // no watermark spec has no reason to ship.
      const watermarked = config.watermark
        ? await applyWatermarks(clean).catch((err) => {
            console.error("watermarking failed", err);
            return null;
          })
        : null;
      // Named like the Studio UI download (startedAt = row createdAt in unix
      // ms), keeping the key deterministic across re-runs.
      const stem = `${createdAt.getTime()}-${index + 1}`;
      const filename = `${stem}.png`;
      const [url] = await Promise.all([
        uploadAndPublish(
          config,
          `${generationId}/${filename}`,
          tag(watermarked ?? clean, generationId),
          "image/png"
        ),
        uploadAndPublish(
          config,
          `${generationId}/${stem}.clean.png`,
          tag(clean, generationId),
          "image/png"
        ),
      ]);
      return { url, filename, type: "url" };
    })
  );
}
