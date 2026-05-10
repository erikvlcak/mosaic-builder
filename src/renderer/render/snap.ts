/**
 * Drag-time alignment snapping for annotations (spec 14).
 *
 * Pure arithmetic on figure-px rectangles — no React, no DOM, no
 * annotation-model coupling. The interaction layer feeds the moving
 * bbox + a list of "other" bboxes (each annotation's hit-rect) and
 * gets back a snapped delta plus a list of guideline segments to
 * paint.
 *
 * The same module will eventually drive panel-rect snapping (spec
 * 11), which is why the input is a generic rect rather than an
 * annotation. Don't grow this file with kind-specific logic.
 */

/** Rectangle in figure-px (top-left origin, width/height non-negative). */
export interface SnapRect {
  /**
   * Stable identifier so the caller can filter the moving rect out of
   * the candidate list, and so guideline keys stay stable across
   * pointermoves.
   */
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Threshold (figure-px) under which an edge alignment is considered a snap candidate. */
export const SNAP_PX = 4;

/**
 * The axis a guideline runs along. "x" = vertical line at constant X
 * (matches left/center-x/right edges); "y" = horizontal line at
 * constant Y (matches top/middle-y/bottom edges).
 */
export type GuidelineAxis = "x" | "y";

/** A single guideline to render. Coordinates are figure-px. */
export interface Guideline {
  axis: GuidelineAxis;
  /** Constant coordinate (X for axis="x", Y for axis="y"). */
  pos: number;
  /**
   * Span along the OTHER axis — e.g. for axis="x" (vertical line),
   * `start`/`end` are Y values. The line is drawn from
   * (pos, start) to (pos, end) for axis="x", or from (start, pos)
   * to (end, pos) for axis="y". Span covers both rectangles' extents
   * on that axis so the user sees which two rects align.
   */
  start: number;
  end: number;
  /** Id of the other rect that participated in this alignment. Useful for testing. */
  otherId: string;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guidelines: Guideline[];
}

type EdgeKind = "min" | "mid" | "max";

interface AxisEdges {
  min: number;
  mid: number;
  max: number;
}

function xEdges(r: { x: number; w: number }): AxisEdges {
  return { min: r.x, mid: r.x + r.w / 2, max: r.x + r.w };
}

function yEdges(r: { y: number; h: number }): AxisEdges {
  return { min: r.y, mid: r.y + r.h / 2, max: r.y + r.h };
}

/**
 * Find the snap-correction for one axis. Returns the smallest signed
 * delta (within ±SNAP_PX) that, when added to the moving rect's edges
 * on this axis, makes some moving-edge match some candidate-edge
 * exactly. Returns 0 when no alignment is in range.
 *
 * We compare every edge-pair (min/mid/max × min/mid/max) but only keep
 * the closest match — soft snap, not greedy. That matches user
 * expectation: dragging near "left aligns with left" of one box
 * shouldn't be hijacked by a "center aligns with center" of a
 * different box that's slightly further away.
 */
function bestAxisCorrection(
  movingEdges: AxisEdges,
  candidateRects: AxisEdges[],
): number {
  let best = 0;
  let bestAbs = Infinity;
  const movingArr: [EdgeKind, number][] = [
    ["min", movingEdges.min],
    ["mid", movingEdges.mid],
    ["max", movingEdges.max],
  ];
  for (const cand of candidateRects) {
    const candArr: [EdgeKind, number][] = [
      ["min", cand.min],
      ["mid", cand.mid],
      ["max", cand.max],
    ];
    for (const [, mEdge] of movingArr) {
      for (const [, cEdge] of candArr) {
        const diff = cEdge - mEdge;
        const abs = Math.abs(diff);
        if (abs <= SNAP_PX && abs < bestAbs) {
          bestAbs = abs;
          best = diff;
        }
      }
    }
  }
  return best;
}

/**
 * After applying the snap correction, collect every (moving-edge,
 * candidate-edge) pair on this axis whose values are now within an
 * exact-match tolerance. We re-scan rather than tracking pairs in
 * `bestAxisCorrection` because multiple candidates may align AFTER
 * the snap (e.g. three boxes whose left edges all line up).
 *
 * The exact-match tolerance is a small epsilon (< 1 px) to absorb
 * floating-point error from the dx correction.
 */
function collectAxisGuidelines(
  axis: GuidelineAxis,
  movingRect: SnapRect,
  candidates: readonly SnapRect[],
  shift: { dx: number; dy: number },
): Guideline[] {
  const eps = 1e-6;
  const moved: SnapRect = {
    ...movingRect,
    x: movingRect.x + shift.dx,
    y: movingRect.y + shift.dy,
  };
  const movingAxis = axis === "x" ? xEdges(moved) : yEdges(moved);
  const movingPerp = axis === "x" ? yEdges(moved) : xEdges(moved);
  const movingEdges: number[] = [movingAxis.min, movingAxis.mid, movingAxis.max];
  const out: Guideline[] = [];
  for (const cand of candidates) {
    const candAxis = axis === "x" ? xEdges(cand) : yEdges(cand);
    const candPerp = axis === "x" ? yEdges(cand) : xEdges(cand);
    const candEdges: number[] = [candAxis.min, candAxis.mid, candAxis.max];
    let matched: number | null = null;
    for (const me of movingEdges) {
      for (const ce of candEdges) {
        if (Math.abs(me - ce) <= eps) {
          matched = ce;
          break;
        }
      }
      if (matched !== null) break;
    }
    if (matched === null) continue;
    // Span covers both rects on the perpendicular axis so the user
    // sees which two are aligned.
    const start = Math.min(movingPerp.min, candPerp.min);
    const end = Math.max(movingPerp.max, candPerp.max);
    out.push({ axis, pos: matched, start, end, otherId: cand.id });
  }
  return out;
}

/**
 * Compute snap correction + guideline list for a drag-in-progress.
 *
 * - `movingRect` is the rect at its raw (unsnapped) drag position
 *   (i.e. with the user's `(rawDx, rawDy)` already applied to its
 *   pre-drag origin). The function returns the *additional* correction
 *   the caller should add on top of the raw delta.
 * - `others` is every other rect on the figure (the caller is
 *   responsible for filtering out `movingRect` itself, including any
 *   bulk-selection siblings).
 * - When `disabled` is true (Shift held), no snap correction is
 *   applied but guidelines still render — so the user gets visual
 *   feedback about alignment opportunities without surrendering
 *   pointer accuracy.
 */
export function snapDelta(
  movingRect: SnapRect,
  others: readonly SnapRect[],
  options: { disabled?: boolean } = {},
): SnapResult {
  if (others.length === 0) {
    return { dx: 0, dy: 0, guidelines: [] };
  }
  const movingX = xEdges(movingRect);
  const movingY = yEdges(movingRect);
  const candX = others.map(xEdges);
  const candY = others.map(yEdges);
  const correctionX = bestAxisCorrection(movingX, candX);
  const correctionY = bestAxisCorrection(movingY, candY);
  const dx = options.disabled === true ? 0 : correctionX;
  const dy = options.disabled === true ? 0 : correctionY;
  // For guideline collection we always want to show alignments at the
  // *snapped* positions, even when snap is disabled — the lines
  // represent "what would align if you snapped here", and the math is
  // simpler when computed against the candidate (pre-snap) corrections.
  const guidelineShift = {
    dx: correctionX,
    dy: correctionY,
  };
  const guidelines: Guideline[] = [
    ...collectAxisGuidelines("x", movingRect, others, guidelineShift),
    ...collectAxisGuidelines("y", movingRect, others, guidelineShift),
  ];
  return { dx, dy, guidelines };
}
