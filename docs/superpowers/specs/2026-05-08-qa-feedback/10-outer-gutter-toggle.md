# 10 — Outer-gutter toggle

## Problem

The figure's gutter color fills the entire canvas, so the gutter band
appears not only between panels but also around the outside (between
the outermost panels and the canvas edge). The user wants the option
to **omit** the outer gutter — gutters between panels only, no
margin around the figure.

## Goal

A new boolean toggle on the figure: "Outer gutter." When enabled
(default — current behavior), the gutter fills the whole canvas.
When disabled, the panels reflow to fill the canvas edge-to-edge,
and the gutter only appears between adjacent panels.

## Design

### Model

Extend `FigureState`:

```ts
outerGutter: boolean; // default true (current behavior)
```

Schema bump in `serialize.ts`; default to `true` for projects without
the field.

### Reducer

```ts
| { type: "SET_OUTER_GUTTER"; outerGutter: boolean }
```

Setter validation: any boolean, no other constraints.

### Layout math

The current panel-rect computation in `render/coords.ts` (or wherever
`computePanelRects` lives) divides the canvas into rows × cols of
equal cells, separated by `gutterPx`, with `gutterPx` of margin on
all four outer edges.

When `outerGutter === false`:

- The outer margin becomes 0 on all four edges.
- Inter-panel gutters stay at `gutterPx`.
- Panel cell width = `(canvasW - (cols - 1) * gutterPx) / cols`.
- Panel cell height = `(canvasH - (rows - 1) * gutterPx) / rows`.

### Gutter fill in `draw-figure.ts`

Today step 2 fills the entire canvas with the gutter color, then
panels are drawn over. With outer-gutter off, panels reach the
canvas edge, so the gutter color shows through only between them —
which already happens for free if step 2 keeps painting the full
canvas. The user-visible difference is purely from where the panels
sit: with outerGutter off, the panel grid expands to fill the
canvas, leaving zero outer band of gutter color.

### UI

Add a checkbox to `GridControls.tsx` (or
`CanvasAndGlobalStyleForm.tsx`):

> ☐ Outer gutter
>
> Show the gutter color around the outside of the canvas. When
> off, panels reach the canvas edge and the gutter only appears
> between them.

### Edge cases

- With `gutterPx = 0`, the toggle has no visible effect — both
  modes produce a panel grid with no gaps.
- Hidden / hole cells (spec 02): the cells are still cells in the
  grid math; toggling `outerGutter` doesn't change which cells are
  empty. The visible difference is only in the outer margin band.

## Files touched

- `src/renderer/model/figure-state.ts` — `outerGutter` field.
- `src/renderer/model/figure-actions.ts` — `SET_OUTER_GUTTER`.
- `src/renderer/model/figure-actions.test.ts` — coverage.
- `src/renderer/model/serialize.ts` — schema migration.
- `src/renderer/render/coords.ts` — branch in `computePanelRects`.
- `src/renderer/components/Toolbar/GridControls.tsx` (or
  Canvas/GlobalStyle form) — checkbox.

## Acceptance

- New checkbox in the grid controls. Default checked.
- Uncheck → panels reach the canvas edge; only inter-panel gutters
  remain visible.
- Re-check → returns to the original layout.
- Saved + reloaded projects preserve the setting.
- Existing tests for `computePanelRects` get a parallel set asserting
  the outer-margin = 0 case.

## Out of scope

- Per-edge outer-gutter control (e.g. top yes, sides no).
- Different inter-panel gutter values per row/column.

## Depends on

Nothing.
