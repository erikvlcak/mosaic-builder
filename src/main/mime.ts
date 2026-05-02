import path from "node:path";

export type ImageMime = "image/png" | "image/jpeg";

/**
 * Returns the image mime type for a known extension, or null.
 * M3 supports PNG + JPEG only; TIFF arrives in M6 with the UTIF worker.
 */
export function mimeFromExt(filePath: string): ImageMime | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return null;
}
