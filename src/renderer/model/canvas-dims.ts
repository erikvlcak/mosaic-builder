import type { ImagePoolItem } from "./pool";
import { MIN_CANVAS_W, MIN_CANVAS_H } from "./figure-state";
import type { Annotation } from "./annotations";

/**
 * The subset of the pool that is actually placed in a panel. Canvas sizing
 * and export resolution derive from these only — an image sitting unplaced
 * in the tray must not grow the canvas (which the user reads as the canvas
 * "expanding for no reason"). Once dragged into a panel it counts, and the
 * canvas resizes then. `placedIds` is the set of panel imageIds.
 */
export function placedPoolImages(
  pool: readonly ImagePoolItem[],
  placedIds: ReadonlySet<string>,
): ImagePoolItem[] {
  return pool.filter((item) => placedIds.has(item.id));
}

/**
 * Compute figure canvas pixel dims from a list of images + grid + gutter.
 * Sized so the largest source image (per axis, across the given images)
 * maps 1:1 onto a single cell at fit:contain. Merged panels span N cells
 * and so automatically receive N× the pixels — no extra math needed.
 *
 * Callers pass the PLACED images only (see `placedPoolImages`) — an unplaced
 * tray image must not affect canvas size or export resolution.
 *
 * Always at least `MIN_CANVAS_W × MIN_CANVAS_H` so an empty figure still
 * has a usable size.
 *
 * Inversion of computePanelRects's per-axis cell math:
 *   widthPx  = cols * cellW + (cols + 1) * gutter, with cellW ≥ maxImgW
 *   heightPx = rows * cellH + (rows + 1) * gutter, with cellH ≥ maxImgH
 */
export function computeCanvasDims(
  images: readonly ImagePoolItem[],
  rows: number,
  cols: number,
  gutterPx: number,
): { widthPx: number; heightPx: number } {
  let maxW = 0;
  let maxH = 0;
  for (const item of images) {
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
 * - symbol: x, y
 * - scalebar: nothing (corner-anchored, lengthValue is in real-world units)
 *
 * sizePt, sizePx, rotationDeg, strokeWidthPx are intentionally left alone
 * — they are visual sizes, not figure coordinates. Returns the same
 * reference when sx === 1 && sy === 1 to avoid no-op state churn.
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
    if (a.kind === "symbol") {
      return { ...a, x: a.x * sx, y: a.y * sy };
    }
    // scalebar — nothing positional to scale.
    return a;
  });
}
