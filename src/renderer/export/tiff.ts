import UTIF from "utif";
import type { Figure } from "../model/types";
import type { ImagePoolItem } from "../model/pool";
import type { ExportResult } from "../../preload/api";
import { renderFigureToOffscreen } from "../render/export-renderer";
import { injectResolutionTags } from "../image/tiff-encode-tags";

const DEFAULT_NAME = "mosaic-figure.tif";

/**
 * Renders the figure to an OffscreenCanvas, pulls raw RGBA pixels,
 * encodes uncompressed TIFF via UTIF, then patches in resolution tags
 * (XResolution / YResolution / ResolutionUnit=inch) so viewers like
 * ImageJ pick up the DPI.
 *
 * UTIF.encodeImage emits placeholder t282/t283/t296 entries already, so
 * `injectResolutionTags` always takes the in-place rewrite path here
 * (no IFD relocation).
 *
 * M6 limitation: pixels collapse to 8-bit RGBA. The OffscreenCanvas
 * pipeline writes 8-bit-per-channel data, and `UTIF.encodeImage` emits
 * 8-bit RGBA only. 16-bit panel data (from 16-bit TIFF imports) is
 * normalised through the canvas.
 * TODO(M8): add a 16-bit-direct path that bypasses the canvas for
 * 16-bit sources.
 */
export async function exportFigureAsTiff(
  figure: Figure,
  images: Map<string, ImageBitmap>,
  dpi: number,
  pool?: Map<string, ImagePoolItem>,
): Promise<ExportResult> {
  let bytes: Uint8Array;
  try {
    const r = renderFigureToOffscreen(figure, images, dpi, pool);
    const ctx = r.canvas.getContext("2d");
    if (ctx === null) {
      return {
        ok: false,
        reason: "render-failed",
        message: "exportFigureAsTiff: failed to get 2D context",
      };
    }
    const img = ctx.getImageData(0, 0, r.width, r.height);
    const rgba = new Uint8Array(
      img.data.buffer,
      img.data.byteOffset,
      img.data.byteLength,
    );
    const tiffBuf = UTIF.encodeImage(rgba, r.width, r.height);
    const raw = new Uint8Array(tiffBuf);
    bytes = injectResolutionTags(raw, dpi);
  } catch (err) {
    return { ok: false, reason: "render-failed", message: String(err) };
  }
  try {
    return await window.api.exportTiff(bytes, DEFAULT_NAME);
  } catch (err) {
    return { ok: false, reason: "ipc-failed", message: String(err) };
  }
}
