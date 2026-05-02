import type { Figure } from "../model/types";
import { drawFigure } from "./draw-figure";

/**
 * Renders the figure into an OffscreenCanvas at full pixel size and
 * returns a PNG Blob. M2: pixel mode only. M6 will route physical
 * mode (inches * dpi) through the same path.
 */
export async function renderFigureToPngBlob(
  figure: Figure,
  images: Map<string, ImageBitmap>,
): Promise<Blob> {
  const off = new OffscreenCanvas(
    figure.canvas.widthPx,
    figure.canvas.heightPx,
  );
  const ctx = off.getContext("2d");
  if (ctx === null) {
    throw new Error("renderFigureToPngBlob: failed to get 2D context");
  }
  drawFigure(ctx, figure, images);
  return off.convertToBlob({ type: "image/png" });
}
