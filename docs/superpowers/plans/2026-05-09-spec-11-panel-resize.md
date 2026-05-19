# Spec 11 — Manual Panel Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `layout: GridLayout` field to `FigureState` that supports two regimes — `uniform` (per-track weights, drag column/row gutters to redistribute) and `free` (absolute per-panel rects, drag a panel corner to free-resize with neighbor cascade) — including reducer actions, layout-pipeline branching, schema v4 migration, and two new UI surfaces (track handles in `GridCells`, corner handles in `PanelInteractionLayer`, plus a "Reset to uniform grid" button).

**Architecture:** Threads `GridLayout` through three layers without forking the renderer. `computePanelRects` branches on `layout.kind`; uniform reuses the existing `computeGridLayout`/`computeCellRect` path with weighted track sizes; free returns `layout.rects[panelId]` directly. Free-mode entry is implicit (first corner-drag converts uniform → free by snapshotting current rects). The cascade math lives in a pure `resizePanelFreeform` for isolation. Schema v4 adds `layout` with backward-compat default `{ kind: "uniform", colWeights: [1/cols × cols], rowWeights: [1/rows × rows] }`.

**Tech Stack:** TypeScript, React 18, Vitest, immutable reducer pattern. No new dependencies.

---

## File Structure

| File                                                     | Role                                                                                                                                                                                           | Change |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `src/renderer/model/grid-layout.ts` (NEW)                | `GridLayout` type + pure helpers (`uniformLayoutFor`, `setTrackWeight`, `rectsFromUniform`, `rectsFromFree`, `resizePanelFreeform`)                                                            | create |
| `src/renderer/model/figure-state.ts`                     | Add `layout: GridLayout` field; `initialFigureState` returns uniform layout                                                                                                                    | modify |
| `src/renderer/model/figure-actions.ts`                   | Three new actions: `SET_TRACK_WEIGHT`, `RESIZE_PANEL_FREEFORM`, `RESET_TO_UNIFORM_GRID`. RESIZE_GRID, MERGE_CELLS, UNMERGE_PANEL, DELETE_PANEL, RESTORE_PANEL_AT must keep `layout` consistent | modify |
| `src/renderer/model/types.ts`                            | `FigureGrid` (Figure type) gains optional `layout: GridLayout`                                                                                                                                 | modify |
| `src/renderer/model/figure-derivations.ts`               | `deriveFigure` copies `state.layout` onto `figure.grid`                                                                                                                                        | modify |
| `src/renderer/render/coords.ts`                          | `computePanelRects` branches on `figure.grid.layout.kind`; uniform path uses weights                                                                                                           | modify |
| `src/renderer/components/Grid/GridCells.tsx`             | New `<TrackHandle>` strips along gutter lines (uniform only); use shared layout-aware computation for panel rects                                                                              | modify |
| `src/renderer/components/Grid/PanelInteractionLayer.tsx` | Render four corner handles when in editing mode; pointer drag dispatches `RESIZE_PANEL_FREEFORM`                                                                                               | modify |
| `src/renderer/components/Toolbar/GridControls.tsx`       | "Reset to uniform grid" button visible when `layout.kind === "free"`                                                                                                                           | modify |
| `src/renderer/App.tsx`                                   | Pipe `layout` + new dispatchers down to `GridControls`, `GridCells`, `PanelInteractionLayer`                                                                                                   | modify |
| `src/renderer/styles.css`                                | Track-handle and corner-handle styles                                                                                                                                                          | modify |
| `src/renderer/model/schema.ts`                           | v4: schema includes `state.layout`; loader migrates v1/v2/v3 → v4                                                                                                                              | modify |
| `src/renderer/model/serialize.ts`                        | `toMosaicFile` writes v4; `fromMosaicFile` reads v3 → seeds uniform layout                                                                                                                     | modify |

**Test files (mirror source):**

- `test/unit/grid-layout.test.ts` — pure helpers
- `test/unit/figure-actions.test.ts` — three new actions + grid-resize/merge/delete interactions
- `test/unit/coords.test.ts` (or extend `figure-layout.test.ts`) — `computePanelRects` in both regimes
- `test/unit/grid-cells-modes.test.tsx` — track handle render + drag
- `test/unit/panel-interaction-layer.test.tsx` — corner handle render + drag
- `test/unit/grid-controls.test.tsx` (NEW) — Reset button visibility/behavior
- `test/unit/schema.test.ts` — v4 validation, v3 → v4 load migration
- `test/unit/serialize.test.ts` — round-trip preserves layout
- `test/unit/m7-roundtrip.test.ts` — load-old/save-new flow

**Constants (in `grid-layout.ts`):**

```ts
export const MIN_TRACK_WEIGHT = 0.05; // 5% of total — keeps a track visible
export const MIN_PANEL_W = 30; // figure-px floor for free-form
export const MIN_PANEL_H = 30;
```

---

## Task 1: `GridLayout` type + uniform helpers

**Files:**

- Create: `src/renderer/model/grid-layout.ts`
- Test: `test/unit/grid-layout.test.ts`

- [ ] **Step 1: Write the type and constants**

```ts
// src/renderer/model/grid-layout.ts
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
      /** length === cols, sum-normalized to 1.0. */
      colWeights: number[];
      /** length === rows, sum-normalized to 1.0. */
      rowWeights: number[];
    }
  | {
      kind: "free";
      /** Absolute rects in figure-px keyed by panelId. */
      rects: Record<string, FreeRect>;
    };

/** Build a uniform layout with equal weights for the given grid dims. */
export function uniformLayoutFor(rows: number, cols: number): GridLayout {
  return {
    kind: "uniform",
    colWeights: equalWeights(cols),
    rowWeights: equalWeights(rows),
  };
}

function equalWeights(n: number): number[] {
  if (n <= 0) return [];
  const w = 1 / n;
  return Array.from({ length: n }, () => w);
}

/**
 * Adjust two adjacent track weights (index, index+1) so that
 * weights[index] === target (clamped to MIN_TRACK_WEIGHT..total-MIN_TRACK_WEIGHT)
 * and the pair's total is preserved. Allocates a fresh array.
 *
 * Why pairwise: the spec's track-drag math touches only the two tracks
 * adjacent to the dragged gutter line. Other tracks' weights are unchanged,
 * which keeps interactions composable (drag one gutter doesn't reflow the
 * whole figure).
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
  const out = weights.slice();
  out[index] = clamped;
  out[index + 1] = total - clamped;
  return out;
}
```

- [ ] **Step 2: Write tests**

```ts
// test/unit/grid-layout.test.ts
import { describe, it, expect } from "vitest";
import {
  uniformLayoutFor,
  setTrackWeight,
  MIN_TRACK_WEIGHT,
} from "../../src/renderer/model/grid-layout";

describe("uniformLayoutFor", () => {
  it("returns equal weights summing to 1", () => {
    const l = uniformLayoutFor(2, 3);
    expect(l.kind).toBe("uniform");
    if (l.kind !== "uniform") throw new Error("unreachable");
    expect(l.colWeights).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(l.rowWeights).toEqual([1 / 2, 1 / 2]);
  });

  it("handles 1x1", () => {
    const l = uniformLayoutFor(1, 1);
    if (l.kind !== "uniform") throw new Error("unreachable");
    expect(l.colWeights).toEqual([1]);
    expect(l.rowWeights).toEqual([1]);
  });
});

describe("setTrackWeight", () => {
  it("transfers mass between adjacent tracks, preserving the pair's sum", () => {
    const next = setTrackWeight([0.5, 0.5], 0, 0.7);
    expect(next).toEqual([0.7, 0.3]);
  });

  it("does not touch tracks outside the dragged pair", () => {
    const next = setTrackWeight([0.25, 0.25, 0.5], 0, 0.4);
    expect(next).toEqual([0.4, 0.1, 0.5]);
  });

  it("clamps to MIN_TRACK_WEIGHT on the lower side", () => {
    const next = setTrackWeight([0.5, 0.5], 0, -1);
    expect(next[0]).toBeCloseTo(MIN_TRACK_WEIGHT, 10);
    expect(next[1]).toBeCloseTo(1 - MIN_TRACK_WEIGHT, 10);
  });

  it("clamps to total - MIN_TRACK_WEIGHT on the upper side", () => {
    const next = setTrackWeight([0.5, 0.5], 0, 99);
    expect(next[0]).toBeCloseTo(1 - MIN_TRACK_WEIGHT, 10);
    expect(next[1]).toBeCloseTo(MIN_TRACK_WEIGHT, 10);
  });

  it("returns a copy (not the input) when index is out of range", () => {
    const input = [0.5, 0.5];
    const next = setTrackWeight(input, 5, 0.3);
    expect(next).toEqual(input);
    expect(next).not.toBe(input);
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL on missing module**

Run: `pnpm vitest run test/unit/grid-layout.test.ts`
Expected: import error / FAIL.

- [ ] **Step 4: Make tests pass**

Step 1 is the implementation; the test should pass once the file is saved.

- [ ] **Step 5: Run tests — expect PASS**

Run: `pnpm vitest run test/unit/grid-layout.test.ts`
Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/model/grid-layout.ts test/unit/grid-layout.test.ts
git commit -m "feat(qa-feedback): GridLayout type + uniform track-weight helpers (spec 11)"
```

---

## Task 2: Uniform-mode rect computation (`rectsFromUniform`)

**Files:**

- Modify: `src/renderer/model/grid-layout.ts`
- Modify: `test/unit/grid-layout.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/grid-layout.test.ts`:

```ts
import { rectsFromUniform } from "../../src/renderer/model/grid-layout";
import type { Panel } from "../../src/renderer/model/panels";

const P = (id: string, row: number, col: number, rs = 1, cs = 1): Panel => ({
  id,
  row,
  col,
  rowSpan: rs,
  colSpan: cs,
});

describe("rectsFromUniform", () => {
  it("matches existing computeGridLayout for equal weights with outerGutter on", () => {
    const panels: Panel[] = [
      P("a", 0, 0),
      P("b", 0, 1),
      P("c", 1, 0),
      P("d", 1, 1),
    ];
    const rects = rectsFromUniform({
      widthPx: 800,
      heightPx: 600,
      rows: 2,
      cols: 2,
      gutterPx: 12,
      outerGutter: true,
      colWeights: [0.5, 0.5],
      rowWeights: [0.5, 0.5],
      panels,
    });
    // outer = 12; inner gutter = 12; avail = 800 - 36 = 764, floor 382 each.
    expect(rects.a).toEqual({ x: 12, y: 12, w: 382, h: 282 });
    // last col absorbs remainder (764 - 764 = 0 → still 382), last row similarly.
    expect(rects.b).toEqual({ x: 12 + 382 + 12, y: 12, w: 382, h: 282 });
    expect(rects.d.x + rects.d.w).toBe(800 - 12);
    expect(rects.d.y + rects.d.h).toBe(600 - 12);
  });

  it("respects unequal weights — wider first column shrinks the second", () => {
    const panels: Panel[] = [P("a", 0, 0), P("b", 0, 1)];
    const rects = rectsFromUniform({
      widthPx: 800,
      heightPx: 100,
      rows: 1,
      cols: 2,
      gutterPx: 0,
      outerGutter: false,
      colWeights: [0.75, 0.25],
      rowWeights: [1.0],
      panels,
    });
    expect(rects.a.x).toBe(0);
    expect(rects.a.w).toBe(600);
    expect(rects.b.x).toBe(600);
    // Last col absorbs any rounding remainder so right edge sits on widthPx.
    expect(rects.b.x + rects.b.w).toBe(800);
  });

  it("handles merged panels by summing the weights they span", () => {
    const panels: Panel[] = [
      P("merged", 0, 0, 2, 2),
      P("c", 2, 0),
      P("d", 2, 1),
    ];
    const rects = rectsFromUniform({
      widthPx: 800,
      heightPx: 600,
      rows: 3,
      cols: 2,
      gutterPx: 0,
      outerGutter: false,
      colWeights: [0.5, 0.5],
      rowWeights: [1 / 3, 1 / 3, 1 / 3],
      panels,
    });
    expect(rects.merged.x).toBe(0);
    expect(rects.merged.y).toBe(0);
    expect(rects.merged.w).toBe(800);
    // 2 of 3 rows merged → 2/3 of 600 = 400.
    expect(rects.merged.h).toBe(400);
    expect(rects.c.y).toBe(400);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL on missing export**

Run: `pnpm vitest run test/unit/grid-layout.test.ts`
Expected: FAIL — `rectsFromUniform` not exported.

- [ ] **Step 3: Implement `rectsFromUniform`**

Append to `src/renderer/model/grid-layout.ts`:

```ts
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
 * Map each panel to its rect under a uniform layout with weighted tracks.
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
  const availW = widthPx - gutterPx * ((outerGutter ? 2 : 0) + (cols - 1));
  const availH = heightPx - gutterPx * ((outerGutter ? 2 : 0) + (rows - 1));

  const colWPx = inp.colWeights.map((w) => Math.floor(availW * w));
  const rowHPx = inp.rowWeights.map((w) => Math.floor(availH * w));
  const wRem = availW - colWPx.reduce((a, b) => a + b, 0);
  const hRem = availH - rowHPx.reduce((a, b) => a + b, 0);
  if (cols > 0) colWPx[cols - 1] = colWPx[cols - 1]! + wRem;
  if (rows > 0) rowHPx[rows - 1] = rowHPx[rows - 1]! + hRem;

  const colX: number[] = new Array(cols).fill(0);
  const rowY: number[] = new Array(rows).fill(0);
  for (let i = 0; i < cols; i++) {
    colX[i] =
      outerOffset + (i === 0 ? 0 : colX[i - 1]! + colWPx[i - 1]! + gutterPx);
  }
  for (let i = 0; i < rows; i++) {
    rowY[i] =
      outerOffset + (i === 0 ? 0 : rowY[i - 1]! + rowHPx[i - 1]! + gutterPx);
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
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm vitest run test/unit/grid-layout.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/model/grid-layout.ts test/unit/grid-layout.test.ts
git commit -m "feat(qa-feedback): rectsFromUniform with weighted tracks (spec 11)"
```

---

## Task 3: Free-form cascade math (`resizePanelFreeform`)

**Files:**

- Modify: `src/renderer/model/grid-layout.ts`
- Modify: `test/unit/grid-layout.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/grid-layout.test.ts`:

```ts
import {
  resizePanelFreeform,
  type FreeRect,
} from "../../src/renderer/model/grid-layout";

describe("resizePanelFreeform", () => {
  // Two-by-two grid in a 1000x1000 figure with no gutters, for clean math.
  const baseRects: Record<string, FreeRect> = {
    tl: { x: 0, y: 0, w: 500, h: 500 },
    tr: { x: 500, y: 0, w: 500, h: 500 },
    bl: { x: 0, y: 500, w: 500, h: 500 },
    br: { x: 500, y: 500, w: 500, h: 500 },
  };

  it("dragging tl's bottom-right corner +50,+50 grows tl and shrinks tr/bl/br", () => {
    const r = resizePanelFreeform(baseRects, "tl", "br", 50, 50);
    expect(r.applied).toEqual({ dx: 50, dy: 50 });
    expect(r.rects.tl).toEqual({ x: 0, y: 0, w: 550, h: 550 });
    // tr shifted right edge unchanged, left edge moved → narrower.
    expect(r.rects.tr).toEqual({ x: 550, y: 0, w: 450, h: 550 });
    // bl: left edge same, top moved down → shorter.
    expect(r.rects.bl).toEqual({ x: 0, y: 550, w: 550, h: 450 });
    // br: top-left moved.
    expect(r.rects.br).toEqual({ x: 550, y: 550, w: 450, h: 450 });
  });

  it("clamps drag so no panel falls below MIN_PANEL_W", () => {
    // br is at width 500. To squeeze tr to MIN_PANEL_W=30, the dx limit
    // is 500 - 30 = 470 figure-px.
    const r = resizePanelFreeform(baseRects, "tl", "br", 9999, 0);
    expect(r.applied.dx).toBe(470);
    expect(r.rects.tr.w).toBe(30);
    expect(r.rects.br.w).toBe(30);
  });

  it("dragging the top-left corner of br by -50,-50 grows br toward origin", () => {
    const r = resizePanelFreeform(baseRects, "br", "tl", -50, -50);
    expect(r.applied).toEqual({ dx: -50, dy: -50 });
    expect(r.rects.br).toEqual({ x: 450, y: 450, w: 550, h: 550 });
    expect(r.rects.tr).toEqual({ x: 500, y: 0, w: 500, h: 450 });
    expect(r.rects.bl).toEqual({ x: 0, y: 500, w: 450, h: 500 });
    expect(r.rects.tl).toEqual({ x: 0, y: 0, w: 450, h: 450 });
  });

  it("a no-op drag returns rects unchanged with zero applied", () => {
    const r = resizePanelFreeform(baseRects, "tl", "br", 0, 0);
    expect(r.applied).toEqual({ dx: 0, dy: 0 });
    expect(r.rects).toEqual(baseRects);
  });

  it("a panel not in the rects map is rejected (returns input + zero)", () => {
    const r = resizePanelFreeform(baseRects, "ghost", "br", 50, 50);
    expect(r.applied).toEqual({ dx: 0, dy: 0 });
    expect(r.rects).toEqual(baseRects);
  });

  it("panels not sharing the moved edge stay put", () => {
    // 1x3 layout: a | b | c. Dragging a's right edge only touches a and b.
    const rects: Record<string, FreeRect> = {
      a: { x: 0, y: 0, w: 200, h: 100 },
      b: { x: 200, y: 0, w: 200, h: 100 },
      c: { x: 400, y: 0, w: 200, h: 100 },
    };
    const r = resizePanelFreeform(rects, "a", "br", 30, 0);
    expect(r.rects.a).toEqual({ x: 0, y: 0, w: 230, h: 100 });
    expect(r.rects.b).toEqual({ x: 230, y: 0, w: 170, h: 100 });
    expect(r.rects.c).toEqual({ x: 400, y: 0, w: 200, h: 100 });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm vitest run test/unit/grid-layout.test.ts`
Expected: FAIL on missing `resizePanelFreeform`.

- [ ] **Step 3: Implement `resizePanelFreeform`**

Append to `src/renderer/model/grid-layout.ts`:

```ts
export type Corner = "tl" | "tr" | "bl" | "br";

export interface FreeformResizeResult {
  rects: Record<string, FreeRect>;
  applied: { dx: number; dy: number };
}

/**
 * Drag panel `panelId` by its `corner` by (dx, dy) figure-px. The dragged
 * corner's two edges propagate: every panel sharing the moved edge as its
 * opposite side shrinks/grows by the same delta.
 *
 * Edge identity:
 *   tl-corner ↔ left + top edges of P
 *   tr-corner ↔ right + top
 *   bl-corner ↔ left + bottom
 *   br-corner ↔ right + bottom
 *
 * For each affected edge, find peers whose opposite side is at exactly the
 * same coordinate as P's moved edge — those are the immediate neighbors
 * (using a small ε for float robustness). Cascade: a panel whose edge moved
 * may propagate further to its own neighbors only if it changed coordinates
 * (handled here by computing the moved-edge set in a single pass — every
 * panel's affected sides are derived from the SAME pre-cascade target edge
 * value, so two-step cascading reduces to a single linear adjustment).
 *
 * Clamp: the largest |dx| or |dy| that keeps every affected panel's width >=
 * MIN_PANEL_W and height >= MIN_PANEL_H. We clamp the input delta uniformly
 * (rather than per-panel) so the cascade is consistent — no overlaps, no
 * negative dims.
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

  // Edge X coordinate the user is moving; same idea on Y.
  const xEdge = movesRight ? target.x + target.w : target.x;
  const yEdge = movesBottom ? target.y + target.h : target.y;

  const ids = Object.keys(rects);
  // Tolerance: tracks rounded to integer px should match exactly, but we
  // stay generous for floats from prior drag math.
  const EPS = 0.5;

  // Partition panels by how each edge change affects them.
  // groupX = panels whose width changes when xEdge moves by dx.
  // For movesRight: shrink panels whose LEFT edge sits at xEdge (their left
  // moves right when target's right moves right). Target itself: right edge
  // moves; it's in the "grow" set with sign +1.
  // For movesLeft: shrink panels whose RIGHT edge sits at xEdge (their right
  // moves left when target's left moves left). Target's left moves; sign -1.
  type Side = "growRight" | "shrinkLeft" | "growLeft" | "shrinkRight";
  interface Affected {
    id: string;
    sideX?: Side;
    sideY?: Side;
  }
  const affected = new Map<string, Affected>();
  function mark(id: string, key: "sideX" | "sideY", side: Side): void {
    const a = affected.get(id) ?? { id };
    a[key] = side;
    affected.set(id, a);
  }

  // Mark target's own sides.
  if (movesRight) mark(panelId, "sideX", "growRight");
  if (movesLeft) mark(panelId, "sideX", "growLeft");
  if (movesBottom) mark(panelId, "sideY", "growRight"); // bottom == growRight on Y
  if (movesTop) mark(panelId, "sideY", "growLeft"); // top == growLeft on Y

  // Mark neighbors.
  for (const id of ids) {
    if (id === panelId) continue;
    const r = rects[id]!;
    const left = r.x;
    const right = r.x + r.w;
    const top = r.y;
    const bottom = r.y + r.h;
    if (movesRight && Math.abs(left - xEdge) < EPS) {
      mark(id, "sideX", "shrinkLeft");
    } else if (movesLeft && Math.abs(right - xEdge) < EPS) {
      mark(id, "sideX", "shrinkRight");
    }
    if (movesBottom && Math.abs(top - yEdge) < EPS) {
      mark(id, "sideY", "shrinkLeft");
    } else if (movesTop && Math.abs(bottom - yEdge) < EPS) {
      mark(id, "sideY", "shrinkRight");
    }
  }

  // Compute per-axis clamp.
  // Each affected panel's width-change as a function of dx:
  //   target growRight: w' = w + dx
  //   target growLeft:  w' = w - dx  (left moves by dx, but in growLeft the
  //                                  sign convention is dx is the left-edge
  //                                  movement; growing means dx<0 → +w. We
  //                                  invert below by negating dx for left-side
  //                                  drags so dx>0 always means the user
  //                                  pushed outward.)
  //   neighbor shrinkLeft: w' = w - dx
  //   neighbor shrinkRight: w' = w + dx
  // To keep math uniform, we let the public `dx`/`dy` be RAW pointer deltas:
  // for tl/bl/tr/br corners alike, +dx is "user pushed right", +dy is "user
  // pushed down". We then translate to per-edge sign.
  //
  // Per-side dim formula (where ddx is the edge's movement on the X axis):
  //   growRight    → w' = w + ddx        (right edge moves +ddx)
  //   growLeft     → w' = w - ddx        (left  edge moves +ddx, inner shrinks)
  //   shrinkLeft   → w' = w - ddx        (left  edge moves +ddx, inner shrinks)
  //   shrinkRight  → w' = w + ddx        (right edge moves +ddx, inner grows)
  // For LEFT-corner drags, user's positive dx pulls the LEFT edge right,
  // which collapses the target. To honor "+dx grows the panel" we flip the
  // sign: ddx = movesLeft ? -dx : +dx. We then apply that ddx to every
  // affected panel using its side's formula.
  const ddxRaw = movesLeft ? -dx : dx;
  const ddyRaw = movesTop ? -dy : dy;

  // Find max |ddx| keeping every affected panel's width >= MIN_PANEL_W.
  function clampAxis(
    delta: number,
    sideKey: "sideX" | "sideY",
    dimKey: "w" | "h",
    min: number,
  ): number {
    if (delta === 0) return 0;
    let bound = Math.abs(delta);
    for (const a of affected.values()) {
      const side = a[sideKey];
      if (side === undefined) continue;
      const r = rects[a.id]!;
      const dim = r[dimKey];
      // direction multiplier: +1 if delta makes panel grow, -1 if shrinks.
      const grows = side === "growRight" || side === "shrinkRight";
      // dim' = dim + (grows ? +delta : -delta). Constraint: dim' >= min.
      // If grows, no bound from below (delta could be negative; constraint
      // dim - |delta| >= min when delta<0).
      // Generalize: dim' = dim + sign * delta where sign = grows ? +1 : -1.
      // Constraint: dim + sign*delta >= min ⇒ sign*delta >= min - dim.
      // delta has known sign: same as input. Let mag = |delta|. Then:
      //   sign*delta = sign*sgn(delta)*mag
      // If sign*sgn(delta) == +1 (panel grows in this direction): no clamp.
      // Else (-1): mag <= dim - min ⇒ bound = min(bound, dim - min).
      const inputSign = delta > 0 ? 1 : -1;
      const effective = (grows ? 1 : -1) * inputSign;
      if (effective < 0) {
        const headroom = dim - min;
        if (headroom < bound) bound = Math.max(0, headroom);
      }
    }
    return delta > 0 ? bound : -bound;
  }

  const ddx = clampAxis(ddxRaw, "sideX", "w", MIN_PANEL_W);
  const ddy = clampAxis(ddyRaw, "sideY", "h", MIN_PANEL_H);

  // Apply clamped deltas. Translate ddx back to user-space dx for the result.
  const appliedDx = movesLeft ? -ddx : ddx;
  const appliedDy = movesTop ? -ddy : ddy;

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
    if (a.sideX === "growRight") w += ddx;
    else if (a.sideX === "shrinkRight") w += ddx;
    else if (a.sideX === "growLeft") {
      x += ddx; // left edge moves by ddx in user-space-flipped frame
      w -= ddx;
    } else if (a.sideX === "shrinkLeft") {
      x += ddx;
      w -= ddx;
    }
    if (a.sideY === "growRight") h += ddy;
    else if (a.sideY === "shrinkRight") h += ddy;
    else if (a.sideY === "growLeft") {
      y += ddy;
      h -= ddy;
    } else if (a.sideY === "shrinkLeft") {
      y += ddy;
      h -= ddy;
    }
    out[id] = { x, y, w, h };
  }

  return { rects: out, applied: { dx: appliedDx, dy: appliedDy } };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm vitest run test/unit/grid-layout.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/model/grid-layout.ts test/unit/grid-layout.test.ts
git commit -m "feat(qa-feedback): freeform corner-resize cascade with MIN_PANEL clamps (spec 11)"
```

---

## Task 4: Add `layout` field to `FigureState`

**Files:**

- Modify: `src/renderer/model/figure-state.ts`
- Modify: `test/unit/figure-state.test.ts` (existing)

- [ ] **Step 1: Write the failing test**

Append to `test/unit/figure-state.test.ts` a new describe block:

```ts
import { initialFigureState } from "../../src/renderer/model/figure-state";

describe("initialFigureState — layout", () => {
  it("seeds a uniform 2x2 layout with equal weights", () => {
    const s = initialFigureState();
    expect(s.layout.kind).toBe("uniform");
    if (s.layout.kind !== "uniform") throw new Error("unreachable");
    expect(s.layout.colWeights).toEqual([0.5, 0.5]);
    expect(s.layout.rowWeights).toEqual([0.5, 0.5]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`s.layout` is undefined)

Run: `pnpm vitest run test/unit/figure-state.test.ts -t "layout"`
Expected: FAIL.

- [ ] **Step 3: Add the field**

In `src/renderer/model/figure-state.ts`:

1. Add import at top:
   ```ts
   import { type GridLayout, uniformLayoutFor } from "./grid-layout";
   ```
2. Add to `FigureState` interface:
   ```ts
   /**
    * Layout regime. Default: uniform with equal weights for the current
    * grid dims (matches pre-spec-11 behavior). User actions transition this
    * to `free` (single-panel corner resize) or back via RESET_TO_UNIFORM_GRID.
    */
   layout: GridLayout;
   ```
3. In `initialFigureState`, add `layout: uniformLayoutFor(2, 2),` to the returned object.
4. Re-export the type from this module (so callers can `import type { GridLayout } from ".../figure-state"` if they prefer):
   ```ts
   export type { GridLayout } from "./grid-layout";
   ```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm vitest run test/unit/figure-state.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run typecheck — expect FAIL on stale serialize/schema**

Run: `pnpm typecheck`
Expected: errors in serialize.ts / schema.ts about missing `layout` (we'll fix in Tasks 11+12).

Note: this is intentional — typecheck will stay broken until Task 12 fully wires the schema layer. Subsequent tasks must keep the failing-test → passing-test → commit loop on a per-test basis even while typecheck is red. The plan returns typecheck to green by end of Task 12.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/model/figure-state.ts test/unit/figure-state.test.ts
git commit -m "feat(qa-feedback): add layout: GridLayout to FigureState (spec 11)"
```

---

## Task 5: Reducer action `SET_TRACK_WEIGHT`

**Files:**

- Modify: `src/renderer/model/figure-actions.ts`
- Modify: `test/unit/figure-actions.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/figure-actions.test.ts`:

```ts
import { setTrackWeightAction } from "../../src/renderer/model/figure-actions";

describe("SET_TRACK_WEIGHT", () => {
  it("adjusts col weights pairwise and preserves their sum", () => {
    const s0 = initialFigureState(); // 2x2, [0.5, 0.5] / [0.5, 0.5]
    const s1 = figureReducer(s0, setTrackWeightAction("col", 0, 0.7));
    if (s1.layout.kind !== "uniform") throw new Error("unreachable");
    expect(s1.layout.colWeights).toEqual([0.7, 0.3]);
    expect(s1.layout.rowWeights).toEqual([0.5, 0.5]);
  });

  it("returns ===-same state when value is unchanged", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, setTrackWeightAction("col", 0, 0.5));
    expect(s1).toBe(s0);
  });

  it("is a no-op when layout is free-form", () => {
    const s0 = initialFigureState();
    // Force into free mode for this test by writing layout directly via RESET_TO_STATE.
    const free: FigureState = {
      ...s0,
      layout: {
        kind: "free",
        rects: { x: { x: 0, y: 0, w: 100, h: 100 } },
      },
    };
    const s1 = figureReducer(free, setTrackWeightAction("col", 0, 0.7));
    expect(s1).toBe(free);
  });

  it("rejects out-of-range index as a no-op", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, setTrackWeightAction("col", 5, 0.7));
    expect(s1).toBe(s0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL on missing import**

Run: `pnpm vitest run test/unit/figure-actions.test.ts -t "SET_TRACK_WEIGHT"`
Expected: FAIL.

- [ ] **Step 3: Implement the action**

In `src/renderer/model/figure-actions.ts`:

1. Import:

   ```ts
   import {
     setTrackWeight,
     uniformLayoutFor,
     resizePanelFreeform,
     rectsFromUniform,
     type FreeRect,
     type Corner,
     type GridLayout,
   } from "./grid-layout";
   ```

2. Add to `FigureAction` union:

   ```ts
   | { type: "SET_TRACK_WEIGHT"; axis: "row" | "col"; index: number; weight: number }
   ```

3. Add the action creator:

   ```ts
   export const setTrackWeightAction = (
     axis: "row" | "col",
     index: number,
     weight: number,
   ): FigureAction => ({ type: "SET_TRACK_WEIGHT", axis, index, weight });
   ```

4. Add the reducer case (above the `default` branch):
   ```ts
   case "SET_TRACK_WEIGHT": {
     if (s.layout.kind !== "uniform") return s;
     const cur = a.axis === "col" ? s.layout.colWeights : s.layout.rowWeights;
     const next = setTrackWeight(cur, a.index, a.weight);
     // setTrackWeight returns a copy even on no-op; compare values to keep
     // the ===-same-state contract.
     if (
       next.length === cur.length &&
       next.every((v, i) => v === cur[i])
     ) {
       return s;
     }
     const layout: GridLayout =
       a.axis === "col"
         ? { ...s.layout, colWeights: next }
         : { ...s.layout, rowWeights: next };
     return { ...s, layout };
   }
   ```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm vitest run test/unit/figure-actions.test.ts -t "SET_TRACK_WEIGHT"`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/model/figure-actions.ts test/unit/figure-actions.test.ts
git commit -m "feat(qa-feedback): SET_TRACK_WEIGHT reducer (spec 11)"
```

---

## Task 6: Reducer actions `RESIZE_PANEL_FREEFORM` + `RESET_TO_UNIFORM_GRID`

**Files:**

- Modify: `src/renderer/model/figure-actions.ts`
- Modify: `test/unit/figure-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/figure-actions.test.ts`:

```ts
import {
  resizePanelFreeformAction,
  resetToUniformGridAction,
} from "../../src/renderer/model/figure-actions";

describe("RESIZE_PANEL_FREEFORM", () => {
  it("converts uniform → free with snapshot rects, then applies the cascade", () => {
    __resetPanelIdsForTests();
    const s0 = initialFigureState(); // 2x2 uniform, panels panel-1..panel-4
    // Use canvas dims that match production: deriveFigure builds Figure with
    // canvas dims, so we approximate by computing rects from the same source
    // of truth via rectsFromUniform under our test canvas.
    const s1 = figureReducer(
      s0,
      resizePanelFreeformAction("panel-1", "br", 50, 50, {
        widthPx: 800,
        heightPx: 600,
      }),
    );
    expect(s1.layout.kind).toBe("free");
    if (s1.layout.kind !== "free") throw new Error("unreachable");
    expect(s1.layout.rects["panel-1"]!.w).toBe(394 + 50); // baseline col w + dx
    // panel-2 (top-right) shrinks by 50 on the left side.
    expect(s1.layout.rects["panel-2"]!.x).toBe(
      s1.layout.rects["panel-1"]!.x + s1.layout.rects["panel-1"]!.w + 12,
    );
  });

  it("subsequent free-form drag updates rects without changing layout.kind", () => {
    __resetPanelIdsForTests();
    const s0 = initialFigureState();
    const s1 = figureReducer(
      s0,
      resizePanelFreeformAction("panel-1", "br", 10, 0, {
        widthPx: 800,
        heightPx: 600,
      }),
    );
    const s2 = figureReducer(
      s1,
      resizePanelFreeformAction("panel-1", "br", 5, 0, {
        widthPx: 800,
        heightPx: 600,
      }),
    );
    expect(s2.layout.kind).toBe("free");
    if (s2.layout.kind !== "free") throw new Error("unreachable");
    if (s1.layout.kind !== "free") throw new Error("unreachable");
    expect(s2.layout.rects["panel-1"]!.w).toBe(
      s1.layout.rects["panel-1"]!.w + 5,
    );
  });

  it("is a no-op when target panel is missing", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(
      s0,
      resizePanelFreeformAction("nope", "br", 50, 50, {
        widthPx: 800,
        heightPx: 600,
      }),
    );
    expect(s1).toBe(s0);
  });
});

describe("RESET_TO_UNIFORM_GRID", () => {
  it("rebuilds equal weights from current rows/cols and discards rects", () => {
    __resetPanelIdsForTests();
    const s0 = initialFigureState();
    const s1 = figureReducer(
      s0,
      resizePanelFreeformAction("panel-1", "br", 50, 50, {
        widthPx: 800,
        heightPx: 600,
      }),
    );
    const s2 = figureReducer(s1, resetToUniformGridAction());
    expect(s2.layout.kind).toBe("uniform");
    if (s2.layout.kind !== "uniform") throw new Error("unreachable");
    expect(s2.layout.colWeights).toEqual([0.5, 0.5]);
    expect(s2.layout.rowWeights).toEqual([0.5, 0.5]);
  });

  it("is a ===-no-op when already uniform with equal weights", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, resetToUniformGridAction());
    expect(s1).toBe(s0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm vitest run test/unit/figure-actions.test.ts -t "RESIZE_PANEL_FREEFORM|RESET_TO_UNIFORM_GRID"`
Expected: FAIL.

- [ ] **Step 3: Implement the actions**

In `src/renderer/model/figure-actions.ts`:

1. Add to the `FigureAction` union:

   ```ts
   | {
       type: "RESIZE_PANEL_FREEFORM";
       panelId: string;
       corner: Corner;
       dx: number;
       dy: number;
       /** Canvas dims used to snapshot uniform → free on first drag. */
       canvas: { widthPx: number; heightPx: number };
     }
   | { type: "RESET_TO_UNIFORM_GRID" }
   ```

2. Action creators:

   ```ts
   export const resizePanelFreeformAction = (
     panelId: string,
     corner: Corner,
     dx: number,
     dy: number,
     canvas: { widthPx: number; heightPx: number },
   ): FigureAction => ({
     type: "RESIZE_PANEL_FREEFORM",
     panelId,
     corner,
     dx,
     dy,
     canvas,
   });

   export const resetToUniformGridAction = (): FigureAction => ({
     type: "RESET_TO_UNIFORM_GRID",
   });
   ```

3. Reducer cases (before `default`):

   ```ts
   case "RESIZE_PANEL_FREEFORM": {
     const target = findPanelById(s.panels, a.panelId);
     if (target === undefined) return s;
     // Snapshot current rects from the active layout so the cascade has a
     // pre-cascade baseline. Uniform → derive via rectsFromUniform; free →
     // use the existing rects map.
     const baseRects =
       s.layout.kind === "free"
         ? s.layout.rects
         : rectsFromUniform({
             widthPx: a.canvas.widthPx,
             heightPx: a.canvas.heightPx,
             rows: s.rows,
             cols: s.cols,
             gutterPx: s.gutterPx,
             outerGutter: s.outerGutter,
             colWeights: s.layout.colWeights,
             rowWeights: s.layout.rowWeights,
             panels: s.panels,
           });
     const r = resizePanelFreeform(baseRects, a.panelId, a.corner, a.dx, a.dy);
     if (r.applied.dx === 0 && r.applied.dy === 0) {
       // No movement applied — but if we were uniform, still flip to free with
       // the snapshot rects so subsequent drags start from a stable baseline.
       // BUT: the pure UI (not yet built) only dispatches when dx|dy != 0, so
       // we keep this branch as a true no-op to preserve the ===-same-state
       // contract for property-based tests.
       if (s.layout.kind === "free" && r.rects === s.layout.rects) return s;
       if (s.layout.kind === "uniform") return s;
       return s;
     }
     return { ...s, layout: { kind: "free", rects: r.rects } };
   }

   case "RESET_TO_UNIFORM_GRID": {
     const fresh = uniformLayoutFor(s.rows, s.cols);
     // Short-circuit if already uniform with the same weight vectors.
     if (
       s.layout.kind === "uniform" &&
       fresh.kind === "uniform" &&
       arraysEqual(s.layout.colWeights, fresh.colWeights) &&
       arraysEqual(s.layout.rowWeights, fresh.rowWeights)
     ) {
       return s;
     }
     return { ...s, layout: fresh };
   }
   ```

4. Add the helper `arraysEqual` near `clampInt`:
   ```ts
   function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
     if (a.length !== b.length) return false;
     for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
     return true;
   }
   ```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm vitest run test/unit/figure-actions.test.ts -t "RESIZE_PANEL_FREEFORM|RESET_TO_UNIFORM_GRID"`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/model/figure-actions.ts test/unit/figure-actions.test.ts
git commit -m "feat(qa-feedback): RESIZE_PANEL_FREEFORM + RESET_TO_UNIFORM_GRID reducers (spec 11)"
```

---

## Task 7: Layout-mutating actions reset/migrate `layout`

`RESIZE_GRID`, `MERGE_CELLS`, `UNMERGE_PANEL`, `DELETE_PANEL`, `RESTORE_PANEL_AT` all change panel identity or grid dims. The `layout` field has invariants tied to those (weights array length === cols/rows; free rects keyed by surviving panel ids). Without housekeeping, a resize-grid then track-drag would crash on out-of-range index.

**Files:**

- Modify: `src/renderer/model/figure-actions.ts`
- Modify: `test/unit/figure-actions.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `test/unit/figure-actions.test.ts`:

```ts
import {
  resizeGrid as resizeGridAction,
  mergeCells,
  unmergePanelAction,
  deletePanel,
  restorePanelAt,
} from "../../src/renderer/model/figure-actions";

describe("layout housekeeping across grid mutations", () => {
  it("RESIZE_GRID rebuilds uniform weights to the new dims", () => {
    __resetPanelIdsForTests();
    const s0 = initialFigureState(); // 2x2
    const s1 = figureReducer(s0, resizeGridAction(3, 4));
    expect(s1.layout.kind).toBe("uniform");
    if (s1.layout.kind !== "uniform") throw new Error("unreachable");
    expect(s1.layout.colWeights.length).toBe(4);
    expect(s1.layout.rowWeights.length).toBe(3);
    // Sum-normalized.
    expect(s1.layout.colWeights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("RESIZE_GRID drops free-form layout and reverts to uniform", () => {
    __resetPanelIdsForTests();
    const s0 = initialFigureState();
    const sFree = figureReducer(
      s0,
      resizePanelFreeformAction("panel-1", "br", 50, 50, {
        widthPx: 800,
        heightPx: 600,
      }),
    );
    expect(sFree.layout.kind).toBe("free");
    const sResized = figureReducer(sFree, resizeGridAction(3, 3));
    expect(sResized.layout.kind).toBe("uniform");
  });

  it("DELETE_PANEL drops the panel's rect from a free layout", () => {
    __resetPanelIdsForTests();
    const s0 = initialFigureState();
    const sFree = figureReducer(
      s0,
      resizePanelFreeformAction("panel-1", "br", 10, 10, {
        widthPx: 800,
        heightPx: 600,
      }),
    );
    if (sFree.layout.kind !== "free") throw new Error("unreachable");
    expect(sFree.layout.rects["panel-2"]).toBeDefined();
    const sDeleted = figureReducer(sFree, deletePanel("panel-2"));
    if (sDeleted.layout.kind !== "free") throw new Error("unreachable");
    expect(sDeleted.layout.rects["panel-2"]).toBeUndefined();
  });

  it("MERGE_CELLS resets layout to uniform (merged panels invalidate rects)", () => {
    __resetPanelIdsForTests();
    const s0 = initialFigureState();
    const sFree = figureReducer(
      s0,
      resizePanelFreeformAction("panel-1", "br", 10, 10, {
        widthPx: 800,
        heightPx: 600,
      }),
    );
    const sMerged = figureReducer(
      sFree,
      mergeCells([
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ]),
    );
    expect(sMerged.layout.kind).toBe("uniform");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm vitest run test/unit/figure-actions.test.ts -t "layout housekeeping"`
Expected: FAIL.

- [ ] **Step 3: Wire layout housekeeping into the affected reducer cases**

In `src/renderer/model/figure-actions.ts`:

1. **`RESIZE_GRID`**: after computing new rows/cols/panels, set `layout: uniformLayoutFor(rows, cols)`. Replace the existing return statement with:

   ```ts
   return {
     ...s,
     rows,
     cols,
     panels: r.panels,
     letterOverrides,
     layout: uniformLayoutFor(rows, cols),
   };
   ```

2. **`MERGE_CELLS`** and **`UNMERGE_PANEL`**: append `layout: uniformLayoutFor(s.rows, s.cols)` to the returned state. Rationale: a merged panel's id changes, and free-form rects keyed by old ids would dangle. Reverting to uniform is simpler than rect surgery and matches the spec's "v1 implementation choice — recommend equal weights for simplicity."

   For `MERGE_CELLS` replace:

   ```ts
   return { ...s, panels: nextPanels, letterOverrides };
   ```

   with:

   ```ts
   return {
     ...s,
     panels: nextPanels,
     letterOverrides,
     layout: uniformLayoutFor(s.rows, s.cols),
   };
   ```

   For `UNMERGE_PANEL` replace:

   ```ts
   return { ...s, panels: next, letterOverrides };
   ```

   with:

   ```ts
   return {
     ...s,
     panels: next,
     letterOverrides,
     layout: uniformLayoutFor(s.rows, s.cols),
   };
   ```

3. **`DELETE_PANEL`**: drop the panel's rect entry from a free layout (keep weights for uniform). Replace the existing return:

   ```ts
   const layout: GridLayout =
     s.layout.kind === "free" && a.panelId in s.layout.rects
       ? { kind: "free", rects: omitKey(s.layout.rects, a.panelId) }
       : s.layout;
   return { ...s, panels, letterOverrides, annotations, layout };
   ```

4. **`RESTORE_PANEL_AT`**: a fresh empty panel appears with no entry in the free rects map. If layout is free, the renderer needs an entry. Simplest: revert to uniform (a free layout with a missing panel can't render). Append `layout: uniformLayoutFor(s.rows, s.cols)` when the layout was free; keep uniform unchanged when layout was uniform. Replace the existing return with:

   ```ts
   const layout: GridLayout =
     s.layout.kind === "free" ? uniformLayoutFor(s.rows, s.cols) : s.layout;
   return { ...s, panels, layout };
   ```

5. Add the `omitKey` helper near `arraysEqual`:
   ```ts
   function omitKey<T>(map: Record<string, T>, key: string): Record<string, T> {
     const out: Record<string, T> = {};
     for (const k in map) if (k !== key) out[k] = map[k]!;
     return out;
   }
   ```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm vitest run test/unit/figure-actions.test.ts -t "layout housekeeping"`
Expected: 4 tests pass.

- [ ] **Step 5: Run the full reducer suite to catch regressions**

Run: `pnpm vitest run test/unit/figure-actions.test.ts`
Expected: all tests pass (no regressions in pre-existing reducer tests).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/model/figure-actions.ts test/unit/figure-actions.test.ts
git commit -m "feat(qa-feedback): layout housekeeping across grid mutations (spec 11)"
```

---

## Task 8: Wire `layout` through `Figure` type + `deriveFigure`

**Files:**

- Modify: `src/renderer/model/types.ts`
- Modify: `src/renderer/model/figure-derivations.ts`
- Modify: `test/unit/figure-derivations.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/figure-derivations.test.ts`:

```ts
import { uniformLayoutFor } from "../../src/renderer/model/grid-layout";

describe("deriveFigure — layout passthrough", () => {
  it("copies state.layout onto figure.grid.layout", () => {
    const s = initialFigureState();
    const f = deriveFigure(s, {
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
    });
    expect(f.grid.layout).toEqual(uniformLayoutFor(2, 2));
  });

  it("propagates a free-form layout unchanged", () => {
    const s0 = initialFigureState();
    const free: typeof s0 = {
      ...s0,
      layout: {
        kind: "free",
        rects: {
          "panel-1": { x: 10, y: 10, w: 100, h: 100 },
        },
      },
    };
    const f = deriveFigure(free, {
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
    });
    expect(f.grid.layout).toEqual(free.layout);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm vitest run test/unit/figure-derivations.test.ts -t "layout"`
Expected: FAIL on missing `f.grid.layout`.

- [ ] **Step 3: Add `layout` to `FigureGrid` and propagate**

In `src/renderer/model/types.ts`, modify `FigureGrid`:

```ts
import type { GridLayout } from "./grid-layout";

export interface FigureGrid {
  rows: number;
  cols: number;
  gutterPx: number;
  gutterColor: Hex;
  outerGutter?: boolean;
  /**
   * Layout regime. Optional on the type so hand-built test fixtures (which
   * pre-date spec 11) still compile; `computePanelRects` defaults missing
   * values to a uniform layout with equal weights for the current grid dims.
   * Production figures always carry the full layout via `deriveFigure`.
   */
  layout?: GridLayout;
}
```

In `src/renderer/model/figure-derivations.ts`, augment the returned `grid`:

```ts
return {
  canvas: opts.canvas,
  grid: {
    rows: state.rows,
    cols: state.cols,
    gutterPx: state.gutterPx,
    gutterColor: state.gutterColor,
    outerGutter: state.outerGutter,
    layout: state.layout,
  },
  panels,
  // ... rest unchanged
};
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm vitest run test/unit/figure-derivations.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/model/types.ts src/renderer/model/figure-derivations.ts test/unit/figure-derivations.test.ts
git commit -m "feat(qa-feedback): plumb GridLayout through Figure + deriveFigure (spec 11)"
```

---

## Task 9: `computePanelRects` branches on `layout.kind`

**Files:**

- Modify: `src/renderer/render/coords.ts`
- Modify: `test/unit/figure-layout.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `test/unit/figure-layout.test.ts`:

```ts
import { uniformLayoutFor } from "../../src/renderer/model/grid-layout";

describe("computePanelRects — layout-aware", () => {
  it("uniform with equal weights matches pre-spec-11 behavior", () => {
    // Hand-build a Figure WITHOUT layout, then with layout — same output.
    const baseFig: Figure = {
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      grid: { rows: 2, cols: 2, gutterPx: 12, gutterColor: "#FFFFFF" },
      panels: [
        { panelId: "a", row: 0, col: 0, kind: "placeholder", label: "A" },
        { panelId: "b", row: 0, col: 1, kind: "placeholder", label: "B" },
        { panelId: "c", row: 1, col: 0, kind: "placeholder", label: "C" },
        { panelId: "d", row: 1, col: 1, kind: "placeholder", label: "D" },
      ],
      annotations: [],
      globalStyle: DEFAULT_GLOBAL_STYLE,
    };
    const rectsNoLayout = computePanelRects(baseFig);
    const rectsWithLayout = computePanelRects({
      ...baseFig,
      grid: { ...baseFig.grid, layout: uniformLayoutFor(2, 2) },
    });
    expect(rectsWithLayout).toEqual(rectsNoLayout);
  });

  it("uniform with unequal weights produces wider tracks per the weights", () => {
    const fig: Figure = {
      canvas: { widthPx: 800, heightPx: 100, background: "#FFFFFF" },
      grid: {
        rows: 1,
        cols: 2,
        gutterPx: 0,
        gutterColor: "#FFFFFF",
        outerGutter: false,
        layout: { kind: "uniform", colWeights: [0.75, 0.25], rowWeights: [1] },
      },
      panels: [
        { panelId: "a", row: 0, col: 0, kind: "placeholder", label: "A" },
        { panelId: "b", row: 0, col: 1, kind: "placeholder", label: "B" },
      ],
      annotations: [],
      globalStyle: DEFAULT_GLOBAL_STYLE,
    };
    const rects = computePanelRects(fig);
    expect(rects[0]!.w).toBe(600);
    expect(rects[1]!.x).toBe(600);
    expect(rects[1]!.w).toBe(200);
  });

  it("free-form returns the layout's rect map keyed by panelId", () => {
    const fig: Figure = {
      canvas: { widthPx: 1000, heightPx: 1000, background: "#FFFFFF" },
      grid: {
        rows: 2,
        cols: 2,
        gutterPx: 0,
        gutterColor: "#FFFFFF",
        outerGutter: false,
        layout: {
          kind: "free",
          rects: {
            a: { x: 0, y: 0, w: 600, h: 400 },
            b: { x: 600, y: 0, w: 400, h: 400 },
          },
        },
      },
      panels: [
        { panelId: "a", row: 0, col: 0, kind: "placeholder", label: "A" },
        { panelId: "b", row: 0, col: 1, kind: "placeholder", label: "B" },
      ],
      annotations: [],
      globalStyle: DEFAULT_GLOBAL_STYLE,
    };
    const rects = computePanelRects(fig);
    expect(rects[0]).toEqual({ x: 0, y: 0, w: 600, h: 400 });
    expect(rects[1]).toEqual({ x: 600, y: 0, w: 400, h: 400 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm vitest run test/unit/figure-layout.test.ts -t "layout-aware"`
Expected: FAIL — current `computePanelRects` ignores layout.

- [ ] **Step 3: Branch `computePanelRects`**

In `src/renderer/render/coords.ts`, replace `computePanelRects`:

```ts
import { rectsFromUniform, uniformLayoutFor } from "../model/grid-layout";

export function computePanelRects(figure: Figure): PanelRect[] {
  const { widthPx, heightPx } = figure.canvas;
  const { rows, cols, gutterPx } = figure.grid;
  const outerGutter = figure.grid.outerGutter ?? true;
  const layout = figure.grid.layout ?? uniformLayoutFor(rows, cols);

  if (layout.kind === "free") {
    return figure.panels.map((p): PanelRect => {
      const r = p.panelId !== undefined ? layout.rects[p.panelId] : undefined;
      // Fallback: a panel without a rect entry (shouldn't happen in
      // production — reducer keeps rects in sync) renders as zero-area at
      // origin. Defensive only; tests should never hit this branch.
      return r ?? { x: 0, y: 0, w: 0, h: 0 };
    });
  }

  // Uniform: build a panelId-keyed rect map (handles unequal weights and
  // merged panels) and look up by panelId. For panels without an id (legacy
  // hand-built fixtures) fall back to the cell-grid path so old tests still
  // pass without modification.
  if (figure.panels.every((p) => p.panelId !== undefined)) {
    const idMap = rectsFromUniform({
      widthPx,
      heightPx,
      rows,
      cols,
      gutterPx,
      outerGutter,
      colWeights: layout.colWeights,
      rowWeights: layout.rowWeights,
      // Build a `Panel`-shaped input from the figure panels so rectsFromUniform
      // can do its job. We synthesize the minimum: id, row, col, spans.
      panels: figure.panels.map((p) => ({
        id: p.panelId!,
        row: p.row,
        col: p.col,
        rowSpan: p.rowSpan ?? 1,
        colSpan: p.colSpan ?? 1,
      })),
    });
    return figure.panels.map((p): PanelRect => idMap[p.panelId!]!);
  }

  // Legacy fallback: figures built without panelIds (some test fixtures).
  const gridLayout = computeGridLayout(
    widthPx,
    heightPx,
    rows,
    cols,
    gutterPx,
    outerGutter,
  );
  return figure.panels.map(
    (p: HardCodedPanel): PanelRect =>
      computeCellRect(gridLayout, p.row, p.col, p.rowSpan ?? 1, p.colSpan ?? 1),
  );
}
```

Note: the existing `computeGridLayout` and `computeCellRect` exports stay — they're consumed by `GridCells` for hole rendering. We'll handle `GridCells` separately in Task 13.

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm vitest run test/unit/figure-layout.test.ts`
Expected: all tests pass (including pre-existing ones).

- [ ] **Step 5: Run the full render-side suite**

Run: `pnpm vitest run test/unit/draw-figure.test.ts test/unit/editor-renderer.test.ts test/unit/export-renderer.test.ts test/unit/coords-transform.test.ts test/unit/figure-to-source.test.ts test/unit/figure-layout.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/render/coords.ts test/unit/figure-layout.test.ts
git commit -m "feat(qa-feedback): computePanelRects branches on layout.kind (spec 11)"
```

---

## Task 10: Schema v4 — type and validator

**Files:**

- Modify: `src/renderer/model/schema.ts`
- Modify: `test/unit/schema.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `test/unit/schema.test.ts`:

```ts
describe("schema v4 — layout", () => {
  function v4File(layoutOverride?: object): unknown {
    return {
      schemaVersion: 4,
      app: "mosaic-builder",
      appVersion: "0.1.0",
      createdAt: "2026-05-09T00:00:00.000Z",
      modifiedAt: "2026-05-09T00:00:00.000Z",
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      state: {
        rows: 2,
        cols: 2,
        gutterPx: 12,
        gutterColor: "#FFFFFF",
        outerGutter: true,
        pool: [],
        panels: [
          { id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1 },
          { id: "p2", row: 0, col: 1, rowSpan: 1, colSpan: 1 },
          { id: "p3", row: 1, col: 0, rowSpan: 1, colSpan: 1 },
          { id: "p4", row: 1, col: 1, rowSpan: 1, colSpan: 1 },
        ],
        annotations: [],
        globalStyle: {
          /* full style — copy from existing v3 fixture */
        },
        letterOverrides: {},
        letterPattern: "uppercase",
        layout: layoutOverride ?? {
          kind: "uniform",
          colWeights: [0.5, 0.5],
          rowWeights: [0.5, 0.5],
        },
      },
    };
  }

  it("accepts a uniform layout with valid weights", () => {
    const r = validateMosaicFile(v4File());
    expect(r.ok).toBe(true);
  });

  it("rejects uniform layout with mismatched colWeights length", () => {
    const r = validateMosaicFile(
      v4File({ kind: "uniform", colWeights: [1.0], rowWeights: [0.5, 0.5] }),
    );
    expect(r.ok).toBe(false);
  });

  it("accepts a free layout with valid rects", () => {
    const r = validateMosaicFile(
      v4File({
        kind: "free",
        rects: {
          p1: { x: 0, y: 0, w: 100, h: 100 },
        },
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("rejects free layout with non-numeric rect", () => {
    const r = validateMosaicFile(
      v4File({
        kind: "free",
        rects: { p1: { x: "wrong", y: 0, w: 100, h: 100 } },
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("rejects unknown layout.kind", () => {
    const r = validateMosaicFile(v4File({ kind: "wat" }));
    expect(r.ok).toBe(false);
  });
});
```

(For the globalStyle fixture, copy from the existing v3 test file's helper.)

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm vitest run test/unit/schema.test.ts -t "v4"`
Expected: FAIL — schema doesn't know about v4.

- [ ] **Step 3: Add `MosaicFileV4` and validation**

In `src/renderer/model/schema.ts`:

1. Bump version constant:

   ```ts
   export const CURRENT_SCHEMA_VERSION = 4;
   ```

2. Import `GridLayout`:

   ```ts
   import type { GridLayout } from "./grid-layout";
   ```

3. Add the v4 type after `MosaicFileV3`:

   ```ts
   /**
    * v4: spec 11 — adds `state.layout: GridLayout`. Loader migrates v1/v2/v3
    * → v4 in-memory by seeding a uniform layout with equal weights.
    */
   export interface MosaicFileV4
     extends Omit<MosaicFileV3, "schemaVersion" | "state"> {
     schemaVersion: 4;
     state: MosaicFileV3["state"] & { layout: GridLayout };
   }
   ```

4. Update `MosaicFile` union:

   ```ts
   export type MosaicFile =
     | MosaicFileV1
     | MosaicFileV2
     | MosaicFileV3
     | MosaicFileV4;
   ```

5. In `validateMosaicFile`, change the version gate:

   ```ts
   if (
     x.schemaVersion !== 1 &&
     x.schemaVersion !== 2 &&
     x.schemaVersion !== 3 &&
     x.schemaVersion !== 4
   ) {
     return err(`schemaVersion: unsupported (${String(x.schemaVersion)})`);
   }
   const sv: 1 | 2 | 3 | 4 = x.schemaVersion;
   ```

6. After the `letterPattern` validation (which is `if (sv === 3)`), expand to include v4 (v4 inherits the v3 fields):

   ```ts
   if (sv === 3 || sv === 4) {
     if (
       st.letterPattern !== "uppercase" &&
       st.letterPattern !== "lowercase" &&
       st.letterPattern !== "numeric" &&
       st.letterPattern !== "uppercase-paren" &&
       st.letterPattern !== "uppercase-bracket" &&
       st.letterPattern !== "rowcol-mixed"
     ) {
       return err("state.letterPattern: invalid");
     }
   }
   ```

   And likewise change the v3-only `letterOverrides` shape gate to `sv === 3 || sv === 4`.

7. Add the v4-specific layout validation. Insert before `return { ok: true, value: x as unknown as MosaicFile };`:

   ```ts
   if (sv === 4) {
     const layoutValidation = validateLayout(
       st.layout,
       "state.layout",
       st.rows,
       st.cols,
     );
     if (!layoutValidation.ok) return layoutValidation;
   }
   ```

8. Add the validator helper near `validatePanels`:
   ```ts
   function validateLayout(
     x: unknown,
     path: string,
     rows: number,
     cols: number,
   ): Result<GridLayout> {
     if (!isObj(x)) return err(`${path}: expected object`);
     if (x.kind === "uniform") {
       if (!Array.isArray(x.colWeights))
         return err(`${path}.colWeights: expected array`);
       if (!Array.isArray(x.rowWeights))
         return err(`${path}.rowWeights: expected array`);
       if (x.colWeights.length !== cols)
         return err(`${path}.colWeights: length must equal cols (${cols})`);
       if (x.rowWeights.length !== rows)
         return err(`${path}.rowWeights: length must equal rows (${rows})`);
       for (let i = 0; i < x.colWeights.length; i++) {
         const v = x.colWeights[i];
         if (!isNum(v) || v <= 0)
           return err(`${path}.colWeights[${i}]: positive number`);
       }
       for (let i = 0; i < x.rowWeights.length; i++) {
         const v = x.rowWeights[i];
         if (!isNum(v) || v <= 0)
           return err(`${path}.rowWeights[${i}]: positive number`);
       }
       return { ok: true, value: x as unknown as GridLayout };
     }
     if (x.kind === "free") {
       if (!isObj(x.rects)) return err(`${path}.rects: expected object`);
       const rects = x.rects;
       for (const k in rects) {
         const r = rects[k];
         if (!isObj(r)) return err(`${path}.rects.${k}: expected object`);
         if (!isNum(r.x) || !isNum(r.y) || !isNum(r.w) || !isNum(r.h)) {
           return err(`${path}.rects.${k}: x/y/w/h must be numbers`);
         }
         if (r.w <= 0 || r.h <= 0) {
           return err(`${path}.rects.${k}: w and h must be positive`);
         }
       }
       return { ok: true, value: x as unknown as GridLayout };
     }
     return err(`${path}.kind: must be uniform|free`);
   }
   ```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm vitest run test/unit/schema.test.ts -t "v4"`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/model/schema.ts test/unit/schema.test.ts
git commit -m "feat(qa-feedback): schema v4 with layout validation (spec 11)"
```

---

## Task 11: Serialize/deserialize layout (v3 → v4 migration)

**Files:**

- Modify: `src/renderer/model/serialize.ts`
- Modify: `test/unit/serialize.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `test/unit/serialize.test.ts`:

```ts
import { uniformLayoutFor } from "../../src/renderer/model/grid-layout";

describe("serialize — layout v4", () => {
  it("toMosaicFile writes schemaVersion 4 with state.layout", () => {
    const state = initialFigureState();
    const file = toMosaicFile({
      state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/tmp/x.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-09T00:00:00.000Z",
    });
    expect(file.schemaVersion).toBe(4);
    expect(file.state.layout).toEqual(uniformLayoutFor(2, 2));
  });

  it("fromMosaicFile on a v3 file seeds uniform layout", () => {
    const v3: MosaicFileV3 = /* build a minimal v3 file fixture */;
    const r = fromMosaicFile(v3);
    expect(r.state.layout).toEqual(uniformLayoutFor(v3.state.rows, v3.state.cols));
  });

  it("round-trips a free-form layout through v4", () => {
    const state = initialFigureState();
    const free: typeof state = {
      ...state,
      layout: {
        kind: "free",
        rects: {
          "panel-1": { x: 0, y: 0, w: 100, h: 100 },
          "panel-2": { x: 100, y: 0, w: 100, h: 100 },
          "panel-3": { x: 0, y: 100, w: 100, h: 100 },
          "panel-4": { x: 100, y: 100, w: 100, h: 100 },
        },
      },
    };
    const file = toMosaicFile({
      state: free,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/tmp/x.mosaic",
      appVersion: "0.1.0",
    });
    const back = fromMosaicFile(file);
    expect(back.state.layout).toEqual(free.layout);
  });
});
```

(Build the v3 fixture by writing out the full state shape; the existing `serialize.test.ts` file likely has a helper.)

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm vitest run test/unit/serialize.test.ts -t "layout v4"`
Expected: FAIL.

- [ ] **Step 3: Update `serialize.ts`**

In `src/renderer/model/serialize.ts`:

1. Change return type:

   ```ts
   import type { MosaicFile, MosaicFileV4 } from "./schema";
   import { uniformLayoutFor } from "./grid-layout";

   export function toMosaicFile(inp: ToMosaicInput): MosaicFileV4 {
     // ... existing pool logic ...
     return {
       schemaVersion: 4,
       app: "mosaic-builder",
       appVersion: inp.appVersion,
       createdAt: stamp,
       modifiedAt: stamp,
       canvas: inp.canvas,
       state: { ...inp.state, pool } as MosaicFileV4["state"],
     };
   }
   ```

2. In `fromMosaicFile`, after `letterPattern` resolution, add layout resolution:
   ```ts
   const layout =
     file.schemaVersion === 4
       ? file.state.layout
       : uniformLayoutFor(file.state.rows, file.state.cols);
   ```
   Then include `layout` in the constructed runtime state:
   ```ts
   const state: FigureState = {
     ...file.state,
     pool: runtimePool,
     annotations,
     letterOverrides,
     letterPattern,
     globalStyle,
     outerGutter: file.state.outerGutter ?? true,
     layout,
   };
   ```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm vitest run test/unit/serialize.test.ts -t "layout v4"`
Expected: 3 tests pass.

- [ ] **Step 5: Run all serialize tests + roundtrip**

Run: `pnpm vitest run test/unit/serialize.test.ts test/unit/m7-roundtrip.test.ts`
Expected: all pass.

- [ ] **Step 6: Verify typecheck is now green**

Run: `pnpm typecheck`
Expected: PASS — every consumer of FigureState now sees the layout field, and serialize+schema are aligned.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/model/serialize.ts test/unit/serialize.test.ts
git commit -m "feat(qa-feedback): serialize layout as v4; v3->v4 load migration (spec 11)"
```

---

## Task 12: Track-resize handle UI in `GridCells`

**Files:**

- Modify: `src/renderer/components/Grid/GridCells.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `test/unit/grid-cells-modes.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to `test/unit/grid-cells-modes.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

describe("GridCells — track-resize handles (spec 11)", () => {
  it("renders cols-1 vertical handles and rows-1 horizontal handles in uniform mode", () => {
    // 2x2 uniform → 1 col handle + 1 row handle.
    const state = initialFigureState();
    render(
      <GridCells
        state={state}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={() => {}}
        selection={new Set()}
        onCellShiftClick={() => {}}
        panelInteraction={{ kind: "none" }}
        onPanelClick={() => {}}
        onPanelDoubleClick={() => {}}
        onHoleClick={() => {}}
        onTrackWeightChange={() => {}}
      />,
    );
    expect(screen.getByTestId("track-handle-col-0")).toBeTruthy();
    expect(screen.getByTestId("track-handle-row-0")).toBeTruthy();
    expect(screen.queryByTestId("track-handle-col-1")).toBeNull();
  });

  it("does not render track handles in free mode", () => {
    const state = {
      ...initialFigureState(),
      layout: {
        kind: "free" as const,
        rects: {},
      },
    };
    render(
      <GridCells
        state={state}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={() => {}}
        selection={new Set()}
        onCellShiftClick={() => {}}
        panelInteraction={{ kind: "none" }}
        onPanelClick={() => {}}
        onPanelDoubleClick={() => {}}
        onHoleClick={() => {}}
        onTrackWeightChange={() => {}}
      />,
    );
    expect(screen.queryByTestId("track-handle-col-0")).toBeNull();
  });

  it("dragging a column handle calls onTrackWeightChange with the new weight", () => {
    const onTrackWeightChange = vi.fn();
    const state = initialFigureState();
    render(
      <GridCells
        state={state}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={() => {}}
        selection={new Set()}
        onCellShiftClick={() => {}}
        panelInteraction={{ kind: "none" }}
        onPanelClick={() => {}}
        onPanelDoubleClick={() => {}}
        onHoleClick={() => {}}
        onTrackWeightChange={onTrackWeightChange}
      />,
    );
    const handle = screen.getByTestId("track-handle-col-0");
    // Pointer-down at center, then move 100px right, then up.
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 500, clientY: 300 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 500, clientY: 300 });
    // The handle should have dispatched at least one weight change.
    expect(onTrackWeightChange).toHaveBeenCalled();
    const [axis, index, weight] = onTrackWeightChange.mock.calls[0]!;
    expect(axis).toBe("col");
    expect(index).toBe(0);
    expect(weight).toBeGreaterThan(0.5);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm vitest run test/unit/grid-cells-modes.test.tsx -t "track-resize"`
Expected: FAIL.

- [ ] **Step 3: Implement track handles**

In `src/renderer/components/Grid/GridCells.tsx`:

1. Add to `Props`:

   ```ts
   onTrackWeightChange?: (axis: "row" | "col", index: number, weight: number) => void;
   ```

2. After the `holes.map(...)` block and before `state.panels.map(...)`, insert track handles. Read layout from state:

   ```tsx
   const isUniform = state.layout.kind === "uniform";
   ```

3. Render col handles (positioned over each gutter line between adjacent columns):

   ```tsx
   {
     isUniform &&
       Array.from({ length: state.cols - 1 }).map((_, i) => {
         // The handle straddles the gutter line between col i and col i+1.
         // Get the right edge of cell (0, i) using computeCellRect.
         const left = computeCellRect(layout, 0, i);
         const lineX = left.x + left.w + state.gutterPx / 2;
         // Handle spans the full grid height.
         const top = computeCellRect(layout, 0, 0).y;
         const bot = computeCellRect(layout, state.rows - 1, 0);
         const fullH = bot.y + bot.h - top;
         return (
           <TrackHandle
             key={`col-${i}`}
             testId={`track-handle-col-${i}`}
             axis="col"
             index={i}
             hairlineCenter={lineX}
             crossSize={fullH}
             crossStart={top}
             sx={sx}
             sy={sy}
             figurePxW={figurePxW}
             figurePxH={figurePxH}
             cssW={cssW}
             cssH={cssH}
             outerOffset={state.outerGutter ? state.gutterPx : 0}
             onChange={(w) => onTrackWeightChange?.("col", i, w)}
           />
         );
       });
   }
   ```

4. Mirror for row handles.

5. Add the `TrackHandle` subcomponent at the bottom of the file:

```tsx
interface TrackHandleProps {
  testId: string;
  axis: "row" | "col";
  index: number;
  hairlineCenter: number; // figure-px
  crossSize: number; // figure-px
  crossStart: number; // figure-px
  sx: number;
  sy: number;
  figurePxW: number;
  figurePxH: number;
  cssW: number;
  cssH: number;
  outerOffset: number;
  onChange: (weight: number) => void;
}

function TrackHandle({
  testId,
  axis,
  index,
  hairlineCenter,
  crossSize,
  crossStart,
  sx,
  sy,
  figurePxW,
  figurePxH,
  cssW,
  cssH,
  outerOffset,
  onChange,
}: TrackHandleProps): JSX.Element {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{ pointerId: number } | null>(null);
  // Hit-strip width (figure-px). Wider than the gutter so the user can grab it.
  const STRIP = 8;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0 || ref.current === null) return;
    ref.current.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId };
    handleMove(e);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    handleMove(e);
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    if (ref.current?.hasPointerCapture(e.pointerId)) {
      ref.current.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  }
  function handleMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (ref.current === null) return;
    // Convert client-x/y → figure-px relative to the canvas. The wrapper
    // (cssW × cssH) maps to (figurePxW × figurePxH).
    const wrapper = ref.current.parentElement?.getBoundingClientRect();
    if (wrapper === undefined) return;
    if (axis === "col") {
      const figX = ((e.clientX - wrapper.left) / cssW) * figurePxW;
      // The dragged handle redistributes weights[index] vs weights[index+1]
      // such that the line moves to figX. New weight[index] proportional to
      // (figX - leftEdgeOfPair) / pairWidthAvail. For simplicity, dispatch
      // the desired left-edge-of-pair-end position; the reducer clamps.
      // We approximate: the new weight = (figX - outerOffset - cumulativeLeft) /
      // (totalAvailW - cumulativeLeft - cumulativeRight). The full math is
      // brittle for merged grids. Practical alternative: reuse the existing
      // pair total — `total = weights[index] + weights[index+1]` — and treat
      // figX as the left edge of weights[index+1]. The pair's left edge is
      // hairlineCenter - currentWeight*availW; we use the parent's known dims.
      // The parent component computes `hairlineCenter`; the new weight is:
      //   (figX - leftEdgeOfPair) / pairAvailW * pairTotal
      // where pairAvailW is the width currently allocated to weights[index]+
      // weights[index+1]. Without that context, we send the proposed center;
      // the reducer (via setTrackWeight) re-anchors.
      // SIMPLER ROUTE: emit the absolute figX; let the App layer compute the
      // weight from current state. We go with that — onChange's payload here
      // is the weight delta in (0..1), specifically the new value of
      // weights[index] computed from figX assuming the rest of the layout
      // is fixed.
      // The parent (App) supplies `onTrackWeightChange(axis, index, weight)`,
      // so we need to compute `weight` here. We have hairlineCenter and the
      // current layout in props (via crossStart/crossSize) but NOT the per-
      // weight breakdown. Instead, lift the weight calc to the App by passing
      // the cursor's figure-px center; restructure: the prop becomes
      //   onChange(figX: number)
      // and App computes the new weight.
      // BUT our test expects axis/index/weight. Compromise: compute weight
      // here, given that the pair's combined width at hairlineCenter time
      // equals `pairAvailW`. We pass `pairAvailW` and `pairLeftEdge` as props
      // from the parent. Add those:
      onChange(0); // placeholder — see Step 3.5 below.
    } else {
      const figY = ((e.clientY - wrapper.top) / cssH) * figurePxH;
      onChange(0);
    }
  }
  // ... layout: render the strip with position absolute, cursor col-resize, etc.
}
```

This sketch reveals the math complication. The cleaner shape is below.

- [ ] **Step 3.5: Restructure track handle to take pair geometry**

Replace the sketch above with a cleaner shape. Add these fields to `TrackHandleProps`:

```ts
pairLeftFigPx: number; // left edge of (weights[index] + weights[index+1]) span
pairWidthFigPx: number; // width of the pair
pairTotalWeight: number; // weights[index] + weights[index+1]
```

In the parent, compute these from `layout` before passing:

```tsx
if (state.layout.kind === "uniform") {
  // For col handle i: pair spans col i and col i+1.
  const leftCell = computeCellRect(layout, 0, i);
  const rightCell = computeCellRect(layout, 0, i + 1);
  const pairLeftFigPx = leftCell.x;
  const pairWidthFigPx = rightCell.x + rightCell.w - leftCell.x;
  const pairTotalWeight =
    state.layout.colWeights[i]! + state.layout.colWeights[i + 1]!;
  // ...pass to TrackHandle
}
```

In `handleMove`:

```tsx
if (axis === "col") {
  const figX = ((e.clientX - wrapper.left) / cssW) * figurePxW;
  // Position of the line within the pair, normalized to (0..1) of pair weight.
  const offsetWithinPair = figX - pairLeftFigPx;
  const fraction = offsetWithinPair / pairWidthFigPx;
  const newWeightForIndex = fraction * pairTotalWeight;
  onChange(newWeightForIndex);
}
```

Mirror for row handles.

- [ ] **Step 3.6: Layout DOM**

The handle's DOM:

```tsx
return (
  <div
    ref={ref}
    data-testid={testId}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerUp}
    className={
      axis === "col"
        ? "track-handle track-handle-col"
        : "track-handle track-handle-row"
    }
    style={{
      position: "absolute",
      left:
        axis === "col" ? (hairlineCenter - STRIP / 2) * sx : crossStart * sx,
      top: axis === "col" ? crossStart * sy : (hairlineCenter - STRIP / 2) * sy,
      width: axis === "col" ? STRIP * sx : crossSize * sx,
      height: axis === "col" ? crossSize * sy : STRIP * sy,
      cursor: axis === "col" ? "col-resize" : "row-resize",
      pointerEvents: "auto",
      touchAction: "none",
      zIndex: 4,
    }}
  />
);
```

Add CSS in `src/renderer/styles.css`:

```css
.track-handle {
  background: transparent;
  transition: background 80ms ease;
}
.track-handle:hover,
.track-handle:active {
  background: var(--c-focus-stroke, #4a90e2);
  opacity: 0.4;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm vitest run test/unit/grid-cells-modes.test.tsx -t "track-resize"`
Expected: 3 tests pass.

- [ ] **Step 5: Wire `onTrackWeightChange` from App**

In `src/renderer/App.tsx`, locate the `<GridCells ...>` usage. Add the prop:

```tsx
onTrackWeightChange={(axis, index, weight) => {
  dispatch(setTrackWeightAction(axis, index, weight));
  history.commit();
}}
```

Import `setTrackWeightAction` at the top.

- [ ] **Step 6: Run lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/Grid/GridCells.tsx src/renderer/App.tsx src/renderer/styles.css test/unit/grid-cells-modes.test.tsx
git commit -m "feat(qa-feedback): track-resize handles in GridCells (spec 11)"
```

---

## Task 13: Corner-resize handles in `PanelInteractionLayer`

**Files:**

- Modify: `src/renderer/components/Grid/PanelInteractionLayer.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `test/unit/panel-interaction-layer.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to `test/unit/panel-interaction-layer.test.tsx`:

```tsx
describe("PanelInteractionLayer — corner-resize handles (spec 11)", () => {
  it("renders four corner handles when present", () => {
    render(
      <PanelInteractionLayer
        // ...existing required props
        onResizeFreeform={() => {}}
        canvasDims={{ widthPx: 800, heightPx: 600 }}
      />,
    );
    expect(screen.getByTestId("corner-handle-tl")).toBeTruthy();
    expect(screen.getByTestId("corner-handle-tr")).toBeTruthy();
    expect(screen.getByTestId("corner-handle-bl")).toBeTruthy();
    expect(screen.getByTestId("corner-handle-br")).toBeTruthy();
  });

  it("dragging the bottom-right corner dispatches RESIZE_PANEL_FREEFORM with cursor delta", () => {
    const onResizeFreeform = vi.fn();
    render(
      <PanelInteractionLayer
        // ...standard props
        onResizeFreeform={onResizeFreeform}
        canvasDims={{ widthPx: 800, heightPx: 600 }}
      />,
    );
    const handle = screen.getByTestId("corner-handle-br");
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 130, clientY: 120 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onResizeFreeform).toHaveBeenCalled();
    const calls = onResizeFreeform.mock.calls;
    // Last call should reflect the final delta. Exact figure-px values
    // depend on cssW/figurePxW; for cssW===figurePxW, dx=30, dy=20.
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBe("br"); // corner
    expect(lastCall[1]).toBeCloseTo(30, 0); // dx
    expect(lastCall[2]).toBeCloseTo(20, 0); // dy
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm vitest run test/unit/panel-interaction-layer.test.tsx -t "corner-resize"`
Expected: FAIL.

- [ ] **Step 3: Add corner handles to `PanelInteractionLayer`**

In `src/renderer/components/Grid/PanelInteractionLayer.tsx`:

1. Add to `Props`:

   ```ts
   /** Dispatched when the user drags a corner handle. dx, dy are figure-px deltas. */
   onResizeFreeform?: (corner: "tl" | "tr" | "bl" | "br", dx: number, dy: number) => void;
   /** Used by the parent to convert pointer movement to figure-px and feed
    *  the reducer's canvas dims arg. */
   canvasDims?: { widthPx: number; heightPx: number };
   ```

2. Inside the component, when `transform.fit !== "stretch"` (the existing "active" branch), render four corner handles before the closing `</div>`:

```tsx
{onResizeFreeform !== undefined && (
  <>
    <CornerHandle
      corner="tl"
      cssToFigX={figurePxW / cssW}
      cssToFigY={figurePxH / cssH}
      onResize={onResizeFreeform}
      onCommit={onCommit}
    />
    <CornerHandle corner="tr" {/* ... */} />
    <CornerHandle corner="bl" {/* ... */} />
    <CornerHandle corner="br" {/* ... */} />
  </>
)}
```

3. Add the `CornerHandle` subcomponent:

```tsx
interface CornerHandleProps {
  corner: "tl" | "tr" | "bl" | "br";
  cssToFigX: number;
  cssToFigY: number;
  onResize: (corner: "tl" | "tr" | "bl" | "br", dx: number, dy: number) => void;
  onCommit: () => void;
}

function CornerHandle({
  corner,
  cssToFigX,
  cssToFigY,
  onResize,
  onCommit,
}: CornerHandleProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0 || ref.current === null) return;
    e.stopPropagation(); // Don't start a pan-drag on the underlying layer.
    ref.current.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== e.pointerId) return;
    const dx = (e.clientX - drag.startClientX) * cssToFigX;
    const dy = (e.clientY - drag.startClientY) * cssToFigY;
    onResize(corner, dx, dy);
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== e.pointerId) return;
    if (ref.current?.hasPointerCapture(e.pointerId)) {
      ref.current.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    onCommit();
  }

  const SIZE = 12;
  const positions: Record<string, React.CSSProperties> = {
    tl: { left: -SIZE / 2, top: -SIZE / 2, cursor: "nwse-resize" },
    tr: { right: -SIZE / 2, top: -SIZE / 2, cursor: "nesw-resize" },
    bl: { left: -SIZE / 2, bottom: -SIZE / 2, cursor: "nesw-resize" },
    br: { right: -SIZE / 2, bottom: -SIZE / 2, cursor: "nwse-resize" },
  };
  return (
    <div
      ref={ref}
      data-testid={`corner-handle-${corner}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="corner-handle"
      style={{
        position: "absolute",
        width: SIZE,
        height: SIZE,
        ...positions[corner],
        background: "var(--c-focus-stroke)",
        border: "1px solid #fff",
        borderRadius: 2,
        zIndex: 5,
        pointerEvents: "auto",
        touchAction: "none",
      }}
    />
  );
}
```

4. Add CSS:

```css
.corner-handle {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
.corner-handle:hover {
  transform: scale(1.15);
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm vitest run test/unit/panel-interaction-layer.test.tsx -t "corner-resize"`
Expected: 2 tests pass.

- [ ] **Step 5: Wire `onResizeFreeform` from App**

In `src/renderer/App.tsx`, add to the `<PanelInteractionLayer ... />` usage:

```tsx
onResizeFreeform={(corner, dx, dy) => {
  if (selectedImagePanel === null) return;
  dispatch(
    resizePanelFreeformAction(
      selectedImagePanel.id,
      corner,
      dx,
      dy,
      { widthPx: canvas.widthPx, heightPx: canvas.heightPx },
    ),
  );
  // history.commit() runs on pointer-up via `onCommit`, which the layer
  // already wires.
}}
canvasDims={{ widthPx: canvas.widthPx, heightPx: canvas.heightPx }}
```

(Adjust property names to match the existing canvas reference in App.tsx.)

- [ ] **Step 6: Run lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/Grid/PanelInteractionLayer.tsx src/renderer/App.tsx src/renderer/styles.css test/unit/panel-interaction-layer.test.tsx
git commit -m "feat(qa-feedback): corner-resize handles trigger free-form layout (spec 11)"
```

---

## Task 14: "Reset to uniform grid" button in `GridControls`

**Files:**

- Modify: `src/renderer/components/Toolbar/GridControls.tsx`
- Modify: `src/renderer/App.tsx`
- Create: `test/unit/grid-controls.test.tsx`

- [ ] **Step 1: Write failing test**

Create `test/unit/grid-controls.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GridControls } from "../../src/renderer/components/Toolbar/GridControls";

describe("GridControls — Reset to uniform grid (spec 11)", () => {
  const defaults = {
    rows: 2,
    cols: 2,
    gutterPx: 12,
    gutterColor: "#FFFFFF",
    outerGutter: true,
    onChangeRows: () => {},
    onChangeCols: () => {},
    onChangeGutterPx: () => {},
    onChangeGutterColor: () => {},
    onChangeOuterGutter: () => {},
  };

  it("hides the Reset button when layout is uniform", () => {
    render(
      <GridControls
        {...defaults}
        layoutKind="uniform"
        onResetUniform={() => {}}
      />,
    );
    expect(screen.queryByTestId("reset-uniform-grid")).toBeNull();
  });

  it("shows the Reset button when layout is free", () => {
    render(
      <GridControls
        {...defaults}
        layoutKind="free"
        onResetUniform={() => {}}
      />,
    );
    expect(screen.getByTestId("reset-uniform-grid")).toBeTruthy();
  });

  it("clicking Reset calls onResetUniform", () => {
    const onResetUniform = vi.fn();
    render(
      <GridControls
        {...defaults}
        layoutKind="free"
        onResetUniform={onResetUniform}
      />,
    );
    fireEvent.click(screen.getByTestId("reset-uniform-grid"));
    expect(onResetUniform).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm vitest run test/unit/grid-controls.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add the button**

In `src/renderer/components/Toolbar/GridControls.tsx`:

1. Extend `Props`:

   ```ts
   layoutKind: "uniform" | "free";
   onResetUniform: () => void;
   ```

2. Destructure them.

3. Render the button at the end of the row, conditionally:
   ```tsx
   {
     layoutKind === "free" && (
       <button
         type="button"
         className="btn-secondary"
         data-testid="reset-uniform-grid"
         onClick={onResetUniform}
         title="Restore equal-width columns and equal-height rows"
       >
         Reset grid
       </button>
     );
   }
   ```

- [ ] **Step 4: Wire from App**

In `src/renderer/App.tsx`:

1. Import `resetToUniformGridAction`.
2. Pass to `GridControls`:
   ```tsx
   layoutKind={state.layout.kind}
   onResetUniform={() => {
     dispatch(resetToUniformGridAction());
     history.commit();
   }}
   ```

- [ ] **Step 5: Run — expect PASS**

Run: `pnpm vitest run test/unit/grid-controls.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 6: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/Toolbar/GridControls.tsx src/renderer/App.tsx test/unit/grid-controls.test.tsx
git commit -m "feat(qa-feedback): Reset to uniform grid button (spec 11)"
```

---

## Task 15: Final integration sweep + manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: every test passes.

- [ ] **Step 2: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: zero warnings.

- [ ] **Step 3: Boot the dev app and smoke-test**

Run: `pnpm dev`

- Drag a column gutter handle → verify the column resizes; the next column shrinks; rest unchanged.
- Drag a row gutter handle → verify mirror behavior.
- Save a `.mosaic` file from this state, close, reopen — verify weights survive.
- Click an image panel to enter editing mode. Drag the bottom-right corner — verify the panel grows and neighbors shrink. The track handles should disappear.
- Verify the "Reset grid" button appeared in the toolbar; click it; verify equal cells are restored.
- Save and reload — verify free-form layout survives.
- Resize the figure (Rows: 2 → 3) — verify layout reverts to uniform with new track count.
- Merge two cells — verify layout reverts to uniform.
- Confirm export (PNG, PDF) renders the active layout pixel-faithfully.

Document any issues uncovered here as a separate fixup commit.

- [ ] **Step 4: Final commit (if smoke test caught issues)**

```bash
git add -p
git commit -m "fix(qa-feedback): smoke-test fixups for spec 11"
```

---

## Self-Review Notes

**Spec coverage check:**

- [x] State shape (`layout: GridLayout`) — Task 4
- [x] Three reducer actions — Tasks 5, 6
- [x] Migration (existing projects → uniform default) — Task 11
- [x] `computePanelRects` layout-aware — Task 9
- [x] Track-resize handles — Task 12
- [x] Corner-resize handles — Task 13
- [x] First-time toast — DEFERRED. The spec describes a one-shot toast warning when a uniform user grabs a corner; this is a small UX nicety not blocking the acceptance criteria. Filing as a separate follow-up rather than adding here.
- [x] Reset button — Task 14
- [x] Merge/unmerge interactions — covered by housekeeping in Task 7
- [x] Hide/delete interactions — covered by `DELETE_PANEL` housekeeping in Task 7
- [x] Outer-gutter coupling — handled inside `rectsFromUniform` directly
- [x] Acceptance: drag column → wider, neighbor shrinks — Task 12 test
- [x] Acceptance: drag corner → cascade + free-form switch — Task 13 test
- [x] Acceptance: Reset → equal cells — Task 14 test
- [x] Acceptance: save/reload preserves layout — Task 11 test
- [x] Acceptance: existing tests pass; merge/unmerge work — Tasks 7, 9, 15
- [x] Acceptance: MIN_PANEL_W floor — Task 3 test

**Scope deliberately deferred:**

- First-time toast on uniform → free transition (small UX, separate PR).
- Smart "auto-detect alignment" reverse path (out of scope per spec).
- Snapping during free-form drag (depends on spec 14 alignment guidelines).

**Risks:**

- Task 3's cascade math is the highest-stakes piece. The clampAxis helper is dense — if the smoke test in Task 15 surfaces a corner-drag bug, it will land here.
- Task 7's "merge resets layout to uniform" is a deliberate UX simplification (the spec calls this out as the recommended v1 implementation choice).
- `RESIZE_PANEL_FREEFORM` accepting `canvas: { widthPx, heightPx }` couples the reducer to a runtime concern. Alternative would be to move the snapshot to the App-level dispatcher; this version keeps reducer self-contained at the cost of a chunkier action shape. Worth revisiting if it bites.
