import type { Panel } from "./panels";

export const MIN_TRACK_WEIGHT = 0.05;
export const MIN_PANEL_W = 30;
export const MIN_PANEL_H = 30;

export interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type GridLayout =
  | {
      kind: "uniform";
      colWeights: number[];
      rowWeights: number[];
    }
  | {
      kind: "free";
      rects: Record<string, FreeRect>;
    };

export function uniformLayoutFor(rows: number, cols: number): GridLayout {
  return {
    kind: "uniform",
    colWeights: equalWeights(cols),
    rowWeights: equalWeights(rows),
  };
}

function round12(v: number): number {
  return Math.round(v * 1e12) / 1e12;
}

function equalWeights(n: number): number[] {
  if (n <= 0) return [];
  const w = 1 / n;
  return Array.from({ length: n }, () => w);
}

/**
 * Why pairwise: track-drag math touches only the two tracks adjacent to the
 * dragged gutter line. Other tracks' weights are unchanged, which keeps
 * interactions composable (drag one gutter doesn't reflow the whole figure).
 */
export function setTrackWeight(
  weights: readonly number[],
  index: number,
  target: number,
): number[] {
  if (index < 0 || index >= weights.length - 1) return weights.slice();
  const a = weights[index]!;
  const b = weights[index + 1]!;
  const total = a + b;
  const min = MIN_TRACK_WEIGHT;
  const clamped = Math.max(min, Math.min(total - min, target));
  // Round to 12 decimals to absorb FP noise (0.5 + 0.5 - 0.7 → 0.300...04).
  // Track weights are user-visible only as track widths so high precision
  // gives no benefit; matching `toEqual` in tests is more useful.
  const out = weights.slice();
  out[index] = round12(clamped);
  out[index + 1] = round12(total - clamped);
  return out;
}

export interface UniformRectInput {
  widthPx: number;
  heightPx: number;
  rows: number;
  cols: number;
  gutterPx: number;
  outerGutter: boolean;
  colWeights: number[];
  rowWeights: number[];
  panels: readonly Panel[];
}

/**
 * Width formula:
 *   availW   = widthPx - gutterPx * (outerGutter ? 2 + (cols-1) : (cols-1))
 *   colW[i]  = floor(availW * weights[i])
 *   colX[i]  = outerOffset + sum(colW[0..i-1]) + i * gutterPx
 * The last column absorbs any rounding remainder so the right edge sits on
 * `widthPx - outerOffset`. Same rule for rows.
 */
export function rectsFromUniform(
  inp: UniformRectInput,
): Record<string, FreeRect> {
  const { widthPx, heightPx, rows, cols, gutterPx, outerGutter, panels } = inp;
  const outerOffset = outerGutter ? gutterPx : 0;
  const availW =
    widthPx - gutterPx * ((outerGutter ? 2 : 0) + (cols - 1));
  const availH =
    heightPx - gutterPx * ((outerGutter ? 2 : 0) + (rows - 1));

  const colWPx = inp.colWeights.map((w) => Math.floor(availW * w));
  const rowHPx = inp.rowWeights.map((w) => Math.floor(availH * w));
  const wRem = availW - colWPx.reduce((a, b) => a + b, 0);
  const hRem = availH - rowHPx.reduce((a, b) => a + b, 0);
  if (cols > 0) colWPx[cols - 1] = colWPx[cols - 1]! + wRem;
  if (rows > 0) rowHPx[rows - 1] = rowHPx[rows - 1]! + hRem;

  const colX: number[] = Array.from({ length: cols }, () => 0);
  const rowY: number[] = Array.from({ length: rows }, () => 0);
  for (let i = 0; i < cols; i++) {
    colX[i] =
      i === 0 ? outerOffset : colX[i - 1]! + colWPx[i - 1]! + gutterPx;
  }
  for (let i = 0; i < rows; i++) {
    rowY[i] =
      i === 0 ? outerOffset : rowY[i - 1]! + rowHPx[i - 1]! + gutterPx;
  }

  const out: Record<string, FreeRect> = {};
  for (const p of panels) {
    const xs = colX[p.col]!;
    const ys = rowY[p.row]!;
    let w = 0;
    for (let c = p.col; c < p.col + p.colSpan; c++) w += colWPx[c]!;
    w += (p.colSpan - 1) * gutterPx;
    let h = 0;
    for (let r = p.row; r < p.row + p.rowSpan; r++) h += rowHPx[r]!;
    h += (p.rowSpan - 1) * gutterPx;
    out[p.id] = { x: xs, y: ys, w, h };
  }
  return out;
}

export type Corner = "tl" | "tr" | "bl" | "br";

export interface FreeformResizeResult {
  rects: Record<string, FreeRect>;
  applied: { dx: number; dy: number };
}

/**
 * Drag panel `panelId` by its `corner` by (dx, dy) figure-px (screen-space).
 * The dragged corner's two edges propagate: every other panel sharing one of
 * those edges *as its opposite side* moves the same edge by the same delta.
 *
 * Edge identity:
 *   tl-corner ↔ left + top edges of P
 *   tr-corner ↔ right + top
 *   bl-corner ↔ left + bottom
 *   br-corner ↔ right + bottom
 *
 * Strict opposite-side semantics (per spec): when target's right edge moves,
 * peers whose LEFT edge sits on that same vertical line follow. Peers sharing
 * the line via their right edge (i.e., on the same side as the target) do
 * NOT — that produces a free-form layout that may have gaps, which is the
 * intended behavior.
 *
 * Clamp: largest |dx| or |dy| keeping every affected panel's width >=
 * MIN_PANEL_W and height >= MIN_PANEL_H. Clamp is uniform across affected
 * panels so the cascade is consistent — no overlaps, no negative dims.
 */
export function resizePanelFreeform(
  rects: Record<string, FreeRect>,
  panelId: string,
  corner: Corner,
  dx: number,
  dy: number,
): FreeformResizeResult {
  const target = rects[panelId];
  if (target === undefined) {
    return { rects, applied: { dx: 0, dy: 0 } };
  }

  const movesRight = corner === "tr" || corner === "br";
  const movesLeft = corner === "tl" || corner === "bl";
  const movesBottom = corner === "bl" || corner === "br";
  const movesTop = corner === "tl" || corner === "tr";

  const xEdge = movesRight ? target.x + target.w : target.x;
  const yEdge = movesBottom ? target.y + target.h : target.y;

  const ids = Object.keys(rects);
  const EPS = 0.5;

  // Edge marker: which edge of this panel moves on each axis (or none).
  type EdgeX = "left" | "right";
  type EdgeY = "top" | "bottom";
  interface Affected {
    id: string;
    edgeX?: EdgeX;
    edgeY?: EdgeY;
  }
  const affected = new Map<string, Affected>();
  function mark(id: string, key: "edgeX" | "edgeY", edge: EdgeX | EdgeY): void {
    const a = affected.get(id) ?? { id };
    if (key === "edgeX") a.edgeX = edge as EdgeX;
    else a.edgeY = edge as EdgeY;
    affected.set(id, a);
  }

  // Target: its dragged corner's two edges move.
  if (movesRight) mark(panelId, "edgeX", "right");
  if (movesLeft) mark(panelId, "edgeX", "left");
  if (movesBottom) mark(panelId, "edgeY", "bottom");
  if (movesTop) mark(panelId, "edgeY", "top");

  // Strict opposite-side: a peer's edge moves only if it's the opposite
  // side of the target's moved edge.
  for (const id of ids) {
    if (id === panelId) continue;
    const r = rects[id]!;
    const left = r.x;
    const right = r.x + r.w;
    const top = r.y;
    const bottom = r.y + r.h;
    if (movesRight && Math.abs(left - xEdge) < EPS) {
      mark(id, "edgeX", "left");
    } else if (movesLeft && Math.abs(right - xEdge) < EPS) {
      mark(id, "edgeX", "right");
    }
    if (movesBottom && Math.abs(top - yEdge) < EPS) {
      mark(id, "edgeY", "top");
    } else if (movesTop && Math.abs(bottom - yEdge) < EPS) {
      mark(id, "edgeY", "bottom");
    }
  }

  // For each affected panel, determine how its width/height changes per unit
  // of dx (or dy). Width-change-per-dx is +1 if the right edge moves, -1 if
  // the left edge moves (left-edge motion shrinks width when dx is positive).
  function widthSign(edge: EdgeX | undefined): 0 | 1 | -1 {
    if (edge === "right") return 1;
    if (edge === "left") return -1;
    return 0;
  }
  function heightSign(edge: EdgeY | undefined): 0 | 1 | -1 {
    if (edge === "bottom") return 1;
    if (edge === "top") return -1;
    return 0;
  }

  // Clamp dx so every affected panel keeps w >= MIN_PANEL_W. The width
  // formula for each affected panel is `w' = w + sign * dx`. We need
  // w + sign * dx >= MIN_PANEL_W ⇒ sign * dx >= MIN_PANEL_W - w.
  function clampAxis(
    delta: number,
    sign: (a: Affected) => 0 | 1 | -1,
    dim: (r: FreeRect) => number,
    min: number,
  ): number {
    if (delta === 0) return 0;
    let lo = -Infinity;
    let hi = Infinity;
    for (const a of affected.values()) {
      const s = sign(a);
      if (s === 0) continue;
      const d = dim(rects[a.id]!);
      // s * delta >= min - d  ⇒  if s===1: delta >= min - d (lo bound)
      //                          if s===-1: delta <= d - min (hi bound)
      if (s === 1) {
        const bound = min - d;
        if (bound > lo) lo = bound;
      } else {
        const bound = d - min;
        if (bound < hi) hi = bound;
      }
    }
    if (delta < lo) return lo;
    if (delta > hi) return hi;
    return delta;
  }

  const ddx = clampAxis(
    dx,
    (a) => widthSign(a.edgeX),
    (r) => r.w,
    MIN_PANEL_W,
  );
  const ddy = clampAxis(
    dy,
    (a) => heightSign(a.edgeY),
    (r) => r.h,
    MIN_PANEL_H,
  );

  if (ddx === 0 && ddy === 0) {
    return { rects, applied: { dx: 0, dy: 0 } };
  }

  const out: Record<string, FreeRect> = {};
  for (const id of ids) {
    const r = rects[id]!;
    const a = affected.get(id);
    if (a === undefined) {
      out[id] = r;
      continue;
    }
    let { x, y, w, h } = r;
    if (a.edgeX === "right") w += ddx;
    else if (a.edgeX === "left") {
      x += ddx;
      w -= ddx;
    }
    if (a.edgeY === "bottom") h += ddy;
    else if (a.edgeY === "top") {
      y += ddy;
      h -= ddy;
    }
    out[id] = { x, y, w, h };
  }

  return { rects: out, applied: { dx: ddx, dy: ddy } };
}
