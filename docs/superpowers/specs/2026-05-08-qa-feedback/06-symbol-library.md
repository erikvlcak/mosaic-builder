# 06 — Replace "arrow" with curated symbol library

## Problem

The annotation toolbar offers a single "Arrow" tool. Researchers need a
wider symbolic vocabulary: asterisks, triangles, plus signs, crosses,
chevrons, brackets, plain dots, and **multiple arrowhead styles** (open,
filled, line, double, etc.).

The current `ArrowAnnotation` model has a `head: "none" | "open" |
"filled"` field — it conflates "is this a line with a head?" with
"what symbol?", and doesn't generalize.

## Goal

Rename the user-facing tool from "Arrow" to "Symbol." Replace the
single-shape model with a `SymbolAnnotation` that carries an
identifier into a curated library of bundled SVG symbols. Symbols are
scalable, rotatable, and re-colorable. The properties panel for a
selected symbol shows a **gallery grid** of available symbols (not a
dropdown), with the active one highlighted.

## Design

### Symbol library

A new module `src/renderer/symbols/library.ts`:

```ts
export interface SymbolDef {
  id: string;            // stable, e.g. "arrow-open-right"
  label: string;         // "Open arrow"
  category: "arrow" | "shape" | "marker" | "bracket";
  /** Path data, expressed in a 100×100 design viewport, centered at (50,50). */
  pathD: string;
  /** Whether the path is filled (otherwise stroked). */
  fill: boolean;
}

export const SYMBOL_LIBRARY: readonly SymbolDef[] = [...]; // ~30-50 entries
```

The library covers four categories:

- **Arrow** — open right, filled right, line right, double-line right,
  thin right, thick right (rotation handles other directions).
- **Shape** — circle, square, triangle, diamond, star, plus, cross,
  asterisk.
- **Marker** — dot (small filled circle), ring (small unfilled
  circle), tick, X.
- **Bracket** — left brace, right brace, square bracket pair, curly
  brace pair.

All symbols designed in a 100×100 viewport, centered at (50,50), so
rendering math is uniform. We choose path-only (no nested groups, no
gradients) so the same path data can be used in:
- The DOM gallery (inline SVG)
- The export canvas (`new Path2D(pathD)` + transform)

### Annotation model

Replace `ArrowAnnotation` with:

```ts
export interface SymbolAnnotation extends BaseAnnotation {
  kind: "symbol";
  symbolId: string;
  /** Anchor (center of the symbol) in figure-canvas px. */
  x: number;
  y: number;
  /** Size in figure-canvas px (the larger of width/height). */
  sizePx: number;
  /** Degrees clockwise. 0 = library default orientation. */
  rotationDeg: number;
  color: string;
  /** Stroke width for stroke-only symbols. Ignored for filled symbols. */
  strokeWidthPx: number;
}
```

Migration: existing `ArrowAnnotation`s in saved projects map to
`SymbolAnnotation { symbolId: <best match by head> }`:
- `head: "filled"` → `arrow-filled-right`
- `head: "open"` → `arrow-open-right`
- `head: "none"` → `arrow-line-right`

The migration computes `x/y` from arrow midpoint, `sizePx` from
arrow length, `rotationDeg` from arrow vector. This is in
`serialize.ts` schema-version bump.

### Toolbar change

```ts
export type Tool = "select" | "text" | "symbol" | "box" | "scalebar";
```

`"arrow"` is gone from the union. The button label becomes "Symbol."

### Creation flow

The current arrow flow is "drag from start to end." For symbols,
that flow doesn't fit (rotation has to be a separate gesture). Use
**click-to-place**:

1. User picks Symbol tool.
2. Properties panel auto-shows the gallery grid; the user picks a
   symbol (default is `arrow-filled-right`).
3. Click on the canvas → drop the symbol at that point with default
   size and rotation.
4. While the new symbol is selected, the user can drag to move,
   grab a corner handle to resize, or grab a rotation handle to
   rotate (similar to standard transform handles).

### Properties panel

Replace `ArrowAnnoForm.tsx` with `SymbolAnnoForm.tsx`. The form has:
- A **Symbol gallery** grid (see below).
- Color picker.
- Size slider/input.
- Rotation slider (0–359°) + a "Reset to 0°" button.
- Stroke width input (only enabled for stroke symbols).

The gallery is grouped by category (Arrow / Shape / Marker /
Bracket), each row a horizontal scrollable strip of clickable swatches
(36×36 px, currently-active swatch has accent border). Selection
updates `symbolId` via `UPDATE_ANNOTATION`.

CSS: a small new `.symbol-gallery` block in `styles.css`. No new
tokens needed.

### Render

In `draw-figure.ts` add a `drawSymbol` helper:

```ts
function drawSymbol(ctx, anno: SymbolAnnotation): void {
  const def = SYMBOL_LIBRARY_BY_ID.get(anno.symbolId);
  if (!def) return;
  ctx.save();
  ctx.translate(anno.x, anno.y);
  ctx.rotate((anno.rotationDeg * Math.PI) / 180);
  // Library viewport is 100×100 centered at (50,50). Translate to (-50,-50)
  // so symbol center is at the (0,0) we just translated to.
  const scale = anno.sizePx / 100;
  ctx.scale(scale, scale);
  ctx.translate(-50, -50);
  const path = new Path2D(def.pathD);
  if (def.fill) {
    ctx.fillStyle = anno.color;
    ctx.fill(path);
  } else {
    ctx.strokeStyle = anno.color;
    ctx.lineWidth = anno.strokeWidthPx / scale;  // keep stroke visually constant
    ctx.stroke(path);
  }
  ctx.restore();
}
```

### Hit-testing

The annotation interaction layer already uses figure-px hit rects. For
symbols use a square hit-rect of size `anno.sizePx` centered at
`(anno.x, anno.y)`, ignoring rotation for simplicity. Acceptable for
now; a precise per-path hit can be a follow-up.

## Files touched

- `src/renderer/symbols/library.ts` — new, with the curated list and
  SVG path data (this is the bulk of the work).
- `src/renderer/symbols/library.test.ts` — quick coverage that all
  ids are unique and all `pathD` parse via `new Path2D()`.
- `src/renderer/model/annotations.ts` — replace `ArrowAnnotation` with
  `SymbolAnnotation`; update unions.
- `src/renderer/model/serialize.ts` — schema bump + migration.
- `src/renderer/model/figure-actions.ts` — wherever the arrow type is
  named (validation paths).
- `src/renderer/render/draw-figure.ts` — `drawSymbol` helper; replace
  `drawArrow`.
- `src/renderer/components/Toolbar/AnnotationToolbar.tsx` — rename
  tool.
- `src/renderer/components/Properties/ArrowAnnoForm.tsx` → rename
  to `SymbolAnnoForm.tsx`; rewrite as the gallery-driven form.
- `src/renderer/components/Properties/AnnotationPropertiesForm.tsx` —
  swap the kind dispatch.
- `src/renderer/components/Annotations/AnnotationInteractionLayer.tsx`
  — change creation gesture from drag to click; add rotation handle.
- `src/renderer/styles.css` — `.symbol-gallery` rules.

## Acceptance

- Switching to the Symbol tool and clicking the canvas drops a symbol.
- The properties form shows a clickable grid of all bundled symbols
  grouped by category.
- Selected symbol can be re-colored, resized, and rotated.
- Saved projects from before this change open without errors and the
  arrow becomes the closest matching symbol.
- Exports render the symbol identically to the editor.

## Out of scope

- User-imported custom SVGs.
- Filling vs stroking the same symbol (each symbol's `fill` is fixed).
- Multi-color symbols.
- A "favorite symbols" pinned row.

## Depends on

Nothing. (Spec 07 — multi-select — composes naturally on top of this
once the symbol type is in.)
