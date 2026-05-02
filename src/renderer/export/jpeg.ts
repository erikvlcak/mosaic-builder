import type { Figure } from "../model/types";
import type { ImagePoolItem } from "../model/pool";
import type { ExportResult } from "../../preload/api";
import { renderFigureToOffscreen } from "../render/export-renderer";

const DEFAULT_NAME = "mosaic-figure.jpg";

/**
 * Renders the figure into an OffscreenCanvas, encodes as JPEG at the
 * given quality, and posts bytes through `window.api.exportJpeg`. JPEG
 * is lossy + has no alpha channel — the figure background colour shows
 * through any transparent regions because the canvas is opaque.
 *
 * @param quality 0.50–1.00. Caller is responsible for clamping; values
 *   outside this range are still passed through to the encoder, which
 *   silently clamps to [0, 1].
 */
export async function exportFigureAsJpeg(
  figure: Figure,
  images: Map<string, ImageBitmap>,
  quality: number,
  pool?: Map<string, ImagePoolItem>,
): Promise<ExportResult> {
  let blob: Blob;
  try {
    const r = renderFigureToOffscreen(figure, images, 300, pool);
    blob = await r.canvas.convertToBlob({ type: "image/jpeg", quality });
  } catch (err) {
    return { ok: false, reason: "render-failed", message: String(err) };
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  try {
    return await window.api.exportJpeg(bytes, DEFAULT_NAME);
  } catch (err) {
    return { ok: false, reason: "ipc-failed", message: String(err) };
  }
}
