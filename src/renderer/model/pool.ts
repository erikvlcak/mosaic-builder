export type ImageMime = "image/png" | "image/jpeg" | "image/tiff";

export interface Calibration {
  unit: "um" | "mm" | "px";
  /**
   * Source pixels per `unit`. For µm: a 6.45 means 6.45 source pixels span 1 µm.
   * Always positive; never zero. The reducer rejects non-finite or non-positive.
   */
  pixelsPerUnit: number;
  source: "tiff-meta" | "manual";
}

export interface ImagePoolItem {
  id: string;
  filename: string;
  filePath: string;
  mime: ImageMime;
  width: number;
  height: number;
  /** 8 for PNG/JPEG/8-bit TIFF; 16 for 16-bit TIFF. Surfaced for UI only. */
  bitDepth: 8 | 16;
  /** Present when extracted from TIFF IFD or saved by the user manually. */
  calibration?: Calibration;
}

/**
 * Generates a v4 uuid. We use crypto.randomUUID (available in Node 22
 * and modern Chromium); no extra dep needed.
 */
export function newImageId(): string {
  return crypto.randomUUID();
}
