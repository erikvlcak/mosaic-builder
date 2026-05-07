import type { ImagePoolItem } from "./pool";
import { MIN_CANVAS_W, MIN_CANVAS_H } from "./figure-state";
import type { Annotation } from "./annotations";

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

/**
 * Scale every annotation's figure-pixel coordinates by (sx, sy). Used
 * when the canvas pixel dims change so on-screen positions stay anchored.
 *
 * - text: x, y
 * - arrow: x1, y1, x2, y2
 * - box: x, y, w, h
 * - scalebar: nothing (corner-anchored, lengthValue is in real-world units)
 *
 * sizePt, thicknessPx, strokeWidthPx are intentionally left alone — they
 * are visual sizes, not figure coordinates. Returns the same reference
 * when sx === 1 && sy === 1 to avoid no-op state churn.
 */
export function scaleAnnotations(
  annotations: readonly Annotation[],
  sx: number,
  sy: number,
): Annotation[] {
  if (sx === 1 && sy === 1) return annotations as Annotation[];
  return annotations.map((a): Annotation => {
    if (a.kind === "text") {
      return { ...a, x: a.x * sx, y: a.y * sy };
    }
    if (a.kind === "arrow") {
      return {
        ...a,
        x1: a.x1 * sx,
        y1: a.y1 * sy,
        x2: a.x2 * sx,
        y2: a.y2 * sy,
      };
    }
    if (a.kind === "box") {
      return {
        ...a,
        x: a.x * sx,
        y: a.y * sy,
        w: a.w * sx,
        h: a.h * sy,
      };
    }
    // scalebar — nothing positional to scale.
    return a;
  });
}
