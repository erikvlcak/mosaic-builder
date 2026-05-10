# 11 — Manual panel resize (uniform → free-form)

## Problem

All panels share the same width (within a column) and the same height
(within a row) — the grid is uniform. The user wants:

1. Drag a column or row gutter to redistribute relative widths/heights
   between adjacent tracks (still a uniform grid, just non-equal
   tracks).
2. Drag a single panel's corner to make that panel bigger; neighbors
   shrink to compensate (the grid is no longer uniform — different
   panels in the same row may have different heights).

## Goal

Two interaction regimes that flow into each other:

- **Uniform regime (default):** state stores per-track weights
  (`colWeights[cols]`, `rowWeights[rows]`); track lines are
  drag-resizable; the figure prints with proportional cells.
- **Free-form regime:** triggered by single-panel corner drag;
  state stores absolute panel rects in figure-px; track-drag
  handles disappear; the figure prints with the user's exact
  per-panel sizes.

Going from uniform → free-form is automatic and one-way per project.
Going back requires an explicit **Reset to uniform grid** button.

This is the largest item in the QA bundle; ship it last.

## Design

### Two state shapes

```ts
type GridLayout =
  | {
      kind: "uniform";
      colWeights: number[]; // length === cols, sum-normalized to 1.0
      rowWeights: number[]; // length === rows
    }
  | {
      kind: "free";
      /** Absolute rects in figure-px for every panel.
       *  Keyed by panelId. Panels still carry row/col/rowSpan/colSpan
       *  for letter derivation, but the rect here wins for layout. */
      rects: Record<string, { x: number; y: number; w: number; h: number }>;
    };
```

Add `figureState.layout: GridLayout`.

Migration: existing projects (no `layout` field) → `{ kind: "uniform",
colWeights: [1/cols, ...], rowWeights: [1/rows, ...] }`.

### Reducer

```ts
| { type: "SET_TRACK_WEIGHT"; axis: "row" | "col"; index: number; weight: number }
  // also adjusts the next track in line so total stays 1.0
| { type: "RESIZE_PANEL_FREEFORM"; panelId: string; rect: PanelRect }
  // implicitly converts uniform → free if currently uniform
| { type: "RESET_TO_UNIFORM_GRID" }
  // recomputes weights from current rects (or just sets equal weights)
```

#### Single-panel resize math (free-form)

When the user drags a single corner of panel P by (dx, dy):

1. Snapshot current panel rects (compute from uniform if currently
   in uniform mode).
2. Find the dragged corner. Each corner has up to two **affected
   edges** (right + bottom, etc.). For each affected edge:
   - Identify the set of other panels that share this edge as
     their opposite side. Those panels must shrink/grow by Δ.
   - Cascade: any panel whose opposite edge is dragged shrinks. If
     it now has neighbors that no longer touch their previous
     edge-mates, that's a contradiction; we then **clamp** the drag
     so the cascade is consistent (no overlaps, no negative-sized
     panels, all panel widths >= MIN_PANEL_W = 30 figure-px).
3. Apply the clamped Δ; produce a new `rects` map; transition state
   to `kind: "free"`.

This is non-trivial. The implementation should be a separate pure
function `resizePanelFreeform(rects, panelId, corner, dx, dy):
{ rects, applied: { dx, dy } }` so it's testable in isolation.

#### Track-drag math (uniform)

In uniform mode, every panel inherits its size from
`colWeights[col]` and `rowWeights[row]` (with span-aware
multiplication for merged panels). Dragging the gutter line between
column `i` and column `i+1` adjusts only those two weights:

```ts
const total = colWeights[i] + colWeights[i + 1];
colWeights[i] = clamp(newWeight, MIN_TRACK_WEIGHT, total - MIN_TRACK_WEIGHT);
colWeights[i + 1] = total - colWeights[i];
```

Pure function `setTrackWeight(weights, index, newWeight): number[]`,
trivially testable.

### Layout pipeline

`computePanelRects(figure)` becomes layout-aware:

- `uniform`: existing path, but uses
  `figure.layout.colWeights` / `rowWeights` instead of equal
  fractions.
- `free`: returns `figure.layout.rects[panelId]` directly.

All consumers (renderer, panel interaction layer, annotation layer
hit-testing) already go through `computePanelRects` — so they pick
up the new behavior with no change.

### UI

#### Track resize handles (uniform mode only)

In `GridCells.tsx`, render thin transparent strips along each gutter
line, with `cursor: col-resize` / `row-resize`. Pointer-down →
capture pointer → pointermove dispatches `SET_TRACK_WEIGHT` with the
new weight derived from the cursor position.

In free mode these handles are not rendered.

#### Panel corner-resize handles (any mode, but explicit in free)

In `PanelInteractionLayer.tsx`, when a panel is selected, render four
small corner handles (`cursor: nwse-resize` / `nesw-resize`).
Pointer-down → capture → pointermove dispatches
`RESIZE_PANEL_FREEFORM`. The first dispatch implicitly transitions
to free mode.

A first-time prompt: when a uniform-mode user grabs a corner handle
for the first time, show a one-shot toast:

> "Resizing this panel switches to free-form layout. Other panels'
> rows and columns will no longer line up. Reset to uniform grid
> from the Grid menu."

This is a good warning gate but not a blocker.

#### Reset button

In `GridControls.tsx`, add a button:

> [ Reset to uniform grid ]

Visible only when `layout.kind === "free"`. Clicking it dispatches
`RESET_TO_UNIFORM_GRID`. The reducer rebuilds equal weights (or, if
we want to preserve user's relative sizing, computes weights from
the average of current row heights / column widths — implementation
choice; recommend equal weights for simplicity in v1).

### Interactions with merge / unmerge

Merged panels span multiple cells. In uniform mode their size is
`sum(colWeights[col..col+colSpan])` × `sum(rowWeights[row..row+rowSpan])`,
which works trivially. In free mode their `rect` is just whatever
the user dragged. Merge / unmerge are still allowed in both modes;
unmerge in free mode produces panels that occupy the merged rect
divided equally. Document this as "if you want fine control of
unmerged panel sizes, drag-resize them after."

### Interactions with hide / delete (spec 02)

Hidden and hole cells are layout-aware:

- Uniform: holes/hidden don't change track weights — empty cells
  still take up their cell.
- Free: holes/hidden show their rect as transparent / gutter-color,
  same as for occupied cells.

### Coupling to outer gutter (spec 10)

The two specs are independent. With outer-gutter off, the canvas
expands to the panel-grid's outer rect; with outer-gutter on, there's
a `gutterPx` band on each side. The track-resize math uses `canvasW

- 2 _ outerMargin - (cols-1) _ gutterPx`for the available
distributable width, where`outerMargin = outerGutter ? gutterPx :
  0`.

## Files touched

- `src/renderer/model/figure-state.ts` — `layout: GridLayout` field.
- `src/renderer/model/figure-actions.ts` — three new actions.
- `src/renderer/model/figure-actions.test.ts` — coverage.
- `src/renderer/model/grid-resize.ts` (existing) — extend to
  understand both regimes.
- `src/renderer/render/coords.ts` (`computePanelRects`) — branch on
  `layout.kind`.
- `src/renderer/render/coords.test.ts` — coverage of both regimes.
- `src/renderer/components/Grid/GridCells.tsx` — track handles.
- `src/renderer/components/Grid/PanelInteractionLayer.tsx` — corner
  handles.
- `src/renderer/components/Toolbar/GridControls.tsx` — Reset button.
- `src/renderer/styles.css` — handle styles.

## Acceptance

- Drag a column gutter → that column gets wider; the next column
  shrinks; the rest unchanged.
- Drag a single panel's corner → that panel grows; neighbors shrink;
  layout switches to free-form; track handles disappear.
- "Reset to uniform grid" snaps back to equal cells.
- Saved/reloaded projects preserve the layout regime + values.
- All existing tests pass; merge/unmerge work in both regimes.
- No panel ever shrinks below `MIN_PANEL_W` × `MIN_PANEL_H` in figure-px.

## Out of scope

- Smart "auto-detect alignment" (going back to uniform without an
  explicit reset).
- Snapping to neighbors during free-form drag (could be a follow-up
  with spec 14's alignment guidelines).
- Resize during multi-select.
- Animated transitions between layouts.

## Depends on

- Spec 10 if you want the outer-gutter math to compose naturally.
- Spec 02 (hide / delete) interacts; ship 02 first so hole-cell
  behavior is well-defined.
- This spec is the highest-risk in the bundle. Recommend shipping
  every other spec first.
