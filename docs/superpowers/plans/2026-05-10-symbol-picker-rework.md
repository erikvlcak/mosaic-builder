# Symbol Picker Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the annotation symbol tool — drop the `box` tool, restructure the symbol library with `geometry`/`fillMode`/`strokeStyle`, surface a picker panel the moment the user clicks the `Symbol` toolbar button, and bump the schema to v5.

**Architecture:** Five independent concerns sequenced from leaves to wiring: (1) symbol library types/catalogue, (2) annotation data model + schema bump (drops `BoxAnnotation`, adds `fillMode`/`strokeStyle` to `SymbolAnnotation`), (3) renderer (`drawSymbol` honours new fields, dash patterns scale with stroke width), (4) shared UI primitives (`SymbolGrid`, `SymbolStyleControls`), (5) App-level wiring (lift `defaultSymbolStyle` to `App.tsx`, route `SymbolPickerPanel` from `PropertiesPanel` when `activeTool === "symbol"`).

**Tech Stack:** TypeScript, React 18, Vitest, `@testing-library/react`. Targets the existing immutable-reducer + derive-figure architecture documented in `CLAUDE.md`.

**Sequencing rationale.** The plan front-loads the typed leaves (library shape, annotation interfaces, schema) so every downstream task picks up clean types. The `box` removal is bundled into Task 4 to avoid leaving the tree red across commits — once `BoxAnnotation` leaves the `Annotation` union, every site that mentions it must compile in the same commit.

---

## File map

This plan creates, modifies, and deletes the following files. Map of responsibilities:

**Modify (renderer source):**
- [src/renderer/symbols/library.ts](src/renderer/symbols/library.ts) — rewrite `SymbolDef`, drop categories/markers/brackets, add ~12 shapes, add `geometry`, move default constants in.
- [src/renderer/model/annotations.ts](src/renderer/model/annotations.ts) — add `FillMode`/`StrokeStyle` types and fields on `SymbolAnnotation`; remove `BoxAnnotation` from union.
- [src/renderer/model/figure-actions.ts](src/renderer/model/figure-actions.ts) — drop `"box"` from `ALLOWED_BULK_KEYS`.
- [src/renderer/model/canvas-dims.ts](src/renderer/model/canvas-dims.ts) — drop the `kind === "box"` branch.
- [src/renderer/model/relocate-anno.ts](src/renderer/model/relocate-anno.ts) — drop the `case "box":` branch.
- [src/renderer/model/types.ts](src/renderer/model/types.ts) — drop `BoxAnnotation` from imports + `ResolvedAnnotation` union.
- [src/renderer/model/schema.ts](src/renderer/model/schema.ts) — bump `CURRENT_SCHEMA_VERSION` to 5; add `MosaicFileV5`; reject v4 in validator; remove `box` from annotation validator; require `fillMode`/`strokeStyle` on symbols in v5.
- [src/renderer/model/serialize.ts](src/renderer/model/serialize.ts) — write v5; remove v3/v4 load branches the loader no longer reaches; update return type to `MosaicFileV5`.
- [src/renderer/render/draw-figure.ts](src/renderer/render/draw-figure.ts) — add `setLineDash` to `DrawCtx` interface.
- [src/renderer/render/draw-annotations.ts](src/renderer/render/draw-annotations.ts) — rewrite `drawSymbol` to honour `fillMode`/`strokeStyle`; add `dashPatternFor` helper; remove `drawBox`; remove `case "box"` from switch.
- [src/renderer/components/Toolbar/AnnotationToolbar.tsx](src/renderer/components/Toolbar/AnnotationToolbar.tsx) — drop `"box"` from `Tool` union and `TOOLS` array; update `symbol` tooltip.
- [src/renderer/components/Annotations/AnnotationInteractionLayer.tsx](src/renderer/components/Annotations/AnnotationInteractionLayer.tsx) — accept `defaultSymbolStyle` prop; drop the box drag-to-draw branch and the `BoxAnnotation` corner-handle branches; symbol click reads from `defaultSymbolStyle`; placement does not auto-select.
- [src/renderer/components/Properties/SymbolAnnoForm.tsx](src/renderer/components/Properties/SymbolAnnoForm.tsx) — rework to render shared `<SymbolGrid>` + `<SymbolStyleControls>` plus its existing Size/Rotation/Delete controls.
- [src/renderer/components/Properties/PropertiesPanel.tsx](src/renderer/components/Properties/PropertiesPanel.tsx) — accept `activeTool` and `defaultSymbolStyle` props; route to `<SymbolPickerPanel>` when `activeTool === "symbol"` and nothing is selected; drop `"box"` from `ANNO_TITLES`.
- [src/renderer/components/Properties/AnnotationPropertiesForm.tsx](src/renderer/components/Properties/AnnotationPropertiesForm.tsx) — drop the `case "box"` branch.
- [src/renderer/components/Properties/MultiAnnoForm.tsx](src/renderer/components/Properties/MultiAnnoForm.tsx) — drop the `box` kind label, the `box` patch-builder branch, and the `BoxKindForm` rendering.
- [src/renderer/components/Properties/AnnotationOverview.tsx](src/renderer/components/Properties/AnnotationOverview.tsx) — drop `"box"` from the kinds-listed array.
- [src/renderer/App.tsx](src/renderer/App.tsx) — add `defaultSymbolStyle` state; pass `activeTool` + `defaultSymbolStyle` + setter into `PropertiesPanel`; pass `defaultSymbolStyle` into `AnnotationInteractionLayer`.

**Create (renderer source):**
- [src/renderer/components/Properties/SymbolGrid.tsx](src/renderer/components/Properties/SymbolGrid.tsx) — flat shape grid; previews use current style; `aria-pressed` on active cell.
- [src/renderer/components/Properties/SymbolStyleControls.tsx](src/renderer/components/Properties/SymbolStyleControls.tsx) — Fill / Stroke style / Stroke width / Color row.
- [src/renderer/components/Properties/SymbolPickerPanel.tsx](src/renderer/components/Properties/SymbolPickerPanel.tsx) — composes the two above against `defaultSymbolStyle`.
- [src/renderer/model/default-symbol-style.ts](src/renderer/model/default-symbol-style.ts) — exports `DefaultSymbolStyle` interface and `initialDefaultSymbolStyle()` helper. Lives in `model/` so both `App.tsx` and the picker import the same type without a UI-layer cycle.

**Delete:**
- [src/renderer/components/Properties/BoxAnnoForm.tsx](src/renderer/components/Properties/BoxAnnoForm.tsx)

**Tests — modify:**
- [test/unit/figure-actions.test.ts](test/unit/figure-actions.test.ts) — remove the box-add and bulk-box assertions; symbol fixture includes `fillMode` + `strokeStyle`.
- [test/unit/annotation-interaction-layer.test.tsx](test/unit/annotation-interaction-layer.test.tsx) — remove all box drag-to-draw / box-handle tests; symbol placement asserts `defaultSymbolStyle` propagation; placement does NOT call `onSelectionChange`.
- [test/unit/annotation-layer-click-passthrough.test.tsx](test/unit/annotation-layer-click-passthrough.test.tsx), [test/unit/annotation-layer-dblclick-passthrough.test.tsx](test/unit/annotation-layer-dblclick-passthrough.test.tsx), [test/unit/annotation-layer-drop-passthrough.test.tsx](test/unit/annotation-layer-drop-passthrough.test.tsx), [test/unit/annotation-layer-editing-passthrough.test.tsx](test/unit/annotation-layer-editing-passthrough.test.tsx), [test/unit/annotation-layer-panel-drag-passthrough.test.tsx](test/unit/annotation-layer-panel-drag-passthrough.test.tsx) — pass `defaultSymbolStyle` prop where the layer is rendered (these don't exercise symbol logic but the prop is required after Task 8).
- [test/unit/draw-symbol.test.ts](test/unit/draw-symbol.test.ts) — symbol fixtures include `fillMode`/`strokeStyle`; recorder fake gains `setLineDash`.
- [test/unit/draw-figure.test.ts](test/unit/draw-figure.test.ts) — drop the box-rendering assertions.
- [test/unit/serialize.test.ts](test/unit/serialize.test.ts) — bump expected `schemaVersion` to 5; remove v1 round-trip of arrows that used `BoxAnnotation` adjacent.
- [test/unit/schema.test.ts](test/unit/schema.test.ts) — accept v5 only; reject v4; symbol annotation requires `fillMode`/`strokeStyle`.
- [test/unit/project-io.test.ts](test/unit/project-io.test.ts) — bump expected `schemaVersion` to 5.
- [test/unit/m7-roundtrip.test.ts](test/unit/m7-roundtrip.test.ts) — symbol fixtures include `fillMode`/`strokeStyle`; bump expected version.
- [test/unit/symbol-anno-form.test.tsx](test/unit/symbol-anno-form.test.tsx) — replace category-based assertions with flat-grid assertions; cover Fill/Stroke style/Stroke width interactions.
- [test/unit/multi-anno-form.test.tsx](test/unit/multi-anno-form.test.tsx) — drop box scenarios.
- [test/unit/annotation-overview.test.tsx](test/unit/annotation-overview.test.tsx) — drop box rows.
- [test/unit/migrate-v1-to-v2.test.ts](test/unit/migrate-v1-to-v2.test.ts) — update fixtures to include the new symbol fields on the v2 output.
- [test/unit/symbol-library.test.ts](test/unit/symbol-library.test.ts) — assert new shape catalogue (size, geometry tags, no categories).

**Tests — create:**
- [test/unit/symbol-picker-panel.test.tsx](test/unit/symbol-picker-panel.test.tsx) — picker visibility (`activeTool === "symbol"` && no selection), shape click updates default but doesn't dispatch `addAnnotation`, Filled toggle disabled for stroke-only, fill mode disables stroke style + stroke width inputs.
- [test/unit/symbol-grid.test.tsx](test/unit/symbol-grid.test.tsx) — flat grid (no category headers), preview reflects current style, active cell has `aria-pressed`.

---

## Task 1: Rewrite the symbol library

**Files:**
- Modify: `src/renderer/symbols/library.ts`
- Modify: `test/unit/symbol-library.test.ts`

This rewrites `SymbolDef`, drops the category dimension, replaces marker+bracket entries with new geometric shapes, and moves the symbol-style defaults into the library so future imports come from one place.

- [ ] **Step 1: Read the existing test to understand what assertions exist**

Run: `cat test/unit/symbol-library.test.ts`
Take note of what is currently asserted so the new test replaces — not duplicates — coverage.

- [ ] **Step 2: Write the failing test for the new library shape**

Replace the contents of `test/unit/symbol-library.test.ts` with:

```typescript
import { describe, it, expect } from "vitest";
import {
  SYMBOL_LIBRARY,
  SYMBOL_LIBRARY_BY_ID,
  DEFAULT_SYMBOL_ID,
  DEFAULT_FILL_MODE,
  DEFAULT_STROKE_STYLE,
  DEFAULT_SYMBOL_COLOR,
  DEFAULT_SYMBOL_STROKE,
  type SymbolDef,
} from "../../src/renderer/symbols/library";

describe("symbol library", () => {
  it("contains exactly 6 arrow ids", () => {
    const arrowIds = SYMBOL_LIBRARY.filter((s) => s.id.startsWith("arrow-")).map(
      (s) => s.id,
    );
    expect(arrowIds.sort()).toEqual([
      "arrow-double-right",
      "arrow-filled-right",
      "arrow-line-right",
      "arrow-open-right",
      "arrow-thick-right",
      "arrow-thin-right",
    ]);
  });

  it("contains the expected shape ids (existing 8 + 12 new)", () => {
    const shapeIds = SYMBOL_LIBRARY.filter((s) => s.id.startsWith("shape-")).map(
      (s) => s.id,
    );
    expect(shapeIds.sort()).toEqual(
      [
        "shape-asterisk",
        "shape-chevron",
        "shape-circle",
        "shape-cross",
        "shape-diamond",
        "shape-heart",
        "shape-hexagon",
        "shape-lightning",
        "shape-octagon",
        "shape-oval",
        "shape-parallelogram",
        "shape-pentagon",
        "shape-plus",
        "shape-right-triangle",
        "shape-rounded-square",
        "shape-speech-bubble",
        "shape-square",
        "shape-star",
        "shape-trapezoid",
        "shape-triangle",
      ].sort(),
    );
  });

  it("contains no marker-* or bracket-* entries", () => {
    expect(SYMBOL_LIBRARY.some((s) => s.id.startsWith("marker-"))).toBe(false);
    expect(SYMBOL_LIBRARY.some((s) => s.id.startsWith("bracket-"))).toBe(false);
  });

  it("every entry has a `geometry` of 'closed' or 'stroke-only' and no legacy `category` or `fill` fields", () => {
    for (const def of SYMBOL_LIBRARY as readonly SymbolDef[]) {
      expect(def.geometry === "closed" || def.geometry === "stroke-only").toBe(
        true,
      );
      expect((def as unknown as { category?: unknown }).category).toBeUndefined();
      expect((def as unknown as { fill?: unknown }).fill).toBeUndefined();
    }
  });

  it("classifies the four currently-stroke-only arrows as 'stroke-only'", () => {
    const strokeOnly = ["arrow-open-right", "arrow-line-right", "arrow-double-right"];
    for (const id of strokeOnly) {
      expect(SYMBOL_LIBRARY_BY_ID.get(id)?.geometry).toBe("stroke-only");
    }
  });

  it("classifies the closed arrows as 'closed'", () => {
    for (const id of ["arrow-filled-right", "arrow-thin-right", "arrow-thick-right"]) {
      expect(SYMBOL_LIBRARY_BY_ID.get(id)?.geometry).toBe("closed");
    }
  });

  it("classifies shape-asterisk as stroke-only and the rest of shapes as closed", () => {
    expect(SYMBOL_LIBRARY_BY_ID.get("shape-asterisk")?.geometry).toBe(
      "stroke-only",
    );
    const closedShapes = SYMBOL_LIBRARY.filter(
      (s) => s.id.startsWith("shape-") && s.id !== "shape-asterisk",
    );
    for (const s of closedShapes) {
      expect(s.geometry).toBe("closed");
    }
  });

  it("exposes default constants", () => {
    expect(DEFAULT_SYMBOL_ID).toBe("arrow-filled-right");
    expect(DEFAULT_FILL_MODE).toBe("filled");
    expect(DEFAULT_STROKE_STYLE).toBe("solid");
    expect(typeof DEFAULT_SYMBOL_COLOR).toBe("string");
    expect(typeof DEFAULT_SYMBOL_STROKE).toBe("number");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run test/unit/symbol-library.test.ts`
Expected: FAIL — most assertions fail because `SymbolDef` still has `category`/`fill`, and the catalogue still contains markers/brackets.

- [ ] **Step 4: Rewrite `src/renderer/symbols/library.ts`**

Replace the file's contents with:

```typescript
/**
 * Curated symbol library. Each symbol is one Path2D-compatible string in
 * a 100×100 design viewport centered at (50, 50). The renderer translates
 * to the annotation's (x, y), rotates, scales by sizePx/100, then translates
 * by -50,-50 so the symbol's center sits at the user's anchor point.
 *
 * `geometry: "closed"` symbols are paths that bound a region — they may be
 * filled OR stroked at draw time, controlled per-annotation by `fillMode`.
 * `geometry: "stroke-only"` symbols are open strokes — the picker disables
 * the Filled toggle for these and the renderer always strokes them.
 *
 * "Right"-orientation convention: arrows point at +x. The user picks
 * rotation independently (0 = library default).
 */

import type { FillMode, StrokeStyle } from "../model/annotations";

export interface SymbolDef {
  /** Stable id; persisted in `.mosaic` files. */
  id: string;
  /** Human label shown in the picker tooltip. */
  label: string;
  /** Path data in a 100×100 viewport centered at (50, 50). */
  pathD: string;
  /**
   * "closed" — path forms a closed region; supports both fill and stroke.
   * "stroke-only" — path is an open stroke; the picker disables the Filled
   * toggle and the renderer falls back to outlined rendering if asked to fill.
   */
  geometry: "closed" | "stroke-only";
}

export const SYMBOL_LIBRARY: readonly SymbolDef[] = [
  // Arrows
  {
    id: "arrow-open-right",
    label: "Open arrow",
    geometry: "stroke-only",
    pathD: "M 15 50 L 75 50 M 75 50 L 60 35 M 75 50 L 60 65",
  },
  {
    id: "arrow-filled-right",
    label: "Filled arrow",
    geometry: "closed",
    pathD: "M 15 45 L 65 45 L 65 30 L 85 50 L 65 70 L 65 55 L 15 55 Z",
  },
  {
    id: "arrow-line-right",
    label: "Line",
    geometry: "stroke-only",
    pathD: "M 15 50 L 85 50",
  },
  {
    id: "arrow-double-right",
    label: "Double arrow",
    geometry: "stroke-only",
    pathD:
      "M 15 50 L 75 50 M 60 35 L 75 50 L 60 65 M 45 35 L 60 50 L 45 65",
  },
  {
    id: "arrow-thin-right",
    label: "Thin arrow",
    geometry: "closed",
    pathD: "M 15 48 L 70 48 L 70 38 L 85 50 L 70 62 L 70 52 L 15 52 Z",
  },
  {
    id: "arrow-thick-right",
    label: "Thick arrow",
    geometry: "closed",
    pathD: "M 15 38 L 60 38 L 60 20 L 90 50 L 60 80 L 60 62 L 15 62 Z",
  },

  // Shapes — existing 8
  {
    id: "shape-circle",
    label: "Circle",
    geometry: "closed",
    pathD: "M 85 50 A 35 35 0 1 1 15 50 A 35 35 0 1 1 85 50 Z",
  },
  {
    id: "shape-square",
    label: "Square",
    geometry: "closed",
    pathD: "M 15 15 L 85 15 L 85 85 L 15 85 Z",
  },
  {
    id: "shape-triangle",
    label: "Triangle",
    geometry: "closed",
    pathD: "M 50 15 L 85 80 L 15 80 Z",
  },
  {
    id: "shape-diamond",
    label: "Diamond",
    geometry: "closed",
    pathD: "M 50 15 L 85 50 L 50 85 L 15 50 Z",
  },
  {
    id: "shape-star",
    label: "Star",
    geometry: "closed",
    pathD:
      "M 50 15 L 60 40 L 87 40 L 65 57 L 73 84 L 50 68 L 27 84 L 35 57 L 13 40 L 40 40 Z",
  },
  {
    id: "shape-plus",
    label: "Plus",
    geometry: "closed",
    pathD:
      "M 42 20 L 58 20 L 58 42 L 80 42 L 80 58 L 58 58 L 58 80 L 42 80 L 42 58 L 20 58 L 20 42 L 42 42 Z",
  },
  {
    id: "shape-cross",
    label: "Cross (X)",
    geometry: "closed",
    pathD:
      "M 22 30 L 30 22 L 50 42 L 70 22 L 78 30 L 58 50 L 78 70 L 70 78 L 50 58 L 30 78 L 22 70 L 42 50 Z",
  },
  {
    id: "shape-asterisk",
    label: "Asterisk",
    geometry: "stroke-only",
    pathD: "M 20 50 L 80 50 M 50 20 L 50 80 M 28 28 L 72 72 M 72 28 L 28 72",
  },

  // Shapes — new 12
  {
    id: "shape-hexagon",
    label: "Hexagon",
    geometry: "closed",
    pathD: "M 25 22 L 75 22 L 90 50 L 75 78 L 25 78 L 10 50 Z",
  },
  {
    id: "shape-pentagon",
    label: "Pentagon",
    geometry: "closed",
    pathD: "M 50 12 L 88 40 L 73 84 L 27 84 L 12 40 Z",
  },
  {
    id: "shape-octagon",
    label: "Octagon",
    geometry: "closed",
    pathD:
      "M 32 12 L 68 12 L 88 32 L 88 68 L 68 88 L 32 88 L 12 68 L 12 32 Z",
  },
  {
    id: "shape-oval",
    label: "Oval",
    geometry: "closed",
    pathD: "M 90 50 A 40 28 0 1 1 10 50 A 40 28 0 1 1 90 50 Z",
  },
  {
    id: "shape-rounded-square",
    label: "Rounded square",
    geometry: "closed",
    pathD:
      "M 25 15 L 75 15 Q 85 15 85 25 L 85 75 Q 85 85 75 85 L 25 85 Q 15 85 15 75 L 15 25 Q 15 15 25 15 Z",
  },
  {
    id: "shape-parallelogram",
    label: "Parallelogram",
    geometry: "closed",
    pathD: "M 25 20 L 90 20 L 75 80 L 10 80 Z",
  },
  {
    id: "shape-trapezoid",
    label: "Trapezoid",
    geometry: "closed",
    pathD: "M 25 20 L 75 20 L 90 80 L 10 80 Z",
  },
  {
    id: "shape-right-triangle",
    label: "Right triangle",
    geometry: "closed",
    pathD: "M 15 15 L 85 85 L 15 85 Z",
  },
  {
    id: "shape-heart",
    label: "Heart",
    geometry: "closed",
    pathD:
      "M 50 82 C 18 60 18 28 38 28 C 46 28 50 36 50 40 C 50 36 54 28 62 28 C 82 28 82 60 50 82 Z",
  },
  {
    id: "shape-lightning",
    label: "Lightning",
    geometry: "closed",
    pathD: "M 55 10 L 25 55 L 45 55 L 35 90 L 70 40 L 50 40 L 60 10 Z",
  },
  {
    id: "shape-speech-bubble",
    label: "Speech bubble",
    geometry: "closed",
    pathD:
      "M 20 20 L 80 20 Q 90 20 90 30 L 90 60 Q 90 70 80 70 L 50 70 L 35 88 L 38 70 L 20 70 Q 10 70 10 60 L 10 30 Q 10 20 20 20 Z",
  },
  {
    id: "shape-chevron",
    label: "Chevron",
    geometry: "closed",
    pathD: "M 20 20 L 50 20 L 80 50 L 50 80 L 20 80 L 50 50 Z",
  },
];

export const SYMBOL_LIBRARY_BY_ID: ReadonlyMap<string, SymbolDef> = new Map(
  SYMBOL_LIBRARY.map((d) => [d.id, d]),
);

export const DEFAULT_SYMBOL_ID = "arrow-filled-right";
export const DEFAULT_FILL_MODE: FillMode = "filled";
export const DEFAULT_STROKE_STYLE: StrokeStyle = "solid";
export const DEFAULT_SYMBOL_COLOR = "#FF0000";
export const DEFAULT_SYMBOL_STROKE = 2;
```

> Note: this file imports `FillMode`/`StrokeStyle` from `model/annotations`. Task 2 adds those exports. Until Task 2 lands the typecheck will fail — that's expected and resolved by the next task.

- [ ] **Step 5: Run the symbol-library test (expect partial green)**

Run: `pnpm vitest run test/unit/symbol-library.test.ts`
Expected: tests pass at runtime IF Task 2 has landed. Until then, the type import fails — proceed to Task 2 and re-run after.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/symbols/library.ts test/unit/symbol-library.test.ts
git commit -m "feat(symbols): restructure library — geometry-tagged, no categories"
```

---

## Task 2: Add `FillMode`/`StrokeStyle` types and rework `SymbolAnnotation`; remove `BoxAnnotation`

**Files:**
- Modify: `src/renderer/model/annotations.ts`
- Modify: `src/renderer/model/types.ts`
- Modify: `src/renderer/model/canvas-dims.ts`
- Modify: `src/renderer/model/relocate-anno.ts`
- Modify: `src/renderer/model/figure-actions.ts` (only `ALLOWED_BULK_KEYS`)
- Modify: `test/unit/figure-actions.test.ts` (drop box, add new symbol fields)

This is a breaking change: it deletes `BoxAnnotation` from the union and adds two new required fields to `SymbolAnnotation`. Because every site that mentions `BoxAnnotation` will fail typecheck the moment the union changes, the cleanups land in the same task.

- [ ] **Step 1: Write the failing typecheck-driven assertions**

Edit `test/unit/figure-actions.test.ts`:

a) Update the `symbolAnno` factory to include the new fields:

```typescript
function symbolAnno(id: string, panelId?: string): SymbolAnnotation {
  return {
    id,
    kind: "symbol",
    z: 0,
    panelId,
    symbolId: "arrow-filled-right",
    x: 25,
    y: 25,
    sizePx: 60,
    rotationDeg: 0,
    color: "#FF0000",
    strokeWidthPx: 2,
    fillMode: "filled",
    strokeStyle: "solid",
  };
}
```

b) Delete the `boxAnno` factory entirely.

c) Delete the `it("ADD_ANNOTATION adds a box annotation", …)` test.

d) In the `figureReducer (bulk annotation actions)` describe block, remove every reference to `boxAnno("b1")` from the `withAnnos(...)` setups, the assertions about box-form patches, and the inline literal `{ kind: "box", … }` — keep only `textAnno`/`symbolAnno`/`scalebarAnno` in the multi-kind setups.

e) Add a new test below the symbol tests:

```typescript
it("ADD_ANNOTATION carries fillMode and strokeStyle through verbatim", () => {
  const s0 = initialFigureState();
  const pid = panelIdAt(s0, 0, 0);
  const ann: SymbolAnnotation = {
    ...symbolAnno("a-fields", pid),
    fillMode: "outlined",
    strokeStyle: "dashed",
    strokeWidthPx: 4,
  };
  const s1 = figureReducer(s0, addAnnotation(ann));
  const stored = s1.annotations[0] as SymbolAnnotation;
  expect(stored.fillMode).toBe("outlined");
  expect(stored.strokeStyle).toBe("dashed");
  expect(stored.strokeWidthPx).toBe(4);
});
```

f) Remove the `BoxAnnotation` import line from the top of the test file.

- [ ] **Step 2: Run the failing test**

Run: `pnpm vitest run test/unit/figure-actions.test.ts`
Expected: typecheck error or runtime failure — `fillMode` is not a property of `SymbolAnnotation` yet, and `BoxAnnotation` is still imported elsewhere.

- [ ] **Step 3: Update `src/renderer/model/annotations.ts`**

Replace the `AnnotationKind` line, the `SymbolAnnotation` interface, the `BoxAnnotation` interface, and the `Annotation` union with:

```typescript
export type AnnotationKind = "text" | "symbol" | "scalebar" | "letter";

export type FillMode = "filled" | "outlined";
export type StrokeStyle = "solid" | "dashed" | "dotted";

export interface SymbolAnnotation extends BaseAnnotation {
  kind: "symbol";
  /** Id into SYMBOL_LIBRARY (see src/renderer/symbols/library.ts). */
  symbolId: string;
  /** Anchor (center of the symbol) in figure-canvas px. */
  x: number;
  y: number;
  /**
   * Image-anchor for the symbol's center, in 0..1 source-image space.
   * Present iff `imageId` is set; the relocator uses it to reproject `x/y`
   * when the image moves to a new panel.
   */
  anchor?: ImageAnchor;
  /** The larger of width/height in figure-canvas px. Square hit-rect side. */
  sizePx: number;
  /** Degrees clockwise. 0 = library default orientation. */
  rotationDeg: number;
  color: string;
  /** Stroke width when outlined (or for stroke-only geometries). */
  strokeWidthPx: number;
  /**
   * Fill vs outline. For `geometry: "stroke-only"` symbols the renderer
   * falls back to outlined rendering even if this is "filled" — the picker
   * UI prevents that combination, but the renderer is defensive.
   */
  fillMode: FillMode;
  /** Honoured only when `fillMode === "outlined"` (or geometry is stroke-only). */
  strokeStyle: StrokeStyle;
}

// BoxAnnotation removed in spec 06 — symbols now cover the rectangle use case
// via shape-square + outlined fillMode, eliminating the redundant tool.

/** User-creatable annotations. `LetterAnnotation` is derived, not in this union. */
export type Annotation =
  | TextAnnotation
  | SymbolAnnotation
  | ScaleBarAnnotation;
```

Delete the entire `BoxAnnotation` interface block. Keep all other annotation interfaces unchanged.

- [ ] **Step 4: Update `src/renderer/model/types.ts`**

Find the `BoxAnnotation` import and the `(BoxAnnotation & { kind: "box" })` line of `ResolvedAnnotation`. Remove both. Specifically:

```typescript
// Before
import type {
  ...
  BoxAnnotation,
  ...
} from "./annotations";

export type ResolvedAnnotation =
  | (TextAnnotation & { kind: "text" })
  | (SymbolAnnotation & { kind: "symbol" })
  | (BoxAnnotation & { kind: "box" })
  | ResolvedScaleBarAnnotation
  | (LetterAnnotation & { kind: "letter" });

// After
import type {
  ...
  // BoxAnnotation removed
  ...
} from "./annotations";

export type ResolvedAnnotation =
  | (TextAnnotation & { kind: "text" })
  | (SymbolAnnotation & { kind: "symbol" })
  | ResolvedScaleBarAnnotation
  | (LetterAnnotation & { kind: "letter" });
```

- [ ] **Step 5: Update `src/renderer/model/canvas-dims.ts`**

Find the `if (a.kind === "box") { ... }` block (around line 61) and delete it entirely. The exhaustive iteration that follows handles the remaining kinds.

- [ ] **Step 6: Update `src/renderer/model/relocate-anno.ts`**

Find the `case "box": { ... }` block (around line 113) and delete it. Confirm the `switch` still covers all remaining annotation kinds (`text`, `symbol`, `scalebar`, `letter` — adjust the exhaustiveness guard if present).

- [ ] **Step 7: Update `src/renderer/model/figure-actions.ts` `ALLOWED_BULK_KEYS`**

Remove the `box` row:

```typescript
const ALLOWED_BULK_KEYS: Record<AnnotationKind, ReadonlySet<string>> = {
  text: new Set(["color", "bgColor", "font", "sizePt", "bold", "italic"]),
  symbol: new Set([
    "color",
    "strokeWidthPx",
    "sizePx",
    "symbolId",
    "rotationDeg",
    "fillMode",
    "strokeStyle",
  ]),
  scalebar: new Set(["lengthValue", "lengthUnit", "cornerOverride"]),
  letter: new Set(),
};
```

(Symbol picks up `fillMode` + `strokeStyle` so multi-select bulk style edits include them.)

- [ ] **Step 8: Run the figure-actions test**

Run: `pnpm vitest run test/unit/figure-actions.test.ts`
Expected: PASS for the symbol-related cases. (Other tests in the suite — bulk box, draw box, etc. — may still fail until Task 3 and onward; that's fine, those land in subsequent commits.)

- [ ] **Step 9: Commit**

```bash
git add src/renderer/model/annotations.ts src/renderer/model/types.ts \
        src/renderer/model/canvas-dims.ts src/renderer/model/relocate-anno.ts \
        src/renderer/model/figure-actions.ts test/unit/figure-actions.test.ts
git commit -m "feat(model): drop BoxAnnotation; add fillMode/strokeStyle to SymbolAnnotation"
```

---

## Task 3: Bump schema to v5 (no migration); update serializer

**Files:**
- Modify: `src/renderer/model/schema.ts`
- Modify: `src/renderer/model/serialize.ts`
- Modify: `test/unit/schema.test.ts`
- Modify: `test/unit/serialize.test.ts`
- Modify: `test/unit/project-io.test.ts`
- Modify: `test/unit/m7-roundtrip.test.ts`
- Modify: `test/unit/migrate-v1-to-v2.test.ts`

The user has confirmed no v4 files exist that need to load, so this is a hard cut: validator rejects v4-and-earlier, loader knows only v5.

- [ ] **Step 1: Write the failing schema test**

In `test/unit/schema.test.ts`:

a) Add this test inside the existing top-level `describe`:

```typescript
it("rejects schemaVersion 4 with a clear error", () => {
  const r = validateMosaicFile({ ...MIN_VALID, schemaVersion: 4 });
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error).toMatch(/older format that is not supported|schemaVersion/);
  }
});

it("accepts schemaVersion 5 when symbol annotations carry fillMode/strokeStyle", () => {
  const r = validateMosaicFile({
    ...MIN_VALID,
    schemaVersion: 5,
  });
  expect(r.ok).toBe(true);
});

it("rejects a v5 symbol annotation missing fillMode", () => {
  const r = validateMosaicFile({
    ...MIN_VALID,
    schemaVersion: 5,
    state: {
      ...MIN_VALID.state,
      annotations: [
        {
          id: "s1",
          kind: "symbol",
          z: 0,
          symbolId: "arrow-filled-right",
          x: 10,
          y: 10,
          sizePx: 60,
          rotationDeg: 0,
          color: "#FF0000",
          strokeWidthPx: 2,
          strokeStyle: "solid",
        },
      ],
    },
  });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toMatch(/fillMode/);
});

it("rejects a v5 symbol annotation with an invalid strokeStyle", () => {
  const r = validateMosaicFile({
    ...MIN_VALID,
    schemaVersion: 5,
    state: {
      ...MIN_VALID.state,
      annotations: [
        {
          id: "s1",
          kind: "symbol",
          z: 0,
          symbolId: "arrow-filled-right",
          x: 10, y: 10, sizePx: 60, rotationDeg: 0,
          color: "#FF0000", strokeWidthPx: 2,
          fillMode: "filled",
          strokeStyle: "wavy",
        },
      ],
    },
  });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toMatch(/strokeStyle/);
});
```

b) Update the existing `MIN_VALID` literal to type `MosaicFileV5` and `schemaVersion: 5`:

```typescript
import {
  validateMosaicFile,
  type MosaicFileV5,
} from "../../src/renderer/model/schema";

const MIN_VALID: MosaicFileV5 = {
  schemaVersion: 5,
  // ...rest unchanged...
};
```

c) In existing assertions, change `expect(r.value.schemaVersion).toBe(3);` → `5`.

d) Find the helper `function buildFile(schemaVersion: 1 | 2 | 3, …)` (around line 430) and update its signature to `1 | 2 | 3 | 4 | 5`. Adjust any switch on the version inside it accordingly so a `5` case constructs a valid V5 file.

e) Drop the `it("rejects schemaVersion 99 (unsupported)", …)` test only if it constructs a v4 file in its setup; otherwise leave it. (It probably doesn't — leave it alone if it just sets `schemaVersion: 99`.)

- [ ] **Step 2: Run the failing schema test**

Run: `pnpm vitest run test/unit/schema.test.ts`
Expected: FAIL — `MosaicFileV5` doesn't exist yet, validator still accepts v4, no `fillMode` enforcement.

- [ ] **Step 3: Update `src/renderer/model/schema.ts`**

a) Bump the constant near the top:

```typescript
export const CURRENT_SCHEMA_VERSION = 5;
```

b) After the `MosaicFileV4` interface, add:

```typescript
/**
 * v5: spec 06 (symbol picker rework) — `BoxAnnotation` removed from the
 * annotation union; `SymbolAnnotation` gains required `fillMode` and
 * `strokeStyle` fields. There is no migration: v4 and earlier files are
 * rejected at load with a clear error, since no production v4 files exist
 * (the user has confirmed this).
 */
export interface MosaicFileV5
  extends Omit<MosaicFileV4, "schemaVersion" | "state"> {
  schemaVersion: 5;
  state: MosaicFileV4["state"];
}
```

c) Update the `MosaicFile` alias:

```typescript
export type MosaicFile =
  | MosaicFileV1
  | MosaicFileV2
  | MosaicFileV3
  | MosaicFileV4
  | MosaicFileV5;
```

d) In `validateMosaicFile`, replace the version check with:

```typescript
if (
  x.schemaVersion !== 1 &&
  x.schemaVersion !== 2 &&
  x.schemaVersion !== 3 &&
  x.schemaVersion !== 5
) {
  if (x.schemaVersion === 4) {
    return err(
      "schemaVersion: this file uses an older format (v4) that is not supported. Re-create the project in the current app.",
    );
  }
  return err(`schemaVersion: unsupported (${String(x.schemaVersion)})`);
}
const sv: 1 | 2 | 3 | 5 = x.schemaVersion;
```

e) Update the `validateAnnotations` signature to `schemaVersion: 1 | 2 | 3 | 5` and at every call site (just one inside `validateMosaicFile`).

f) Inside `validateAnnotations`, find the `else if (k === "symbol")` block and append:

```typescript
if (sv === 5) {
  if (
    a.fillMode !== "filled" &&
    a.fillMode !== "outlined"
  ) {
    return err(`${path}[${i}].fillMode: must be 'filled' or 'outlined'`);
  }
  if (
    a.strokeStyle !== "solid" &&
    a.strokeStyle !== "dashed" &&
    a.strokeStyle !== "dotted"
  ) {
    return err(`${path}[${i}].strokeStyle: must be 'solid'|'dashed'|'dotted'`);
  }
}
```

g) Find the `else if (k === "box")` block in `validateAnnotations` and replace it with:

```typescript
} else if (k === "box") {
  return err(
    `${path}[${i}].kind: 'box' annotations are not supported in v${sv}`,
  );
}
```

h) Update the final `return err(...)` in the kinds switch to mention the current set: `"must be text|symbol|scalebar (or arrow in v1)"`.

i) Update the `letterOverrides`/`letterPattern`/`layout` version guards: anywhere the code says `sv === 3 || sv === 4`, change it to `sv === 3 || sv === 5`. (Skip the `sv === 4` arm; v4 is unreachable.)

- [ ] **Step 4: Update `src/renderer/model/serialize.ts`**

a) Change the import at the top:

```typescript
import type { MosaicFile, MosaicFileV5 } from "./schema";
```

b) Update the return type of `toMosaicFile`:

```typescript
export function toMosaicFile(inp: ToMosaicInput): MosaicFileV5 {
  // ...
  const pool = inp.state.pool.map((item) => {
    const out: MosaicFileV5["state"]["pool"][number] = { ...item };
    // ...rest unchanged
  });

  return {
    schemaVersion: 5,
    // ...rest unchanged, the `state` cast becomes MosaicFileV5["state"]
    state: { ...inp.state, pool } as MosaicFileV5["state"],
  };
}
```

c) In `fromMosaicFile`:

i. Update the annotations branch — v5 files come in v5 shape directly; no migration needed:
```typescript
const annotations: Annotation[] =
  file.schemaVersion === 1
    ? migrateAnnotationsV1ToV2(file.state.annotations)
    : (file.state.annotations as Annotation[]);
```

ii. Update letterOverrides / letterPattern: `file.schemaVersion === 3 || file.schemaVersion === 5` (drop the `=== 4` arm; layout has the same change):

```typescript
const letterOverrides: Record<string, LetterOverride> =
  file.schemaVersion === 3 || file.schemaVersion === 5
    ? file.state.letterOverrides
    : migrateLetterOverridesV2ToV3(
        file.state.letterOverrides as unknown as Record<string, string>,
      );
const letterPattern: FigureState["letterPattern"] =
  file.schemaVersion === 3 || file.schemaVersion === 5
    ? file.state.letterPattern
    : "uppercase";
const layout =
  file.schemaVersion === 5
    ? file.state.layout
    : uniformLayoutFor(file.state.rows, file.state.cols);
```

> Note: `migrateAnnotationsV1ToV2` produces `SymbolAnnotation` shapes that lack `fillMode`/`strokeStyle`. v1 files are still legal at load time, so we need to fill in defaults during migration. Update Task 9 (`migrate-v1-to-v2.ts`) to set `fillMode: <derived from old fill flag>` and `strokeStyle: "solid"`. We bundle that change into Task 9 below to keep scope local.

- [ ] **Step 5: Update `test/unit/serialize.test.ts`**

Replace `expect(f.schemaVersion).toBe(4);` with `5` in both test cases (around lines 32 and 200). The v1 round-trip test that builds a `MosaicFileV1` literal stays — it asserts that v1 files still load — but its expected output schemaVersion (`4`) becomes `5`.

- [ ] **Step 6: Update `test/unit/project-io.test.ts`**

Change every `expect(parsed.schemaVersion).toBe(4)` and `expect(r.file.schemaVersion).toBe(4)` to `5`.

- [ ] **Step 7: Update `test/unit/m7-roundtrip.test.ts`**

Add `fillMode: "filled"` and `strokeStyle: "solid"` to every `SymbolAnnotation` literal. Change any `schemaVersion` assertion from 4 to 5.

- [ ] **Step 8: Run all schema/serialize/io tests**

Run: `pnpm vitest run test/unit/schema.test.ts test/unit/serialize.test.ts test/unit/project-io.test.ts test/unit/m7-roundtrip.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/model/schema.ts src/renderer/model/serialize.ts \
        test/unit/schema.test.ts test/unit/serialize.test.ts \
        test/unit/project-io.test.ts test/unit/m7-roundtrip.test.ts
git commit -m "feat(schema): bump to v5 — drop BoxAnnotation, require fillMode+strokeStyle"
```

---

## Task 4: Add `setLineDash` to `DrawCtx`; rewrite `drawSymbol` with `dashPatternFor`; remove `drawBox`

**Files:**
- Modify: `src/renderer/render/draw-figure.ts`
- Modify: `src/renderer/render/draw-annotations.ts`
- Modify: `test/unit/draw-symbol.test.ts`
- Modify: `test/unit/draw-figure.test.ts`

The renderer change is the substance of the spec. We also drop `drawBox` here since the `case "box"` in the switch can't compile after Task 2.

- [ ] **Step 1: Update the recorder fake to capture `setLineDash`**

In `test/unit/draw-symbol.test.ts`, find the `makeRecorder` function. Add a `setLineDash` method to the returned `ctx` (right after `fill`):

```typescript
setLineDash(segments: number[]) {
  calls.push(snapshot("setLineDash", [segments.slice()]));
},
```

- [ ] **Step 2: Write the failing test for `fillMode`/`strokeStyle`**

Replace the existing `drawSymbol` describe block (lines 135 onward in `test/unit/draw-symbol.test.ts`) with:

```typescript
describe("drawSymbol", () => {
  it("filled symbol fills the path and never strokes", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "shape-circle",
        x: 100, y: 100,
        sizePx: 50,
        rotationDeg: 0,
        color: "#112233",
        strokeWidthPx: 4,
        fillMode: "filled",
        strokeStyle: "dashed", // ignored when filled
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    expect(ctx.calls.some((c) => c.op === "fill")).toBe(true);
    expect(ctx.calls.some((c) => c.op === "stroke")).toBe(false);
  });

  it("outlined symbol strokes the path and never fills", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "shape-circle",
        x: 100, y: 100,
        sizePx: 50,
        rotationDeg: 0,
        color: "#112233",
        strokeWidthPx: 4,
        fillMode: "outlined",
        strokeStyle: "solid",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    expect(ctx.calls.some((c) => c.op === "stroke")).toBe(true);
    expect(ctx.calls.some((c) => c.op === "fill")).toBe(false);
  });

  it("stroke-only geometry forces outlined rendering even when fillMode=filled", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "arrow-line-right", // stroke-only
        x: 100, y: 100,
        sizePx: 50,
        rotationDeg: 0,
        color: "#112233",
        strokeWidthPx: 4,
        fillMode: "filled", // invalid combo — defensive fallback
        strokeStyle: "solid",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    expect(ctx.calls.some((c) => c.op === "stroke")).toBe(true);
    expect(ctx.calls.some((c) => c.op === "fill")).toBe(false);
  });

  it("solid stroke calls setLineDash([]) and resets after stroking", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "shape-circle",
        x: 100, y: 100, sizePx: 50, rotationDeg: 0,
        color: "#112233", strokeWidthPx: 4,
        fillMode: "outlined", strokeStyle: "solid",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const dashCalls = ctx.calls.filter((c) => c.op === "setLineDash");
    // At minimum: one setLineDash([]) before stroke + one [] reset after.
    expect(dashCalls.length).toBeGreaterThanOrEqual(2);
    expect(dashCalls[dashCalls.length - 1]?.args[0]).toEqual([]);
  });

  it("dashed stroke uses a 2-element dash pattern proportional to strokeWidthPx", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "shape-circle",
        x: 100, y: 100, sizePx: 100, rotationDeg: 0,
        color: "#112233", strokeWidthPx: 2,
        fillMode: "outlined", strokeStyle: "dashed",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const dashCalls = ctx.calls.filter((c) => c.op === "setLineDash");
    // First setLineDash call sets the dashed pattern (before stroke); last resets to [].
    const setCall = dashCalls[0];
    const pattern = setCall?.args[0] as number[];
    expect(pattern).toHaveLength(2);
    expect(pattern[0]).toBeGreaterThan(0);
    expect(pattern[1]).toBeGreaterThan(0);
    // sizePx 100 → scale 1; pattern divided by scale = pattern itself.
    // Spec: dashed = [(8 * w) / scale, (4 * w) / scale] = [16, 8] for w=2.
    expect(pattern[0]).toBeCloseTo(16);
    expect(pattern[1]).toBeCloseTo(8);
    // Reset call is last.
    expect(dashCalls[dashCalls.length - 1]?.args[0]).toEqual([]);
  });

  it("dotted stroke uses a tighter 2-element dash pattern", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "shape-circle",
        x: 100, y: 100, sizePx: 100, rotationDeg: 0,
        color: "#112233", strokeWidthPx: 2,
        fillMode: "outlined", strokeStyle: "dotted",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const dashCalls = ctx.calls.filter((c) => c.op === "setLineDash");
    const pattern = dashCalls[0]?.args[0] as number[];
    // Spec: dotted = [(1.5 * w) / scale, (3 * w) / scale] = [3, 6] for w=2 at scale 1.
    expect(pattern[0]).toBeCloseTo(3);
    expect(pattern[1]).toBeCloseTo(6);
  });

  it("dash pattern divides by scale so on-screen spacing is constant", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "shape-circle",
        x: 100, y: 100, sizePx: 200, rotationDeg: 0,
        color: "#112233", strokeWidthPx: 2,
        fillMode: "outlined", strokeStyle: "dashed",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const dashCalls = ctx.calls.filter((c) => c.op === "setLineDash");
    const pattern = dashCalls[0]?.args[0] as number[];
    // sizePx 200 → scale 2; spec values divided by 2 → [8, 4].
    expect(pattern[0]).toBeCloseTo(8);
    expect(pattern[1]).toBeCloseTo(4);
  });

  it("unknown symbolId emits no save/restore/fill/stroke", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "ghost",
        x: 100, y: 100, sizePx: 50, rotationDeg: 0,
        color: "#112233", strokeWidthPx: 2,
        fillMode: "filled", strokeStyle: "solid",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    expect(ctx.calls).toHaveLength(0);
  });

  it("sizePx = 0 is a no-op", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "shape-circle",
        x: 100, y: 100, sizePx: 0, rotationDeg: 0,
        color: "#112233", strokeWidthPx: 2,
        fillMode: "filled", strokeStyle: "solid",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    expect(ctx.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the failing test**

Run: `pnpm vitest run test/unit/draw-symbol.test.ts`
Expected: FAIL — `DrawCtx` lacks `setLineDash`, and `drawSymbol` doesn't honour the new fields.

- [ ] **Step 4: Add `setLineDash` to `DrawCtx`**

In `src/renderer/render/draw-figure.ts`, add this method after `fill(path?: Path2D): void;`:

```typescript
setLineDash(segments: number[]): void;
```

- [ ] **Step 5: Rewrite `drawSymbol` and remove `drawBox`**

In `src/renderer/render/draw-annotations.ts`:

a) Update imports — remove `BoxAnnotation`:

```typescript
import type {
  LetterAnnotation,
  TextAnnotation,
  SymbolAnnotation,
  ScaleBarAnnotation,
  StrokeStyle,
} from "../model/annotations";
```

b) Delete the `drawBox` function entirely.

c) Remove the `case "box":` arm from the switch in `drawAnnotations`. The exhaustiveness `_exhaustive: never = a` guard stays.

d) Replace the existing `drawSymbol` body with:

```typescript
function drawSymbol(ctx: DrawCtx, a: SymbolAnnotation): void {
  const def = SYMBOL_LIBRARY_BY_ID.get(a.symbolId);
  if (def === undefined) return;
  if (a.sizePx <= 0) return;
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate((a.rotationDeg * Math.PI) / 180);
  const scale = a.sizePx / 100;
  ctx.scale(scale, scale);
  ctx.translate(-50, -50);
  const path = new Path2D(def.pathD);

  // Stroke-only geometries silently degrade if asked to fill — the picker
  // UI prevents this combo, but we don't want a broken render if a future
  // code path constructs an invalid annotation.
  const wantFill = a.fillMode === "filled" && def.geometry === "closed";
  if (wantFill) {
    ctx.fillStyle = a.color;
    ctx.fill(path);
  } else {
    ctx.strokeStyle = a.color;
    // Keep on-screen stroke width constant in figure-px regardless of sizePx.
    ctx.lineWidth = a.strokeWidthPx / scale;
    ctx.setLineDash(dashPatternFor(a.strokeStyle, a.strokeWidthPx, scale));
    ctx.stroke(path);
    // Reset so we don't leak dash state to subsequent draws.
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/**
 * Dash pattern in figure-px (divided by `scale` so on-screen spacing is
 * constant regardless of sizePx — same trick we use for `lineWidth`). The
 * pattern is also proportional to `strokeWidthPx` so a thicker stroke gets
 * proportionally longer dashes (avoids the "fat dotted line that looks
 * solid" failure mode).
 */
function dashPatternFor(
  style: StrokeStyle,
  strokeWidthPx: number,
  scale: number,
): number[] {
  switch (style) {
    case "solid":
      return [];
    case "dashed":
      return [(8 * strokeWidthPx) / scale, (4 * strokeWidthPx) / scale];
    case "dotted":
      return [(1.5 * strokeWidthPx) / scale, (3 * strokeWidthPx) / scale];
  }
}
```

- [ ] **Step 6: Update `test/unit/draw-figure.test.ts`**

Find the two test cases that build inline `kind: "box"` annotations (around lines 505 and 538) and delete them entirely. They tested `drawBox`, which no longer exists.

- [ ] **Step 7: Run the renderer tests**

Run: `pnpm vitest run test/unit/draw-symbol.test.ts test/unit/draw-figure.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/render/draw-figure.ts src/renderer/render/draw-annotations.ts \
        test/unit/draw-symbol.test.ts test/unit/draw-figure.test.ts
git commit -m "feat(render): drawSymbol honours fillMode + strokeStyle; dashPatternFor"
```

---

## Task 5: Drop `box` from the toolbar

**Files:**
- Modify: `src/renderer/components/Toolbar/AnnotationToolbar.tsx`

A small, isolated commit so a reviewer can verify the toolbar surface area in one diff.

- [ ] **Step 1: Replace the file contents**

```typescript
/**
 * Toolbar exposing the annotation tool selector + the global "letters"
 * visibility toggle.
 */

export type Tool = "select" | "text" | "symbol" | "scalebar";

interface Props {
  active: Tool;
  onChange: (t: Tool) => void;
  lettersEnabled: boolean;
  onToggleLetters: () => void;
}

const TOOLS: ReadonlyArray<{ id: Tool; label: string; title: string }> = [
  { id: "select", label: "Select", title: "Select and move annotations" },
  { id: "text", label: "Text", title: "Add text — click to place" },
  {
    id: "symbol",
    label: "Symbol",
    title: "Pick a symbol — click canvas to place",
  },
  { id: "scalebar", label: "Scale", title: "Add scale bar — click a panel" },
];

export function AnnotationToolbar({
  active,
  onChange,
  lettersEnabled,
  onToggleLetters,
}: Props): JSX.Element {
  return (
    <div
      data-testid="annotation-toolbar"
      style={{ display: "flex", gap: 8, alignItems: "center" }}
    >
      <div className="seg" role="group" aria-label="Annotation tool">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="btn"
            onClick={() => onChange(t.id)}
            aria-pressed={active === t.id}
            data-testid={`anno-tool-${t.id}`}
            title={t.title}
          >
            {t.label}
          </button>
        ))}
      </div>
      <label
        className="checkbox-row"
        title="Show or hide auto-generated per-panel letter labels (A, B, C…)"
      >
        <input
          type="checkbox"
          checked={lettersEnabled}
          onChange={onToggleLetters}
          data-testid="anno-letters-toggle"
        />
        Letters
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Run the typechecker**

Run: `pnpm typecheck`
Expected: errors in `AnnotationInteractionLayer.tsx`, `PropertiesPanel.tsx`, `MultiAnnoForm.tsx`, etc., that still reference the `"box"` literal — these are bundled into Tasks 11 and 13. Don't fix them here.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/Toolbar/AnnotationToolbar.tsx
git commit -m "feat(toolbar): drop the redundant 'box' tool"
```

---

## Task 6: Add `DefaultSymbolStyle` model

**Files:**
- Create: `src/renderer/model/default-symbol-style.ts`

This is a tiny standalone module — the type that the App, the picker, and the interaction layer share. Lives in `model/` so the UI layer doesn't need to import another UI module to get the type.

- [ ] **Step 1: Write the file**

Create `src/renderer/model/default-symbol-style.ts`:

```typescript
import type { FillMode, StrokeStyle } from "./annotations";
import {
  DEFAULT_SYMBOL_ID,
  DEFAULT_FILL_MODE,
  DEFAULT_STROKE_STYLE,
  DEFAULT_SYMBOL_COLOR,
  DEFAULT_SYMBOL_STROKE,
} from "../symbols/library";

/**
 * Picker state: the style/shape pair that `AnnotationInteractionLayer` reads
 * when the user clicks the canvas in `symbol` tool mode. Lives in App-level
 * React state — not in `FigureState` — because it's session-only UI state
 * (not undoable, not serialized).
 */
export interface DefaultSymbolStyle {
  symbolId: string;
  fillMode: FillMode;
  strokeStyle: StrokeStyle;
  strokeWidthPx: number;
  color: string;
}

export function initialDefaultSymbolStyle(): DefaultSymbolStyle {
  return {
    symbolId: DEFAULT_SYMBOL_ID,
    fillMode: DEFAULT_FILL_MODE,
    strokeStyle: DEFAULT_STROKE_STYLE,
    strokeWidthPx: DEFAULT_SYMBOL_STROKE,
    color: DEFAULT_SYMBOL_COLOR,
  };
}
```

- [ ] **Step 2: Run typecheck for this file**

Run: `pnpm typecheck`
Expected: no NEW errors from this file (existing errors in the tree from prior tasks are okay).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/model/default-symbol-style.ts
git commit -m "feat(model): add DefaultSymbolStyle for the picker"
```

---

## Task 7: Build `<SymbolGrid>` and `<SymbolStyleControls>`

**Files:**
- Create: `src/renderer/components/Properties/SymbolGrid.tsx`
- Create: `src/renderer/components/Properties/SymbolStyleControls.tsx`
- Create: `test/unit/symbol-grid.test.tsx`

These are the two reusable subcomponents shared between `<SymbolPickerPanel>` and `<SymbolAnnoForm>`. Building them first lets the next task assemble the picker with confidence.

- [ ] **Step 1: Write the failing test for `<SymbolGrid>`**

Create `test/unit/symbol-grid.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SymbolGrid } from "../../src/renderer/components/Properties/SymbolGrid";
import { SYMBOL_LIBRARY } from "../../src/renderer/symbols/library";

// @vitest-environment jsdom

describe("<SymbolGrid>", () => {
  it("renders one cell per library entry, flat (no category headers)", () => {
    render(
      <SymbolGrid
        value="arrow-filled-right"
        currentColor="#FF0000"
        currentStrokeWidthPx={2}
        currentFillMode="filled"
        currentStrokeStyle="solid"
        onChange={() => {}}
      />,
    );
    for (const def of SYMBOL_LIBRARY) {
      expect(screen.getByTestId(`symbol-grid-cell-${def.id}`)).toBeDefined();
    }
    expect(screen.queryByTestId(/symbol-grid-group-/)).toBeNull();
  });

  it("marks the active cell with aria-pressed=true", () => {
    render(
      <SymbolGrid
        value="shape-circle"
        currentColor="#FF0000"
        currentStrokeWidthPx={2}
        currentFillMode="filled"
        currentStrokeStyle="solid"
        onChange={() => {}}
      />,
    );
    const active = screen.getByTestId("symbol-grid-cell-shape-circle");
    expect(active.getAttribute("aria-pressed")).toBe("true");
    const other = screen.getByTestId("symbol-grid-cell-shape-square");
    expect(other.getAttribute("aria-pressed")).toBe("false");
  });

  it("clicking a cell calls onChange with that symbol id", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SymbolGrid
        value="shape-circle"
        currentColor="#FF0000"
        currentStrokeWidthPx={2}
        currentFillMode="filled"
        currentStrokeStyle="solid"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByTestId("symbol-grid-cell-shape-square"));
    expect(onChange).toHaveBeenCalledWith("shape-square");
  });

  it("preview SVGs use the current color for fill when shape is fillable + filled", () => {
    render(
      <SymbolGrid
        value="shape-circle"
        currentColor="#00FF00"
        currentStrokeWidthPx={2}
        currentFillMode="filled"
        currentStrokeStyle="solid"
        onChange={() => {}}
      />,
    );
    // shape-circle is closed + filled → preview path's fill attribute = currentColor.
    const cell = screen.getByTestId("symbol-grid-cell-shape-circle");
    const path = cell.querySelector("path");
    expect(path?.getAttribute("fill")).toBe("#00FF00");
  });

  it("preview SVGs stroke instead of fill when fillMode='outlined'", () => {
    render(
      <SymbolGrid
        value="shape-circle"
        currentColor="#00FF00"
        currentStrokeWidthPx={2}
        currentFillMode="outlined"
        currentStrokeStyle="solid"
        onChange={() => {}}
      />,
    );
    const cell = screen.getByTestId("symbol-grid-cell-shape-circle");
    const path = cell.querySelector("path");
    expect(path?.getAttribute("fill")).toBe("none");
    expect(path?.getAttribute("stroke")).toBe("#00FF00");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm vitest run test/unit/symbol-grid.test.tsx`
Expected: FAIL — `SymbolGrid` doesn't exist yet.

- [ ] **Step 3: Create `src/renderer/components/Properties/SymbolGrid.tsx`**

```typescript
import type { FillMode, StrokeStyle } from "../../model/annotations";
import { SYMBOL_LIBRARY } from "../../symbols/library";

interface Props {
  /** Currently-selected symbol id (drives `aria-pressed`). */
  value: string;
  /** Current style — drives the per-cell preview rendering. */
  currentColor: string;
  currentStrokeWidthPx: number;
  currentFillMode: FillMode;
  currentStrokeStyle: StrokeStyle;
  /** Called when the user clicks a cell. */
  onChange: (symbolId: string) => void;
}

const STROKE_DASH_BY_STYLE: Record<StrokeStyle, string | undefined> = {
  solid: undefined,
  dashed: "8 4",
  dotted: "1.5 3",
};

export function SymbolGrid({
  value,
  currentColor,
  currentStrokeWidthPx,
  currentFillMode,
  currentStrokeStyle,
  onChange,
}: Props): JSX.Element {
  return (
    <div
      role="group"
      aria-label="Symbol"
      data-testid="symbol-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: 6,
      }}
    >
      {SYMBOL_LIBRARY.map((s) => {
        const isActive = s.id === value;
        // A cell preview reflects the *current* style: filled if both the
        // user's fillMode is "filled" AND the geometry supports it.
        const wantFill = currentFillMode === "filled" && s.geometry === "closed";
        const dash = STROKE_DASH_BY_STYLE[currentStrokeStyle];
        return (
          <button
            key={s.id}
            type="button"
            title={s.label}
            aria-label={s.label}
            aria-pressed={isActive}
            data-testid={`symbol-grid-cell-${s.id}`}
            className={"symbol-gallery-cell" + (isActive ? " is-active" : "")}
            onClick={() => onChange(s.id)}
          >
            <svg viewBox="0 0 100 100" width={24} height={24}>
              <path
                d={s.pathD}
                fill={wantFill ? currentColor : "none"}
                stroke={wantFill ? "none" : currentColor}
                strokeWidth={wantFill ? undefined : currentStrokeWidthPx * 3}
                strokeLinecap="round"
                strokeLinejoin="round"
                {...(dash !== undefined && !wantFill
                  ? { strokeDasharray: dash }
                  : {})}
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Create `src/renderer/components/Properties/SymbolStyleControls.tsx`**

```typescript
import type { FillMode, StrokeStyle } from "../../model/annotations";
import { ColorField } from "./inputs/ColorField";
import { NumberField } from "./inputs/NumberField";

export interface SymbolStyleValue {
  fillMode: FillMode;
  strokeStyle: StrokeStyle;
  strokeWidthPx: number;
  color: string;
}

interface Props {
  value: SymbolStyleValue;
  /** Whether the active shape supports filling. False → Filled toggle is disabled. */
  canFill: boolean;
  onChange: (patch: Partial<SymbolStyleValue>) => void;
  /** Optional blur handler for committing transient inputs (color, stroke width). */
  onCommit?: () => void;
}

const STROKE_STYLES: { id: StrokeStyle; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "dashed", label: "Dashed" },
  { id: "dotted", label: "Dotted" },
];

export function SymbolStyleControls({
  value,
  canFill,
  onChange,
  onCommit,
}: Props): JSX.Element {
  const isOutlined = value.fillMode === "outlined" || !canFill;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
          Fill
        </div>
        <div className="seg" role="group" aria-label="Fill mode">
          <button
            type="button"
            className="btn"
            aria-pressed={!isOutlined}
            disabled={!canFill}
            data-testid="symbol-fill-mode-filled"
            onClick={() => {
              onChange({ fillMode: "filled" });
              onCommit?.();
            }}
          >
            Filled
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={isOutlined}
            data-testid="symbol-fill-mode-outlined"
            onClick={() => {
              onChange({ fillMode: "outlined" });
              onCommit?.();
            }}
          >
            Outlined
          </button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
          Stroke style
        </div>
        <select
          data-testid="symbol-stroke-style"
          value={value.strokeStyle}
          disabled={!isOutlined}
          onChange={(e) => {
            onChange({ strokeStyle: e.target.value as StrokeStyle });
            onCommit?.();
          }}
        >
          {STROKE_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <NumberField
        label="Stroke width (px)"
        value={value.strokeWidthPx}
        min={0}
        max={32}
        disabled={!isOutlined}
        data-testid="symbol-stroke-width"
        onChange={(strokeWidthPx) => onChange({ strokeWidthPx })}
        onBlur={onCommit}
      />

      <ColorField
        label="Color"
        value={value.color}
        onChange={(color) => onChange({ color })}
        onBlur={onCommit}
      />
    </div>
  );
}
```

- [ ] **Step 5: Run the SymbolGrid test**

Run: `pnpm vitest run test/unit/symbol-grid.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/Properties/SymbolGrid.tsx \
        src/renderer/components/Properties/SymbolStyleControls.tsx \
        test/unit/symbol-grid.test.tsx
git commit -m "feat(properties): SymbolGrid + SymbolStyleControls primitives"
```

---

## Task 8: Build `<SymbolPickerPanel>`

**Files:**
- Create: `src/renderer/components/Properties/SymbolPickerPanel.tsx`
- Create: `test/unit/symbol-picker-panel.test.tsx`

The panel composes the two primitives against an externally-owned `DefaultSymbolStyle`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/symbol-picker-panel.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SymbolPickerPanel } from "../../src/renderer/components/Properties/SymbolPickerPanel";
import { initialDefaultSymbolStyle } from "../../src/renderer/model/default-symbol-style";

// @vitest-environment jsdom

describe("<SymbolPickerPanel>", () => {
  it("clicking a shape in the grid updates the picker style and does NOT dispatch addAnnotation", () => {
    const onChange = vi.fn();
    render(
      <SymbolPickerPanel
        value={initialDefaultSymbolStyle()}
        onChange={onChange}
      />,
    );
    void userEvent.click(screen.getByTestId("symbol-grid-cell-shape-circle"));
    return Promise.resolve().then(() => {
      // Picker fires onChange with the new symbolId.
      const calls = onChange.mock.calls.map((c) => c[0]);
      expect(calls.some((p) => p.symbolId === "shape-circle")).toBe(true);
    });
  });

  it("Filled toggle is disabled when active shape is stroke-only", () => {
    render(
      <SymbolPickerPanel
        value={{
          ...initialDefaultSymbolStyle(),
          symbolId: "arrow-line-right", // stroke-only
          fillMode: "outlined",
        }}
        onChange={() => {}}
      />,
    );
    const filledBtn = screen.getByTestId("symbol-fill-mode-filled");
    expect(filledBtn.hasAttribute("disabled")).toBe(true);
  });

  it("Filled toggle is enabled when active shape is closed", () => {
    render(
      <SymbolPickerPanel
        value={{
          ...initialDefaultSymbolStyle(),
          symbolId: "shape-circle",
          fillMode: "outlined",
        }}
        onChange={() => {}}
      />,
    );
    const filledBtn = screen.getByTestId("symbol-fill-mode-filled");
    expect(filledBtn.hasAttribute("disabled")).toBe(false);
  });

  it("stroke-style and stroke-width inputs are disabled when fillMode='filled' on a closed shape", () => {
    render(
      <SymbolPickerPanel
        value={{
          ...initialDefaultSymbolStyle(),
          symbolId: "shape-circle",
          fillMode: "filled",
        }}
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByTestId("symbol-stroke-style").hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByTestId("symbol-stroke-width").hasAttribute("disabled"),
    ).toBe(true);
  });

  it("stroke-style and stroke-width inputs are enabled when fillMode='outlined'", () => {
    render(
      <SymbolPickerPanel
        value={{
          ...initialDefaultSymbolStyle(),
          symbolId: "shape-circle",
          fillMode: "outlined",
        }}
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByTestId("symbol-stroke-style").hasAttribute("disabled"),
    ).toBe(false);
    expect(
      screen.getByTestId("symbol-stroke-width").hasAttribute("disabled"),
    ).toBe(false);
  });

  it("toggling Filled → Outlined patches the style", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SymbolPickerPanel
        value={{
          ...initialDefaultSymbolStyle(),
          symbolId: "shape-circle",
          fillMode: "filled",
        }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByTestId("symbol-fill-mode-outlined"));
    const calls = onChange.mock.calls.map((c) => c[0]);
    expect(calls.some((p) => p.fillMode === "outlined")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm vitest run test/unit/symbol-picker-panel.test.tsx`
Expected: FAIL — `SymbolPickerPanel` doesn't exist.

- [ ] **Step 3: Create `src/renderer/components/Properties/SymbolPickerPanel.tsx`**

```typescript
import type { DefaultSymbolStyle } from "../../model/default-symbol-style";
import { SYMBOL_LIBRARY_BY_ID } from "../../symbols/library";
import { SymbolGrid } from "./SymbolGrid";
import { SymbolStyleControls } from "./SymbolStyleControls";

interface Props {
  value: DefaultSymbolStyle;
  onChange: (next: DefaultSymbolStyle) => void;
}

export function SymbolPickerPanel({ value, onChange }: Props): JSX.Element {
  const def = SYMBOL_LIBRARY_BY_ID.get(value.symbolId);
  const canFill = def?.geometry === "closed";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
          Symbol
        </div>
        <SymbolGrid
          value={value.symbolId}
          currentColor={value.color}
          currentStrokeWidthPx={value.strokeWidthPx}
          currentFillMode={value.fillMode}
          currentStrokeStyle={value.strokeStyle}
          onChange={(symbolId) => onChange({ ...value, symbolId })}
        />
      </div>
      <SymbolStyleControls
        value={value}
        canFill={canFill}
        onChange={(patch) => onChange({ ...value, ...patch })}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the picker test**

Run: `pnpm vitest run test/unit/symbol-picker-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/Properties/SymbolPickerPanel.tsx \
        test/unit/symbol-picker-panel.test.tsx
git commit -m "feat(properties): SymbolPickerPanel composes grid + style controls"
```

---

## Task 9: Update v1 → v2 migration to seed `fillMode`/`strokeStyle`

**Files:**
- Modify: `src/renderer/model/migrate-v1-to-v2.ts`
- Modify: `test/unit/migrate-v1-to-v2.test.ts`

v1 files still load (the schema accepts them); they're routed through the migrator before becoming runtime `SymbolAnnotation`s. Now that `fillMode`/`strokeStyle` are required, the migrator must emit defaults.

- [ ] **Step 1: Read the existing migrator to understand its mapping**

Run: `cat src/renderer/model/migrate-v1-to-v2.ts`
Look at how `head: "open" | "filled" | "none"` maps to a `symbolId`.

- [ ] **Step 2: Write the failing migration test**

In `test/unit/migrate-v1-to-v2.test.ts`, add:

```typescript
it("migrated symbol annotations carry default fillMode + strokeStyle", () => {
  const v1Arrow = {
    id: "a1",
    kind: "arrow" as const,
    z: 0,
    x1: 10, y1: 10, x2: 100, y2: 10,
    color: "#FF0000",
    thicknessPx: 2,
    head: "filled" as const,
  };
  const out = migrateAnnotationsV1ToV2([v1Arrow]);
  const sym = out[0];
  expect(sym?.kind).toBe("symbol");
  if (sym?.kind === "symbol") {
    expect(sym.fillMode).toBe("filled");
    expect(sym.strokeStyle).toBe("solid");
  }
});

it("v1 arrow with head='open' migrates to outlined fillMode", () => {
  const v1Arrow = {
    id: "a2", kind: "arrow" as const, z: 0,
    x1: 0, y1: 0, x2: 50, y2: 0,
    color: "#0000FF", thicknessPx: 1, head: "open" as const,
  };
  const out = migrateAnnotationsV1ToV2([v1Arrow]);
  const sym = out[0];
  if (sym?.kind === "symbol") {
    expect(sym.fillMode).toBe("outlined");
    expect(sym.strokeStyle).toBe("solid");
  }
});
```

- [ ] **Step 3: Run the failing test**

Run: `pnpm vitest run test/unit/migrate-v1-to-v2.test.ts`
Expected: FAIL — migrator doesn't emit those fields yet.

- [ ] **Step 4: Update `src/renderer/model/migrate-v1-to-v2.ts`**

Find every `return { id, kind: "symbol", … }` literal and add `fillMode` (derived from the old head shape — `"filled"` for filled-head arrows, `"outlined"` for open/none) and `strokeStyle: "solid"`.

Concretely, for each symbolId emitted by the migrator:
- `arrow-filled-right` → `fillMode: "filled"`
- `arrow-open-right`, `arrow-line-right` → `fillMode: "outlined"`

If the migrator currently has a single helper that builds the SymbolAnnotation, add a `fillMode` parameter and pass `"filled"` / `"outlined"` from each branch. Always emit `strokeStyle: "solid"` (legacy arrows had no concept of dashing).

- [ ] **Step 5: Run the migration test**

Run: `pnpm vitest run test/unit/migrate-v1-to-v2.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/model/migrate-v1-to-v2.ts test/unit/migrate-v1-to-v2.test.ts
git commit -m "fix(migrate): seed fillMode + strokeStyle on v1→v2 symbol migration"
```

---

## Task 10: Rework `<SymbolAnnoForm>` to share the new primitives

**Files:**
- Modify: `src/renderer/components/Properties/SymbolAnnoForm.tsx`
- Modify: `test/unit/symbol-anno-form.test.tsx`

The form for editing a *selected* symbol now uses the same flat grid + style controls as the picker, plus its existing Size/Rotation/Delete controls.

- [ ] **Step 1: Read the existing test**

Run: `cat test/unit/symbol-anno-form.test.tsx`
Note which assertions reference category headers — those will be replaced.

- [ ] **Step 2: Write the failing tests for the reworked form**

Replace `test/unit/symbol-anno-form.test.tsx` with assertions against the flat grid:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SymbolAnnoForm } from "../../src/renderer/components/Properties/SymbolAnnoForm";
import type { SymbolAnnotation } from "../../src/renderer/model/annotations";

// @vitest-environment jsdom

function ann(overrides: Partial<SymbolAnnotation> = {}): SymbolAnnotation {
  return {
    id: "s1",
    kind: "symbol",
    z: 0,
    symbolId: "arrow-filled-right",
    x: 50, y: 50, sizePx: 60, rotationDeg: 0,
    color: "#FF0000", strokeWidthPx: 2,
    fillMode: "filled", strokeStyle: "solid",
    ...overrides,
  };
}

const COMMIT = { markDirty: vi.fn(), flush: vi.fn() };

describe("<SymbolAnnoForm>", () => {
  it("renders the flat grid (no category headers)", () => {
    render(<SymbolAnnoForm anno={ann()} dispatch={vi.fn()} commit={COMMIT} />);
    expect(screen.getByTestId("symbol-grid")).toBeDefined();
    expect(screen.queryByTestId(/symbol-grid-group-/)).toBeNull();
  });

  it("clicking a shape dispatches UPDATE_ANNOTATION with new symbolId", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<SymbolAnnoForm anno={ann()} dispatch={dispatch} commit={COMMIT} />);
    await user.click(screen.getByTestId("symbol-grid-cell-shape-circle"));
    expect(
      dispatch.mock.calls.some(
        (c) =>
          c[0]?.type === "UPDATE_ANNOTATION" &&
          c[0]?.patch?.symbolId === "shape-circle",
      ),
    ).toBe(true);
  });

  it("Filled toggle disabled when current shape is stroke-only", () => {
    render(
      <SymbolAnnoForm
        anno={ann({ symbolId: "arrow-line-right", fillMode: "outlined" })}
        dispatch={vi.fn()}
        commit={COMMIT}
      />,
    );
    expect(
      screen
        .getByTestId("symbol-fill-mode-filled")
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("toggling Outlined dispatches fillMode patch", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(
      <SymbolAnnoForm
        anno={ann({ fillMode: "filled" })}
        dispatch={dispatch}
        commit={COMMIT}
      />,
    );
    await user.click(screen.getByTestId("symbol-fill-mode-outlined"));
    expect(
      dispatch.mock.calls.some(
        (c) =>
          c[0]?.type === "UPDATE_ANNOTATION" &&
          c[0]?.patch?.fillMode === "outlined",
      ),
    ).toBe(true);
  });

  it("Size, Rotation, and Delete controls are still present", () => {
    render(<SymbolAnnoForm anno={ann()} dispatch={vi.fn()} commit={COMMIT} />);
    expect(screen.getByTestId("symbol-rotate-reset")).toBeDefined();
    // NumberField label-based queries:
    expect(screen.getByLabelText(/Size/i)).toBeDefined();
    expect(screen.getByLabelText(/Rotation/i)).toBeDefined();
    expect(screen.getByText(/Delete annotation/i)).toBeDefined();
  });
});
```

- [ ] **Step 3: Run the failing test**

Run: `pnpm vitest run test/unit/symbol-anno-form.test.tsx`
Expected: FAIL — current form still uses category headers and lacks the fill-mode toggle.

- [ ] **Step 4: Rewrite `src/renderer/components/Properties/SymbolAnnoForm.tsx`**

Replace the file with:

```typescript
import type { Dispatch } from "react";
import type { SymbolAnnotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import { updateAnnotation, removeAnnotation } from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { SYMBOL_LIBRARY_BY_ID } from "../../symbols/library";
import { NumberField } from "./inputs/NumberField";
import { SymbolGrid } from "./SymbolGrid";
import { SymbolStyleControls } from "./SymbolStyleControls";

interface Props {
  anno: SymbolAnnotation;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

export function SymbolAnnoForm({ anno, dispatch, commit }: Props): JSX.Element {
  function patch(p: Partial<SymbolAnnotation>, immediate = false): void {
    dispatch(updateAnnotation(anno.id, p));
    if (immediate) commit.flush();
    else commit.markDirty();
  }
  const def = SYMBOL_LIBRARY_BY_ID.get(anno.symbolId);
  const canFill = def?.geometry === "closed";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
          Symbol
        </div>
        <SymbolGrid
          value={anno.symbolId}
          currentColor={anno.color}
          currentStrokeWidthPx={anno.strokeWidthPx}
          currentFillMode={anno.fillMode}
          currentStrokeStyle={anno.strokeStyle}
          onChange={(symbolId) => patch({ symbolId }, true)}
        />
      </div>

      <SymbolStyleControls
        value={{
          fillMode: anno.fillMode,
          strokeStyle: anno.strokeStyle,
          strokeWidthPx: anno.strokeWidthPx,
          color: anno.color,
        }}
        canFill={canFill}
        onChange={(p) => patch(p)}
        onCommit={commit.flush}
      />

      <NumberField
        label="Size (px)"
        value={anno.sizePx}
        min={4}
        max={2000}
        onChange={(sizePx) => patch({ sizePx })}
        onBlur={commit.flush}
      />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
        <div style={{ flex: 1 }}>
          <NumberField
            label="Rotation (deg)"
            value={Math.round(anno.rotationDeg)}
            min={-360}
            max={720}
            onChange={(rotationDeg) => patch({ rotationDeg })}
            onBlur={commit.flush}
          />
        </div>
        <button
          type="button"
          className="btn"
          data-testid="symbol-rotate-reset"
          onClick={() => patch({ rotationDeg: 0 }, true)}
        >
          Reset
        </button>
      </div>
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => {
          dispatch(removeAnnotation(anno.id));
          commit.flush();
        }}
        style={{ marginTop: 4 }}
      >
        Delete annotation
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Run the form test**

Run: `pnpm vitest run test/unit/symbol-anno-form.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/Properties/SymbolAnnoForm.tsx \
        test/unit/symbol-anno-form.test.tsx
git commit -m "feat(properties): SymbolAnnoForm uses flat grid + style controls"
```

---

## Task 11: Drop `BoxAnnoForm`; clean up downstream form/overview wiring

**Files:**
- Delete: `src/renderer/components/Properties/BoxAnnoForm.tsx`
- Modify: `src/renderer/components/Properties/AnnotationPropertiesForm.tsx`
- Modify: `src/renderer/components/Properties/PropertiesPanel.tsx` (just `ANNO_TITLES`)
- Modify: `src/renderer/components/Properties/MultiAnnoForm.tsx`
- Modify: `src/renderer/components/Properties/AnnotationOverview.tsx`
- Modify: `test/unit/multi-anno-form.test.tsx`
- Modify: `test/unit/annotation-overview.test.tsx`

This unblocks the typechecker by removing every remaining `"box"` reference from the UI layer. We hold the new `PropertiesPanel` routing for Task 12 — this commit only does cleanup.

- [ ] **Step 1: Delete `BoxAnnoForm.tsx`**

```bash
git rm src/renderer/components/Properties/BoxAnnoForm.tsx
```

- [ ] **Step 2: Update `AnnotationPropertiesForm.tsx`**

Replace the file's contents:

```typescript
import type { Dispatch } from "react";
import type { Annotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { TextAnnoForm } from "./TextAnnoForm";
import { SymbolAnnoForm } from "./SymbolAnnoForm";
import { ScalebarAnnoForm } from "./ScalebarAnnoForm";

interface Props {
  anno: Annotation;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

export function AnnotationPropertiesForm({
  anno,
  dispatch,
  commit,
}: Props): JSX.Element {
  switch (anno.kind) {
    case "text":
      return <TextAnnoForm anno={anno} dispatch={dispatch} commit={commit} />;
    case "symbol":
      return <SymbolAnnoForm anno={anno} dispatch={dispatch} commit={commit} />;
    case "scalebar":
      return (
        <ScalebarAnnoForm anno={anno} dispatch={dispatch} commit={commit} />
      );
  }
}
```

- [ ] **Step 3: Update `PropertiesPanel.tsx` `ANNO_TITLES`**

Replace the existing `ANNO_TITLES` constant:

```typescript
const ANNO_TITLES: Record<Annotation["kind"], string> = {
  text: "Text annotation",
  symbol: "Symbol annotation",
  scalebar: "Scale bar",
};
```

- [ ] **Step 4: Update `MultiAnnoForm.tsx`**

a) Remove the `BoxAnnotation` import line.
b) In the `KIND_LABELS` (or equivalent) record, remove the `box: "Boxes"` entry.
c) In the patch-builder switch (around lines 52 and 66), delete the `case "box"` branches. Since BoxAnnotation no longer exists in the union, TS should already flag these.
d) Remove the JSX block that conditionally renders `BoxKindForm` (around line 203).
e) Delete the `BoxKindForm` function (around line 314) entirely.
f) In the swatch helper around line 230 (`if (a.kind === "box" …)`), remove that branch.

- [ ] **Step 5: Update `AnnotationOverview.tsx`**

Find the array around line 28 that lists kinds (e.g. `["text", "symbol", "box", "scalebar"]`) and remove `"box"`.

- [ ] **Step 6: Update affected tests**

In `test/unit/multi-anno-form.test.tsx`, delete every test case that constructs a `BoxAnnotation` literal or asserts on box rendering. Tests covering text+symbol+scalebar mixes stay.

In `test/unit/annotation-overview.test.tsx`, delete any test asserting that a "box" row is rendered.

- [ ] **Step 7: Run the affected tests**

Run: `pnpm vitest run test/unit/multi-anno-form.test.tsx test/unit/annotation-overview.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(properties): remove BoxAnnoForm and box-kind branches"
```

---

## Task 12: Wire `defaultSymbolStyle` and `activeTool` through `PropertiesPanel`

**Files:**
- Modify: `src/renderer/components/Properties/PropertiesPanel.tsx`
- Modify: `src/renderer/App.tsx`

The picker needs `activeTool` to know whether to render. We pass it from `App.tsx`. The picker also needs the current `defaultSymbolStyle` and a setter; both live in `App.tsx` state.

- [ ] **Step 1: Update `PropertiesPanel.tsx` props + routing**

Add new props to the `Props` interface:

```typescript
import type { Tool } from "../Toolbar/AnnotationToolbar";
import type { DefaultSymbolStyle } from "../../model/default-symbol-style";
import { SymbolPickerPanel } from "./SymbolPickerPanel";

interface Props {
  // ...existing fields...
  /**
   * The active annotation tool. When `"symbol"` and nothing is selected,
   * the panel routes to `<SymbolPickerPanel>` instead of the global-style
   * fallback so the user can pick shape + style BEFORE clicking the canvas.
   */
  activeTool: Tool;
  /** Picker state (session-only — not in FigureState, not undoable). */
  defaultSymbolStyle: DefaultSymbolStyle;
  onDefaultSymbolStyleChange: (next: DefaultSymbolStyle) => void;
}
```

Add a routing branch right BEFORE the existing `else { /* no selection — global style */ }` branch (the `else` after the empty-panel branch). The branch needs to fire when (a) no annotation is selected, (b) no panel is selected, and (c) `activeTool === "symbol"`:

```typescript
} else if (activeTool === "symbol") {
  title = "Symbol";
  subtitle = "Pick a symbol — click canvas to place";
  body = (
    <SymbolPickerPanel
      value={defaultSymbolStyle}
      onChange={onDefaultSymbolStyleChange}
    />
  );
} else {
  // existing global-style fallback unchanged
  title = "Figure";
  subtitle = "No selection — editing global style";
  // ...rest unchanged...
}
```

> Important: the picker branch must NOT fire when a `selectedAnno` exists — selecting a symbol on canvas takes precedence. The branch order in the existing function already handles this (selection branches run first), so inserting before the final `else` is sufficient.

Destructure the new props in the function signature.

- [ ] **Step 2: Update `App.tsx`**

a) At the top, add imports:

```typescript
import {
  type DefaultSymbolStyle,
  initialDefaultSymbolStyle,
} from "./model/default-symbol-style";
```

b) Near the other `useState` calls (around line 84):

```typescript
const [defaultSymbolStyle, setDefaultSymbolStyle] = useState<DefaultSymbolStyle>(
  initialDefaultSymbolStyle,
);
```

c) Pass the new props into `<PropertiesPanel>` (around line 735):

```tsx
<PropertiesPanel
  state={state}
  focusedPanel={selectedImagePanel}
  selectedAnno={selectedAnno}
  activeTool={activeTool}
  defaultSymbolStyle={defaultSymbolStyle}
  onDefaultSymbolStyleChange={setDefaultSymbolStyle}
  // ...rest unchanged
/>
```

> Note: pass `activeTool`, NOT `effectiveTool` — when the user holds spacebar to peek into select-mode, the picker should stay open. Spacebar is a transient peek; the user's intent (per `activeTool`) is still "symbol".

- [ ] **Step 3: Run the typechecker and existing tests**

Run: `pnpm typecheck && pnpm vitest run test/unit/symbol-picker-panel.test.tsx`
Expected: typecheck passes; picker tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/Properties/PropertiesPanel.tsx src/renderer/App.tsx
git commit -m "feat(app): route SymbolPickerPanel when activeTool=symbol with no selection"
```

---

## Task 13: Wire `defaultSymbolStyle` through `AnnotationInteractionLayer`; remove box logic; placement no-auto-select

**Files:**
- Modify: `src/renderer/components/Annotations/AnnotationInteractionLayer.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `test/unit/annotation-interaction-layer.test.tsx`
- Modify: `test/unit/annotation-layer-click-passthrough.test.tsx`
- Modify: `test/unit/annotation-layer-dblclick-passthrough.test.tsx`
- Modify: `test/unit/annotation-layer-drop-passthrough.test.tsx`
- Modify: `test/unit/annotation-layer-editing-passthrough.test.tsx`
- Modify: `test/unit/annotation-layer-panel-drag-passthrough.test.tsx`

This is the largest single file change — but the surface is narrow: replace the single `lastSymbolIdRef` with a `defaultSymbolStyle` prop, remove every box code path, and stop auto-selecting after symbol placement.

- [ ] **Step 1: Write the failing tests**

In `test/unit/annotation-interaction-layer.test.tsx`:

a) Find `setupSelectedSymbol` and the `AnnotationInteractionLayer: symbol creation + handles` describe. Update the layer-render call signature to pass the new `defaultSymbolStyle` prop. Define a constant near the top of the test:

```typescript
import { initialDefaultSymbolStyle } from "../../src/renderer/model/default-symbol-style";

const DEFAULT_PICKER = initialDefaultSymbolStyle();
```

Then update every `<AnnotationInteractionLayer …>` JSX in that file to include `defaultSymbolStyle={DEFAULT_PICKER}`.

b) Replace the test "clicking the layer in symbol mode dispatches ADD_ANNOTATION with default symbol" with two tests:

```typescript
it("clicking the layer in symbol mode dispatches ADD_ANNOTATION with the picker's defaultSymbolStyle", () => {
  const dispatch = vi.fn();
  const onSelect = vi.fn();
  render(
    <AnnotationInteractionLayer
      activeTool="symbol"
      figure={EMPTY_FIGURE}
      panelRectsById={EMPTY_RECTS}
      imagesById={EMPTY_IMAGES}
      cssW={400}
      cssH={300}
      figurePxW={400}
      figurePxH={300}
      selectedAnnotationIds={new Set()}
      onSelectionChange={onSelect}
      onEditingChange={vi.fn()}
      dispatch={dispatch}
      onTrayDrop={vi.fn()}
      onPanelDoubleClick={vi.fn()}
      onPanelClick={vi.fn()}
      defaultSymbolStyle={{
        symbolId: "shape-circle",
        fillMode: "outlined",
        strokeStyle: "dashed",
        strokeWidthPx: 5,
        color: "#00FF00",
      }}
    />,
  );
  const layer = screen.getByTestId("annotation-interaction-layer");
  fireEvent.pointerDown(layer, { clientX: 100, clientY: 80, pointerId: 1, button: 0 });
  fireEvent.pointerUp(layer, { clientX: 100, clientY: 80, pointerId: 1 });
  const adds = dispatch.mock.calls
    .map((c) => c[0])
    .filter((a) => a.type === "ADD_ANNOTATION");
  expect(adds).toHaveLength(1);
  const ann = adds[0].annotation;
  expect(ann.kind).toBe("symbol");
  expect(ann.symbolId).toBe("shape-circle");
  expect(ann.fillMode).toBe("outlined");
  expect(ann.strokeStyle).toBe("dashed");
  expect(ann.strokeWidthPx).toBe(5);
  expect(ann.color).toBe("#00FF00");
});

it("symbol placement does NOT auto-select the new annotation (placement mode persists)", () => {
  const dispatch = vi.fn();
  const onSelect = vi.fn();
  render(
    <AnnotationInteractionLayer
      activeTool="symbol"
      figure={EMPTY_FIGURE}
      panelRectsById={EMPTY_RECTS}
      imagesById={EMPTY_IMAGES}
      cssW={400}
      cssH={300}
      figurePxW={400}
      figurePxH={300}
      selectedAnnotationIds={new Set()}
      onSelectionChange={onSelect}
      onEditingChange={vi.fn()}
      dispatch={dispatch}
      onTrayDrop={vi.fn()}
      onPanelDoubleClick={vi.fn()}
      onPanelClick={vi.fn()}
      defaultSymbolStyle={DEFAULT_PICKER}
    />,
  );
  const layer = screen.getByTestId("annotation-interaction-layer");
  fireEvent.pointerDown(layer, { clientX: 100, clientY: 80, pointerId: 1, button: 0 });
  fireEvent.pointerUp(layer, { clientX: 100, clientY: 80, pointerId: 1 });
  expect(onSelect).not.toHaveBeenCalled();
});
```

> If `EMPTY_FIGURE`/`EMPTY_RECTS`/`EMPTY_IMAGES` aren't already defined in this file, build minimal versions inline mirroring what the existing test setup uses; or copy the helper from the existing test fixtures already present.

c) Delete the entire `describe("AnnotationInteractionLayer: click-on-anno-selects in creation mode", () => …)` block — it tests the box tool. (If part of it tests select-mode behaviour, retain only the select-mode subset.) Search for `setupWithExistingBox` and remove it.

d) In other describe blocks, drop any setup that creates `kind: "box"` annotations or asserts on `anno-box-handle-*` test ids.

e) Add the prop to every other `<AnnotationInteractionLayer …>` instance in this file.

In each passthrough test (`test/unit/annotation-layer-*-passthrough.test.tsx`), add `defaultSymbolStyle={DEFAULT_PICKER}` to the layer's props (importing `initialDefaultSymbolStyle` at the top of each file).

- [ ] **Step 2: Run the failing test**

Run: `pnpm vitest run test/unit/annotation-interaction-layer.test.tsx`
Expected: FAIL — `defaultSymbolStyle` prop doesn't exist; placement still auto-selects.

- [ ] **Step 3: Update `AnnotationInteractionLayer.tsx` props**

a) Add to imports:

```typescript
import type { DefaultSymbolStyle } from "../../model/default-symbol-style";
```

b) Add a required prop on the component's interface:

```typescript
defaultSymbolStyle: DefaultSymbolStyle;
```

c) Destructure it in the function signature.

d) Remove the line:

```typescript
const lastSymbolIdRef = useRef<string>(DEFAULT_SYMBOL_ID);
```

…and the import for `DEFAULT_SYMBOL_ID`. Remove the `useEffect` (around line 594) that syncs the ref from selected annotations — selection no longer rewrites picker state in this design (per the spec: the picker is its own surface).

e) Replace the `if (activeTool === "symbol") { ... }` body (around line 686) with:

```typescript
if (activeTool === "symbol") {
  const ann: SymbolAnnotation = {
    id: newAnnoId(),
    kind: "symbol",
    z: Z_SYMBOL,
    symbolId: defaultSymbolStyle.symbolId,
    x: c.fx,
    y: c.fy,
    sizePx: DEFAULT_SYMBOL_SIZE,
    rotationDeg: 0,
    color: defaultSymbolStyle.color,
    strokeWidthPx: defaultSymbolStyle.strokeWidthPx,
    fillMode: defaultSymbolStyle.fillMode,
    strokeStyle: defaultSymbolStyle.strokeStyle,
  };
  const imgCtx = imageContextAt(
    c.fx, c.fy, figure, panelRectsById, imagesById,
  );
  if (imgCtx !== null && imgCtx.panel.panelId !== undefined) {
    const anchor = anchorFromFigure(c.fx, c.fy, imgCtx);
    if (anchor !== null) {
      ann.imageId = imgCtx.imageId;
      ann.panelId = imgCtx.panel.panelId;
      ann.anchor = anchor;
    }
  }
  dispatch(addAnnotation(ann));
  // Spec: placement mode persists. Do NOT auto-select — the user can click
  // again to place another symbol with the same style. Switch to Select to
  // edit a placed symbol.
  return;
}
```

(Note: `onSelectionChange(replaceSelection(ann.id))` is removed.)

- [ ] **Step 4: Remove the box drag-to-draw branch and box selection handles**

a) Delete the box-creation block at lines 721-731:

```typescript
// box: begin a rubber-band drag.
if (activeTool !== "box") return;
e.currentTarget.setPointerCapture(e.pointerId);
setDrag({
  pointerId: e.pointerId,
  kind: "create-box",
  // ...
});
```

b) Delete the `if (drag.kind === "create-box") { ... }` branch in `onLayerPointerUp` (lines 752–796 or thereabouts). The whole branch ending in dispatching the box annotation is gone.

c) From the `Drag` discriminated union, remove `"create-box"` and `"box-corner"` variants.

d) Delete every `case "box":` branch in the switch around line 1082 (the move/drag handler for selected annos) and around line 1258 (`box-corner` start). Delete the whole `box-corner` setup function near line 1224, the corresponding pointer-move at 1249, and pointer-up at 1345.

e) Remove the Box-corner-handles JSX block at line 2179-2222 (`{/* Box corner handles … */}` through its closing `)}`).

f) Remove the box-preview block at lines 2222–2240 (`{/* Transient preview during box creation. */}`).

g) Update the `activeTool === "symbol" || activeTool === "box"` condition around line 1641 to `activeTool === "symbol"`.

h) Remove the `BoxAnnotation` import.

i) Remove the `kind === "box"` branch in the bbox helper around line 453.

> The file is large; if any other `box`/`BoxAnnotation` references remain after these edits, search-and-remove. The exhaustiveness guard in any switch will compile only when every box reference is gone.

- [ ] **Step 5: Update `App.tsx` to pass `defaultSymbolStyle` into the layer**

In the `<AnnotationInteractionLayer …>` JSX (around line 698), add the prop:

```tsx
<AnnotationInteractionLayer
  activeTool={effectiveTool}
  defaultSymbolStyle={defaultSymbolStyle}
  // ...rest unchanged
/>
```

- [ ] **Step 6: Run all interaction-layer tests**

Run: `pnpm vitest run test/unit/annotation-interaction-layer.test.tsx test/unit/annotation-layer-click-passthrough.test.tsx test/unit/annotation-layer-dblclick-passthrough.test.tsx test/unit/annotation-layer-drop-passthrough.test.tsx test/unit/annotation-layer-editing-passthrough.test.tsx test/unit/annotation-layer-panel-drag-passthrough.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/Annotations/AnnotationInteractionLayer.tsx \
        src/renderer/App.tsx \
        test/unit/annotation-interaction-layer.test.tsx \
        test/unit/annotation-layer-click-passthrough.test.tsx \
        test/unit/annotation-layer-dblclick-passthrough.test.tsx \
        test/unit/annotation-layer-drop-passthrough.test.tsx \
        test/unit/annotation-layer-editing-passthrough.test.tsx \
        test/unit/annotation-layer-panel-drag-passthrough.test.tsx
git commit -m "feat(annotations): symbol placement reads picker style; drop box drag-to-draw"
```

---

## Task 14: Final pass — typecheck, lint, full test run, manual visual review

**Files:**
- (No source changes expected; this is a verification gate)

If any of these steps surface a regression, fix in place and add a regression test before committing.

- [ ] **Step 1: Run the typechecker on every project ref**

Run: `pnpm typecheck`
Expected: zero errors. Common surprises:
- Stray `BoxAnnotation` references in test helpers — delete them.
- Switch statements in `MultiAnnoForm` whose exhaustiveness check now flags an unused `default` — leave it; it's harmless.

- [ ] **Step 2: Run the linter (zero-warning policy)**

Run: `pnpm lint`
Expected: zero errors AND zero warnings. If a previously-used import (`BoxAnnotation`, `SYMBOL_CATEGORIES`) is now unused, ESLint will flag it — remove the import line.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm test`
Expected: all suites pass. If a snapshot or DOM-shape assertion fails because of the new picker DOM, update the assertion to reflect the new expected DOM.

- [ ] **Step 4: Manual visual review of the picker grid**

Run: `pnpm dev`

In the running app:

1. Click the **Symbol** toolbar button. Verify the right panel immediately shows the picker (no canvas click needed).
2. Verify the grid renders 6 arrows + 20 shapes flat (no category headers).
3. Hover each cell — tooltip = label.
4. Click a closed shape (e.g. `shape-hexagon`). Toggle Filled ↔ Outlined; verify previews update inline.
5. Click `arrow-line-right` (stroke-only). Verify the **Filled** button is disabled and Outlined is forced.
6. Switch to Outlined; switch Stroke style to Dashed; raise stroke width to 8. Click on the canvas multiple times — verify each click places a new dashed thick-stroke shape with the same style; the picker stays open and no symbol is auto-selected.
7. Switch to **Select** tool, click a placed symbol. Verify `<SymbolAnnoForm>` appears with the same flat grid and Filled/Outlined controls (and the Size, Rotation, Delete controls).
8. Visually inspect each new shape (`shape-hexagon` … `shape-chevron`) at sizes 30 px, 60 px, and 200 px to confirm the path looks reasonable. If a path looks broken, file the specific shape's path data as a follow-up — do NOT block this merge unless the shape is unusable.

- [ ] **Step 5: Commit (only if any fix landed during Steps 1–3)**

```bash
git add -A
git commit -m "chore(symbols): final cleanup after spec 06"
```

If nothing changed, skip the commit.

---

## Risks (from the spec, expanded)

1. **`setLineDash` reset.** Covered by `test/unit/draw-symbol.test.ts` step 4 — the test asserts `setLineDash([])` is the LAST dash call when stroking.
2. **Stroke-only + filled combo.** Covered by `drawSymbol` defensive `def.geometry === "closed"` check and the test "stroke-only geometry forces outlined rendering even when fillMode=filled".
3. **`activeTool` not propagating.** Covered by the picker-visibility tests in `symbol-picker-panel.test.tsx` and the routing branch in `PropertiesPanel.tsx` (Task 12).
4. **Default style not propagating from picker → click.** Covered by the new test "clicking the layer in symbol mode dispatches ADD_ANNOTATION with the picker's defaultSymbolStyle" in Task 13.
5. **Hand-crafted shape paths look bad at small sizes.** Covered by the manual visual review in Task 14 step 4. New shapes (heart, lightning, speech-bubble, chevron, etc.) are the highest-risk paths.
6. **Spacebar peek confuses the picker.** App.tsx passes `activeTool` (not `effectiveTool`) into `PropertiesPanel`, so holding spacebar to peek into select-mode does not collapse the picker. This is documented in Task 12 step 2.
