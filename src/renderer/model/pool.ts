export type ImageMime = "image/png" | "image/jpeg";

export interface ImagePoolItem {
  id: string;
  filename: string;
  filePath: string;
  mime: ImageMime;
  width: number;
  height: number;
}

/**
 * Generates a v4 uuid. We use crypto.randomUUID (available in Node 22
 * and modern Chromium); no extra dep needed.
 */
export function newImageId(): string {
  return crypto.randomUUID();
}
