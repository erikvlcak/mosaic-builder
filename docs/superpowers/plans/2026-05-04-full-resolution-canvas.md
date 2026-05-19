# Full-Resolution Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop hardcoding the figure pixel canvas at 800×600 so large source images (TIFFs especially) render and export at their true resolution; rescale annotations whenever the canvas dimensions change so they stay anchored.

**Architecture:** Move `canvas: { widthPx, heightPx }` into `FigureState` as a derived-but-stored field. Add a pure `computeCanvasDims(pool, rows, cols, gutterPx)` helper. Recompute and store the new dims (and proportionally scale stored annotation coordinates) inside the reducer for the four actions that affect the formula: `ADD_TO_POOL`, `REMOVE_FROM_POOL`, `RESIZE_GRID`, `SET_GUTTER_PX`. Wire `App.tsx` and the serializer to use `state.canvas` instead of hardcoded constants. CSS box stays 800×600; the canvas backing store grows. Lossless export paths (PNG, TIFF, PDF) become byte-faithful for free; JPEG remains opt-in lossy.

**Tech Stack:** TypeScript, React 18, Vitest, Electron renderer process. No new deps.

---

## File Structure

**New files:**

- `src/renderer/model/canvas-dims.ts` — pure helpers `computeCanvasDims` and `scaleAnnotations`. Kept separate from `figure-actions.ts` so the unit tests are focused and the reducer file doesn't grow.
- `test/unit/canvas-dims.test.ts` — tests for the two pure helpers.

**Modified files:**

- `src/renderer/model/figure-state.ts` — add `canvas: { widthPx; heightPx }` field; initialize at `MIN_CANVAS_W/H`.
- `src/renderer/model/figure-actions.ts` — recompute canvas + scale annotations in 4 actions.
- `src/renderer/model/serialize.ts` — read `state.canvas`; map to/from on-disk top-level `file.canvas`.
- `src/renderer/state/load-project.ts` — no signature change; depends on serializer change.
- `src/renderer/App.tsx` — remove `FIGURE_PX_W/H`; pass `state.canvas.widthPx/heightPx` everywhere.
- Existing tests under `test/unit/` that pass `canvas: { widthPx: 800, heightPx: 600, ... }` to the serializer continue working unchanged because the input shape is unchanged for that path.

---

## Task 1: Add canvas field to FigureState

**Files:**

- Modify: `src/renderer/model/figure-state.ts`
- Modify: `test/unit/figure-state.test.ts`

- [ ] **Step 1: Add the failing test**

Edit `test/unit/figure-state.test.ts`. Inside the existing `describe("initialFigureState — M6 shape", ...)` block, add this `it` block after the existing two:

```typescript
it("includes a canvas with default 800x600 dims", () => {
  const s = initialFigureState();
  expect(s.canvas).toEqual({ widthPx: 800, heightPx: 600 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- figure-state`
Expected: FAIL — `Property 'canvas' does not exist on type 'FigureState'` (TypeScript) or runtime `expected undefined to deeply equal …`.

- [ ] **Step 3: Add the field to the type and initial state**

Edit `src/renderer/model/figure-state.ts`. After the `letterOverrides` field in the `FigureState` interface, add:

```typescript
/**
 * Figure pixel dimensions. Derived from `pool + rows + cols + gutterPx`
 * by `computeCanvasDims` and recomputed inside the reducer whenever
 * those inputs change. Stored (rather than recomputed at every render)
 * because annotation coordinates need a stable previous value to scale
 * against on every recompute.
 */
canvas: {
  widthPx: number;
  heightPx: number;
}
```

Add at the top of the file, alongside the other constants:

```typescript
export const MIN_CANVAS_W = 800;
export const MIN_CANVAS_H = 600;
```

Update `initialFigureState()` to include the new field:

```typescript
export function initialFigureState(): FigureState {
  return {
    pool: [],
    panels: defaultPanels(2, 2),
    rows: 2,
    cols: 2,
    gutterPx: 12,
    gutterColor: "#FFFFFF",
    annotations: [],
    globalStyle: DEFAULT_GLOBAL_STYLE,
    letterOverrides: {},
    canvas: { widthPx: MIN_CANVAS_W, heightPx: MIN_CANVAS_H },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- figure-state`
Expected: PASS (3 passing).

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS. Reasoning: every reducer case in `figure-actions.ts` returns `{ ...s, ... }`, which already carries the new `canvas` field through automatically. `RESET_FIGURE` returns `initialFigureState()` (which now includes `canvas`). `RESET_TO_STATE` takes a full state from the action's payload — that's the caller's responsibility, no reducer change needed.

If typecheck fails for serialize.ts (re `file.canvas` vs `state.canvas`), that's expected and gets fixed in Task 5. For Task 1, leave serialize.ts alone if errors there are about the new state field — they will resolve once Task 5 is complete. To make the test for Task 1 pass on its own without Task 5, no change to serialize.ts is needed because `initialFigureState()` already carries `canvas` through `{ ...inp.state }` spreads.

If typecheck fails for any test file that builds a hand-rolled `FigureState` literal without spreading `initialFigureState()`, add `canvas: { widthPx: 800, heightPx: 600 }` to that fixture. Search: `grep -rn "rows: [0-9]" test/unit/*.ts | grep -v initialFigureState` to find candidates.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/model/figure-state.ts test/unit/figure-state.test.ts
git commit -m "feat(canvas): add canvas dims field to FigureState

Adds canvas: { widthPx, heightPx } as a stored field on FigureState,
initialized to 800x600. No reducer logic yet; subsequent commits wire
in the recompute on pool/grid changes."
```

---

## Task 2: Pure helper — computeCanvasDims

**Files:**

- Create: `src/renderer/model/canvas-dims.ts`
- Create: `test/unit/canvas-dims.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/unit/canvas-dims.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { ImagePoolItem } from "../../src/renderer/model/pool";
import { computeCanvasDims } from "../../src/renderer/model/canvas-dims";

const MIN_W = 800;
const MIN_H = 600;

function img(width: number, height: number): ImagePoolItem {
  return {
    id: `${width}x${height}`,
    filename: "x.png",
    filePath: "/x.png",
    mime: "image/png",
    width,
    height,
    bitDepth: 8,
  };
}

describe("computeCanvasDims", () => {
  it("returns the minimum 800x600 for an empty pool", () => {
    const d = computeCanvasDims([], 2, 2, 12);
    expect(d).toEqual({ widthPx: MIN_W, heightPx: MIN_H });
  });

  it("returns the minimum when all pool images fit inside a single cell at min canvas", () => {
    const d = computeCanvasDims([img(100, 100)], 2, 2, 12);
    // single cell at 800x600 / 2x2 with 12px gutters easily fits 100x100
    expect(d).toEqual({ widthPx: MIN_W, heightPx: MIN_H });
  });

  it("grows widthPx so the largest image fits a single cell on the X axis", () => {
    // 1x1 grid, 12px gutter → widthPx = 1*4000 + 2*12 = 4024 (≥ MIN_W).
    const d = computeCanvasDims([img(4000, 100)], 1, 1, 12);
    expect(d.widthPx).toBe(4024);
    // height stays at MIN_H since the largest image is short.
    expect(d.heightPx).toBe(MIN_H);
  });

  it("grows heightPx so the largest image fits a single cell on the Y axis", () => {
    const d = computeCanvasDims([img(100, 3000)], 1, 1, 12);
    expect(d.heightPx).toBe(3024);
    expect(d.widthPx).toBe(MIN_W);
  });

  it("scales width with cols (2 cols, 4000-wide image → 4000*2 + 3*12)", () => {
    const d = computeCanvasDims([img(4000, 100)], 1, 2, 12);
    expect(d.widthPx).toBe(4000 * 2 + 3 * 12);
  });

  it("scales height with rows (3 rows, 3000-tall image → 3000*3 + 4*12)", () => {
    const d = computeCanvasDims([img(100, 3000)], 3, 1, 12);
    expect(d.heightPx).toBe(3000 * 3 + 4 * 12);
  });

  it("uses the per-axis maximum across mixed-aspect images", () => {
    // image A is wide (4000x100); image B is tall (100x3000). Per-axis max:
    // width-axis → 4000, height-axis → 3000.
    const d = computeCanvasDims([img(4000, 100), img(100, 3000)], 1, 1, 12);
    expect(d.widthPx).toBe(4024);
    expect(d.heightPx).toBe(3024);
  });

  it("respects gutter changes", () => {
    const d0 = computeCanvasDims([img(4000, 3000)], 1, 1, 0);
    expect(d0).toEqual({ widthPx: 4000, heightPx: 3000 });
    const d40 = computeCanvasDims([img(4000, 3000)], 1, 1, 40);
    expect(d40).toEqual({ widthPx: 4000 + 2 * 40, heightPx: 3000 + 2 * 40 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- canvas-dims`
Expected: FAIL — module `../../src/renderer/model/canvas-dims` not found.

- [ ] **Step 3: Implement computeCanvasDims**

Create `src/renderer/model/canvas-dims.ts`:

```typescript
import type { ImagePoolItem } from "./pool";
import { MIN_CANVAS_W, MIN_CANVAS_H } from "./figure-state";

/**
 * Compute figure canvas pixel dims from the pool + grid + gutter. Sized
 * so that the largest source image (per axis, across the pool) maps 1:1
 * onto a single cell at fit:contain. Merged panels span N cells and so
 * automatically receive N× the pixels — no extra math needed for them.
 *
 * Always at least `MIN_CANVAS_W × MIN_CANVAS_H` so an empty figure still
 * has a usable size.
 *
 * Inversion of computePanelRects's per-axis cell math:
 *   widthPx  = cols * cellW + (cols + 1) * gutter, with cellW ≥ maxImgW
 *   heightPx = rows * cellH + (rows + 1) * gutter, with cellH ≥ maxImgH
 */
export function computeCanvasDims(
  pool: readonly ImagePoolItem[],
  rows: number,
  cols: number,
  gutterPx: number,
): { widthPx: number; heightPx: number } {
  let maxW = 0;
  let maxH = 0;
  for (const item of pool) {
    if (item.width > maxW) maxW = item.width;
    if (item.height > maxH) maxH = item.height;
  }
  const widthPx = Math.max(MIN_CANVAS_W, cols * maxW + (cols + 1) * gutterPx);
  const heightPx = Math.max(MIN_CANVAS_H, rows * maxH + (rows + 1) * gutterPx);
  return { widthPx, heightPx };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- canvas-dims`
Expected: PASS — 8 passing.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/model/canvas-dims.ts test/unit/canvas-dims.test.ts
git commit -m "feat(canvas): pure computeCanvasDims helper

Per-axis sizing: widthPx ≥ cols*maxImgW + (cols+1)*gutter, same for
height. Falls back to MIN 800x600 for an empty pool."
```

---

## Task 3: Pure helper — scaleAnnotations

**Files:**

- Modify: `src/renderer/model/canvas-dims.ts`
- Modify: `test/unit/canvas-dims.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/canvas-dims.test.ts`:

```typescript
import type {
  Annotation,
  TextAnnotation,
  ArrowAnnotation,
  BoxAnnotation,
  ScaleBarAnnotation,
} from "../../src/renderer/model/annotations";
import { scaleAnnotations } from "../../src/renderer/model/canvas-dims";

const TEXT: TextAnnotation = {
  id: "t1",
  kind: "text",
  z: 1,
  x: 100,
  y: 200,
  text: "hi",
  font: "system-ui",
  sizePt: 12,
  bold: false,
  italic: false,
  color: "#000000",
};

const ARROW: ArrowAnnotation = {
  id: "a1",
  kind: "arrow",
  z: 1,
  x1: 10,
  y1: 20,
  x2: 30,
  y2: 40,
  color: "#000000",
  thicknessPx: 2,
  head: "filled",
};

const BOX: BoxAnnotation = {
  id: "b1",
  kind: "box",
  z: 1,
  x: 50,
  y: 60,
  w: 100,
  h: 200,
  stroke: "#000000",
  strokeWidthPx: 1,
};

const SCALE: ScaleBarAnnotation = {
  id: "s1",
  kind: "scalebar",
  z: 1,
  panelId: "p1",
  lengthValue: 100,
  lengthUnit: "um",
};

describe("scaleAnnotations", () => {
  it("returns the same array reference when sx and sy are both 1", () => {
    const arr: Annotation[] = [TEXT, ARROW, BOX, SCALE];
    const out = scaleAnnotations(arr, 1, 1);
    expect(out).toBe(arr);
  });

  it("scales text x/y", () => {
    const out = scaleAnnotations([TEXT], 2, 3);
    const t = out[0] as TextAnnotation;
    expect(t.x).toBe(200);
    expect(t.y).toBe(600);
    expect(t.sizePt).toBe(12); // unchanged — points are not figure-px
  });

  it("scales arrow endpoints", () => {
    const out = scaleAnnotations([ARROW], 2, 3);
    const a = out[0] as ArrowAnnotation;
    expect(a.x1).toBe(20);
    expect(a.y1).toBe(60);
    expect(a.x2).toBe(60);
    expect(a.y2).toBe(120);
    expect(a.thicknessPx).toBe(2); // unchanged
  });

  it("scales box position and size", () => {
    const out = scaleAnnotations([BOX], 2, 3);
    const b = out[0] as BoxAnnotation;
    expect(b.x).toBe(100);
    expect(b.y).toBe(180);
    expect(b.w).toBe(200);
    expect(b.h).toBe(600);
    expect(b.strokeWidthPx).toBe(1); // unchanged
  });

  it("leaves scalebar unchanged (corner-anchored, no figure-px coords)", () => {
    const out = scaleAnnotations([SCALE], 2, 3);
    expect(out[0]).toEqual(SCALE);
  });

  it("returns a new array (does not mutate input) when scale != 1", () => {
    const arr: Annotation[] = [TEXT];
    const out = scaleAnnotations(arr, 2, 2);
    expect(out).not.toBe(arr);
    expect(arr[0]).toEqual(TEXT); // input untouched
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- canvas-dims`
Expected: FAIL — `scaleAnnotations is not a function` (or import error).

- [ ] **Step 3: Implement scaleAnnotations**

Edit `src/renderer/model/canvas-dims.ts`. Append at the end:

```typescript
import type { Annotation } from "./annotations";

/**
 * Scale every annotation's figure-pixel coordinates by (sx, sy). Used
 * when the canvas pixel dims change so on-screen positions stay anchored.
 *
 * - text: x, y
 * - arrow: x1, y1, x2, y2
 * - box: x, y, w, h
 * - scalebar: nothing (corner-anchored, lengthValue is in real-world units)
 *
 * sizePt, thicknessPx, strokeWidthPx are intentionally left alone — they
 * are visual sizes, not figure coordinates. Returns the same reference
 * when sx === 1 && sy === 1 to avoid no-op state churn.
 */
export function scaleAnnotations(
  annotations: readonly Annotation[],
  sx: number,
  sy: number,
): Annotation[] {
  if (sx === 1 && sy === 1) return annotations as Annotation[];
  return annotations.map((a): Annotation => {
    if (a.kind === "text") {
      return { ...a, x: a.x * sx, y: a.y * sy };
    }
    if (a.kind === "arrow") {
      return {
        ...a,
        x1: a.x1 * sx,
        y1: a.y1 * sy,
        x2: a.x2 * sx,
        y2: a.y2 * sy,
      };
    }
    if (a.kind === "box") {
      return {
        ...a,
        x: a.x * sx,
        y: a.y * sy,
        w: a.w * sx,
        h: a.h * sy,
      };
    }
    // scalebar — nothing positional to scale.
    return a;
  });
}
```

Note: the early-return `return annotations as Annotation[]` is intentional — `Annotation[]` is the file-shape declared by `figure-state.ts`'s `annotations` field; we widen the readonly back to mutable for the caller's convenience, since the reducer always treats it as immutable input.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- canvas-dims`
Expected: PASS — 14 passing total (8 from Task 2 + 6 new).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/model/canvas-dims.ts test/unit/canvas-dims.test.ts
git commit -m "feat(canvas): scaleAnnotations helper

Scales figure-pixel coordinates of text/arrow/box annotations by per-axis
(sx, sy). Scalebar is corner-anchored and left untouched."
```

---

## Task 4: Recompute canvas + scale annotations in the reducer

**Files:**

- Modify: `src/renderer/model/figure-actions.ts`
- Modify: `test/unit/figure-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

Edit `test/unit/figure-actions.test.ts`. Add this `describe` block at the bottom of the file:

```typescript
describe("figureReducer — canvas auto-resize (Task 4)", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  const BIG: ImagePoolItem = {
    id: "big",
    filename: "big.png",
    filePath: "/big.png",
    mime: "image/png",
    width: 4000,
    height: 3000,
    bitDepth: 8,
  };

  it("ADD_TO_POOL grows canvas to fit the largest image (per cell)", () => {
    const s0 = initialFigureState(); // 2x2, gutter 12, canvas 800x600
    const s1 = figureReducer(s0, addToPool(BIG));
    // 2 cols * 4000 + 3 * 12 = 8036
    expect(s1.canvas.widthPx).toBe(2 * 4000 + 3 * 12);
    // 2 rows * 3000 + 3 * 12 = 6036
    expect(s1.canvas.heightPx).toBe(2 * 3000 + 3 * 12);
  });

  it("ADD_TO_POOL scales existing annotations proportionally", () => {
    const text: Annotation = {
      id: "t1",
      kind: "text",
      z: 1,
      x: 100,
      y: 100,
      text: "hi",
      font: "system-ui",
      sizePt: 12,
      bold: false,
      italic: false,
      color: "#000000",
    };
    let s = figureReducer(initialFigureState(), addAnnotation(text));
    expect(s.annotations[0]).toMatchObject({ x: 100, y: 100 });
    // canvas was 800x600; after adding BIG it becomes 8036x6036 → sx≈10.045, sy≈10.06
    s = figureReducer(s, addToPool(BIG));
    const sx = s.canvas.widthPx / 800;
    const sy = s.canvas.heightPx / 600;
    expect((s.annotations[0] as TextAnnotation).x).toBeCloseTo(100 * sx, 6);
    expect((s.annotations[0] as TextAnnotation).y).toBeCloseTo(100 * sy, 6);
  });

  it("REMOVE_FROM_POOL shrinks the canvas back when the largest image is removed", () => {
    let s = figureReducer(initialFigureState(), addToPool(BIG));
    expect(s.canvas.widthPx).toBeGreaterThan(800);
    s = figureReducer(s, removeFromPool(BIG.id));
    expect(s.canvas).toEqual({ widthPx: 800, heightPx: 600 });
  });

  it("RESIZE_GRID recomputes canvas when cols change", () => {
    const s0 = figureReducer(initialFigureState(), addToPool(BIG));
    // resize to 3 cols → widthPx = 3*4000 + 4*12 = 12048
    const s1 = figureReducer(s0, resizeGrid(2, 3));
    expect(s1.canvas.widthPx).toBe(3 * 4000 + 4 * 12);
  });

  it("SET_GUTTER_PX recomputes canvas", () => {
    const s0 = figureReducer(initialFigureState(), addToPool(BIG));
    // gutter 0 → widthPx = 2*4000 = 8000
    const s1 = figureReducer(s0, setGutterPx(0));
    expect(s1.canvas.widthPx).toBe(2 * 4000);
  });

  it("does not modify state.canvas when ADD_TO_POOL is a duplicate (no-op)", () => {
    let s = figureReducer(initialFigureState(), addToPool(BIG));
    const before = s.canvas;
    s = figureReducer(s, addToPool(BIG)); // dedupe path
    expect(s.canvas).toBe(before);
  });
});
```

Required imports for the new block: `Annotation`, `TextAnnotation`, `addAnnotation`, `removeFromPool`, and `ImagePoolItem` are all already imported at the top of the file. **Add** `setGutterPx` and `resizeGrid` to the existing import block from `"../../src/renderer/model/figure-actions"` (currently missing). The `BIG` fixture is local to the new describe block.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- figure-actions`
Expected: FAIL — most assertions fail because the reducer doesn't recompute `canvas` yet.

- [ ] **Step 3: Wire the reducer cases**

Edit `src/renderer/model/figure-actions.ts`. Add at the top with other imports:

```typescript
import { computeCanvasDims, scaleAnnotations } from "./canvas-dims";
```

Add this private helper near the other helpers at the bottom of the file (above `findPanelByCoord`):

```typescript
/**
 * Apply a canvas-dims recompute to `next`, scaling annotations
 * proportionally if dims actually changed. Returns the same `next`
 * reference when dims are unchanged so React identity checks see no churn.
 */
function applyCanvasResize(prev: FigureState, next: FigureState): FigureState {
  const dims = computeCanvasDims(
    next.pool,
    next.rows,
    next.cols,
    next.gutterPx,
  );
  if (
    dims.widthPx === prev.canvas.widthPx &&
    dims.heightPx === prev.canvas.heightPx
  ) {
    // Dims unchanged — keep the existing canvas object identity.
    return { ...next, canvas: prev.canvas };
  }
  const sx = dims.widthPx / prev.canvas.widthPx;
  const sy = dims.heightPx / prev.canvas.heightPx;
  const annotations = scaleAnnotations(next.annotations, sx, sy);
  return { ...next, canvas: dims, annotations };
}
```

Now wire the four affected cases. Each currently returns `{ ...s, ... }` — wrap that return in `applyCanvasResize(s, ...)`:

In `case "ADD_TO_POOL"`:

```typescript
    case "ADD_TO_POOL": {
      if (s.pool.some((p) => p.id === a.item.id)) return s;
      return applyCanvasResize(s, { ...s, pool: [...s.pool, a.item] });
    }
```

In `case "REMOVE_FROM_POOL"`, change the final `return { ... }` block to:

```typescript
return applyCanvasResize(s, {
  ...s,
  pool: s.pool.filter((p) => p.id !== a.imageId),
  panels,
  annotations,
});
```

In `case "RESIZE_GRID"`, change the return to:

```typescript
return applyCanvasResize(s, {
  ...s,
  rows,
  cols,
  panels: r.panels,
  letterOverrides,
});
```

In `case "SET_GUTTER_PX"`, change the final return to:

```typescript
return applyCanvasResize(s, { ...s, gutterPx });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- figure-actions`
Expected: PASS — all new tests pass; all existing tests still pass.

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: PASS. If any test that constructs a hand-built `FigureState` fails because the new `canvas` field is missing, fix the fixture by spreading `initialFigureState()` or explicitly adding `canvas: { widthPx: 800, heightPx: 600 }`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/model/figure-actions.ts test/unit/figure-actions.test.ts
git commit -m "feat(canvas): reducer recomputes canvas + scales annotations

ADD_TO_POOL, REMOVE_FROM_POOL, RESIZE_GRID, SET_GUTTER_PX now run
computeCanvasDims and apply the dim delta as a proportional scale to
annotation coordinates. Dims unchanged → canvas object identity is
preserved so React doesn't re-render unnecessarily."
```

---

## Task 5: Round-trip canvas through serializer

**Files:**

- Modify: `src/renderer/model/serialize.ts`
- Modify: `src/renderer/state/load-project.ts`
- Modify: `test/unit/serialize.test.ts`

The serializer's on-disk shape stays the same (top-level `file.canvas`). Only the in-memory shape changes: read from `state.canvas` on save; write to `state.canvas` on load. The on-disk file MUST NOT carry a duplicate `state.canvas`.

- [ ] **Step 1: Write the failing tests**

Edit `test/unit/serialize.test.ts`. Add this `describe` at the bottom of the file:

```typescript
describe("serialize — canvas comes from state.canvas", () => {
  it("toMosaicFile reads canvas from state.canvas (and strips it from on-disk state)", () => {
    const state = {
      ...initialFigureState(),
      canvas: { widthPx: 4024, heightPx: 3024 },
    };
    const file = toMosaicFile({
      state,
      canvas: { widthPx: 999, heightPx: 999, background: "#FFFFFF" }, // ignored
      mosaicPath: "/tmp/x.mosaic",
      appVersion: "0.0.0",
    });
    // top-level file.canvas wins from state
    expect(file.canvas.widthPx).toBe(4024);
    expect(file.canvas.heightPx).toBe(3024);
    // background still uses the inp.canvas.background (no canonical home in state yet)
    expect(file.canvas.background).toBe("#FFFFFF");
    // on-disk state should NOT carry a nested canvas (would duplicate the
    // top-level field and confuse round-trip parity)
    expect(
      (file.state as unknown as { canvas?: unknown }).canvas,
    ).toBeUndefined();
  });

  it("fromMosaicFile puts file.canvas onto state.canvas", () => {
    const file: MosaicFileV1 = {
      schemaVersion: 1,
      app: "mosaic-builder",
      appVersion: "0.0.0",
      createdAt: "2026-05-04T00:00:00Z",
      modifiedAt: "2026-05-04T00:00:00Z",
      canvas: { widthPx: 4024, heightPx: 3024, background: "#FFFFFF" },
      state: {
        ...initialFigureState(),
        // omit canvas — exactly what an on-disk file produced by the new
        // serializer will look like
      } as MosaicFileV1["state"],
    };
    // Strip canvas from state to mimic on-disk shape, in case the spread
    // included it from initialFigureState()
    delete (file.state as unknown as { canvas?: unknown }).canvas;
    const r = fromMosaicFile(file);
    expect(r.state.canvas).toEqual({ widthPx: 4024, heightPx: 3024 });
  });
});
```

You may need to add imports at the top of the test file: `initialFigureState`, `MosaicFileV1`. Look at existing imports and add only what's missing.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- serialize`
Expected: FAIL — `toMosaicFile` still uses `inp.canvas.widthPx`; `fromMosaicFile` doesn't put canvas on state.

- [ ] **Step 3: Update `toMosaicFile`**

Edit `src/renderer/model/serialize.ts`. Replace the body of `toMosaicFile` with:

```typescript
export function toMosaicFile(inp: ToMosaicInput): MosaicFileV1 {
  const now = inp.now ?? (() => new Date().toISOString());
  const baseDir = posixDirname(inp.mosaicPath);
  const stamp = now();

  const pool = inp.state.pool.map((item) => {
    const out: MosaicFileV1["state"]["pool"][number] = { ...item };
    const rel = posixRelative(baseDir, item.filePath);
    if (rel !== null) out.relPath = rel;
    const sha = inp.shaByImageId?.[item.id];
    if (sha !== undefined) out.sha256 = sha;
    return out;
  });

  // Top-level file.canvas reads from state.canvas; background still comes
  // from the input (no canonical home in state). On-disk state strips its
  // nested `canvas` so the file shape doesn't duplicate the dims.
  const canvas = {
    widthPx: inp.state.canvas.widthPx,
    heightPx: inp.state.canvas.heightPx,
    background: inp.canvas.background,
  };
  // Build the on-disk state without the runtime-only `canvas` field.
  // Matches the `_ignoredX` rename convention used in figure-actions.ts.
  const { canvas: _ignoredCanvas, ...stateWithoutCanvas } = inp.state;
  return {
    schemaVersion: 1,
    app: "mosaic-builder",
    appVersion: inp.appVersion,
    createdAt: stamp,
    modifiedAt: stamp,
    canvas,
    state: { ...stateWithoutCanvas, pool } as MosaicFileV1["state"],
  };
}
```

- [ ] **Step 4: Update `fromMosaicFile`**

In the same file, replace the body of `fromMosaicFile`:

```typescript
export function fromMosaicFile(file: MosaicFileV1): FromMosaicResult {
  const relinkHints: RelinkHint[] = [];
  const runtimePool = file.state.pool.map((item) => {
    const { relPath, sha256, ...rest } = item as unknown as ImagePoolItem & {
      relPath?: string;
      sha256?: string;
    };
    const hint: RelinkHint = { imageId: rest.id, filePath: rest.filePath };
    if (relPath !== undefined) hint.relPath = relPath;
    if (sha256 !== undefined) hint.sha256 = sha256;
    relinkHints.push(hint);
    return rest;
  });
  const canvas = {
    widthPx: file.canvas.widthPx,
    heightPx: file.canvas.heightPx,
    background: file.canvas.background,
  };
  const state: FigureState = {
    ...file.state,
    pool: runtimePool,
    canvas: { widthPx: canvas.widthPx, heightPx: canvas.heightPx },
  };
  return { state, canvas, relinkHints };
}
```

You'll need a `FigureState` import — add `import type { FigureState } from "./figure-state";` at the top alongside other imports if it's not already there.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- serialize`
Expected: PASS.

- [ ] **Step 6: Run the round-trip integration test**

Run: `pnpm test -- m7-roundtrip`
Expected: PASS. The roundtrip test feeds `inp.canvas` and reads back from `r.canvas` — both still work because we didn't break those external surfaces.

- [ ] **Step 7: Verify load-project still works**

`src/renderer/state/load-project.ts` calls `fromMosaicFile(result.file)` and dispatches `resetToState(r.state)`. Now `r.state.canvas` is populated, so the dispatched state carries canvas dims. No code change needed there.

Read `src/renderer/state/load-project.ts` to confirm. Run: `pnpm test -- load-project` (or the relevant integration test if one exists).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/model/serialize.ts test/unit/serialize.test.ts
git commit -m "feat(canvas): round-trip canvas dims through serializer

Save reads canvas dims from state.canvas (writes them at the top-level
file.canvas); load puts file.canvas onto state.canvas. On-disk shape
unchanged: file.canvas at root, state.canvas omitted. Existing files
load identically because top-level file.canvas was always populated."
```

---

## Task 6: Wire App.tsx to use state.canvas

**Files:**

- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Replace constants with derived values**

Edit `src/renderer/App.tsx`. Find the constants block at the top (around line 52):

```typescript
const FIGURE_PX_W = 800;
const FIGURE_PX_H = 600;
const CANVAS_BG = "#FFFFFF";
const CANVAS_CSS_W = 800;
const CANVAS_CSS_H = 600;
```

Remove `FIGURE_PX_W` and `FIGURE_PX_H`. Keep `CANVAS_BG`, `CANVAS_CSS_W`, `CANVAS_CSS_H`. The CSS dims stay 800×600 (the editor box on screen); the figure pixel dims now come from `state.canvas`.

- [ ] **Step 2: Replace deriveFigure call**

Find the `figure = useMemo(...)` block (~line 81). Replace with:

```typescript
const figure = useMemo(
  () =>
    deriveFigure(state, {
      canvas: {
        widthPx: state.canvas.widthPx,
        heightPx: state.canvas.heightPx,
        background: CANVAS_BG,
      },
    }),
  [state],
);
```

(`state` already includes `canvas` so the dependency is correct via the existing `[state]` dep.)

- [ ] **Step 3: Replace toMosaicFile call**

Find the `onSaveProject` callback (~line 288). Replace the `toMosaicFile` invocation:

```typescript
const file = toMosaicFile({
  state,
  canvas: {
    widthPx: state.canvas.widthPx,
    heightPx: state.canvas.heightPx,
    background: CANVAS_BG,
  },
  mosaicPath: projectPath ?? "untitled.mosaic",
  appVersion: APP_VERSION,
});
```

(The serializer reads `state.canvas` for dims now; `inp.canvas` is only used for `background`. Keeping the same shape avoids an unrelated refactor.)

- [ ] **Step 4: Replace component prop sites**

Inside the JSX, find all places that pass `figurePxW={FIGURE_PX_W}` and `figurePxH={FIGURE_PX_H}` (the GridCells, PanelInteractionLayer, and AnnotationInteractionLayer components — search for `figurePxW=` in the file). Replace each occurrence:

```typescript
              figurePxW={state.canvas.widthPx}
              figurePxH={state.canvas.heightPx}
```

There are three occurrences. Make all three changes.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS — all FIGURE_PX_W/H references are gone.

- [ ] **Step 6: Run the full test suite**

Run: `pnpm test`
Expected: PASS — no tests should regress.

- [ ] **Step 7: Manual sanity check (dev server)**

Run: `pnpm dev`

- Add a small image (e.g. <800×600). Confirm the grid still renders and looks normal.
- Add a large TIFF (e.g. ≥4000×3000). Confirm the grid renders. The on-screen size of the editor box should stay the same (CSS-bound to 800×600), but the image inside should look sharp now (no visible blurriness).
- Export PNG. Open the saved file. It should be ≥4000×3000 (or larger, depending on grid dims) and the image should be at full resolution.
- Save the project, reload it, confirm the canvas dims and any placed images come back correctly.

If anything looks off, debug; do NOT proceed to commit until manual verification passes. State explicitly in the commit message that manual UI testing was performed.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(canvas): App.tsx uses state.canvas instead of hardcoded constants

Removes FIGURE_PX_W/H. The figure's pixel dims now come from
state.canvas, which auto-grows with the largest pool image. CSS box
size (CANVAS_CSS_W/H) stays 800x600; only the canvas backing store
grows. Verified manually: large TIFF imports now render and export at
their true resolution."
```

---

## Task 7: Confirm export fidelity

**Files:** none (verification-only).

This task confirms the no-compression-on-export rule from the spec. No code changes; existing export code is already correct once canvas dims grow.

- [ ] **Step 1: Inspect export paths**

Read these files (to internalize the chain):

- `src/renderer/render/export-renderer.ts` — uses `figure.canvas.widthPx/heightPx` for the OffscreenCanvas. Already correct.
- `src/renderer/export/png.ts` — `convertToBlob({ type: "image/png" })`. Lossless by spec.
- `src/renderer/export/tiff.ts` — `UTIF.encodeImage(rgba, w, h)`. Uncompressed (per the file's own comment).
- `src/renderer/export/pdf.ts` — embeds a PNG. Lossless. Note `PDF_DPI = 300` makes the page physically larger as the canvas grows — that's correct behavior (more pixels at the same DPI = larger page). No code change.
- `src/renderer/export/jpeg.ts` — JPEG. Opt-in lossy via the user's quality slider. No change.

- [ ] **Step 2: Manual sanity check**

Run `pnpm dev`. Add a 4000×3000 TIFF, place it in a single panel of a 1×1 grid. Export PNG.

- Open the resulting PNG in a viewer. Confirm dims ≥ 4000×3000.
- Zoom into the panel content. Confirm visible detail matches the source TIFF (no blur, no posterization).

Repeat for TIFF export. Confirm output is a valid TIFF readable by ImageJ or Preview, dimensions match canvas.

If anything looks lossy beyond JPEG, debug before continuing.

- [ ] **Step 3: No commit**

This task does not produce code changes. Skip the commit step.

---

## Task 8: Cleanup pass

**Files:**

- Modify: `src/renderer/model/figure-state.ts` (potentially)
- Modify: `src/renderer/App.tsx` (potentially)

Verification + cleanup only.

- [ ] **Step 1: Search for stragglers**

Run: `grep -rn "FIGURE_PX_W\|FIGURE_PX_H" src/ test/`
Expected: zero matches. If any survive, replace with `state.canvas.widthPx/heightPx` (in App-side code) or `figure.canvas.widthPx/heightPx` (in render-side code).

Run: `grep -rn "widthPx: 800\|heightPx: 600" src/`
Expected: zero matches. Test fixtures (`test/`) may legitimately keep these.

- [ ] **Step 2: Run full test suite + typecheck + lint**

Run these in sequence:

```
pnpm typecheck
pnpm test
pnpm lint
```

Expected: all PASS.

- [ ] **Step 3: Final manual smoke test**

Run: `pnpm dev`. Walk through:

1. New empty figure — confirm 800×600 canvas appears normal.
2. Add small image → grid renders, no resolution issue.
3. Add large TIFF → grid still fits the same on-screen box, image is sharp.
4. Resize grid (e.g. 1×1 → 3×3) → canvas dims should adjust; placed images stay placed.
5. Add an annotation (text or arrow), then add another large image → annotation should stay anchored to its on-screen position (didn't drift).
6. Save project. Quit. Relaunch `pnpm dev`. Open the saved project → canvas dims, panels, annotations match what you saved.
7. Export PNG → output is full resolution.

- [ ] **Step 4: Commit if any cleanup changes were needed**

If Step 1 or 2 produced changes:

```bash
git add -A
git commit -m "chore(canvas): final cleanup pass

Removes any remaining hardcoded 800x600 stragglers and confirms
typecheck/lint/tests all pass."
```

If nothing needed cleaning, skip the commit.

---

## Self-Review Notes

**Spec coverage:**

- "Compute canvas from pool + grid + gutter" → Task 2.
- "Recompute on ADD_TO_POOL/REMOVE_FROM_POOL/RESIZE_GRID/SET_GUTTER_PX" → Task 4.
- "Scale annotations proportionally" → Task 3 (helper) + Task 4 (wiring).
- "Add `canvas` to FigureState; init at MIN_CANVAS_W/H" → Task 1.
- "Round-trip canvas through serializer" → Task 5.
- "Don't auto-grow on load" → satisfied for free: load goes through `RESET_TO_STATE` which doesn't run `applyCanvasResize`. Confirmed by Task 5 Step 6.
- "Remove FIGURE_PX_W/H from App.tsx; CSS stays 800×600" → Task 6.
- "No compression on import or export" → already correct in code; Task 7 is verification-only.
- "JPEG remains opt-in lossy" → no code change needed; spec acceptance.
- "Acceptance criteria" → Task 6 Step 7 (manual) + Task 7 Step 2 (manual).

**Type/name consistency:**

- `MIN_CANVAS_W` / `MIN_CANVAS_H` exported from `figure-state.ts`, imported by `canvas-dims.ts`. Same names throughout.
- `computeCanvasDims(pool, rows, cols, gutterPx)` signature consistent across helper, reducer, and tests.
- `scaleAnnotations(annotations, sx, sy)` consistent.
- `applyCanvasResize(prev, next)` is private to `figure-actions.ts`.
- `FigureState.canvas` shape `{ widthPx; heightPx }` consistent with `FigureCanvas` type minus `background` (background remains a derive-time input).

**Risk/edge case audit:**

- `RESET_FIGURE` returns `initialFigureState()` which has `canvas` initialized — fine.
- `RESET_TO_STATE` requires the caller to pass a fully-formed state (including `canvas`); this is what serializer load now does. Existing test fixtures that build hand-rolled states for this action need a `canvas` field. Task 4 Step 5 catches them.
- React identity: `applyCanvasResize` returns the same `prev.canvas` object when dims don't change, so `useMemo([state])` gates can short-circuit downstream.
- Overflow: a 50000×50000 RGBA canvas is ~10 GB. Spec acknowledges no caps. No code defenses are added.
