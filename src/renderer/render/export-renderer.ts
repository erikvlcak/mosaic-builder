import type { Figure } from "../model/types";
import type { ImagePoolItem } from "../model/pool";
import { drawFigure } from "./draw-figure";

/**
 * Renders the figure into an OffscreenCanvas at full pixel size and
 * returns a PNG Blob. `exportScale` (default 1) uniformly enlarges the
 * output canvas while drawing the figure in editor-figure-px space — so
 * source images preserve their full pixel resolution inside their panel
 * rects, and annotations/text/strokes scale proportionally. The figure
 * itself is unmodified; the scale is purely a render-time concern.
 */
export async function renderFigureToPngBlob(
  figure: Figure,
  images: Map<string, ImageBitmap>,
  pool?: Map<string, ImagePoolItem>,
  exportScale = 1,
): Promise<Blob> {
  const off = new OffscreenCanvas(
    Math.round(figure.canvas.widthPx * exportScale),
    Math.round(figure.canvas.heightPx * exportScale),
  );
  const ctx = off.getContext("2d");
  if (ctx === null) {
    throw new Error("renderFigureToPngBlob: failed to get 2D context");
  }
  if (exportScale !== 1) ctx.scale(exportScale, exportScale);
  drawFigure(ctx, figure, images, pool);
  return off.convertToBlob({ type: "image/png" });
}

export interface OffscreenRender {
  /** OffscreenCanvas the figure was drawn into. Callers can pull pixels
   *  via `getContext("2d")?.getImageData(...)` or convert to a Blob. */
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  /** Source DPI that callers (TIFF, PDF) need for proper page sizing. */
  dpi: number;
}

/**
 * Shared core for non-PNG export paths (JPEG/TIFF/PDF). Renders the
 * figure into an OffscreenCanvas and returns the canvas + dimensions +
 * intended DPI for downstream encoders.
 *
 * Callers convert to Blob (`canvas.convertToBlob({ type, quality })`)
 * or pull raw pixels (`getImageData`) as needed.
 */
export function renderFigureToOffscreen(
  figure: Figure,
  images: Map<string, ImageBitmap>,
  dpi: number = 300,
  pool?: Map<string, ImagePoolItem>,
  exportScale = 1,
): OffscreenRender {
  const w = Math.round(figure.canvas.widthPx * exportScale);
  const h = Math.round(figure.canvas.heightPx * exportScale);
  const off = new OffscreenCanvas(w, h);
  const ctx = off.getContext("2d");
  if (ctx === null) {
    throw new Error("renderFigureToOffscreen: failed to get 2D context");
  }
  if (exportScale !== 1) ctx.scale(exportScale, exportScale);
  drawFigure(ctx, figure, images, pool);
  return {
    canvas: off,
    width: w,
    height: h,
    dpi,
  };
}
