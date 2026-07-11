import type { Calibration, ImageMime } from "../model/pool";
import { decodeTiffViaWorker } from "./tiff-worker-host";

export type { ImageMime };

export interface DecodedImage {
  bitmap: ImageBitmap;
  bitDepth: 8 | 16;
  calibration?: Calibration;
}

/**
 * Decodes raw image bytes into a bitmap plus metadata. PNG and JPEG go
 * through the browser's `createImageBitmap` (always 8-bit, no calibration).
 * TIFF is routed to the UTIF web worker, which extracts bit-depth and
 * (when present) a `Calibration` from the IFD before producing RGBA bytes.
 */
export async function decodeImageBytes(
  bytes: Uint8Array,
  mime: ImageMime,
): Promise<DecodedImage> {
  if (bytes.byteLength === 0) {
    throw new Error("decodeImageBytes: empty bytes");
  }
  if (mime === "image/tiff") {
    const ab = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const r = await decodeTiffViaWorker(ab);
    const bitmap = await rgbaToImageBitmap(r.rgba, r.width, r.height);
    return {
      bitmap,
      bitDepth: r.bitDepth,
      ...(r.calibration !== undefined ? { calibration: r.calibration } : {}),
    };
  }
  if (mime !== "image/png" && mime !== "image/jpeg") {
    throw new Error(`decodeImageBytes: unsupported mime "${mime as string}"`);
  }
  const blob = new Blob([bytes as BlobPart], { type: mime });
  // Honor EXIF orientation: Chromium's default ignores the tag, so camera /
  // microscope JPEGs with a rotation flag would display sideways, breaking
  // pixel-WYSIWYG. No-op for PNG (no orientation metadata).
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: "from-image",
  });
  return { bitmap, bitDepth: 8 };
}

async function rgbaToImageBitmap(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
): Promise<ImageBitmap> {
  const data = new ImageData(rgba, w, h);
  return createImageBitmap(data);
}
