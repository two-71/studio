// Client-side clipboard/download helpers for generated images. Both fetch the
// original R2 URL (full resolution, not the CDN-resized variant), so the R2
// public domain must allow CORS GETs from the app origin.

async function fetchImageBlob(src: string): Promise<Blob> {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status}`);
  }
  return await response.blob();
}

// The clipboard only accepts PNG for images, so non-PNG sources are re-encoded
// through a canvas.
async function toPngBlob(src: string): Promise<Blob> {
  const blob = await fetchImageBlob(src);
  if (blob.type === "image/png") {
    return blob;
  }
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (png) => (png ? resolve(png) : reject(new Error("PNG encode failed"))),
      "image/png"
    );
  });
}

export async function copyImage(src: string): Promise<void> {
  // Promise-valued ClipboardItem keeps the write inside the user gesture
  // (required by Safari) while the fetch/encode runs async.
  const item = new ClipboardItem({ "image/png": toPngBlob(src) });
  await navigator.clipboard.write([item]);
}

export async function downloadImage(
  src: string,
  filename?: string
): Promise<void> {
  // Cross-origin anchors ignore the download attribute, so go through a blob.
  const blob = await fetchImageBlob(src);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    filename ?? new URL(src).pathname.split("/").at(-1) ?? "image";
  anchor.click();
  URL.revokeObjectURL(url);
}
