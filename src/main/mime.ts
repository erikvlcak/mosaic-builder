import path from "node:path";

export type ImageMime = "image/png" | "image/jpeg" | "image/tiff";

/**
 * Returns the image mime type for a known extension, or null.
 * Supports PNG, JPEG, and TIFF (8/16-bit, decoded in the renderer worker).
 */
export function mimeFromExt(filePath: string): ImageMime | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  return null;
}
