export type ImageMime = "image/png" | "image/jpeg";

const SUPPORTED: ReadonlySet<ImageMime> = new Set(["image/png", "image/jpeg"]);

/**
 * Decodes raw image bytes into an ImageBitmap. M3 supports PNG + JPEG;
 * TIFF arrives in M6 with the UTIF web worker.
 */
export async function decodeImageBytes(
  bytes: Uint8Array,
  mime: ImageMime,
): Promise<ImageBitmap> {
  if (bytes.byteLength === 0) {
    throw new Error("decodeImageBytes: empty bytes");
  }
  if (!SUPPORTED.has(mime)) {
    throw new Error(`decodeImageBytes: unsupported mime "${mime}"`);
  }
  const blob = new Blob([bytes], { type: mime });
  return createImageBitmap(blob);
}
