import type { ImagePoolItem } from "../model/pool";
import { computeCanvasDims } from "../model/canvas-dims";

/**
 * Compute a uniform scale factor `s` such that rendering an editor-sized
 * figure (figureW × figureH) into a `(figureW·s × figureH·s)` canvas
 * preserves every source image's full pixel resolution inside its panel
 * rect. The factor matches the larger of the per-axis ratios produced by
 * `computeCanvasDims`, so source pixels are at least 1:1 on the dominant
 * axis and over-provisioned on the other.
 *
 * Returns 1 (no-op) when no image in the pool exceeds what the editor
 * canvas already provides — exporting a figure with only small images
 * stays at editor resolution.
 */
export function computeExportScale(
  pool: readonly ImagePoolItem[],
  rows: number,
  cols: number,
  gutterPx: number,
  editorW: number,
  editorH: number,
): number {
  const dims = computeCanvasDims(pool, rows, cols, gutterPx);
  const sx = dims.widthPx / editorW;
  const sy = dims.heightPx / editorH;
  return Math.max(1, sx, sy);
}
