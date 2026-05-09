# Symbol Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `ArrowAnnotation` with a `SymbolAnnotation` that references a curated library of ~24 bundled SVG symbols (arrows, shapes, markers, brackets), and replace the "Arrow" tool with a "Symbol" tool that uses click-to-place + a category-grouped gallery in the properties panel.

**Architecture:** A new `src/renderer/symbols/library.ts` exports `SYMBOL_LIBRARY` — an immutable list of `SymbolDef { id, label, category, pathD, fill }`, all paths designed in a 100×100 viewport centered at (50, 50). The annotations model swaps `ArrowAnnotation` → `SymbolAnnotation { x, y, sizePx, rotationDeg, color, strokeWidthPx, symbolId }`. `drawAnnotations` translates/rotates/scales the canvas then strokes-or-fills `new Path2D(def.pathD)`. The `.mosaic` schema bumps to v2; v1 files are migrated in `fromMosaicFile` (the three legacy `head` values map to `arrow-open-right`, `arrow-filled-right`, `arrow-line-right` and arrow midpoint/length/vector become x/y/sizePx/rotationDeg). The interaction layer changes the creation gesture from drag-to-draw to click-to-place; selected symbols get four corner resize handles + one rotation handle.

**Tech Stack:** React 18, TypeScript strict, Vitest + @testing-library/react (jsdom), pnpm. No new runtime deps.

**Reference spec:** [docs/superpowers/specs/2026-05-08-qa-feedback/06-symbol-library.md](../specs/2026-05-08-qa-feedback/06-symbol-library.md)

**Branch:** `qa-feedback/symbol-library` off `main` (matches the existing `feat(qa-feedback): …` commit pattern).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/renderer/symbols/library.ts` | **Create** | `SymbolDef` interface, `SYMBOL_LIBRARY` (~24 entries grouped by category), `SYMBOL_LIBRARY_BY_ID`, `SYMBOL_CATEGORIES`. Single source of truth for path data. |
| `src/renderer/symbols/library.test.ts` | **Create** | (Co-located tests are not the project pattern; this file lives at `test/unit/symbol-library.test.ts` instead — see below.) |
| `test/unit/symbol-library.test.ts` | **Create** | Unique-id check, every `pathD` parses via `new Path2D()`, all four categories present, each category has at least one entry. |
| `src/renderer/model/annotations.ts` | **Modify** | Replace `ArrowAnnotation` with `SymbolAnnotation`. Update `AnnotationKind` and the user-facing `Annotation` union. |
| `src/renderer/model/types.ts` | **Modify** | Update `ResolvedAnnotation` so the symbol kind threads through to the renderer. |
| `src/renderer/model/canvas-dims.ts` | **Modify** | Replace the arrow branch in `scaleAnnotations` with a symbol branch that scales `x` and `y` only (size/rotation are visual, like `thicknessPx` was for arrows). |
| `src/renderer/model/relocate-anno.ts` | **Modify** | Replace the `arrow` case in `reprojectAnno` with a `symbol` case. Symbols carry one optional `anchor` (the symbol center) — much simpler than the two-endpoint arrow logic. |
| `src/renderer/model/figure-state.ts` | (no change) | |
| `src/renderer/model/figure-actions.ts` | (no change to action shapes) | |
| `src/renderer/model/schema.ts` | **Modify** | Bump `CURRENT_SCHEMA_VERSION` to 2. Add `MosaicFileV2`. Validator accepts both v1 (with `arrow` annos) and v2 (with `symbol` annos), narrowing on `schemaVersion`. |
| `src/renderer/model/serialize.ts` | **Modify** | `toMosaicFile` writes v2. `fromMosaicFile` accepts both v1 and v2; for v1 it migrates `arrow` annos in the deserialized state to `symbol` shape. |
| `src/renderer/model/migrate-v1-to-v2.ts` | **Create** | Pure function `migrateAnnotationsV1ToV2(annotations)` that converts `arrow`-kind annotations to `symbol` shape. Lives next to other model helpers; deliberately small and well-tested. |
| `test/unit/migrate-v1-to-v2.test.ts` | **Create** | All three head values map to expected symbol ids; midpoint, length, rotation derivation verified for known arrows. |
| `src/renderer/render/draw-annotations.ts` | **Modify** | Replace `drawArrow` with `drawSymbol`. Use `Path2D` (already on `DrawCtx`-compatible browser canvases — but note: `DrawCtx` does NOT currently expose `Path2D` operations, so this task includes extending that surface). |
| `src/renderer/render/draw-figure.ts` | **Modify** | Extend `DrawCtx` interface with the methods the symbol path-rendering needs: `fill(path: Path2D): void` and `stroke(path: Path2D): void` overloads. |
| `src/renderer/components/Toolbar/AnnotationToolbar.tsx` | **Modify** | Replace `"arrow"` with `"symbol"` in the `Tool` union; rename button label/title. |
| `src/renderer/components/Properties/SymbolAnnoForm.tsx` | **Create** | Properties form for a selected symbol: gallery grid grouped by category, color picker, size input, rotation slider with reset, stroke-width input (only for stroke symbols). Replaces `ArrowAnnoForm.tsx`. |
| `src/renderer/components/Properties/ArrowAnnoForm.tsx` | **Delete** | |
| `src/renderer/components/Properties/AnnotationPropertiesForm.tsx` | **Modify** | Swap `arrow` case for `symbol`; render `<SymbolAnnoForm>`. |
| `src/renderer/components/Annotations/AnnotationInteractionLayer.tsx` | **Modify** | Replace the arrow drag-to-create branch with click-to-place. Replace arrow endpoint handles with: 4 corner resize handles + 1 rotation handle when a symbol is selected. Update `annoBounds` to use a square `sizePx`-by-`sizePx` rect centered at `(x, y)`. |
| `src/renderer/styles.css` | **Modify** | Add `.symbol-gallery` and `.symbol-gallery-cell` rules. |
| `test/unit/draw-symbol.test.ts` | **Create** | Replaces `draw-arrow.test.ts`. Verifies translate→rotate→scale→`fill(path)` or `stroke(path)` order using a recorder ctx. |
| `test/unit/draw-arrow.test.ts` | **Delete** | |
| `test/unit/figure-actions.test.ts` | **Modify** | Update tests that fabricate `ArrowAnnotation` fixtures to use `SymbolAnnotation`. |
| `test/unit/relocate-anno.test.ts` | **Modify** | Update arrow tests to symbol shape (one anchor, not two). |
| `test/unit/draw-figure.test.ts` | **Modify** | Replace any `arrow` annotation fixtures with `symbol` fixtures. |
| `test/unit/canvas-dims.test.ts` | **Modify** | Replace `arrow` case in `scaleAnnotations` test with `symbol`. |
| `test/unit/serialize.test.ts` | **Modify** | Add a v1-load round-trip test that asserts arrows are migrated. |
| `test/unit/symbol-anno-form.test.tsx` | **Create** | Component test: gallery click dispatches `UPDATE_ANNOTATION` with `symbolId`. |
| `test/unit/annotation-toolbar.test.tsx` | **Modify (if exists; otherwise extend in `App.test`)** | Tool button label is "Symbol" and `data-testid` is `anno-tool-symbol`. |

---

## Migration semantics (locked in here so tasks below match)

- `CURRENT_SCHEMA_VERSION = 2`.
- `validateMosaicFile` accepts `schemaVersion: 1 | 2`. The validator uses one shared validator for `text/box/scalebar` (unchanged), one for `arrow` (v1-only), one for `symbol` (v2-only). It rejects mixing — e.g. `arrow` annotations in a v2 file is an error.
- `fromMosaicFile` returns the runtime `FigureState` always in v2 shape. If the on-disk file is v1, it runs `migrateAnnotationsV1ToV2` before constructing the state.
- `toMosaicFile` always writes v2. There is no path that emits v1.
- The migration mapping per the spec:
  - `head: "filled"` → `symbolId: "arrow-filled-right"`
  - `head: "open"` → `symbolId: "arrow-open-right"`
  - `head: "none"` → `symbolId: "arrow-line-right"`
  - `x = (x1 + x2) / 2`, `y = (y1 + y2) / 2`
  - `sizePx = max(8, sqrt((x2-x1)^2 + (y2-y1)^2))` (the `max(8, …)` keeps zero-length legacy arrows from collapsing into invisible 0px symbols).
  - `rotationDeg = atan2(y2 - y1, x2 - x1) * 180 / PI` (the library's "right"-facing arrows point along +x at rotation 0, matching the legacy x1→x2 convention).
  - `color = a.color`
  - `strokeWidthPx = a.thicknessPx` (preserved even for filled symbols; ignored at draw time per the spec).
  - `panelId`, `imageId`, `z`, `id` carry over unchanged.
  - Image-bound arrows: combine `anchor1` and `anchor2` into a single midpoint anchor `{ imgU: (a1.imgU + a2.imgU) / 2, imgV: (a1.imgV + a2.imgV) / 2 }`. Best-effort — the symbol's anchor is the center, not two endpoints.

---

## Symbol library content (locked in here so Task 2 matches)

All paths below are designed in a 100×100 viewport, centered at (50, 50), with the "right" orientation (i.e. arrows point at +x, brackets open to the right, ticks lean +x). Path data uses absolute commands with integers or one-decimal floats so it's both compact and readable. Where possible I keep stroke-mode shapes inside a 70×70 inset (15..85) so a default `strokeWidthPx` of 4 doesn't clip the viewport edge.

### Arrow (6)
1. `arrow-open-right` — Open chevron + shaft. `M 15 50 L 75 50 M 75 50 L 60 35 M 75 50 L 60 65` — fill: `false`.
2. `arrow-filled-right` — Solid arrow with triangle head. `M 15 45 L 65 45 L 65 30 L 85 50 L 65 70 L 65 55 L 15 55 Z` — fill: `true`.
3. `arrow-line-right` — Plain line, no head. `M 15 50 L 85 50` — fill: `false`.
4. `arrow-double-right` — Two stacked open chevrons + shaft. `M 15 50 L 75 50 M 60 35 L 75 50 L 60 65 M 45 35 L 60 50 L 45 65` — fill: `false`.
5. `arrow-thin-right` — Thinner triangle head, narrow shaft. `M 15 48 L 70 48 L 70 38 L 85 50 L 70 62 L 70 52 L 15 52 Z` — fill: `true`.
6. `arrow-thick-right` — Wider arrow. `M 15 38 L 60 38 L 60 20 L 90 50 L 60 80 L 60 62 L 15 62 Z` — fill: `true`.

### Shape (8)
7. `shape-circle` — `M 85 50 A 35 35 0 1 1 15 50 A 35 35 0 1 1 85 50 Z` — fill: `true`.
8. `shape-square` — `M 15 15 L 85 15 L 85 85 L 15 85 Z` — fill: `true`.
9. `shape-triangle` — Equilateral, point up. `M 50 15 L 85 80 L 15 80 Z` — fill: `true`.
10. `shape-diamond` — `M 50 15 L 85 50 L 50 85 L 15 50 Z` — fill: `true`.
11. `shape-star` — 5-point. `M 50 15 L 60 40 L 87 40 L 65 57 L 73 84 L 50 68 L 27 84 L 35 57 L 13 40 L 40 40 Z` — fill: `true`.
12. `shape-plus` — `M 42 20 L 58 20 L 58 42 L 80 42 L 80 58 L 58 58 L 58 80 L 42 80 L 42 58 L 20 58 L 20 42 L 42 42 Z` — fill: `true`.
13. `shape-cross` — Diagonal X (filled). `M 22 30 L 30 22 L 50 42 L 70 22 L 78 30 L 58 50 L 78 70 L 70 78 L 50 58 L 30 78 L 22 70 L 42 50 Z` — fill: `true`.
14. `shape-asterisk` — Six-spoke. `M 47 20 L 53 20 L 53 47 L 80 47 L 80 53 L 53 53 L 53 80 L 47 80 L 47 53 L 20 53 L 20 47 L 47 47 Z M 31 27 L 35 23 L 54 42 L 50 46 Z M 65 23 L 69 27 L 50 46 L 46 42 Z M 31 73 L 27 69 L 46 50 L 50 54 Z M 65 77 L 69 73 L 50 54 L 46 58 Z` — fill: `true`. (Compound: a `+` with a rotated `×`.)

### Marker (4)
15. `marker-dot` — Small filled circle. `M 65 50 A 15 15 0 1 1 35 50 A 15 15 0 1 1 65 50 Z` — fill: `true`.
16. `marker-ring` — Small unfilled circle (stroked). `M 65 50 A 15 15 0 1 1 35 50 A 15 15 0 1 1 65 50 Z` — fill: `false`.
17. `marker-tick` — Checkmark. `M 25 55 L 45 75 L 80 30` — fill: `false`.
18. `marker-x` — Stroked X. `M 25 25 L 75 75 M 75 25 L 25 75` — fill: `false`.

### Bracket (6)
19. `bracket-curly-left` — `M 60 15 Q 40 15 40 35 Q 40 50 30 50 Q 40 50 40 65 Q 40 85 60 85` — fill: `false`.
20. `bracket-curly-right` — `M 40 15 Q 60 15 60 35 Q 60 50 70 50 Q 60 50 60 65 Q 60 85 40 85` — fill: `false`.
21. `bracket-square-left` — `M 70 15 L 30 15 L 30 85 L 70 85` — fill: `false`.
22. `bracket-square-right` — `M 30 15 L 70 15 L 70 85 L 30 85` — fill: `false`.
23. `bracket-angle-left` — `M 70 15 L 30 50 L 70 85` — fill: `false`.
24. `bracket-angle-right` — `M 30 15 L 70 50 L 30 85` — fill: `false`.

Total: 24 entries, 4 categories. Default for new symbols: `arrow-filled-right`.

---

## Task 1: Symbol library + tests

**Files:**
- Create: `src/renderer/symbols/library.ts`
- Test: `test/unit/symbol-library.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/symbol-library.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SYMBOL_LIBRARY,
  SYMBOL_LIBRARY_BY_ID,
  SYMBOL_CATEGORIES,
  type SymbolDef,
} from "../../src/renderer/symbols/library";

describe("SYMBOL_LIBRARY", () => {
  it("has 24 entries", () => {
    expect(SYMBOL_LIBRARY).toHaveLength(24);
  });

  it("has unique ids", () => {
    const ids = SYMBOL_LIBRARY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers all four categories", () => {
    const seen = new Set(SYMBOL_LIBRARY.map((s) => s.category));
    expect(seen).toEqual(new Set(["arrow", "shape", "marker", "bracket"]));
  });

  it("every category has at least one entry", () => {
    for (const c of SYMBOL_CATEGORIES) {
      expect(SYMBOL_LIBRARY.some((s) => s.category === c)).toBe(true);
    }
  });

  it("every pathD parses via new Path2D()", () => {
    for (const def of SYMBOL_LIBRARY) {
      // Throws if invalid SVG path. jsdom + canvas polyfill provides Path2D.
      expect(() => new Path2D(def.pathD)).not.toThrow();
    }
  });

  it("includes the three migration-target arrow ids", () => {
    const required = ["arrow-open-right", "arrow-filled-right", "arrow-line-right"];
    const ids = new Set(SYMBOL_LIBRARY.map((s) => s.id));
    for (const id of required) expect(ids.has(id)).toBe(true);
  });

  it("SYMBOL_LIBRARY_BY_ID is consistent with SYMBOL_LIBRARY", () => {
    expect(SYMBOL_LIBRARY_BY_ID.size).toBe(SYMBOL_LIBRARY.length);
    for (const def of SYMBOL_LIBRARY) {
      expect(SYMBOL_LIBRARY_BY_ID.get(def.id)).toBe(def);
    }
  });

  it("each SymbolDef has well-typed fields", () => {
    for (const def of SYMBOL_LIBRARY) {
      const ok: SymbolDef = def;
      expect(typeof ok.id).toBe("string");
      expect(typeof ok.label).toBe("string");
      expect(typeof ok.pathD).toBe("string");
      expect(typeof ok.fill).toBe("boolean");
    }
  });
});
```

The Vitest config in this repo runs in `node`. `Path2D` is a browser global; we must import it from `canvas` polyfill OR run this test under jsdom. The `// @vitest-environment jsdom` directive at the top of the file flips the environment for that one file. **Use that.** Add as the very first line of the file:

```ts
// @vitest-environment jsdom
```

(Other component tests in this repo already use jsdom this way — the directive is well-supported.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/symbol-library.test.ts`

Expected: FAIL with "Cannot find module '../../src/renderer/symbols/library'".

- [ ] **Step 3: Create the library module**

Create `src/renderer/symbols/library.ts`:

```ts
/**
 * Curated symbol library. Each symbol is one Path2D-compatible string in
 * a 100×100 design viewport centered at (50, 50). The renderer translates
 * to the annotation's (x, y), rotates, scales by sizePx/100, then translates
 * by -50,-50 so the symbol's center sits at the user's anchor point.
 *
 * fill=true symbols are painted with ctx.fill(path) and use the annotation
 * color for fill. fill=false symbols are stroked with ctx.stroke(path) and
 * use strokeWidthPx; the renderer divides strokeWidthPx by the path scale
 * so stroke width is constant in figure-px regardless of sizePx.
 *
 * "Right"-orientation convention: arrows point at +x, brackets open to the
 * right. The user picks rotation independently (0 = library default).
 */

export type SymbolCategory = "arrow" | "shape" | "marker" | "bracket";

export const SYMBOL_CATEGORIES: readonly SymbolCategory[] = [
  "arrow",
  "shape",
  "marker",
  "bracket",
] as const;

export interface SymbolDef {
  /** Stable id; persisted in `.mosaic` files. */
  id: string;
  /** Human label shown in the gallery. */
  label: string;
  category: SymbolCategory;
  /** Path data in a 100×100 viewport centered at (50, 50). */
  pathD: string;
  /** True → ctx.fill(path); false → ctx.stroke(path). */
  fill: boolean;
}

export const SYMBOL_LIBRARY: readonly SymbolDef[] = [
  // Arrow
  { id: "arrow-open-right",    label: "Open arrow",    category: "arrow", fill: false, pathD: "M 15 50 L 75 50 M 75 50 L 60 35 M 75 50 L 60 65" },
  { id: "arrow-filled-right",  label: "Filled arrow",  category: "arrow", fill: true,  pathD: "M 15 45 L 65 45 L 65 30 L 85 50 L 65 70 L 65 55 L 15 55 Z" },
  { id: "arrow-line-right",    label: "Line",          category: "arrow", fill: false, pathD: "M 15 50 L 85 50" },
  { id: "arrow-double-right",  label: "Double arrow",  category: "arrow", fill: false, pathD: "M 15 50 L 75 50 M 60 35 L 75 50 L 60 65 M 45 35 L 60 50 L 45 65" },
  { id: "arrow-thin-right",    label: "Thin arrow",    category: "arrow", fill: true,  pathD: "M 15 48 L 70 48 L 70 38 L 85 50 L 70 62 L 70 52 L 15 52 Z" },
  { id: "arrow-thick-right",   label: "Thick arrow",   category: "arrow", fill: true,  pathD: "M 15 38 L 60 38 L 60 20 L 90 50 L 60 80 L 60 62 L 15 62 Z" },

  // Shape
  { id: "shape-circle",        label: "Circle",        category: "shape", fill: true,  pathD: "M 85 50 A 35 35 0 1 1 15 50 A 35 35 0 1 1 85 50 Z" },
  { id: "shape-square",        label: "Square",        category: "shape", fill: true,  pathD: "M 15 15 L 85 15 L 85 85 L 15 85 Z" },
  { id: "shape-triangle",      label: "Triangle",      category: "shape", fill: true,  pathD: "M 50 15 L 85 80 L 15 80 Z" },
  { id: "shape-diamond",       label: "Diamond",       category: "shape", fill: true,  pathD: "M 50 15 L 85 50 L 50 85 L 15 50 Z" },
  { id: "shape-star",          label: "Star",          category: "shape", fill: true,  pathD: "M 50 15 L 60 40 L 87 40 L 65 57 L 73 84 L 50 68 L 27 84 L 35 57 L 13 40 L 40 40 Z" },
  { id: "shape-plus",          label: "Plus",          category: "shape", fill: true,  pathD: "M 42 20 L 58 20 L 58 42 L 80 42 L 80 58 L 58 58 L 58 80 L 42 80 L 42 58 L 20 58 L 20 42 L 42 42 Z" },
  { id: "shape-cross",         label: "Cross (X)",     category: "shape", fill: true,  pathD: "M 22 30 L 30 22 L 50 42 L 70 22 L 78 30 L 58 50 L 78 70 L 70 78 L 50 58 L 30 78 L 22 70 L 42 50 Z" },
  { id: "shape-asterisk",      label: "Asterisk",      category: "shape", fill: true,  pathD: "M 47 20 L 53 20 L 53 47 L 80 47 L 80 53 L 53 53 L 53 80 L 47 80 L 47 53 L 20 53 L 20 47 L 47 47 Z M 31 27 L 35 23 L 54 42 L 50 46 Z M 65 23 L 69 27 L 50 46 L 46 42 Z M 31 73 L 27 69 L 46 50 L 50 54 Z M 65 77 L 69 73 L 50 54 L 46 58 Z" },

  // Marker
  { id: "marker-dot",          label: "Dot",           category: "marker", fill: true,  pathD: "M 65 50 A 15 15 0 1 1 35 50 A 15 15 0 1 1 65 50 Z" },
  { id: "marker-ring",         label: "Ring",          category: "marker", fill: false, pathD: "M 65 50 A 15 15 0 1 1 35 50 A 15 15 0 1 1 65 50 Z" },
  { id: "marker-tick",         label: "Tick",          category: "marker", fill: false, pathD: "M 25 55 L 45 75 L 80 30" },
  { id: "marker-x",            label: "X",             category: "marker", fill: false, pathD: "M 25 25 L 75 75 M 75 25 L 25 75" },

  // Bracket
  { id: "bracket-curly-left",  label: "Curly {",       category: "bracket", fill: false, pathD: "M 60 15 Q 40 15 40 35 Q 40 50 30 50 Q 40 50 40 65 Q 40 85 60 85" },
  { id: "bracket-curly-right", label: "Curly }",       category: "bracket", fill: false, pathD: "M 40 15 Q 60 15 60 35 Q 60 50 70 50 Q 60 50 60 65 Q 60 85 40 85" },
  { id: "bracket-square-left", label: "Square [",      category: "bracket", fill: false, pathD: "M 70 15 L 30 15 L 30 85 L 70 85" },
  { id: "bracket-square-right",label: "Square ]",      category: "bracket", fill: false, pathD: "M 30 15 L 70 15 L 70 85 L 30 85" },
  { id: "bracket-angle-left",  label: "Angle <",       category: "bracket", fill: false, pathD: "M 70 15 L 30 50 L 70 85" },
  { id: "bracket-angle-right", label: "Angle >",       category: "bracket", fill: false, pathD: "M 30 15 L 70 50 L 30 85" },
] as const;

export const SYMBOL_LIBRARY_BY_ID: ReadonlyMap<string, SymbolDef> = new Map(
  SYMBOL_LIBRARY.map((d) => [d.id, d]),
);

export const DEFAULT_SYMBOL_ID = "arrow-filled-right";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/symbol-library.test.ts`

Expected: PASS, all 7 cases.

- [ ] **Step 5: Commit**

```bash
git checkout -b qa-feedback/symbol-library
git add src/renderer/symbols/library.ts test/unit/symbol-library.test.ts
git commit -m "feat(symbols): add curated symbol library (24 entries, 4 categories)"
```

---

## Task 2: SymbolAnnotation type + AnnotationKind union

**Files:**
- Modify: `src/renderer/model/annotations.ts`
- Modify: `src/renderer/model/types.ts`

This is a type-only change; tests in later tasks (canvas-dims, draw, etc.) will fail to compile until this is done. We use the typecheck itself as the failing→passing verification.

- [ ] **Step 1: Verify the type currently has `ArrowAnnotation`**

Run: `grep -n 'ArrowAnnotation\|"arrow"' src/renderer/model/annotations.ts src/renderer/model/types.ts`

Expected: matches in both files (this is "before" state).

- [ ] **Step 2: Replace `ArrowAnnotation` with `SymbolAnnotation` in `annotations.ts`**

Open `src/renderer/model/annotations.ts`. Replace the `AnnotationKind` line:

```ts
export type AnnotationKind = "text" | "symbol" | "box" | "scalebar" | "letter";
```

Replace the entire `ArrowAnnotation` interface (lines ~77-90) with:

```ts
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
  /** Stroke width for stroke-only symbols. Ignored at draw time for filled symbols. */
  strokeWidthPx: number;
}
```

Update the `Annotation` union at the bottom (line ~135):

```ts
export type Annotation =
  | TextAnnotation
  | SymbolAnnotation
  | BoxAnnotation
  | ScaleBarAnnotation;
```

Also update the docblock at the top (lines 1-15): the union now has 4 kinds via `text/symbol/box/scalebar`. Update the `AnnotationKind` JSDoc accordingly.

- [ ] **Step 3: Update `types.ts`**

Open `src/renderer/model/types.ts`. Change the import line (line ~9):

```ts
import type {
  TextAnnotation,
  SymbolAnnotation,
  BoxAnnotation,
  ScaleBarAnnotation,
  LetterAnnotation,
} from "./annotations";
```

Update `ResolvedAnnotation` (lines ~72-77):

```ts
export type ResolvedAnnotation =
  | (TextAnnotation & { kind: "text" })
  | (SymbolAnnotation & { kind: "symbol" })
  | (BoxAnnotation & { kind: "box" })
  | (ScaleBarAnnotation & { kind: "scalebar"; resolvedPanelId: string })
  | (LetterAnnotation & { kind: "letter" });
```

- [ ] **Step 4: Run typecheck — expect failures only in not-yet-updated callsites**

Run: `pnpm typecheck`

Expected: errors in `canvas-dims.ts`, `relocate-anno.ts`, `draw-annotations.ts`, `schema.ts`, `serialize.ts`, `AnnotationToolbar.tsx`, `ArrowAnnoForm.tsx`, `AnnotationPropertiesForm.tsx`, `AnnotationInteractionLayer.tsx`, and the corresponding tests. **Do not commit yet** — the codebase doesn't compile. Continue to Task 3.

---

## Task 3: scaleAnnotations symbol case

**Files:**
- Modify: `src/renderer/model/canvas-dims.ts`
- Test: `test/unit/canvas-dims.test.ts`

- [ ] **Step 1: Update `canvas-dims.test.ts` to use symbol fixtures**

Open `test/unit/canvas-dims.test.ts`. Find the test(s) that build an `arrow` annotation and rewrite them to use the new symbol shape. For each test like:

```ts
{ kind: "arrow", id: "...", z: 1, x1: 10, y1: 20, x2: 100, y2: 200, color: "#000", thicknessPx: 2, head: "filled" }
```

replace with:

```ts
{ kind: "symbol", id: "...", z: 1, symbolId: "arrow-filled-right", x: 50, y: 100, sizePx: 60, rotationDeg: 0, color: "#000", strokeWidthPx: 2 }
```

Update the assertion: `scaleAnnotations` should multiply `x` by `sx` and `y` by `sy` (sizePx and rotationDeg are NOT scaled — they're visual).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/canvas-dims.test.ts`

Expected: FAIL — implementation still has the arrow branch.

- [ ] **Step 3: Update `canvas-dims.ts`**

Open `src/renderer/model/canvas-dims.ts`. Replace the entire `if (a.kind === "arrow")` block (lines ~58-66) with:

```ts
    if (a.kind === "symbol") {
      return {
        ...a,
        x: a.x * sx,
        y: a.y * sy,
      };
    }
```

Update the docblock above `scaleAnnotations` (line ~39). Replace the `- arrow: x1, y1, x2, y2` line with `- symbol: x, y` and update the trailing prose: `sizePt, strokeWidthPx, sizePx, rotationDeg are intentionally left alone …`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/canvas-dims.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit (still not buildable; commit incrementally)**

```bash
git add src/renderer/model/canvas-dims.ts test/unit/canvas-dims.test.ts
git commit -m "refactor(symbols): scaleAnnotations handles symbol kind"
```

---

## Task 4: relocate-anno symbol case

**Files:**
- Modify: `src/renderer/model/relocate-anno.ts`
- Test: `test/unit/relocate-anno.test.ts`

- [ ] **Step 1: Update `relocate-anno.test.ts` arrow tests**

Open `test/unit/relocate-anno.test.ts`. For every fixture where an `arrow` annotation is reprojected, rewrite to symbol:

- Replace `kind: "arrow"`, `x1/y1/x2/y2`, `anchor1/anchor2` with `kind: "symbol"`, `x/y`, `anchor: { imgU, imgV }`.
- Replace `head: ...` and `thicknessPx: ...` with `symbolId: "arrow-filled-right"`, `sizePx: 60`, `rotationDeg: 0`, `strokeWidthPx: 2`.
- Replace assertions on `x1/y1/x2/y2` with assertions on `x/y` (the projected midpoint should be a single point).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/relocate-anno.test.ts`

Expected: FAIL — implementation still has the arrow branch.

- [ ] **Step 3: Update `relocate-anno.ts`**

Open `src/renderer/model/relocate-anno.ts`. Replace the `case "arrow":` block (lines ~104-125) with:

```ts
    case "symbol": {
      if (a.anchor === undefined) return a;
      const p = projectAnchor(a.anchor, panelRect, transform, imgW, imgH);
      if (a.x === p.fx && a.y === p.fy && a.panelId === panelId) return a;
      return { ...a, x: p.fx, y: p.fy, panelId };
    }
```

(Note: rotation re-projection on flip/rotate is **not** wired here. The spec accepts the simplification — symbols re-anchor by center; visual orientation stays put. A later spec can revisit if users complain that flipping a panel doesn't flip the arrows pointing at things.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/relocate-anno.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/model/relocate-anno.ts test/unit/relocate-anno.test.ts
git commit -m "refactor(symbols): relocate-anno handles symbol kind"
```

---

## Task 5: V1 → V2 migration helper + tests

**Files:**
- Create: `src/renderer/model/migrate-v1-to-v2.ts`
- Create: `test/unit/migrate-v1-to-v2.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/migrate-v1-to-v2.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { migrateAnnotationsV1ToV2 } from "../../src/renderer/model/migrate-v1-to-v2";

describe("migrateAnnotationsV1ToV2", () => {
  it("maps head=filled to arrow-filled-right", () => {
    const out = migrateAnnotationsV1ToV2([
      { id: "a1", kind: "arrow", z: 0, x1: 10, y1: 20, x2: 110, y2: 20, color: "#F00", thicknessPx: 3, head: "filled" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "a1", kind: "symbol", z: 0, symbolId: "arrow-filled-right",
      x: 60, y: 20, sizePx: 100, rotationDeg: 0, color: "#F00", strokeWidthPx: 3,
    });
  });

  it("maps head=open to arrow-open-right", () => {
    const out = migrateAnnotationsV1ToV2([
      { id: "a2", kind: "arrow", z: 0, x1: 0, y1: 0, x2: 0, y2: 100, color: "#000", thicknessPx: 2, head: "open" },
    ]);
    expect(out[0]).toMatchObject({
      kind: "symbol", symbolId: "arrow-open-right", x: 0, y: 50, sizePx: 100, rotationDeg: 90,
    });
  });

  it("maps head=none to arrow-line-right", () => {
    const out = migrateAnnotationsV1ToV2([
      { id: "a3", kind: "arrow", z: 0, x1: 100, y1: 100, x2: 0, y2: 100, color: "#000", thicknessPx: 1, head: "none" },
    ]);
    expect(out[0]).toMatchObject({
      kind: "symbol", symbolId: "arrow-line-right", x: 50, y: 100, sizePx: 100, rotationDeg: 180,
    });
  });

  it("clamps zero-length arrows to sizePx=8", () => {
    const out = migrateAnnotationsV1ToV2([
      { id: "a4", kind: "arrow", z: 0, x1: 50, y1: 50, x2: 50, y2: 50, color: "#000", thicknessPx: 1, head: "filled" },
    ]);
    expect(out[0]).toMatchObject({ kind: "symbol", x: 50, y: 50, sizePx: 8, rotationDeg: 0 });
  });

  it("merges anchor1+anchor2 into a midpoint anchor when arrow is image-bound", () => {
    const out = migrateAnnotationsV1ToV2([
      {
        id: "a5", kind: "arrow", z: 0, x1: 10, y1: 10, x2: 90, y2: 90,
        color: "#000", thicknessPx: 2, head: "filled",
        imageId: "img1", panelId: "p1",
        anchor1: { imgU: 0.1, imgV: 0.2 },
        anchor2: { imgU: 0.5, imgV: 0.4 },
      },
    ]);
    expect(out[0]).toMatchObject({
      kind: "symbol", imageId: "img1", panelId: "p1",
      anchor: { imgU: 0.3, imgV: 0.30000000000000004 },
    });
  });

  it("leaves non-arrow annotations unchanged", () => {
    const text = { id: "t1", kind: "text" as const, z: 0, x: 0, y: 0, text: "hi", font: "sans", sizePt: 12, bold: false, italic: false, color: "#000" };
    const out = migrateAnnotationsV1ToV2([text]);
    expect(out[0]).toEqual(text);
  });

  it("returns the same array reference when no arrow annotations are present", () => {
    const arr = [
      { id: "t1", kind: "text" as const, z: 0, x: 0, y: 0, text: "hi", font: "sans", sizePt: 12, bold: false, italic: false, color: "#000" },
    ];
    expect(migrateAnnotationsV1ToV2(arr)).toBe(arr);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/migrate-v1-to-v2.test.ts`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `migrate-v1-to-v2.ts`**

Create `src/renderer/model/migrate-v1-to-v2.ts`:

```ts
/**
 * One-way migration from `.mosaic` v1 to v2: arrow annotations become
 * symbol annotations. All other kinds pass through unchanged.
 *
 * Mapping from spec 06:
 *   head=filled → arrow-filled-right
 *   head=open   → arrow-open-right
 *   head=none   → arrow-line-right
 *   x = (x1+x2)/2, y = (y1+y2)/2
 *   sizePx = max(8, sqrt((x2-x1)^2 + (y2-y1)^2))
 *   rotationDeg = atan2(y2-y1, x2-x1) * 180 / PI
 *   strokeWidthPx = thicknessPx (preserved; ignored for filled symbols at draw time)
 *   anchor = midpoint of (anchor1, anchor2) when image-bound
 */

import type { Annotation, ImageAnchor, SymbolAnnotation } from "./annotations";

interface V1ArrowAnnotation {
  id: string;
  kind: "arrow";
  z: number;
  panelId?: string;
  imageId?: string;
  x1: number; y1: number;
  x2: number; y2: number;
  anchor1?: ImageAnchor;
  anchor2?: ImageAnchor;
  color: string;
  thicknessPx: number;
  head: "none" | "open" | "filled";
}

type V1Annotation = Annotation | V1ArrowAnnotation;

const HEAD_TO_SYMBOL: Record<V1ArrowAnnotation["head"], string> = {
  filled: "arrow-filled-right",
  open: "arrow-open-right",
  none: "arrow-line-right",
};

export function migrateAnnotationsV1ToV2(
  annotations: readonly V1Annotation[],
): Annotation[] {
  if (!annotations.some((a) => a.kind === "arrow")) {
    return annotations as Annotation[];
  }
  return annotations.map((a): Annotation => {
    if (a.kind !== "arrow") return a as Annotation;
    return migrateArrow(a);
  });
}

function migrateArrow(a: V1ArrowAnnotation): SymbolAnnotation {
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const sizePx = Math.max(8, len);
  // For zero-length arrows atan2(0,0) === 0; that's fine.
  const rotationDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const x = (a.x1 + a.x2) / 2;
  const y = (a.y1 + a.y2) / 2;
  const out: SymbolAnnotation = {
    id: a.id,
    kind: "symbol",
    z: a.z,
    symbolId: HEAD_TO_SYMBOL[a.head],
    x,
    y,
    sizePx,
    rotationDeg,
    color: a.color,
    strokeWidthPx: a.thicknessPx,
  };
  if (a.panelId !== undefined) out.panelId = a.panelId;
  if (a.imageId !== undefined) out.imageId = a.imageId;
  if (a.anchor1 !== undefined && a.anchor2 !== undefined) {
    out.anchor = {
      imgU: (a.anchor1.imgU + a.anchor2.imgU) / 2,
      imgV: (a.anchor1.imgV + a.anchor2.imgV) / 2,
    };
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/migrate-v1-to-v2.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/model/migrate-v1-to-v2.ts test/unit/migrate-v1-to-v2.test.ts
git commit -m "feat(symbols): v1->v2 annotation migration helper"
```

---

## Task 6: Schema bump to v2 + serialize migration on load

**Files:**
- Modify: `src/renderer/model/schema.ts`
- Modify: `src/renderer/model/serialize.ts`
- Modify: `test/unit/schema.test.ts`
- Modify: `test/unit/serialize.test.ts`

- [ ] **Step 1: Add a failing serialize round-trip test**

Open `test/unit/serialize.test.ts`. Add a new test block at the bottom:

```ts
describe("v1 → v2 migration on fromMosaicFile", () => {
  it("converts a v1 file with arrow annotations to a v2 state with symbol annotations", () => {
    const v1: any = {
      schemaVersion: 1,
      app: "mosaic-builder",
      appVersion: "0.1.0",
      createdAt: "2025-12-01T00:00:00Z",
      modifiedAt: "2025-12-01T00:00:00Z",
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      state: {
        rows: 1, cols: 1, gutterPx: 4, gutterColor: "#FFFFFF",
        pool: [], panels: [{ id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1 }],
        annotations: [
          { id: "a1", kind: "arrow", z: 0, x1: 10, y1: 20, x2: 110, y2: 20, color: "#F00", thicknessPx: 3, head: "filled" },
        ],
        globalStyle: {
          letters: { enabled: true, font: "Arial", sizePt: 14, color: "#000000", paddingPx: 4, bold: true, corner: "tl" },
          scalebar: { font: "Arial", sizePt: 12, color: "#000000", barColor: "#000000", thicknessPx: 4, paddingPx: 8, showLabel: true, corner: "br" },
        },
        letterOverrides: {},
      },
    };
    const { state } = fromMosaicFile(v1);
    expect(state.annotations).toHaveLength(1);
    expect(state.annotations[0]).toMatchObject({
      kind: "symbol", symbolId: "arrow-filled-right", x: 60, y: 20, sizePx: 100, rotationDeg: 0,
    });
  });

  it("toMosaicFile always writes schemaVersion=2", () => {
    const f = toMosaicFile({
      state: initialFigureState(),
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/tmp/x.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-09T00:00:00Z",
    });
    expect(f.schemaVersion).toBe(2);
  });
});
```

In the existing test "emits schemaVersion=1, app=mosaic-builder, copies state through", change `expect(f.schemaVersion).toBe(1)` to `expect(f.schemaVersion).toBe(2)`. **Do not delete the test** — it's verifying many other things.

- [ ] **Step 2: Add a failing schema test**

Open `test/unit/schema.test.ts`. Add tests for the v1 acceptance + v2 default:

```ts
describe("validateMosaicFile schema versions", () => {
  it("accepts a valid v1 file with arrow annotations", () => {
    const v1 = makeMinimalFile(1, [
      { id: "a1", kind: "arrow", z: 0, x1: 0, y1: 0, x2: 100, y2: 0, color: "#000000", thicknessPx: 2, head: "filled" },
    ]);
    expect(validateMosaicFile(v1).ok).toBe(true);
  });

  it("accepts a valid v2 file with symbol annotations", () => {
    const v2 = makeMinimalFile(2, [
      { id: "a1", kind: "symbol", z: 0, symbolId: "arrow-filled-right", x: 50, y: 50, sizePx: 60, rotationDeg: 0, color: "#000000", strokeWidthPx: 2 },
    ]);
    expect(validateMosaicFile(v2).ok).toBe(true);
  });

  it("rejects a v1 file containing symbol annotations", () => {
    const bad = makeMinimalFile(1, [
      { id: "a1", kind: "symbol", z: 0, symbolId: "x", x: 0, y: 0, sizePx: 60, rotationDeg: 0, color: "#000000", strokeWidthPx: 2 },
    ]);
    const r = validateMosaicFile(bad);
    expect(r.ok).toBe(false);
  });

  it("rejects a v2 file containing arrow annotations", () => {
    const bad = makeMinimalFile(2, [
      { id: "a1", kind: "arrow", z: 0, x1: 0, y1: 0, x2: 100, y2: 0, color: "#000000", thicknessPx: 2, head: "filled" },
    ]);
    const r = validateMosaicFile(bad);
    expect(r.ok).toBe(false);
  });

  it("rejects schemaVersion 3", () => {
    const bad = makeMinimalFile(3 as any, []);
    expect(validateMosaicFile(bad).ok).toBe(false);
  });
});

function makeMinimalFile(schemaVersion: 1 | 2, annotations: any[]): unknown {
  return {
    schemaVersion,
    app: "mosaic-builder",
    appVersion: "0.1.0",
    createdAt: "2026-05-09T00:00:00Z",
    modifiedAt: "2026-05-09T00:00:00Z",
    canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
    state: {
      rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFFFFF",
      pool: [], panels: [{ id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1 }],
      annotations,
      globalStyle: {
        letters: { enabled: true, font: "Arial", sizePt: 14, color: "#000000", paddingPx: 4, bold: true, corner: "tl" },
        scalebar: { font: "Arial", sizePt: 12, color: "#000000", barColor: "#000000", thicknessPx: 4, paddingPx: 8, showLabel: true, corner: "br" },
      },
      letterOverrides: {},
    },
  };
}
```

(If `schema.test.ts` doesn't exist, create it. If it does, append these tests at the bottom.)

- [ ] **Step 3: Run tests to verify failure**

Run: `pnpm vitest run test/unit/serialize.test.ts test/unit/schema.test.ts`

Expected: FAIL.

- [ ] **Step 4: Update `schema.ts`**

Open `src/renderer/model/schema.ts`. Replace `CURRENT_SCHEMA_VERSION` line:

```ts
export const CURRENT_SCHEMA_VERSION = 2;
```

Add a v2 type next to `MosaicFileV1`:

```ts
/** v2: identical to v1 but `arrow` annotations are replaced by `symbol`. */
export interface MosaicFileV2 extends Omit<MosaicFileV1, "schemaVersion"> {
  schemaVersion: 2;
}

/** Type alias used by callers that don't care about version. */
export type MosaicFile = MosaicFileV1 | MosaicFileV2;
```

Update `validateAnnotations`. Pass the schemaVersion in:

```ts
function validateAnnotations(
  x: unknown,
  path: string,
  schemaVersion: 1 | 2,
): Result<FigureState["annotations"]> {
  // …existing prelude…
    const k = a.kind;
    if (k === "text") { /* unchanged */ }
    else if (k === "arrow") {
      if (schemaVersion !== 1) {
        return err(`${path}[${i}].kind: arrow not allowed in v${schemaVersion}`);
      }
      // …existing v1 arrow validation unchanged…
    }
    else if (k === "symbol") {
      if (schemaVersion !== 2) {
        return err(`${path}[${i}].kind: symbol not allowed in v${schemaVersion}`);
      }
      if (
        !isStr(a.symbolId) ||
        !isNum(a.x) ||
        !isNum(a.y) ||
        !isNum(a.sizePx) ||
        a.sizePx <= 0 ||
        !isNum(a.rotationDeg) ||
        !isStr(a.color) ||
        !isNum(a.strokeWidthPx) ||
        a.strokeWidthPx < 0
      ) {
        return err(`${path}[${i}]: malformed symbol annotation`);
      }
      if (a.anchor !== undefined && !isImageAnchor(a.anchor)) {
        return err(`${path}[${i}].anchor`);
      }
    }
    else if (k === "box") { /* unchanged */ }
    else if (k === "scalebar") { /* unchanged */ }
    else {
      return err(`${path}[${i}].kind: must be text|symbol|box|scalebar (or arrow in v1)`);
    }
  // …existing footer…
}
```

In the top-level `validateMosaicFile`, change the schemaVersion check:

```ts
  if (x.schemaVersion !== 1 && x.schemaVersion !== 2) {
    return err(`schemaVersion: unsupported (${String(x.schemaVersion)})`);
  }
  const sv = x.schemaVersion as 1 | 2;
```

And the call to `validateAnnotations`:

```ts
  const ann = validateAnnotations(st.annotations, "state.annotations", sv);
```

- [ ] **Step 5: Update `serialize.ts`**

Open `src/renderer/model/serialize.ts`. Update imports to include the migrator:

```ts
import { migrateAnnotationsV1ToV2 } from "./migrate-v1-to-v2";
import type { MosaicFile, MosaicFileV2 } from "./schema";
```

Update `toMosaicFile`'s return: change `schemaVersion: 1` to `schemaVersion: 2` and the cast to `MosaicFileV2`. Also update its return type annotation: `): MosaicFileV2 {`.

Update `fromMosaicFile`'s parameter type: `(file: MosaicFile)` (accept either version). Inside, after destructuring `state`, call the migrator when v1:

```ts
  const annotations =
    file.schemaVersion === 1
      ? migrateAnnotationsV1ToV2(file.state.annotations as any)
      : (file.state.annotations as Annotation[]);
  const state: FigureState = {
    ...file.state,
    pool: runtimePool,
    annotations,
    outerGutter: file.state.outerGutter ?? true,
  };
```

(Add `import type { Annotation } from "./annotations";` at the top.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run test/unit/migrate-v1-to-v2.test.ts test/unit/serialize.test.ts test/unit/schema.test.ts`

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/model/schema.ts src/renderer/model/serialize.ts test/unit/serialize.test.ts test/unit/schema.test.ts
git commit -m "feat(symbols): bump schema to v2; load-time arrow->symbol migration"
```

---

## Task 7: Extend DrawCtx for Path2D, swap drawArrow for drawSymbol

**Files:**
- Modify: `src/renderer/render/draw-figure.ts`
- Modify: `src/renderer/render/draw-annotations.ts`
- Create: `test/unit/draw-symbol.test.ts`
- Delete: `test/unit/draw-arrow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/draw-symbol.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { drawAnnotations } from "../../src/renderer/render/draw-annotations";
import type { DrawCtx } from "../../src/renderer/render/draw-figure";
import type { Figure } from "../../src/renderer/model/types";
import type { SymbolAnnotation } from "../../src/renderer/model/annotations";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";

interface Call { op: string; args: unknown[]; }

function recorder(): DrawCtx & { calls: Call[]; lastFillStyle: string; lastStrokeStyle: string; lastLineWidth: number } {
  const calls: Call[] = [];
  let _fill = "";
  let _stroke = "";
  let _lw = 1;
  const ctx: any = {
    calls,
    get fillStyle() { return _fill; }, set fillStyle(v: string) { _fill = v; this.lastFillStyle = v; calls.push({ op: "set:fillStyle", args: [v] }); },
    get strokeStyle() { return _stroke; }, set strokeStyle(v: string) { _stroke = v; this.lastStrokeStyle = v; calls.push({ op: "set:strokeStyle", args: [v] }); },
    get lineWidth() { return _lw; }, set lineWidth(v: number) { _lw = v; this.lastLineWidth = v; calls.push({ op: "set:lineWidth", args: [v] }); },
    font: "", textAlign: "left", textBaseline: "top", lineCap: "butt", lineJoin: "miter",
    fillRect() {}, strokeRect() {}, fillText() {}, measureText() { return { width: 0 }; }, drawImage() {},
    save() { calls.push({ op: "save", args: [] }); },
    restore() { calls.push({ op: "restore", args: [] }); },
    beginPath() { calls.push({ op: "beginPath", args: [] }); },
    closePath() { calls.push({ op: "closePath", args: [] }); },
    rect() {}, clip() {},
    translate(x: number, y: number) { calls.push({ op: "translate", args: [x, y] }); },
    scale(x: number, y: number) { calls.push({ op: "scale", args: [x, y] }); },
    rotate(r: number) { calls.push({ op: "rotate", args: [r] }); },
    moveTo() {}, lineTo() {}, stroke(p?: Path2D) { calls.push({ op: "stroke", args: p === undefined ? [] : ["path"] }); },
    fill(p?: Path2D) { calls.push({ op: "fill", args: p === undefined ? [] : ["path"] }); },
  };
  return ctx;
}

function figure(annos: SymbolAnnotation[]): Figure {
  return {
    canvas: { widthPx: 200, heightPx: 200, background: "#FFFFFF" },
    grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFFFFF" },
    panels: [],
    annotations: annos,
    globalStyle: DEFAULT_GLOBAL_STYLE,
  };
}

describe("drawSymbol", () => {
  it("for a fill=true symbol, calls translate→rotate→scale→translate(-50,-50)→fill(path)", () => {
    const ctx = recorder();
    const a: SymbolAnnotation = {
      id: "s1", kind: "symbol", z: 0, symbolId: "arrow-filled-right",
      x: 100, y: 100, sizePx: 50, rotationDeg: 90, color: "#FF0000", strokeWidthPx: 4,
    };
    drawAnnotations(ctx, figure([a]), {
      panelRectsById: new Map(), panelsById: new Map(), imagesById: new Map(), bitmaps: new Map(),
    });
    const ops = ctx.calls.map((c) => c.op);
    const i = ops.indexOf("save");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(ops.slice(i, i + 7)).toEqual([
      "save", "translate", "rotate", "scale", "translate", "set:fillStyle", "fill",
    ]);
    expect(ctx.calls[i + 1]!.args).toEqual([100, 100]);
    expect(ctx.calls[i + 2]!.args).toEqual([(90 * Math.PI) / 180]);
    expect(ctx.calls[i + 3]!.args).toEqual([0.5, 0.5]);
    expect(ctx.calls[i + 4]!.args).toEqual([-50, -50]);
    expect(ctx.lastFillStyle).toBe("#FF0000");
  });

  it("for a fill=false symbol, divides strokeWidthPx by scale to keep visual width constant", () => {
    const ctx = recorder();
    const a: SymbolAnnotation = {
      id: "s2", kind: "symbol", z: 0, symbolId: "arrow-line-right",
      x: 0, y: 0, sizePx: 50, rotationDeg: 0, color: "#0000FF", strokeWidthPx: 4,
    };
    drawAnnotations(ctx, figure([a]), {
      panelRectsById: new Map(), panelsById: new Map(), imagesById: new Map(), bitmaps: new Map(),
    });
    expect(ctx.lastStrokeStyle).toBe("#0000FF");
    // scale = 50/100 = 0.5, so lineWidth = 4 / 0.5 = 8.
    expect(ctx.lastLineWidth).toBe(8);
    const ops = ctx.calls.map((c) => c.op);
    expect(ops).toContain("stroke");
  });

  it("renders nothing when symbolId is unknown", () => {
    const ctx = recorder();
    const a: SymbolAnnotation = {
      id: "s3", kind: "symbol", z: 0, symbolId: "no-such-symbol",
      x: 0, y: 0, sizePx: 50, rotationDeg: 0, color: "#000", strokeWidthPx: 1,
    };
    drawAnnotations(ctx, figure([a]), {
      panelRectsById: new Map(), panelsById: new Map(), imagesById: new Map(), bitmaps: new Map(),
    });
    const ops = ctx.calls.map((c) => c.op);
    expect(ops).not.toContain("fill");
    expect(ops).not.toContain("stroke");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/draw-symbol.test.ts`

Expected: FAIL — no symbol case in `drawAnnotations`, and DrawCtx doesn't accept `Path2D` args.

- [ ] **Step 3: Extend `DrawCtx` in `draw-figure.ts`**

Open `src/renderer/render/draw-figure.ts`. Update the `stroke` and `fill` member signatures so they accept an optional `Path2D`:

```ts
  stroke(path?: Path2D): void;
  fill(path?: Path2D): void;
```

- [ ] **Step 4: Replace drawArrow with drawSymbol in `draw-annotations.ts`**

Open `src/renderer/render/draw-annotations.ts`.

1. Update imports:

```ts
import type {
  LetterAnnotation,
  TextAnnotation,
  BoxAnnotation,
  SymbolAnnotation,
  ScaleBarAnnotation,
} from "../model/annotations";
import { SYMBOL_LIBRARY_BY_ID } from "../symbols/library";
```

2. In the switch in `drawAnnotations`, replace the `arrow` case with `symbol`:

```ts
      case "symbol":
        drawSymbol(ctx, a);
        break;
```

3. Delete `drawArrow` (the whole function from lines ~223-287).

4. Add `drawSymbol`:

```ts
function drawSymbol(ctx: DrawCtx, a: SymbolAnnotation): void {
  const def = SYMBOL_LIBRARY_BY_ID.get(a.symbolId);
  if (def === undefined) return;
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate((a.rotationDeg * Math.PI) / 180);
  // Library viewport is 100x100 with center at (50,50). Scale to sizePx,
  // then translate by -50,-50 so the symbol's center sits where the user
  // placed it. The order matters: scale BEFORE the -50,-50 translate so
  // the offset is in the SAME local space as the path coordinates.
  const scale = a.sizePx / 100;
  ctx.scale(scale, scale);
  ctx.translate(-50, -50);
  const path = new Path2D(def.pathD);
  if (def.fill) {
    ctx.fillStyle = a.color;
    ctx.fill(path);
  } else {
    ctx.strokeStyle = a.color;
    // Keep on-screen stroke width constant in figure-px regardless of sizePx.
    ctx.lineWidth = a.strokeWidthPx / scale;
    ctx.stroke(path);
  }
  ctx.restore();
}
```

- [ ] **Step 5: Delete the old arrow-specific test**

```bash
git rm test/unit/draw-arrow.test.ts
```

- [ ] **Step 6: Update `draw-figure.test.ts` and any other test that built arrow annotation fixtures**

Open `test/unit/draw-figure.test.ts`. Replace any `arrow` fixtures with `symbol` fixtures using `arrow-filled-right`, `x: midpoint`, `y: midpoint`, `sizePx: 60`, `rotationDeg: 0`, `color: …`, `strokeWidthPx: 2`.

Repeat for any other tests that turned up in the earlier `grep -l ArrowAnnotation` search and weren't already addressed.

- [ ] **Step 7: Run all draw + figure tests**

Run: `pnpm vitest run test/unit/draw-symbol.test.ts test/unit/draw-figure.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/render/draw-figure.ts src/renderer/render/draw-annotations.ts test/unit/draw-symbol.test.ts test/unit/draw-figure.test.ts
git rm test/unit/draw-arrow.test.ts
git commit -m "feat(symbols): drawSymbol renders Path2D with translate/rotate/scale"
```

---

## Task 8: Toolbar — replace "Arrow" with "Symbol"

**Files:**
- Modify: `src/renderer/components/Toolbar/AnnotationToolbar.tsx`
- Modify: any test that asserted the arrow toolbar button.

- [ ] **Step 1: Find tests that assert the arrow toolbar button**

Run: `grep -rn 'anno-tool-arrow\|"arrow"' test/unit | head`

For any test that selects `anno-tool-arrow`, update it to `anno-tool-symbol`.

- [ ] **Step 2: Update the toolbar**

Open `src/renderer/components/Toolbar/AnnotationToolbar.tsx`. Change the `Tool` type and the entry in `TOOLS`:

```ts
export type Tool = "select" | "text" | "symbol" | "box" | "scalebar";

const TOOLS: ReadonlyArray<{ id: Tool; label: string; title: string }> = [
  { id: "select", label: "Select", title: "Select and move annotations" },
  { id: "text", label: "Text", title: "Add text — click to place" },
  { id: "symbol", label: "Symbol", title: "Add symbol — click to place" },
  { id: "box", label: "Box", title: "Add box — drag to draw" },
  { id: "scalebar", label: "Scale", title: "Add scale bar — click a panel" },
];
```

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run test/unit/annotation-interaction-layer.test.tsx` (and any explicit toolbar test).

Expected: typecheck failures in the interaction layer (handled in Task 9). Tests for the toolbar itself should now pass.

- [ ] **Step 4: Commit (still not buildable end-to-end, OK)**

```bash
git add src/renderer/components/Toolbar/AnnotationToolbar.tsx
# plus any test files updated
git commit -m "refactor(symbols): rename Arrow tool to Symbol"
```

---

## Task 9: Interaction layer — click-to-place + symbol handles

**Files:**
- Modify: `src/renderer/components/Annotations/AnnotationInteractionLayer.tsx`
- Modify: `test/unit/annotation-interaction-layer.test.tsx`

This task is the largest UX change. We'll do it in pieces.

- [ ] **Step 1: Update existing arrow tests in the interaction-layer test file**

Open `test/unit/annotation-interaction-layer.test.tsx`. Find any test that:
- selects tool "arrow"
- builds an `arrow` annotation fixture
- asserts arrow endpoint handles

Rewrite all to symbols:
- Tool "symbol".
- The creation gesture is a single click: `pointerdown` on (x, y) followed by `pointerup` at the **same** coords (no drag).
- The dispatched `ADD_ANNOTATION` payload is a `SymbolAnnotation` with `symbolId: "arrow-filled-right"` (default), `x`, `y` at the click position, `sizePx: 60`, `rotationDeg: 0`, default color `#FF0000`, `strokeWidthPx: 2`.
- For selection chrome, the symbol shows 4 corner handles (`anno-symbol-handle-tl/tr/bl/br`) and 1 rotation handle (`anno-symbol-handle-rotate`).

- [ ] **Step 2: Run failing test**

Run: `pnpm vitest run test/unit/annotation-interaction-layer.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement creation gesture: click-to-place**

Open `src/renderer/components/Annotations/AnnotationInteractionLayer.tsx`. Locate `onLayerPointerDown`. The current arrow/box branch starts a drag. Split it:

```ts
    if (activeTool === "symbol") {
      // Click-to-place: drop a symbol at this point. No drag-to-size.
      const ann: SymbolAnnotation = {
        id: newAnnoId(),
        kind: "symbol",
        z: Z_SYMBOL,
        symbolId: lastSymbolIdRef.current ?? DEFAULT_SYMBOL_ID,
        x: c.fx,
        y: c.fy,
        sizePx: DEFAULT_SYMBOL_SIZE,
        rotationDeg: 0,
        color: DEFAULT_SYMBOL_COLOR,
        strokeWidthPx: DEFAULT_SYMBOL_STROKE,
      };
      // Image-bind if dropped over an image-bearing panel.
      const ctx = imageContextAt(c.fx, c.fy, figure, panelRectsById, imagesById);
      if (ctx !== null && ctx.panel.panelId !== undefined) {
        const anchor = anchorFromFigure(c.fx, c.fy, ctx);
        if (anchor !== null) {
          ann.imageId = ctx.imageId;
          ann.panelId = ctx.panel.panelId;
          ann.anchor = anchor;
        }
      }
      dispatch(addAnnotation(ann));
      onSelectAnnotation(ann.id);
      return;
    }

    // box: begin a drag. (arrow branch is gone.)
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      pointerId: e.pointerId,
      kind: "create-box",
      startFx: c.fx,
      startFy: c.fy,
      curFx: c.fx,
      curFy: c.fy,
    });
```

Add the constants and a ref near the existing `DEFAULT_*` constants:

```ts
import { DEFAULT_SYMBOL_ID } from "../../symbols/library";

const DEFAULT_SYMBOL_SIZE = 60;
const DEFAULT_SYMBOL_COLOR = "#FF0000";
const DEFAULT_SYMBOL_STROKE = 2;
const Z_SYMBOL = 1;
```

`lastSymbolIdRef` retains the last user-picked symbol across clicks (so the user can pick "shape-circle" once and click multiple times to drop circles). Add it inside the component:

```ts
  const lastSymbolIdRef = useRef<string>(DEFAULT_SYMBOL_ID);
```

Wire it: when the user updates `symbolId` via the form, the form calls `dispatch(updateAnnotation(...))` directly. Read the updated symbol back in `lastSymbolIdRef` from a `useEffect` that watches `figure.annotations` for the selected annotation:

```ts
  useEffect(() => {
    if (selectedAnnotationId === null) return;
    const a = figure.annotations.find((x) => x.id === selectedAnnotationId);
    if (a !== undefined && a.kind === "symbol") {
      lastSymbolIdRef.current = a.symbolId;
    }
  }, [selectedAnnotationId, figure.annotations]);
```

- [ ] **Step 4: Remove arrow-creation drag branch + arrow-endpoint handles**

In the same file:
1. Remove `case "arrow"` from the `onHitPointerMove` switch and replace with a `case "symbol"`:

```ts
      case "symbol": {
        const nx = start.x + dx;
        const ny = start.y + dy;
        patch = { x: nx, y: ny };
        if (start.imageId !== undefined) {
          const ctx = imageContextAt(nx, ny, figure, panelRectsById, imagesById);
          if (ctx !== null && ctx.imageId === start.imageId) {
            const a = anchorFromFigure(nx, ny, ctx);
            if (a !== null) (patch as Partial<SymbolAnnotation>).anchor = a;
          }
        }
        break;
      }
```

2. Remove the entire `onArrowEndpointPointerDown/Move/Up` block and the `arrow-endpoint` `kind` from `DragState`.

3. Remove the JSX that renders arrow endpoint handles (the `selected.kind === "arrow"` block, lines ~1158-1190).

4. Remove the create-arrow drag preview (the `<svg data-testid="anno-preview-arrow">` block, lines ~1251-1272).

5. Remove `"create-arrow"` from the `DragState.kind` union (we now click-to-place; no drag).

6. Delete the `if (drag.kind === "create-arrow")` branch inside `onLayerPointerUp` (and the `DEFAULT_ARROW_*` constants — they're no longer used, but keep `DEFAULT_BOX_*`).

- [ ] **Step 5: Add symbol corner handles + rotation handle**

In `DragState`, add `"symbol-corner" | "symbol-rotate"` to the `kind` union and add fields:

```ts
  /** Which corner is being dragged ("symbol-corner" only). */
  symbolCorner?: "tl" | "tr" | "bl" | "br";
```

Add handlers:

```ts
function onSymbolCornerPointerDown(
  e: React.PointerEvent<HTMLDivElement>,
  a: SymbolAnnotation,
  corner: "tl" | "tr" | "bl" | "br",
): void {
  if (e.button !== 0) return;
  e.stopPropagation();
  onSelectAnnotation(a.id);
  const c = clientToFigure(e);
  if (c === null) return;
  e.currentTarget.setPointerCapture(e.pointerId);
  setDrag({
    pointerId: e.pointerId,
    kind: "symbol-corner",
    startFx: c.fx,
    startFy: c.fy,
    curFx: c.fx,
    curFy: c.fy,
    movingId: a.id,
    startAnno: a,
    symbolCorner: corner,
  });
}

function onSymbolCornerPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
  if (drag === null || drag.kind !== "symbol-corner" || drag.pointerId !== e.pointerId) return;
  const c = clientToFigure(e);
  if (c === null) return;
  const start = drag.startAnno;
  if (start === undefined || start.kind !== "symbol" || drag.movingId === undefined) return;
  // Resize from corner: distance from symbol center sets the new sizePx,
  // doubled (since sizePx is the full diagonal-square edge, not a half-extent).
  const cx = start.x;
  const cy = start.y;
  const half = Math.max(4, Math.max(Math.abs(c.fx - cx), Math.abs(c.fy - cy)));
  const patch: Partial<SymbolAnnotation> = { sizePx: half * 2 };
  dispatch(updateAnnotation(drag.movingId, patch));
}

function onSymbolCornerPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
  if (drag === null || drag.kind !== "symbol-corner" || drag.pointerId !== e.pointerId) return;
  if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  setDrag(null);
}

function onSymbolRotatePointerDown(
  e: React.PointerEvent<HTMLDivElement>,
  a: SymbolAnnotation,
): void {
  if (e.button !== 0) return;
  e.stopPropagation();
  onSelectAnnotation(a.id);
  const c = clientToFigure(e);
  if (c === null) return;
  e.currentTarget.setPointerCapture(e.pointerId);
  setDrag({
    pointerId: e.pointerId,
    kind: "symbol-rotate",
    startFx: c.fx,
    startFy: c.fy,
    curFx: c.fx,
    curFy: c.fy,
    movingId: a.id,
    startAnno: a,
  });
}

function onSymbolRotatePointerMove(e: React.PointerEvent<HTMLDivElement>): void {
  if (drag === null || drag.kind !== "symbol-rotate" || drag.pointerId !== e.pointerId) return;
  const c = clientToFigure(e);
  if (c === null) return;
  const start = drag.startAnno;
  if (start === undefined || start.kind !== "symbol" || drag.movingId === undefined) return;
  const angleRad = Math.atan2(c.fy - start.y, c.fx - start.x);
  const rotationDeg = (angleRad * 180) / Math.PI;
  const patch: Partial<SymbolAnnotation> = { rotationDeg };
  dispatch(updateAnnotation(drag.movingId, patch));
}

function onSymbolRotatePointerUp(e: React.PointerEvent<HTMLDivElement>): void {
  if (drag === null || drag.kind !== "symbol-rotate" || drag.pointerId !== e.pointerId) return;
  if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  setDrag(null);
}
```

- [ ] **Step 6: Update `annoBounds` for symbol**

Replace the `case "arrow":` in `annoBounds` (lines ~265-271) with:

```ts
    case "symbol": {
      const half = a.sizePx / 2;
      return { x: a.x - half, y: a.y - half, w: a.sizePx, h: a.sizePx };
    }
```

- [ ] **Step 7: Render the four corner handles + rotation handle when a symbol is selected**

In the JSX block where the arrow endpoint handles previously lived, render symbol handles instead:

```tsx
{activeTool === "select" &&
  selected !== undefined &&
  selected.kind === "symbol" && (
    <>
      {(
        [
          ["tl", selected.x - selected.sizePx / 2, selected.y - selected.sizePx / 2, "nwse-resize"],
          ["tr", selected.x + selected.sizePx / 2, selected.y - selected.sizePx / 2, "nesw-resize"],
          ["bl", selected.x - selected.sizePx / 2, selected.y + selected.sizePx / 2, "nesw-resize"],
          ["br", selected.x + selected.sizePx / 2, selected.y + selected.sizePx / 2, "nwse-resize"],
        ] as const
      ).map(([corner, fx, fy, cursor]) => (
        <div
          key={`symbol-handle-${corner}`}
          data-testid={`anno-symbol-handle-${corner}`}
          onPointerDown={(e) => onSymbolCornerPointerDown(e, selected, corner)}
          onPointerMove={onSymbolCornerPointerMove}
          onPointerUp={onSymbolCornerPointerUp}
          onPointerCancel={onSymbolCornerPointerUp}
          style={{
            position: "absolute",
            left: fx * figToCssX - HANDLE_PX / 2,
            top: fy * figToCssY - HANDLE_PX / 2,
            width: HANDLE_PX,
            height: HANDLE_PX,
            background: "#0066FF",
            pointerEvents: "auto",
            cursor,
            zIndex: 4,
          }}
        />
      ))}
      {/* Rotation handle: small disc above the top edge. */}
      <div
        data-testid="anno-symbol-handle-rotate"
        onPointerDown={(e) => onSymbolRotatePointerDown(e, selected)}
        onPointerMove={onSymbolRotatePointerMove}
        onPointerUp={onSymbolRotatePointerUp}
        onPointerCancel={onSymbolRotatePointerUp}
        style={{
          position: "absolute",
          left: selected.x * figToCssX - HANDLE_PX / 2,
          top: (selected.y - selected.sizePx / 2 - 16) * figToCssY - HANDLE_PX / 2,
          width: HANDLE_PX,
          height: HANDLE_PX,
          borderRadius: HANDLE_PX,
          background: "#0066FF",
          pointerEvents: "auto",
          cursor: "grab",
          zIndex: 4,
        }}
      />
    </>
  )}
```

- [ ] **Step 8: Update the cursor for the symbol tool**

In the `cursor` ternary near the bottom of the component, add:

```ts
  const cursor =
    activeTool === "text" ? "text"
    : activeTool === "symbol" ? "crosshair"
    : activeTool === "box" ? "crosshair"
    : activeTool === "scalebar" ? "cell"
    : "default";
```

- [ ] **Step 9: Run the interaction-layer tests**

Run: `pnpm vitest run test/unit/annotation-interaction-layer.test.tsx`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/components/Annotations/AnnotationInteractionLayer.tsx test/unit/annotation-interaction-layer.test.tsx
git commit -m "feat(symbols): click-to-place + corner/rotation handles in interaction layer"
```

---

## Task 10: SymbolAnnoForm component

**Files:**
- Create: `src/renderer/components/Properties/SymbolAnnoForm.tsx`
- Delete: `src/renderer/components/Properties/ArrowAnnoForm.tsx`
- Modify: `src/renderer/components/Properties/AnnotationPropertiesForm.tsx`
- Modify: `src/renderer/styles.css`
- Create: `test/unit/symbol-anno-form.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `test/unit/symbol-anno-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SymbolAnnoForm } from "../../src/renderer/components/Properties/SymbolAnnoForm";
import type { SymbolAnnotation } from "../../src/renderer/model/annotations";

const makeAnno = (overrides: Partial<SymbolAnnotation> = {}): SymbolAnnotation => ({
  id: "s1",
  kind: "symbol",
  z: 0,
  symbolId: "arrow-filled-right",
  x: 0,
  y: 0,
  sizePx: 60,
  rotationDeg: 0,
  color: "#FF0000",
  strokeWidthPx: 2,
  ...overrides,
});

const noopCommit = { markDirty: () => {}, flush: () => {} };

describe("SymbolAnnoForm", () => {
  it("renders gallery groups for each category", () => {
    const dispatch = vi.fn();
    const { getAllByTestId } = render(
      <SymbolAnnoForm anno={makeAnno()} dispatch={dispatch} commit={noopCommit} />,
    );
    expect(getAllByTestId(/^symbol-gallery-group-/).length).toBe(4);
  });

  it("clicking a non-active gallery cell dispatches UPDATE_ANNOTATION with that symbolId", () => {
    const dispatch = vi.fn();
    const { getByTestId } = render(
      <SymbolAnnoForm anno={makeAnno()} dispatch={dispatch} commit={noopCommit} />,
    );
    fireEvent.click(getByTestId("symbol-gallery-cell-shape-circle"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ANNOTATION",
      annotationId: "s1",
      patch: { symbolId: "shape-circle" },
    });
  });

  it("rotation reset button dispatches rotationDeg=0", () => {
    const dispatch = vi.fn();
    const anno = makeAnno({ rotationDeg: 137 });
    const { getByTestId } = render(
      <SymbolAnnoForm anno={anno} dispatch={dispatch} commit={noopCommit} />,
    );
    fireEvent.click(getByTestId("symbol-rotate-reset"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ANNOTATION",
      annotationId: "s1",
      patch: { rotationDeg: 0 },
    });
  });

  it("stroke-width input is disabled for fill symbols", () => {
    const dispatch = vi.fn();
    const { getByTestId } = render(
      <SymbolAnnoForm anno={makeAnno({ symbolId: "shape-circle" })} dispatch={dispatch} commit={noopCommit} />,
    );
    expect((getByTestId("symbol-stroke-width") as HTMLInputElement).disabled).toBe(true);
  });

  it("stroke-width input is enabled for stroke symbols", () => {
    const dispatch = vi.fn();
    const { getByTestId } = render(
      <SymbolAnnoForm anno={makeAnno({ symbolId: "marker-tick" })} dispatch={dispatch} commit={noopCommit} />,
    );
    expect((getByTestId("symbol-stroke-width") as HTMLInputElement).disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/symbol-anno-form.test.tsx`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `SymbolAnnoForm.tsx`**

Create `src/renderer/components/Properties/SymbolAnnoForm.tsx`:

```tsx
import type { Dispatch } from "react";
import type { SymbolAnnotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import { updateAnnotation, removeAnnotation } from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import {
  SYMBOL_LIBRARY,
  SYMBOL_LIBRARY_BY_ID,
  SYMBOL_CATEGORIES,
} from "../../symbols/library";
import { ColorField } from "./inputs/ColorField";
import { NumberField } from "./inputs/NumberField";

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
  const isFilled = def?.fill === true;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Symbol</div>
        <div className="symbol-gallery">
          {SYMBOL_CATEGORIES.map((cat) => (
            <div
              key={cat}
              className="symbol-gallery-group"
              data-testid={`symbol-gallery-group-${cat}`}
            >
              <div className="symbol-gallery-label">{cat}</div>
              <div className="symbol-gallery-row">
                {SYMBOL_LIBRARY.filter((s) => s.category === cat).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title={s.label}
                    data-testid={`symbol-gallery-cell-${s.id}`}
                    aria-pressed={s.id === anno.symbolId}
                    className={
                      "symbol-gallery-cell" +
                      (s.id === anno.symbolId ? " is-active" : "")
                    }
                    onClick={() => patch({ symbolId: s.id }, true)}
                  >
                    <svg viewBox="0 0 100 100" width={24} height={24}>
                      <path
                        d={s.pathD}
                        fill={s.fill ? "currentColor" : "none"}
                        stroke={s.fill ? "none" : "currentColor"}
                        strokeWidth={s.fill ? 0 : 6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ColorField
        label="Color"
        value={anno.color}
        onChange={(color) => patch({ color })}
        onBlur={commit.flush}
      />
      <NumberField
        label="Size (px)"
        value={anno.sizePx}
        min={4}
        max={2000}
        onChange={(sizePx) => patch({ sizePx })}
        onBlur={commit.flush}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <NumberField
          label="Rotation (°)"
          value={Math.round(anno.rotationDeg)}
          min={-360}
          max={720}
          onChange={(rotationDeg) => patch({ rotationDeg })}
          onBlur={commit.flush}
        />
        <button
          type="button"
          className="btn"
          data-testid="symbol-rotate-reset"
          onClick={() => patch({ rotationDeg: 0 }, true)}
        >
          Reset
        </button>
      </div>
      <NumberField
        label="Stroke width (px)"
        value={anno.strokeWidthPx}
        min={0}
        max={32}
        // For fill symbols, the stroke width is ignored at draw time.
        // Disable rather than hide so users can see the field while comparing
        // symbol kinds across the gallery without the form jumping.
        disabled={isFilled}
        data-testid="symbol-stroke-width"
        onChange={(strokeWidthPx) => patch({ strokeWidthPx })}
        onBlur={commit.flush}
      />
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

If `NumberField` does NOT currently accept a `disabled` prop, add it. Open `src/renderer/components/Properties/inputs/NumberField.tsx` and add `disabled?: boolean` to the props, plumb it onto the `<input>`. Add a `data-testid?: string` prop too (used by the test); default-undefined.

- [ ] **Step 4: Wire `SymbolAnnoForm` into `AnnotationPropertiesForm.tsx`**

Open `src/renderer/components/Properties/AnnotationPropertiesForm.tsx`. Replace the `arrow` case:

```tsx
import { SymbolAnnoForm } from "./SymbolAnnoForm";
// (delete the ArrowAnnoForm import)

  switch (anno.kind) {
    case "text":
      return <TextAnnoForm anno={anno} dispatch={dispatch} commit={commit} />;
    case "symbol":
      return <SymbolAnnoForm anno={anno} dispatch={dispatch} commit={commit} />;
    case "box":
      return <BoxAnnoForm anno={anno} dispatch={dispatch} commit={commit} />;
    case "scalebar":
      return <ScalebarAnnoForm anno={anno} dispatch={dispatch} commit={commit} />;
  }
```

- [ ] **Step 5: Add CSS for the gallery**

Open `src/renderer/styles.css`. Append:

```css
/* Symbol gallery (properties panel) */
.symbol-gallery { display: flex; flex-direction: column; gap: 8px; }
.symbol-gallery-group { display: flex; flex-direction: column; gap: 4px; }
.symbol-gallery-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-text-muted, #888);
}
.symbol-gallery-row {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.symbol-gallery-cell {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--c-surface, #FFF);
  border: 1px solid var(--c-border, #DDD);
  border-radius: 4px;
  color: var(--c-text, #333);
  cursor: pointer;
  padding: 0;
}
.symbol-gallery-cell:hover { background: var(--c-surface-hover, #F4F4F4); }
.symbol-gallery-cell.is-active {
  border-color: var(--c-accent, #0066FF);
  box-shadow: 0 0 0 1px var(--c-accent, #0066FF) inset;
}
```

- [ ] **Step 6: Delete `ArrowAnnoForm.tsx`**

```bash
git rm src/renderer/components/Properties/ArrowAnnoForm.tsx
```

- [ ] **Step 7: Run the form test**

Run: `pnpm vitest run test/unit/symbol-anno-form.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/Properties/SymbolAnnoForm.tsx src/renderer/components/Properties/AnnotationPropertiesForm.tsx src/renderer/components/Properties/inputs/NumberField.tsx src/renderer/styles.css test/unit/symbol-anno-form.test.tsx
git rm src/renderer/components/Properties/ArrowAnnoForm.tsx
git commit -m "feat(symbols): SymbolAnnoForm with category-grouped gallery + rotation reset"
```

---

## Task 11: Update remaining tests + clean up

**Files:**
- Modify: `test/unit/figure-actions.test.ts`
- Modify: any other test that still references `kind: "arrow"` or `ArrowAnnotation`.

- [ ] **Step 1: Find lingering arrow refs**

Run: `grep -rn 'kind: *"arrow"\|ArrowAnnotation\|drawArrow' src test`

Expected: zero matches. Any matches need cleanup — most likely in test fixtures.

- [ ] **Step 2: Update each match to symbol shape**

For each test that references `kind: "arrow"`, rewrite the fixture to a `symbol` shape (default `arrow-filled-right`, midpoint x/y, sizePx, etc.).

- [ ] **Step 3: Full test suite**

Run: `pnpm test`

Expected: all PASS.

- [ ] **Step 4: Full typecheck + lint**

Run: `pnpm typecheck && pnpm lint`

Expected: zero errors, zero warnings.

- [ ] **Step 5: Commit any cleanup**

```bash
git add -p
git commit -m "chore(symbols): mop up trailing arrow references in tests"
```

---

## Task 12: Manual smoke test

**Files:** none (runtime verification).

- [ ] **Step 1: Start the dev app**

Run: `pnpm dev`

- [ ] **Step 2: Verify symbol creation flow**

In the app:
1. Click the **Symbol** button in the annotation toolbar.
2. Click somewhere on the canvas.
3. Confirm a red filled-right arrow symbol appears at the click point.
4. The properties panel shows the gallery grid with 4 categories and `arrow-filled-right` highlighted.
5. Click `shape-circle` in the gallery — the symbol on the canvas changes to a circle.
6. Drag a corner handle to resize.
7. Drag the rotation handle to rotate.
8. Click `Reset` next to the rotation field — rotation snaps back to 0.

- [ ] **Step 3: Verify undo/redo**

1. Place a symbol.
2. Resize it.
3. Press Cmd+Z (or whatever the project uses) — verify the resize undoes (one undo step), then again to remove the symbol.

- [ ] **Step 4: Verify a v1 file loads**

1. Open a `.mosaic` file saved before this change (one with arrow annotations).
2. Confirm: no errors. Each previous arrow is now a symbol with the matching `arrow-*-right` symbolId. The midpoint and orientation roughly match the original arrow.

- [ ] **Step 5: Verify export**

1. Add several symbols (mix of arrow, circle, asterisk, curly bracket).
2. PNG export → open the PNG → confirm symbols render identically to the editor.
3. PDF export → open the PDF → confirm symbols render at the expected physical size and orientation.

- [ ] **Step 6: Commit (no code changes; smoke-test gate only)**

No commit if no changes. If you noticed and patched anything during smoke (e.g. a CSS variable name that's wrong in the project's theme), commit that small fix:

```bash
git commit -m "fix(symbols): polish from smoke test"
```

---

## Task 13: Open PR

**Files:** none.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin qa-feedback/symbol-library
```

- [ ] **Step 2: Open the PR**

Use the project's preferred PR command (e.g. `gh pr create`) with title:

> feat(qa-feedback): replace arrow with curated symbol library (spec 06)

Body should include:
- Link to `docs/superpowers/specs/2026-05-08-qa-feedback/06-symbol-library.md`.
- Acceptance criteria from that spec, each checked.
- Note on the schemaVersion bump (v1 → v2) and migration path.

- [ ] **Step 3: Verify CI**

Wait for `pnpm test`, `pnpm typecheck`, `pnpm lint` to pass on CI. If anything fails on CI but passed locally, address before merge.

---

## Self-review checklist

Done after writing the plan, before handoff:

- **Spec coverage** — every spec section has at least one task: ✅ symbol library (T1), annotation model (T2), schema bump + migration (T5+T6), toolbar rename (T8), creation flow (T9), properties panel gallery (T10), draw helper (T7), hit-testing via square rect (T9 step 6), files-touched list covered (T1-T11), acceptance items covered (T12 manual smoke), out-of-scope items respected (no custom SVGs, no fill-toggle per symbol).
- **Placeholder scan** — no "TBD", "etc.", "appropriate validation"; every code step has the actual code; the symbol library has concrete `pathD` strings.
- **Type consistency** — `SymbolAnnotation` field names match across tasks; `Tool` union value `"symbol"` matches everywhere; `symbolId` (not `symbolID`) is consistent; `DEFAULT_SYMBOL_ID` is exported from library and consumed in interaction layer; the migration helper's input shape (`V1ArrowAnnotation`) matches the v1 schema.
- **Test placement** — all tests live in `test/unit/*.test.ts(x)` per project convention. The `// @vitest-environment jsdom` directive is used where DOM/SVG/Path2D APIs are required.
