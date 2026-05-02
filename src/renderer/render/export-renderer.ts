import type { Figure } from "../model/types";
import type { ImagePoolItem } from "../model/pool";
import { drawFigure } from "./draw-figure";

/**
 * Renders the figure into an OffscreenCanvas at full pixel size and
 * returns a PNG Blob. M2: pixel mode only. M6 will route physical
 * mode (inches * dpi) through the same path.
 */
export async function renderFigureToPngBlob(
  figure: Figure,
  images: Map<string, ImageBitmap>,
  pool?: Map<string, ImagePoolItem>,
): Promise<Blob> {
  const off = new OffscreenCanvas(
    figure.canvas.widthPx,
    figure.canvas.heightPx,
  );
  const ctx = off.getContext("2d");
  if (ctx === null) {
    throw new Error("renderFigureToPngBlob: failed to get 2D context");
  }
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
): OffscreenRender {
  const off = new OffscreenCanvas(
    figure.canvas.widthPx,
    figure.canvas.heightPx,
  );
  const ctx = off.getContext("2d");
  if (ctx === null) {
    throw new Error("renderFigureToOffscreen: failed to get 2D context");
  }
  drawFigure(ctx, figure, images, pool);
  return {
    canvas: off,
    width: figure.canvas.widthPx,
    height: figure.canvas.heightPx,
    dpi,
  };
}
