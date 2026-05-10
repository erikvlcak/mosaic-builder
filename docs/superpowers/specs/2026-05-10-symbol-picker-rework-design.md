# Symbol picker rework

**Date:** 2026-05-10
**Status:** Draft, pending implementation plan
**Scope:** Rework of the annotation symbol tool — toolbar, library, picker UI, data model, and renderer.

## Problem

Three issues with the current Symbol tool:

1. **`Box` is redundant alongside `Symbol`.** A box is a shape; having a separate toolbar tool for it splits the symbol library across two surfaces.
2. **The library has the wrong shape.** Brackets and markers are not useful for scientific figures. Conversely, the shape category is too sparse.
3. **The picker is invisible until you've already placed something.** Clicking the `Symbol` toolbar button does nothing visible — the right panel only switches to the symbol gallery after a symbol is dropped onto the canvas. The first click on the canvas places a (probably wrong) default arrow, and only then does the picker appear so the user can change it. The picker should appear when the user picks the tool, not after placement.

## Goals

- One unified shape library, accessed through one toolbar tool.
- A larger, more useful set of shapes — primarily geometric primitives that scientific figures actually need.
- Each outlined shape supports stroke style variants (solid, dashed, dotted).
- Clicking the `Symbol` toolbar button immediately opens the picker in the right panel — no canvas click required.
- Style choices in the picker apply to the *next* placement, so the user picks shape + style, then clicks canvas to drop.
- Selecting an existing symbol on canvas continues to show that symbol's editing form (unchanged behavior pattern, but with the new fields).

## Non-goals

- No migration of existing `.mosaic` files. The user has confirmed no old files exist that we need to preserve.
- No persistence of picker defaults across app launches. Defaults reset to a sensible starting state each session.
- No changes to other annotation tools (`Text`, `Scale`, `Select`, `Letters` toggle).

## Architecture

The change touches five concerns; they are intentionally independent so each can be reviewed and tested in isolation:

1. **Toolbar** — drop the `box` tool.
2. **Symbol library** — restructure the `SymbolDef` shape and the catalogue of entries.
3. **Data model** — add `fillMode` and `strokeStyle` to `SymbolAnnotation`; remove `BoxAnnotation` from the union; bump the schema version.
4. **Renderer** — `drawSymbol` honours `fillMode` and `strokeStyle`.
5. **UI** — a new `<SymbolPickerPanel>` component used when `activeTool === "symbol"` and nothing is selected; `<SymbolAnnoForm>` is reworked to share the same grid + style controls.

Each is described below.

---

## 1. Toolbar (`AnnotationToolbar.tsx`)

Drop `box` from the `Tool` union and from the `TOOLS` array.

```typescript
export type Tool = "select" | "text" | "symbol" | "scalebar";

const TOOLS = [
  { id: "select", label: "Select", title: "Select and move annotations" },
  { id: "text",   label: "Text",   title: "Add text — click to place" },
  { id: "symbol", label: "Symbol", title: "Pick a symbol — click canvas to place" },
  { id: "scalebar", label: "Scale", title: "Add scale bar — click a panel" },
];
```

Title for `symbol` updated to reflect the new flow ("pick a symbol — click canvas to place").

## 2. Symbol library (`src/renderer/symbols/library.ts`)

### `SymbolDef` shape

```typescript
export interface SymbolDef {
  id: string;            // stable id, persisted in .mosaic files
  label: string;         // human label shown in the picker tooltip
  pathD: string;         // 100×100 viewport, centered at (50, 50)
  geometry: "closed" | "stroke-only";
  // "closed"      — path forms a closed region; supports both fill and stroke
  // "stroke-only" — path is an open stroke; the "filled" mode is invalid and
  //                 the picker disables the Filled toggle for this shape
}
```

Removed:

- `category` field — picker is a flat grid.
- `fill: boolean` — superseded by per-annotation `fillMode`.
- `SYMBOL_CATEGORIES` constant.

### Catalogue

**Arrows (6, all `geometry: "stroke-only"` except where noted):**

- `arrow-open-right` — stroke-only
- `arrow-filled-right` — closed (the body is a closed region)
- `arrow-line-right` — stroke-only
- `arrow-double-right` — stroke-only
- `arrow-thin-right` — closed
- `arrow-thick-right` — closed

The `closed` arrows can be filled or outlined. The `stroke-only` arrows can only be outlined; the picker's Filled toggle is disabled for them. (This matches their current rendering, which is purely strokes.)

**Shapes (~20, all `geometry: "closed"` unless noted):**

Existing 8 retained:

- `shape-circle`, `shape-square`, `shape-triangle`, `shape-diamond`, `shape-star`, `shape-plus`, `shape-cross`, `shape-asterisk` (asterisk: `stroke-only`)

New ~12:

- `shape-hexagon`, `shape-pentagon`, `shape-octagon`
- `shape-oval` (ellipse, wider than tall)
- `shape-rounded-square`
- `shape-parallelogram`
- `shape-trapezoid`
- `shape-right-triangle`
- `shape-heart`
- `shape-lightning` (bolt)
- `shape-speech-bubble`
- `shape-chevron`

Removed:

- All `marker-*` (4 entries).
- All `bracket-*` (6 entries).

### Default values

```typescript
export const DEFAULT_SYMBOL_ID = "arrow-filled-right";
export const DEFAULT_FILL_MODE: FillMode = "filled";
export const DEFAULT_STROKE_STYLE: StrokeStyle = "solid";
```

`DEFAULT_SYMBOL_COLOR` and `DEFAULT_SYMBOL_STROKE` already exist in `AnnotationInteractionLayer.tsx`; we'll move them to `library.ts` so all defaults live together.

## 3. Data model (`src/renderer/model/annotations.ts`)

### `SymbolAnnotation`

```typescript
export type FillMode = "filled" | "outlined";
export type StrokeStyle = "solid" | "dashed" | "dotted";

export interface SymbolAnnotation extends BaseAnnotation {
  kind: "symbol";
  symbolId: string;
  x: number;
  y: number;
  sizePx: number;
  rotationDeg: number;
  anchor?: ImageAnchor;
  color: string;
  strokeWidthPx: number;
  fillMode: FillMode;
  strokeStyle: StrokeStyle; // honoured only when fillMode === "outlined"
}
```

Both new fields are required (not optional). This forces every `SymbolAnnotation` construction site to set them, which is the safety net we want.

### `BoxAnnotation`

Removed from the `Annotation` union. The `BoxAnnotation` interface itself is deleted; nothing else references it once the related actions and form are gone.

### Schema (`src/renderer/model/schema.ts` + `serialize.ts`)

- Bump `schemaVersion` from `4` to `5`.
- Validator rejects v4 and earlier (no migration). Loader returns a clear "this file uses an older format that is not supported" error.
- `MosaicFileV5` mirrors `MosaicFileV4` minus `BoxAnnotation` in the annotation union, plus the two new fields on `SymbolAnnotation`.

This is a hard cut. Per the user, no v4 files exist that need to load.

## 4. Renderer (`src/renderer/render/draw-annotations.ts`)

`drawSymbol` is rewritten:

```typescript
function drawSymbol(ctx: DrawCtx, a: SymbolAnnotation): void {
  const def = SYMBOL_LIBRARY_BY_ID.get(a.symbolId);
  if (!def) return;

  const scale = a.sizePx / 100;
  // ...existing translate/rotate/scale setup unchanged...
  const path = new Path2D(def.pathD);

  if (a.fillMode === "filled" && def.geometry === "closed") {
    ctx.fillStyle = a.color;
    ctx.fill(path);
  } else {
    ctx.strokeStyle = a.color;
    ctx.lineWidth = a.strokeWidthPx / scale;
    ctx.setLineDash(dashPatternFor(a.strokeStyle, a.strokeWidthPx, scale));
    ctx.stroke(path);
    ctx.setLineDash([]); // reset so caller's state isn't leaked
  }
}

function dashPatternFor(style: StrokeStyle, w: number, scale: number): number[] {
  switch (style) {
    case "solid":  return [];
    case "dashed": return [(8 * w) / scale, (4 * w) / scale];
    case "dotted": return [(1.5 * w) / scale, (3 * w) / scale];
  }
}
```

Dash patterns are computed in figure-px (divided by `scale`) so dash spacing is constant regardless of `sizePx`, matching how `lineWidth` is already handled. The pattern is also proportional to `strokeWidthPx` so a thicker stroke gets proportionally longer dashes (avoids the "fat dotted line that looks solid" failure mode).

Defensive note: `def.geometry === "closed"` is checked even when `fillMode === "filled"` because TypeScript can't enforce that the picker UI prevents an invalid combination. Stroke-only shapes silently degrade to outlined if someone constructs an invalid annotation.

## 5. UI

### `<SymbolPickerPanel>` (new)

Rendered by `PropertiesPanel` when `activeTool === "symbol"` AND no symbol annotation is currently selected. Layout:

```
Symbol
[grid of all shapes — flat, no category labels]
  Each cell renders the shape with the CURRENT picker style applied
  (so a user toggling Filled/Outlined immediately sees previews update).
  Tooltip = label. Active cell highlighted via aria-pressed.

Fill         [ ● Filled ] [ ○ Outlined ]
   ↳ Filled disabled when active shape is stroke-only
Stroke style [ Solid ▾ ]   ← disabled when fillMode === "filled"
Stroke width [ 2 ] px       ← disabled when fillMode === "filled"
Color        [ ■ ]
```

State source: a new `defaultSymbolStyle` object in `App.tsx`:

```typescript
interface DefaultSymbolStyle {
  symbolId: string;
  fillMode: FillMode;
  strokeStyle: StrokeStyle;
  strokeWidthPx: number;
  color: string;
}
```

The existing `lastSymbolIdRef` in `AnnotationInteractionLayer.tsx` is replaced by this richer state, lifted to `App.tsx` and passed down. The interaction layer reads from it when constructing a `SymbolAnnotation` on canvas click.

Picker behaviour:

- Clicking a shape in the grid sets `defaultSymbolStyle.symbolId`. **No annotation is created.** The cursor stays armed.
- Toggling Fill / Stroke style / Stroke width / Color updates the corresponding field in `defaultSymbolStyle`.
- When the user clicks the canvas (with `activeTool === "symbol"`), `AnnotationInteractionLayer` constructs a `SymbolAnnotation` from `defaultSymbolStyle`, position from the click, and dispatches `addAnnotation`.
- **Placement mode persists.** The newly placed symbol is NOT auto-selected; the picker panel stays open and the cursor stays armed. Subsequent canvas clicks place additional symbols using the same `defaultSymbolStyle`. This makes "place several arrows in a row" a one-click-per-symbol operation.
- To edit a placed symbol, the user switches to the `Select` tool (or presses Esc, which switches to Select), then clicks the symbol. At that point `SymbolAnnoForm` takes over.

This is a deliberate change from how `Text` placement currently works (which auto-selects after placement to enable inline editing). Symbol's repeat-placement ergonomics matter more than its inline-edit ergonomics, so the two tools differ.

### `<SymbolAnnoForm>` (rework)

Replaces the existing category-grouped gallery with a flat grid identical to the picker's. Structurally, both surfaces share two factored-out subcomponents:

- `<SymbolGrid value onChange disabledFillForCurrent>` — shape selection grid.
- `<SymbolStyleControls value onChange canFill>` — Fill / Stroke style / Stroke width / Color row.

`SymbolPickerPanel` wires these to `defaultSymbolStyle`. `SymbolAnnoForm` wires them to the selected annotation's fields, dispatching `updateAnnotation`. Same UI, different state target — keeps them visually and behaviourally consistent.

Other `SymbolAnnoForm` controls retained as-is: Size (px), Rotation (deg) + Reset, Delete annotation button.

### `PropertiesPanel.tsx` routing

New branch in the routing decision tree (insert before the no-selection fallback):

```typescript
if (activeTool === "symbol" && !selectedAnno) {
  return <SymbolPickerPanel ... />;
}
```

This requires plumbing `activeTool` from `App.tsx` into `PropertiesPanel` — currently it isn't passed through.

## Files

**Modify:**

- `src/renderer/components/Toolbar/AnnotationToolbar.tsx` — drop `box`.
- `src/renderer/symbols/library.ts` — restructure `SymbolDef`, drop categories/markers/brackets, add ~12 shapes, add `geometry`, move default constants in.
- `src/renderer/model/annotations.ts` — add `FillMode`, `StrokeStyle`, fields on `SymbolAnnotation`; remove `BoxAnnotation`.
- `src/renderer/model/figure-actions.ts` — drop box-specific actions; symbol-related action factories accept new fields.
- `src/renderer/components/Annotations/AnnotationInteractionLayer.tsx` — remove the box drag-to-draw branch; symbol placement reads from `defaultSymbolStyle` prop.
- `src/renderer/render/draw-annotations.ts` — rewrite `drawSymbol`; add `dashPatternFor` helper.
- `src/renderer/components/Properties/SymbolAnnoForm.tsx` — rework to use `<SymbolGrid>` + `<SymbolStyleControls>`.
- `src/renderer/components/Properties/PropertiesPanel.tsx` — pass-through `activeTool`; route to `SymbolPickerPanel` when in picker mode.
- `src/renderer/components/Properties/AnnotationPropertiesForm.tsx` — drop the box-form dispatch branch.
- `src/renderer/App.tsx` — add `defaultSymbolStyle` state; pass `activeTool` and `defaultSymbolStyle` into `PropertiesPanel` and `AnnotationInteractionLayer`.
- `src/renderer/model/schema.ts` — bump `schemaVersion` to 5; reject older versions.
- `src/renderer/model/serialize.ts` — write v5.

**Add:**

- `src/renderer/components/Properties/SymbolPickerPanel.tsx`
- `src/renderer/components/Properties/SymbolGrid.tsx`
- `src/renderer/components/Properties/SymbolStyleControls.tsx`

**Delete:**

- `src/renderer/components/Properties/BoxAnnoForm.tsx`

**Tests:**

- Update `test/unit/figure-actions.test.ts` — remove box action tests; symbol creation includes `fillMode` / `strokeStyle`.
- Update `test/unit/annotation-interaction-layer.test.tsx` — remove box drag-to-draw cases; symbol placement asserts default style propagation from picker state; placement does NOT auto-select (placement mode persists).
- Update existing draw/serialize tests to cover the new symbol fields and the v5 schema.
- New `test/unit/symbol-picker-panel.test.tsx` — picker visibility (visible iff `activeTool === "symbol"` && no selection); clicking shape updates default but doesn't place; Filled toggle disabled for stroke-only; toggling fill mode disables stroke style + width inputs.
- New `test/unit/symbol-grid.test.tsx` — grid renders flat (no category headers), preview reflects current style, active cell highlighted.
- New `test/unit/draw-symbol.test.ts` — `drawSymbol` honours `fillMode` (fills vs. strokes), `strokeStyle` produces correct `setLineDash` calls, line dash is reset after drawing.

## Risks

1. **Forgetting to reset `setLineDash`** would leak state to subsequent draw calls. The renderer test asserts `setLineDash([])` is called after every dashed/dotted stroke.
2. **Stroke-only shape with `fillMode: "filled"`** could be constructed by code despite the UI preventing it. Mitigated by the renderer's defensive check (`def.geometry === "closed"`) which falls back to outlined rendering.
3. **`activeTool` not propagating** to `PropertiesPanel`. Verified by the picker visibility test.
4. **Default style not persisting across symbol placements within a session.** State lives in `App.tsx` (not the reducer), so it survives re-renders but resets on app restart. This is intentional.
5. **New shape paths look bad at small sizes.** Each new shape's path is hand-crafted in the 100×100 viewport. Visual review of the picker grid is mandatory before merge — the audit can run as a manual `pnpm dev` check rather than a unit test.
