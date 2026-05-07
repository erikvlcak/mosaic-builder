import type { ImagePoolItem } from "./pool";
import { MIN_CANVAS_W, MIN_CANVAS_H } from "./figure-state";

/**
 * Compute figure canvas pixel dims from the pool + grid + gutter. Sized
 * so that the largest source image (per axis, across the pool) maps 1:1
 * onto a single cell at fit:contain. Merged panels span N cells and so
 * automatically receive N× the pixels — no extra math needed for them.
 *
 * Always at least `MIN_CANVAS_W × MIN_CANVAS_H` so an empty figure still
 * has a usable size.
 *
 * Inversion of computePanelRects's per-axis cell math:
 *   widthPx  = cols * cellW + (cols + 1) * gutter, with cellW ≥ maxImgW
 *   heightPx = rows * cellH + (rows + 1) * gutter, with cellH ≥ maxImgH
 */
export function computeCanvasDims(
  pool: readonly ImagePoolItem[],
  rows: number,
  cols: number,
  gutterPx: number,
): { widthPx: number; heightPx: number } {
  let maxW = 0;
  let maxH = 0;
  for (const item of pool) {
    if (item.width > maxW) maxW = item.width;
    if (item.height > maxH) maxH = item.height;
  }
  const widthPx = Math.max(MIN_CANVAS_W, cols * maxW + (cols + 1) * gutterPx);
  const heightPx = Math.max(MIN_CANVAS_H, rows * maxH + (rows + 1) * gutterPx);
  return { widthPx, heightPx };
}
