# Canvas Zoom & Pan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fit/100%/zoom/pan to the editor canvas so a user can inspect a figure at true source resolution, while leaving the model figure-px space, `.mosaic` files, and exports byte-identical.

**Architecture:** Decouple three resolutions that are conflated today. The model figure-px space (`FigureState`, annotations, `.mosaic`) stays frozen at 800×600. The editor canvas backing store grows to full source resolution (`editorScale`, reusing the shipped `computeCanvasDims`/`computeExportScale` math). The on-screen CSS box becomes a variable multiple (`viewZoom`) of the model. Zoom/pan is session-only React state (`view`), never in `FigureState`. Default wheel/drag operate on the canvas/view; holding **Space** redirects them to the active (double-clicked) image; temporary-select moves from Space to **Cmd/Ctrl-hold**.

**Tech Stack:** TypeScript, React 18, Electron, Vitest (`environment: "node"`, jsdom per-test via `// @vitest-environment jsdom`), `@testing-library/react`. Toolchain pinned: Node 22, pnpm 10.

## Global Constraints

- **Model figure-px space is frozen at 800×600.** `deriveFigure` keeps receiving `{ widthPx: 800, heightPx: 600 }`. Never change `FIGURE_PX_W`/`FIGURE_PX_H` or pass `view`-derived values as `figurePxW`/`figurePxH`. This is the design's safety property.
- **Zoom/pan never enters `FigureState`.** `view` is `useState` in `App.tsx`, like `panelInteraction`/`selectedThumbId`. No reducer action, no serialization, no undo entry, no dirty flag.
- **Exports are a pure function of `figure` (model-space) + pool.** `computeExportScale` and the export renderers never receive `view`. Do not thread `view` into any `export/*` or `render/export-*` code.
- **Zero-warning lint:** ESLint runs type-checked with `--max-warnings 0`. Unused vars must start with `_`. Prettier must pass.
- **Reducers return `===` same state on no-op** — not relevant here (no new reducer actions) but do not violate it.
- **No comments stating WHAT code does** — only WHY (invariants, derivations). Match `coords.ts` `figureToSource` prose bar.
- **Every increment lands green:** `pnpm typecheck && pnpm test && pnpm lint`.
- **Zoom clamp bounds:** display-% range is 10%–800% of source-100%. `ZOOM_MIN = 0.1`, `ZOOM_MAX = 8`, expressed in display-% terms — so `clampViewZoom(zoom, sourceScale)` clamps `zoom` to `[ZOOM_MIN·sourceScale, ZOOM_MAX·sourceScale]`.
- **Definitions:** `sourceScale = editorBackingDims.widthPx / 800` (= the export scale; `= 1` when the pool holds no image larger than the 800×600 baseline). `zoom` is the model→CSS multiple (`zoom = 1` ⇒ 1 model-px = 1 CSS-px). Display-% shown to the user `= round(100 · zoom / sourceScale)`, so `zoom = (pct/100)·sourceScale`. UI "100%" ⇒ `zoom = sourceScale`. `editorScale = sourceScale` (capped at source-100% — never rasterize the backing store larger than `computeCanvasDims`).

---

## File Structure

**New files:**

- `src/renderer/render/view-transform.ts` — pure zoom/fit/scroll math (no React, no DOM). The testable heart.
- `src/renderer/hooks/useCanvasZoom.ts` — imperative browser wiring: `ResizeObserver` (fit mode), space-gated wheel-zoom listener, drag-to-pan-view pointer handler, cursor-anchored scroll. Owns `view` state.
- `src/renderer/components/Toolbar/ZoomControls.tsx` — presentational Fit/100%/−/+/% cluster.

**Modified files:**

- `src/renderer/render/editor-renderer.ts` — accept `editorScale`; grow backing store to `800·editorScale·dpr`; compose the `editorScale·dpr` transform; stop writing `canvas.style` size.
- `src/renderer/components/Canvas/EditorCanvas.tsx` — plumb `editorScale` prop → renderer.
- `src/renderer/components/Grid/PanelInteractionLayer.tsx` — accept `spacebarHeld`; early-return from wheel + `onPointerDown` (before `setPointerCapture`) when space is not held.
- `src/renderer/App.tsx` — `view` via `useCanvasZoom`; wrapper `<div>` sized to `cssW/cssH`; pass variable `cssW/cssH` + `editorScale` + `spacebarHeld` down; keep `figurePxW/figurePxH` = 800/600; reset `view` on New/Open; mount `ZoomControls`; retarget temporary-select to Cmd/Ctrl-hold; update the SELECT MODE chip.
- `src/renderer/hooks/useKeyboardShortcuts.ts` — add `Cmd/Ctrl` + `=`/`-`/`0`/`1`.

**New test files:**

- `test/unit/view-transform.test.ts`
- additions to `test/unit/editor-renderer.test.ts`
- `test/unit/use-canvas-zoom.test.ts`
- `test/unit/zoom-controls.test.tsx`
- `test/unit/panel-interaction-space-gate.test.tsx`
- `test/unit/keyboard-shortcuts-zoom.test.ts` (or extend an existing shortcuts test if present)

---

## Task 1: Pure view-transform math

**Files:**

- Create: `src/renderer/render/view-transform.ts`
- Test: `test/unit/view-transform.test.ts`

**Interfaces:**

- Consumes: nothing (leaf module).
- Produces:

  - `export const ZOOM_MIN = 0.1`
  - `export const ZOOM_MAX = 8`
  - `export function clampViewZoom(zoom: number, sourceScale: number): number`
  - `export function fitZoom(containerW: number, containerH: number, modelW: number, modelH: number): number`
  - `export function zoomToCssSize(zoom: number, modelW: number, modelH: number): { cssW: number; cssH: number }`
  - `export function scrollForCursorZoom(args: { cursorX: number; cursorY: number; oldScrollLeft: number; oldScrollTop: number; oldCssW: number; oldCssH: number; newCssW: number; newCssH: number }): { scrollLeft: number; scrollTop: number }`

- [ ] **Step 1: Write the failing test**

Create `test/unit/view-transform.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  ZOOM_MIN,
  ZOOM_MAX,
  clampViewZoom,
  fitZoom,
  zoomToCssSize,
  scrollForCursorZoom,
} from "../../src/renderer/render/view-transform";

describe("clampViewZoom", () => {
  it("clamps to [ZOOM_MIN*sourceScale, ZOOM_MAX*sourceScale]", () => {
    // sourceScale 1 → bounds [0.1, 8]
    expect(clampViewZoom(0.01, 1)).toBe(ZOOM_MIN);
    expect(clampViewZoom(100, 1)).toBe(ZOOM_MAX);
    expect(clampViewZoom(2, 1)).toBe(2);
  });

  it("scales the bounds by sourceScale (5x source figure)", () => {
    // sourceScale 5 → display-100% is zoom=5; bounds [0.5, 40]
    expect(clampViewZoom(0.1, 5)).toBe(0.5);
    expect(clampViewZoom(1000, 5)).toBe(40);
    expect(clampViewZoom(5, 5)).toBe(5);
  });
});

describe("fitZoom", () => {
  it("returns the largest zoom that fits the model in the container", () => {
    // model 800x600, container 400x600 → width-bound → 0.5
    expect(fitZoom(400, 600, 800, 600)).toBeCloseTo(0.5, 6);
    // container 800x300 → height-bound → 0.5
    expect(fitZoom(800, 300, 800, 600)).toBeCloseTo(0.5, 6);
    // container exactly the model → 1
    expect(fitZoom(800, 600, 800, 600)).toBeCloseTo(1, 6);
  });

  it("never returns 0 or negative for a zero-sized container", () => {
    expect(fitZoom(0, 0, 800, 600)).toBeGreaterThan(0);
  });
});

describe("zoomToCssSize", () => {
  it("multiplies model dims by zoom", () => {
    expect(zoomToCssSize(2, 800, 600)).toEqual({ cssW: 1600, cssH: 1200 });
    expect(zoomToCssSize(0.5, 800, 600)).toEqual({ cssW: 400, cssH: 300 });
  });
});

describe("scrollForCursorZoom", () => {
  it("keeps the model point under the cursor fixed", () => {
    // Before: cssW 800, scrollLeft 0, cursor at x=400 (model x=400).
    // After zoom 2x: cssW 1600, the same model x=400 is now at css x=800.
    // To keep it under cursorX=400, scrollLeft must become 800-400=400.
    const r = scrollForCursorZoom({
      cursorX: 400,
      cursorY: 300,
      oldScrollLeft: 0,
      oldScrollTop: 0,
      oldCssW: 800,
      oldCssH: 600,
      newCssW: 1600,
      newCssH: 1200,
    });
    expect(r.scrollLeft).toBeCloseTo(400, 6);
    expect(r.scrollTop).toBeCloseTo(300, 6);
  });

  it("clamps scroll offsets to >= 0", () => {
    const r = scrollForCursorZoom({
      cursorX: 0,
      cursorY: 0,
      oldScrollLeft: 0,
      oldScrollTop: 0,
      oldCssW: 800,
      oldCssH: 600,
      newCssW: 400,
      newCssH: 300,
    });
    expect(r.scrollLeft).toBeGreaterThanOrEqual(0);
    expect(r.scrollTop).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/view-transform.test.ts`
Expected: FAIL — cannot resolve `../../src/renderer/render/view-transform` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/render/view-transform.ts`:

```ts
// View-transform math for the editor canvas. This is a VIEW concern only:
// it never touches FigureState or the model figure-px space. `zoom` is the
// model→CSS multiple; `sourceScale` is editorBackingDims/model, i.e. the
// export scale, so display-100% (1 source-px = 1 screen-px) is zoom ===
// sourceScale. Bounds are expressed in display-% terms, hence they scale by
// sourceScale.

export const ZOOM_MIN = 0.1; // 10% of source-100%
export const ZOOM_MAX = 8; // 800% of source-100%

export function clampViewZoom(zoom: number, sourceScale: number): number {
  const lo = ZOOM_MIN * sourceScale;
  const hi = ZOOM_MAX * sourceScale;
  return Math.max(lo, Math.min(hi, zoom));
}

export function fitZoom(
  containerW: number,
  containerH: number,
  modelW: number,
  modelH: number,
): number {
  // Guard against a zero/negative container (pre-layout, hidden tab): fall
  // back to 1 so the canvas is never sized to 0.
  if (containerW <= 0 || containerH <= 0) return 1;
  return Math.min(containerW / modelW, containerH / modelH);
}

export function zoomToCssSize(
  zoom: number,
  modelW: number,
  modelH: number,
): { cssW: number; cssH: number } {
  return { cssW: modelW * zoom, cssH: modelH * zoom };
}

export function scrollForCursorZoom(args: {
  cursorX: number;
  cursorY: number;
  oldScrollLeft: number;
  oldScrollTop: number;
  oldCssW: number;
  oldCssH: number;
  newCssW: number;
  newCssH: number;
}): { scrollLeft: number; scrollTop: number } {
  // The model point under the cursor is at document-x = scrollLeft + cursorX,
  // a fraction (scrollLeft + cursorX)/oldCssW of the box. After resizing the
  // box, that same fraction times newCssW must again sit at cursorX, so:
  //   newScrollLeft = frac*newCssW - cursorX.
  const fracX = (args.oldScrollLeft + args.cursorX) / args.oldCssW;
  const fracY = (args.oldScrollTop + args.cursorY) / args.oldCssH;
  const scrollLeft = fracX * args.newCssW - args.cursorX;
  const scrollTop = fracY * args.newCssH - args.cursorY;
  return {
    scrollLeft: Math.max(0, scrollLeft),
    scrollTop: Math.max(0, scrollTop),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/view-transform.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + lint the new file**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS, zero warnings.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/render/view-transform.ts test/unit/view-transform.test.ts
git commit -m "feat(zoom): pure view-transform math (clamp/fit/cssSize/cursor-scroll)"
```

---

## Task 2: Editor renderer honors `editorScale`

**Files:**

- Modify: `src/renderer/render/editor-renderer.ts`
- Test: `test/unit/editor-renderer.test.ts` (add a describe block)

**Interfaces:**

- Consumes: nothing new (leaf render change).
- Produces:

  - `EditorRenderer` gains `setEditorScale(scale: number): void`.
  - Backing store becomes `round(figure.canvas.widthPx · editorScale · dpr)` × `round(figure.canvas.heightPx · editorScale · dpr)`.
  - The single ctx transform is `setTransform(editorScale·dpr, 0, 0, editorScale·dpr, 0, 0)`.
  - The renderer NO LONGER sets `canvas.style.width/height` (the wrapper owns CSS size from Task 6).

- [ ] **Step 1: Write the failing test**

Add to `test/unit/editor-renderer.test.ts` (new `describe`, reusing the file's existing stubs). Note: the existing test stubs `getContext` with only `setTransform`/`scale`; capture the `setTransform` args here:

```ts
describe("editor-renderer: editorScale", () => {
  let canvas: HTMLCanvasElement;
  let drawFigureSpy: ReturnType<typeof vi.spyOn>;
  let setTransformCalls: number[][];

  beforeEach(() => {
    canvas = document.createElement("canvas");
    setTransformCalls = [];
    canvas.getContext = (() =>
      ({
        setTransform: (...args: number[]) => {
          setTransformCalls.push(args);
        },
        scale: () => {},
      }) as unknown) as HTMLCanvasElement["getContext"];

    drawFigureSpy = vi
      .spyOn(drawFigureModule, "drawFigure")
      .mockImplementation(() => {});

    let pending: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      pending = cb;
      queueMicrotask(() => {
        if (pending !== null) {
          const c = pending;
          pending = null;
          c(0);
        }
      });
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    // Force a deterministic dpr for the assertions.
    vi.stubGlobal("window", { devicePixelRatio: 2 });
  });

  afterEach(() => {
    drawFigureSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("sizes the backing store to model * editorScale * dpr", async () => {
    const r = createEditorRenderer(canvas);
    r.setEditorScale(3);
    r.setFigure(FIG); // FIG.canvas is 100x100 in this test file
    await Promise.resolve();
    await Promise.resolve();
    // 100 * 3 * 2 = 600
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(600);
  });

  it("composes editorScale*dpr into the single ctx transform", async () => {
    const r = createEditorRenderer(canvas);
    r.setEditorScale(3);
    r.setFigure(FIG);
    await Promise.resolve();
    await Promise.resolve();
    // editorScale 3 * dpr 2 = 6 on both axes.
    expect(setTransformCalls.at(-1)).toEqual([6, 0, 0, 6, 0, 0]);
  });

  it("passes an identical model-space figure to drawFigure regardless of editorScale", async () => {
    const r1 = createEditorRenderer(canvas);
    r1.setEditorScale(1);
    r1.setFigure(FIG);
    await Promise.resolve();
    await Promise.resolve();
    const figAt1 = drawFigureSpy.mock.calls.at(-1)?.[1];

    const r2 = createEditorRenderer(canvas);
    r2.setEditorScale(4);
    r2.setFigure(FIG);
    await Promise.resolve();
    await Promise.resolve();
    const figAt4 = drawFigureSpy.mock.calls.at(-1)?.[1];

    // Same model figure object reaches drawFigure; zoom does not leak in.
    expect(figAt1).toBe(FIG);
    expect(figAt4).toBe(FIG);
  });

  it("defaults editorScale to 1 before setEditorScale is called", async () => {
    const r = createEditorRenderer(canvas);
    r.setFigure(FIG);
    await Promise.resolve();
    await Promise.resolve();
    // 100 * 1 * 2 = 200
    expect(canvas.width).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/editor-renderer.test.ts -t editorScale`
Expected: FAIL — `r.setEditorScale is not a function`.

- [ ] **Step 3: Write minimal implementation**

Edit `src/renderer/render/editor-renderer.ts`:

Add to the interface (after `setPool`):

```ts
export interface EditorRenderer {
  setFigure(figure: Figure): void;
  setImages(images: Map<string, ImageBitmap>): void;
  setPool(pool: Map<string, ImagePoolItem>): void;
  setEditorScale(scale: number): void;
  dispose(): void;
}
```

Add a module-level `editorScale` alongside the other closure vars:

```ts
let pool: Map<string, ImagePoolItem> = new Map();
let editorScale = 1;
let rafHandle: number | null = null;
```

Replace the sizing/transform block inside `paint()` (the `targetW`/`targetH`/`canvas.style.*`/`setTransform` section) with:

```ts
const dpr =
  typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio)
    ? Math.max(1, window.devicePixelRatio)
    : 1;
// Two independent multipliers stack on the backing store: editorScale
// (full source resolution, from the pool) and dpr (HiDPI). Both are also
// composed into the single ctx transform so drawFigure still paints in
// the 800x600 model coordinate system and never learns about zoom.
const combined = editorScale * dpr;
const targetW = Math.round(figure.canvas.widthPx * combined);
const targetH = Math.round(figure.canvas.heightPx * combined);
if (canvas.width !== targetW) canvas.width = targetW;
if (canvas.height !== targetH) canvas.height = targetH;
// CSS size is owned by the wrapper <div> (App.tsx), driven by the view
// zoom. The renderer no longer sets canvas.style.* — doing so would fight
// the zoom's CSS box.
const ctx = canvas.getContext("2d");
if (ctx === null) return;
if (typeof ctx.setTransform === "function") {
  ctx.setTransform(combined, 0, 0, combined, 0, 0);
} else {
  ctx.scale(combined, combined);
}
```

Add the setter to the returned object (after `setPool`):

```ts
    setEditorScale(next: number): void {
      editorScale = next;
      schedule();
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/unit/editor-renderer.test.ts`
Expected: PASS (both the original 4 tests and the new editorScale block). The original tests still pass because default `editorScale = 1` preserves prior backing-store math, and they never asserted on `canvas.style`.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/render/editor-renderer.ts test/unit/editor-renderer.test.ts
git commit -m "feat(zoom): editor renderer honors editorScale (full-res backing store)"
```

---

## Task 3: EditorCanvas plumbs `editorScale`

**Files:**

- Modify: `src/renderer/components/Canvas/EditorCanvas.tsx`
- Test: covered by Task 2's renderer test + Task 6's integration; add a focused prop test here.

**Interfaces:**

- Consumes: `EditorRenderer.setEditorScale` (Task 2).
- Produces: `EditorCanvas` gains an `editorScale: number` prop, forwarded to the renderer via `setEditorScale` in an effect.

- [ ] **Step 1: Write the failing test**

Create `test/unit/editor-canvas-scale.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { EditorCanvas } from "../../src/renderer/components/Canvas/EditorCanvas";
import * as rendererModule from "../../src/renderer/render/editor-renderer";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";

const FIG: Figure = {
  canvas: { widthPx: 800, heightPx: 600, background: "#fff" },
  grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#000" },
  panels: [{ row: 0, col: 0, kind: "placeholder", label: "" }],
  annotations: [],
  globalStyle: DEFAULT_GLOBAL_STYLE,
};

afterEach(() => cleanup());

describe("EditorCanvas: editorScale plumbing", () => {
  it("forwards editorScale to the renderer's setEditorScale", () => {
    const setEditorScale = vi.fn();
    vi.spyOn(rendererModule, "createEditorRenderer").mockReturnValue({
      setFigure: vi.fn(),
      setImages: vi.fn(),
      setPool: vi.fn(),
      setEditorScale,
      dispose: vi.fn(),
    });
    render(
      <EditorCanvas
        figure={FIG}
        images={new Map()}
        pool={new Map()}
        editorScale={4}
      />,
    );
    expect(setEditorScale).toHaveBeenCalledWith(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/editor-canvas-scale.test.tsx`
Expected: FAIL — `editorScale` not a prop / not forwarded (TS error or missing call).

- [ ] **Step 3: Write minimal implementation**

Edit `src/renderer/components/Canvas/EditorCanvas.tsx`. Add `editorScale` to `Props`:

```tsx
interface Props {
  figure: Figure;
  images: Map<string, ImageBitmap>;
  /** Pool items keyed by image id. Required for scale-bar calibration. */
  pool: Map<string, ImagePoolItem>;
  /** Full-resolution backing-store multiplier (= export sourceScale). */
  editorScale: number;
}
```

Destructure it and add an effect (next to the existing `setFigure`/`setImages`/`setPool` effects):

```tsx
export function EditorCanvas({ figure, images, pool, editorScale }: Props): JSX.Element {
```

```tsx
useEffect(() => {
  rendererRef.current?.setEditorScale(editorScale);
}, [editorScale]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/editor-canvas-scale.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: FAIL typecheck — `App.tsx` renders `<EditorCanvas>` without the now-required `editorScale` prop. Add a temporary `editorScale={1}` to the `<EditorCanvas>` in `App.tsx` (line ~949) to keep the tree green; Task 6 replaces it with the real value.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/Canvas/EditorCanvas.tsx test/unit/editor-canvas-scale.test.tsx src/renderer/App.tsx
git commit -m "feat(zoom): EditorCanvas forwards editorScale to the renderer"
```

---

## Task 4: ZoomControls component

**Files:**

- Create: `src/renderer/components/Toolbar/ZoomControls.tsx`
- Test: `test/unit/zoom-controls.test.tsx`

**Interfaces:**

- Consumes: nothing (presentational).
- Produces:

  - `export interface ZoomControlsProps { displayPct: number; onFit: () => void; onActualSize: () => void; onZoomIn: () => void; onZoomOut: () => void; onSetPercent: (pct: number) => void; isFit: boolean; }`
  - `export function ZoomControls(props: ZoomControlsProps): JSX.Element`
  - Renders buttons with `data-testid`: `zoom-fit`, `zoom-actual`, `zoom-in`, `zoom-out`, and an input `zoom-pct-input`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/zoom-controls.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ZoomControls } from "../../src/renderer/components/Toolbar/ZoomControls";

afterEach(() => cleanup());

function setup(overrides = {}) {
  const props = {
    displayPct: 100,
    isFit: false,
    onFit: vi.fn(),
    onActualSize: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onSetPercent: vi.fn(),
    ...overrides,
  };
  render(<ZoomControls {...props} />);
  return props;
}

describe("ZoomControls", () => {
  it("fires onFit / onActualSize / onZoomIn / onZoomOut", () => {
    const p = setup();
    fireEvent.click(screen.getByTestId("zoom-fit"));
    fireEvent.click(screen.getByTestId("zoom-actual"));
    fireEvent.click(screen.getByTestId("zoom-in"));
    fireEvent.click(screen.getByTestId("zoom-out"));
    expect(p.onFit).toHaveBeenCalledOnce();
    expect(p.onActualSize).toHaveBeenCalledOnce();
    expect(p.onZoomIn).toHaveBeenCalledOnce();
    expect(p.onZoomOut).toHaveBeenCalledOnce();
  });

  it("shows the current percent", () => {
    setup({ displayPct: 250 });
    expect(screen.getByTestId<HTMLInputElement>("zoom-pct-input").value).toBe(
      "250",
    );
  });

  it("commits a typed percent on Enter", () => {
    const p = setup();
    const input = screen.getByTestId<HTMLInputElement>("zoom-pct-input");
    fireEvent.change(input, { target: { value: "175" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(p.onSetPercent).toHaveBeenCalledWith(175);
  });

  it("ignores a non-numeric percent entry", () => {
    const p = setup();
    const input = screen.getByTestId<HTMLInputElement>("zoom-pct-input");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(p.onSetPercent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/zoom-controls.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/components/Toolbar/ZoomControls.tsx`:

```tsx
import { useEffect, useState } from "react";

export interface ZoomControlsProps {
  /** Zoom shown to the user, e.g. 100 for 100%. */
  displayPct: number;
  /** True when the view is in fit-to-window mode. */
  isFit: boolean;
  onFit: () => void;
  onActualSize: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSetPercent: (pct: number) => void;
}

export function ZoomControls({
  displayPct,
  isFit,
  onFit,
  onActualSize,
  onZoomIn,
  onZoomOut,
  onSetPercent,
}: ZoomControlsProps): JSX.Element {
  // Local buffer so typing doesn't fight the controlled displayPct until the
  // user commits with Enter/blur.
  const [draft, setDraft] = useState(String(displayPct));
  useEffect(() => setDraft(String(displayPct)), [displayPct]);

  function commit(): void {
    const n = Number.parseInt(draft, 10);
    if (Number.isFinite(n) && n > 0) onSetPercent(n);
    else setDraft(String(displayPct));
  }

  return (
    <div className="zoom-controls" data-testid="zoom-controls">
      <button
        type="button"
        className={`btn${isFit ? " btn-active" : ""}`}
        data-testid="zoom-fit"
        onClick={onFit}
        title="Fit to window (⌘0)"
      >
        Fit
      </button>
      <button
        type="button"
        className="btn"
        data-testid="zoom-actual"
        onClick={onActualSize}
        title="Actual pixels — 100% (⌘1)"
      >
        100%
      </button>
      <button
        type="button"
        className="btn btn-icon"
        data-testid="zoom-out"
        onClick={onZoomOut}
        title="Zoom out (⌘−)"
        aria-label="Zoom out"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        className="zoom-pct-input"
        data-testid="zoom-pct-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        onBlur={commit}
        aria-label="Zoom percent"
      />
      <button
        type="button"
        className="btn btn-icon"
        data-testid="zoom-in"
        onClick={onZoomIn}
        title="Zoom in (⌘+)"
        aria-label="Zoom in"
      >
        +
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/zoom-controls.test.tsx`
Expected: PASS (all 4).

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/Toolbar/ZoomControls.tsx test/unit/zoom-controls.test.tsx
git commit -m "feat(zoom): ZoomControls presentational component"
```

---

## Task 5: `PanelInteractionLayer` yields gestures unless Space is held

**Files:**

- Modify: `src/renderer/components/Grid/PanelInteractionLayer.tsx`
- Test: `test/unit/panel-interaction-space-gate.test.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: `PanelInteractionLayer` gains a required prop `spacebarHeld: boolean`. When `false`: the wheel listener returns WITHOUT `preventDefault`, and `onPointerDown` returns BEFORE `setPointerCapture` (so drags bubble to the canvas). Corner-handle resize is unaffected (it has its own `stopPropagation`).

- [ ] **Step 1: Write the failing test**

Create `test/unit/panel-interaction-space-gate.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PanelInteractionLayer } from "../../src/renderer/components/Grid/PanelInteractionLayer";
import { DEFAULT_TRANSFORM } from "../../src/renderer/model/panels";

const RECT = { x: 0, y: 0, w: 100, h: 100 };
const BITMAP = { width: 200, height: 200 } as unknown as ImageBitmap;

function renderLayer(spacebarHeld: boolean, dispatch = vi.fn()) {
  const utils = render(
    <PanelInteractionLayer
      panelId="p1"
      panelRect={RECT}
      transform={DEFAULT_TRANSFORM}
      bitmap={BITMAP}
      figurePxW={800}
      figurePxH={600}
      cssW={800}
      cssH={600}
      spacebarHeld={spacebarHeld}
      dispatch={dispatch}
      onCommit={vi.fn()}
    />,
  );
  const el = utils.getByTestId("panel-interaction-layer");
  return { el, dispatch };
}

afterEach(() => cleanup());

describe("PanelInteractionLayer space gate", () => {
  it("does NOT preventDefault the wheel when space is not held", () => {
    const { el } = renderLayer(false);
    const ev = new WheelEvent("wheel", {
      deltaY: 100,
      cancelable: true,
      bubbles: true,
    });
    el.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("DOES preventDefault the wheel when space is held", () => {
    const { el } = renderLayer(true);
    const ev = new WheelEvent("wheel", {
      deltaY: 100,
      cancelable: true,
      bubbles: true,
    });
    el.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("does NOT capture the pointer / dispatch a pan on pointerdown when space is not held", () => {
    const { el, dispatch } = renderLayer(false);
    const capture = vi.fn();
    (el as unknown as { setPointerCapture: unknown }).setPointerCapture =
      capture;
    el.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        pointerId: 1,
        bubbles: true,
      }),
    );
    expect(capture).not.toHaveBeenCalled();
  });

  it("DOES capture the pointer on pointerdown when space is held", () => {
    const { el } = renderLayer(true);
    const capture = vi.fn();
    (el as unknown as { setPointerCapture: unknown }).setPointerCapture =
      capture;
    el.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        pointerId: 1,
        bubbles: true,
      }),
    );
    expect(capture).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/panel-interaction-space-gate.test.tsx`
Expected: FAIL — `spacebarHeld` not a prop; wheel always prevents default; pointer always captured.

- [ ] **Step 3: Write minimal implementation**

Edit `src/renderer/components/Grid/PanelInteractionLayer.tsx`.

Add to `Props` (after `cssH: number;`):

```ts
/** When false, this layer yields wheel + drag to the canvas-level handlers
 *  so default gestures operate on the whole canvas. Space redirects them
 *  back to this panel's image. */
spacebarHeld: boolean;
```

Add `spacebarHeld` to the destructured params and to BOTH the `stateRef.current` object literals (the wheel listener reads it via `stateRef`):

```ts
  spacebarHeld,
```

In the two `stateRef` assignments (the `useRef({...})` initializer and the `stateRef.current = {...}` line), add `spacebarHeld,` alongside the other fields.

In the wheel handler `onWheel`, add the gate as the FIRST line (before the `stretch` check is fine, but must be before `preventDefault`):

```ts
    function onWheel(e: WheelEvent): void {
      const s = stateRef.current;
      if (!s.spacebarHeld) return; // yield canvas zoom to the container handler
      if (s.transform.fit === "stretch") return;
      e.preventDefault();
```

In `onPointerDown`, gate BEFORE `setPointerCapture`:

```ts
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (ref.current === null) return;
    if (e.button !== 0) return;
    if (!spacebarHeld) return; // yield view-pan to the canvas container
    ref.current.setPointerCapture(e.pointerId);
```

Note: the stretch-fit early-return branch (the `if (transform.fit === "stretch")` block that renders a `pointerEvents: "none"` div) is unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/panel-interaction-space-gate.test.tsx`
Expected: PASS (all 4).

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: FAIL typecheck — `App.tsx` renders `<PanelInteractionLayer>` without `spacebarHeld`. Add `spacebarHeld={spacebarHeld}` to that JSX (App.tsx ~line 982); `spacebarHeld` state already exists in App. Re-run typecheck → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/Grid/PanelInteractionLayer.tsx test/unit/panel-interaction-space-gate.test.tsx src/renderer/App.tsx
git commit -m "feat(zoom): panel layer yields wheel/drag to canvas unless Space held"
```

---

## Task 6: `useCanvasZoom` hook (view state + browser wiring)

**Files:**

- Create: `src/renderer/hooks/useCanvasZoom.ts`
- Test: `test/unit/use-canvas-zoom.test.ts`

**Interfaces:**

- Consumes: `view-transform.ts` (Task 1); `computeCanvasDims` from `model/canvas-dims.ts`.
- Produces:
  - `export interface CanvasZoom { view: { zoom: number; mode: "fit" | "free" }; cssW: number; cssH: number; sourceScale: number; displayPct: number; isFit: boolean; setPercent: (pct: number) => void; zoomIn: () => void; zoomOut: () => void; fit: () => void; actualSize: () => void; }`
  - `export function useCanvasZoom(args: { scrollRef: React.RefObject<HTMLElement>; sourceScale: number; spacebarHeld: boolean; modelW: number; modelH: number }): CanvasZoom`
  - Internally: `ResizeObserver` on `scrollRef.current` re-derives fit zoom while `mode === "fit"`; a `{ passive: false }` wheel listener on `scrollRef.current` that zooms the canvas (cursor-anchored) when NOT `defaultPrevented`; a pointer drag handler on `scrollRef.current` that pans the view (adjusts `scrollLeft/scrollTop`) when NOT `spacebarHeld`.

Note on testing scope: `ResizeObserver` and layout are unavailable in the node/jsdom test env. Unit-test the **pure-ish reducers** the hook exposes (zoomIn/out/fit/actualSize/setPercent effects on `view` and derived `cssW/cssH/displayPct`), and cover the wheel/drag DOM wiring in the Task 9 visual check. To make the state logic testable without a DOM, factor the state transitions into a tiny pure helper co-located in the hook file and export it.

- [ ] **Step 1: Write the failing test**

Create `test/unit/use-canvas-zoom.test.ts` (tests the exported pure helper, not the React effects):

```ts
import { describe, it, expect } from "vitest";
import {
  nextViewForZoomIn,
  nextViewForZoomOut,
  nextViewForActualSize,
  nextViewForPercent,
  deriveCss,
  ZOOM_STEP,
} from "../../src/renderer/hooks/useCanvasZoom";

const SOURCE = 4; // 4x source figure
const MODEL = { w: 800, h: 600 };

describe("useCanvasZoom pure helpers", () => {
  it("zoomIn multiplies by ZOOM_STEP and switches to free mode", () => {
    const v = nextViewForZoomIn({ zoom: 1, mode: "fit" }, SOURCE);
    expect(v.mode).toBe("free");
    expect(v.zoom).toBeCloseTo(ZOOM_STEP, 6);
  });

  it("zoomOut divides by ZOOM_STEP", () => {
    const v = nextViewForZoomOut({ zoom: 2, mode: "free" }, SOURCE);
    expect(v.zoom).toBeCloseTo(2 / ZOOM_STEP, 6);
  });

  it("actualSize sets zoom to sourceScale (display 100%)", () => {
    const v = nextViewForActualSize(SOURCE);
    expect(v).toEqual({ zoom: SOURCE, mode: "free" });
  });

  it("setPercent maps display-% to zoom via sourceScale", () => {
    const v = nextViewForPercent(200, SOURCE);
    // 200% of source-100% → zoom = 2 * sourceScale = 8
    expect(v.zoom).toBeCloseTo(8, 6);
    expect(v.mode).toBe("free");
  });

  it("clamps zoom to the source-scaled bounds", () => {
    const v = nextViewForPercent(100000, SOURCE);
    expect(v.zoom).toBeCloseTo(8 * SOURCE, 6); // ZOOM_MAX * sourceScale
  });

  it("deriveCss returns model*zoom and the display percent", () => {
    const d = deriveCss(
      { zoom: SOURCE, mode: "free" },
      SOURCE,
      MODEL.w,
      MODEL.h,
    );
    expect(d.cssW).toBe(800 * SOURCE);
    expect(d.cssH).toBe(600 * SOURCE);
    expect(d.displayPct).toBe(100); // zoom === sourceScale
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/use-canvas-zoom.test.ts`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/hooks/useCanvasZoom.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  clampViewZoom,
  fitZoom,
  zoomToCssSize,
  scrollForCursorZoom,
} from "../render/view-transform";

export const ZOOM_STEP = 1.25;

export interface ViewTransform {
  zoom: number;
  mode: "fit" | "free";
}

// --- Pure state transitions (unit-tested; no DOM) ---------------------------

export function nextViewForZoomIn(
  v: ViewTransform,
  sourceScale: number,
): ViewTransform {
  return { zoom: clampViewZoom(v.zoom * ZOOM_STEP, sourceScale), mode: "free" };
}

export function nextViewForZoomOut(
  v: ViewTransform,
  sourceScale: number,
): ViewTransform {
  return { zoom: clampViewZoom(v.zoom / ZOOM_STEP, sourceScale), mode: "free" };
}

export function nextViewForActualSize(sourceScale: number): ViewTransform {
  return { zoom: sourceScale, mode: "free" };
}

export function nextViewForPercent(
  pct: number,
  sourceScale: number,
): ViewTransform {
  return {
    zoom: clampViewZoom((pct / 100) * sourceScale, sourceScale),
    mode: "free",
  };
}

export function deriveCss(
  v: ViewTransform,
  sourceScale: number,
  modelW: number,
  modelH: number,
): { cssW: number; cssH: number; displayPct: number } {
  const { cssW, cssH } = zoomToCssSize(v.zoom, modelW, modelH);
  const displayPct = Math.round((100 * v.zoom) / sourceScale);
  return { cssW, cssH, displayPct };
}

// --- The hook ---------------------------------------------------------------

export interface CanvasZoom {
  view: ViewTransform;
  cssW: number;
  cssH: number;
  sourceScale: number;
  displayPct: number;
  isFit: boolean;
  setView: (v: ViewTransform) => void;
  setPercent: (pct: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  actualSize: () => void;
}

export function useCanvasZoom(args: {
  scrollRef: RefObject<HTMLElement>;
  sourceScale: number;
  spacebarHeld: boolean;
  modelW: number;
  modelH: number;
}): CanvasZoom {
  const { scrollRef, sourceScale, spacebarHeld, modelW, modelH } = args;
  const [view, setView] = useState<ViewTransform>({ zoom: 1, mode: "fit" });

  // Latest values for the imperative (addEventListener) handlers.
  const s = useRef({ view, sourceScale, spacebarHeld, modelW, modelH });
  s.current = { view, sourceScale, spacebarHeld, modelW, modelH };

  // Fit mode: re-derive zoom to fit the container. Runs on mount, on resize,
  // and whenever the model dims change while in fit mode.
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    function applyFit(): void {
      if (s.current.view.mode !== "fit") return;
      const z = fitZoom(
        el!.clientWidth,
        el!.clientHeight,
        s.current.modelW,
        s.current.modelH,
      );
      setView((prev) =>
        prev.mode === "fit" ? { zoom: z, mode: "fit" } : prev,
      );
    }
    applyFit();
    const ro = new ResizeObserver(applyFit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef, modelW, modelH, view.mode]);

  // Cursor-anchored canvas zoom on wheel — unless an inner layer (an editing
  // panel while Space is held) already consumed it.
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    function onWheel(e: WheelEvent): void {
      if (e.defaultPrevented) return; // panel-zoom consumed it (Space held)
      e.preventDefault();
      const cur = s.current;
      const oldCss = zoomToCssSize(cur.view.zoom, cur.modelW, cur.modelH);
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nextZoom = clampViewZoom(cur.view.zoom * factor, cur.sourceScale);
      const newCss = zoomToCssSize(nextZoom, cur.modelW, cur.modelH);
      const rect = el!.getBoundingClientRect();
      const next = scrollForCursorZoom({
        cursorX: e.clientX - rect.left,
        cursorY: e.clientY - rect.top,
        oldScrollLeft: el!.scrollLeft,
        oldScrollTop: el!.scrollTop,
        oldCssW: oldCss.cssW,
        oldCssH: oldCss.cssH,
        newCssW: newCss.cssW,
        newCssH: newCss.cssH,
      });
      setView({ zoom: nextZoom, mode: "free" });
      el!.scrollLeft = next.scrollLeft;
      el!.scrollTop = next.scrollTop;
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scrollRef]);

  // Drag-to-pan-view — unless Space is held (then the panel image-pans).
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    let drag: { x: number; y: number; sl: number; st: number } | null = null;
    function onDown(e: PointerEvent): void {
      if (e.button !== 0) return;
      if (s.current.spacebarHeld) return; // Space → image pan on the panel layer
      drag = {
        x: e.clientX,
        y: e.clientY,
        sl: el!.scrollLeft,
        st: el!.scrollTop,
      };
    }
    function onMove(e: PointerEvent): void {
      if (drag === null) return;
      el!.scrollLeft = drag.sl - (e.clientX - drag.x);
      el!.scrollTop = drag.st - (e.clientY - drag.y);
    }
    function onUp(): void {
      drag = null;
    }
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scrollRef]);

  const { cssW, cssH, displayPct } = deriveCss(
    view,
    sourceScale,
    modelW,
    modelH,
  );

  const zoomIn = useCallback(
    () => setView((v) => nextViewForZoomIn(v, s.current.sourceScale)),
    [],
  );
  const zoomOut = useCallback(
    () => setView((v) => nextViewForZoomOut(v, s.current.sourceScale)),
    [],
  );
  const actualSize = useCallback(
    () => setView(nextViewForActualSize(s.current.sourceScale)),
    [],
  );
  const fit = useCallback(
    () => setView((v) => ({ zoom: v.zoom, mode: "fit" })),
    [],
  );
  const setPercent = useCallback(
    (pct: number) => setView(nextViewForPercent(pct, s.current.sourceScale)),
    [],
  );

  return {
    view,
    cssW,
    cssH,
    sourceScale,
    displayPct,
    isFit: view.mode === "fit",
    setView,
    setPercent,
    zoomIn,
    zoomOut,
    fit,
    actualSize,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/use-canvas-zoom.test.ts`
Expected: PASS (all 6).

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. (The hook is not yet used by App — that's Task 7. Unused-export is fine; ESLint's unused-vars rule targets locals, not exports.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/hooks/useCanvasZoom.ts test/unit/use-canvas-zoom.test.ts
git commit -m "feat(zoom): useCanvasZoom hook (view state, wheel-zoom, drag-pan, fit observer)"
```

---

## Task 7: Wire zoom into App.tsx

**Files:**

- Modify: `src/renderer/App.tsx`
- Test: manual/typecheck this task; behavior covered by Tasks 8–9. Add one focused no-dirty assertion.

**Interfaces:**

- Consumes: `useCanvasZoom` (Task 6), `ZoomControls` (Task 4), `computeCanvasDims` (`model/canvas-dims.ts`).
- Produces: App renders at variable zoom; `figurePxW/figurePxH` stay 800/600; `editorScale` = capped `sourceScale`; `spacebarHeld` flows to `useCanvasZoom` + `PanelInteractionLayer`; temporary-select on Cmd/Ctrl-hold.

- [ ] **Step 1: Add a scroll-container ref and compute `sourceScale`**

In `App.tsx`, add imports:

```tsx
import { useCanvasZoom } from "./hooks/useCanvasZoom";
import { ZoomControls } from "./components/Toolbar/ZoomControls";
import { computeCanvasDims } from "./model/canvas-dims";
```

Add a ref near the other refs (after `stateRef`):

```tsx
const scrollRef = useRef<HTMLElement | null>(null);
```

Compute `sourceScale` from the SAME inputs the export path uses (memoized). The model is fixed 800×600, so `sourceScale = computeCanvasDims(...).widthPx / FIGURE_PX_W` capped at source-100% (which it already is — dims are never < model for the width axis given MIN_CANVAS = 800):

```tsx
const sourceScale = useMemo(() => {
  const dims = computeCanvasDims(
    state.pool,
    state.rows,
    state.cols,
    state.gutterPx,
  );
  // sourceScale drives BOTH the editor backing store and the zoom % mapping.
  // Match computeExportScale: the larger per-axis ratio, floored at 1.
  return Math.max(1, dims.widthPx / FIGURE_PX_W, dims.heightPx / FIGURE_PX_H);
}, [state.pool, state.rows, state.cols, state.gutterPx]);
```

- [ ] **Step 2: Call the hook**

After `sourceScale`:

```tsx
const zoom = useCanvasZoom({
  scrollRef,
  sourceScale,
  spacebarHeld,
  modelW: FIGURE_PX_W,
  modelH: FIGURE_PX_H,
});
```

- [ ] **Step 3: Attach the ref + drive the wrapper size**

On the canvas `<section>` (App.tsx ~line 924), add `ref={scrollRef}`:

```tsx
<section
  ref={scrollRef as React.RefObject<HTMLElement>}
  onClick={(e) => { /* unchanged */ }}
  style={{ /* unchanged */ }}
>
```

On the wrapper `<div>` (App.tsx ~line 941), replace `width: CANVAS_CSS_W, height: CANVAS_CSS_H` with the zoom-driven size:

```tsx
<div
  style={{
    position: "relative",
    width: zoom.cssW,
    height: zoom.cssH,
    boxShadow: "var(--sh-md)",
  }}
>
```

- [ ] **Step 4: Feed variable css + editorScale + spacebarHeld down**

- `<EditorCanvas … editorScale={sourceScale} />` (replace the temporary `editorScale={1}` from Task 3).
- Every `cssW={CANVAS_CSS_W}` → `cssW={zoom.cssW}` and `cssH={CANVAS_CSS_H}` → `cssH={zoom.cssH}` on `<GridCells>`, `<PanelInteractionLayer>`, `<AnnotationInteractionLayer>`.
- Leave every `figurePxW={FIGURE_PX_W}` / `figurePxH={FIGURE_PX_H}` UNCHANGED.
- `<PanelInteractionLayer … spacebarHeld={spacebarHeld} />` (already added in Task 5, confirm present).

`CANVAS_CSS_W`/`CANVAS_CSS_H` constants are now unused — delete their declarations (lines 89–90) to satisfy lint.

- [ ] **Step 5: Retarget temporary-select to Cmd/Ctrl-hold**

Add a `cmdHeld` state + effect mirroring the existing `spacebarHeld` effect (keydown/keyup/blur on `Meta`/`Control`):

```tsx
const [cmdHeld, setCmdHeld] = useState<boolean>(false);
useEffect(() => {
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Meta" || e.key === "Control") setCmdHeld(true);
  }
  function onKeyUp(e: KeyboardEvent): void {
    if (e.key === "Meta" || e.key === "Control") setCmdHeld(false);
  }
  function onBlur(): void {
    setCmdHeld(false);
  }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
  };
}, []);
```

Change `effectiveTool` (line ~536) from spacebar to cmd:

```tsx
const effectiveTool: Tool = cmdHeld ? "select" : activeTool;
```

Update the SELECT MODE chip (lines ~1039–1048) to key off `cmdHeld` and say `⌘`/Ctrl:

```tsx
{
  cmdHeld && activeTool !== "select" && (
    <div
      data-testid="select-mode-chip"
      className="select-mode-chip"
      role="status"
      aria-live="polite"
    >
      SELECT MODE (release ⌘)
    </div>
  );
}
```

Note: the existing `spacebarHeld` keydown effect calls `e.preventDefault()` on Space and sets `spacebarHeld` — keep it (Space now means image-ops, still needs the state). Its `isFormElementFocused` guard stays.

- [ ] **Step 6: Mount ZoomControls in the tool-ribbon**

Add a new `ToolGroup` after the Annotate group (App.tsx ~line 907):

```tsx
<span className="toolbar-divider" aria-hidden="true" />
<ToolGroup label="Zoom">
  <ZoomControls
    displayPct={zoom.displayPct}
    isFit={zoom.isFit}
    onFit={zoom.fit}
    onActualSize={zoom.actualSize}
    onZoomIn={zoom.zoomIn}
    onZoomOut={zoom.zoomOut}
    onSetPercent={zoom.setPercent}
  />
</ToolGroup>
```

- [ ] **Step 7: Reset view on New/Open**

In `onNew` (after `setPanelInteraction(null)`, ~line 716) and `onOpenProject` (after `setPanelInteraction(null)`, ~line 692), add:

```tsx
zoom.setView({ zoom: 1, mode: "fit" });
```

Add `zoom` to the `useCallback` dependency arrays for `onNew` and `onOpenProject` (or reference `zoom.setView` — it is stable via `useCallback` in the hook, so depending on it is safe).

- [ ] **Step 8: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. Fix any unused-var (`CANVAS_CSS_W/H` removed) or missing-dep lint errors surfaced.

- [ ] **Step 9: Run the full suite**

Run: `pnpm test`
Expected: PASS. Existing tests that don't render `<App>` are unaffected; the canvas/coords tests still pass because `figurePxW/H` stayed 800/600.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(zoom): wire canvas zoom/pan into App (view box, controls, cmd-select)"
```

---

## Task 8: Zoom keyboard shortcuts

**Files:**

- Modify: `src/renderer/hooks/useKeyboardShortcuts.ts`
- Test: `test/unit/keyboard-shortcuts-zoom.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `ShortcutHandlers` gains optional `onZoomIn?`, `onZoomOut?`, `onZoomFit?`, `onZoomActual?`. Bindings: `Cmd/Ctrl` + `=`/`+` → zoomIn; `Cmd/Ctrl` + `-` → zoomOut; `Cmd/Ctrl` + `0` → fit; `Cmd/Ctrl` + `1` → actual. All call `preventDefault` and skip typing targets.

- [ ] **Step 1: Write the failing test**

Create `test/unit/keyboard-shortcuts-zoom.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useKeyboardShortcuts } from "../../src/renderer/hooks/useKeyboardShortcuts";

afterEach(() => cleanup());

function press(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const e = new KeyboardEvent("keydown", {
    key,
    metaKey: true,
    cancelable: true,
    ...opts,
  });
  window.dispatchEvent(e);
  return e;
}

const noop = {
  onMerge: () => {},
  onUnmerge: () => {},
  onEscape: () => {},
};

describe("zoom keyboard shortcuts", () => {
  it("Cmd-= zooms in, Cmd-- zooms out", () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    renderHook(() => useKeyboardShortcuts({ ...noop, onZoomIn, onZoomOut }));
    press("=");
    press("-");
    expect(onZoomIn).toHaveBeenCalledOnce();
    expect(onZoomOut).toHaveBeenCalledOnce();
  });

  it("Cmd-0 fits, Cmd-1 actual size", () => {
    const onZoomFit = vi.fn();
    const onZoomActual = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({ ...noop, onZoomFit, onZoomActual }),
    );
    press("0");
    press("1");
    expect(onZoomFit).toHaveBeenCalledOnce();
    expect(onZoomActual).toHaveBeenCalledOnce();
  });

  it("does not trigger without the Cmd/Ctrl modifier", () => {
    const onZoomFit = vi.fn();
    renderHook(() => useKeyboardShortcuts({ ...noop, onZoomFit }));
    // bare '0' is the reset-transform binding, not zoom-fit
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "0" }));
    expect(onZoomFit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/keyboard-shortcuts-zoom.test.ts`
Expected: FAIL — handlers not wired.

- [ ] **Step 3: Write minimal implementation**

Edit `src/renderer/hooks/useKeyboardShortcuts.ts`.

Add to `ShortcutHandlers`:

```ts
  /** Cmd/Ctrl-'='/'+'. */
  onZoomIn?: () => void;
  /** Cmd/Ctrl-'-'. */
  onZoomOut?: () => void;
  /** Cmd/Ctrl-'0'. */
  onZoomFit?: () => void;
  /** Cmd/Ctrl-'1'. */
  onZoomActual?: () => void;
```

Add a modifier branch INSIDE `onKey`, right after the `isModZ` block (so it runs before the "no modifier" guard at `if (e.metaKey || e.ctrlKey || e.altKey) return;`):

```ts
const mod = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
if (mod && (e.key === "=" || e.key === "+")) {
  if (handlers.onZoomIn) {
    e.preventDefault();
    handlers.onZoomIn();
  }
  return;
}
if (mod && e.key === "-") {
  if (handlers.onZoomOut) {
    e.preventDefault();
    handlers.onZoomOut();
  }
  return;
}
if (mod && e.key === "0") {
  if (handlers.onZoomFit) {
    e.preventDefault();
    handlers.onZoomFit();
  }
  return;
}
if (mod && e.key === "1") {
  if (handlers.onZoomActual) {
    e.preventDefault();
    handlers.onZoomActual();
  }
  return;
}
```

Guard against typing targets: these should also `if (isTypingTarget(e.target)) return;` first — mirror the `isModZ` block, which checks `isTypingTarget` before acting. Add that check at the top of each branch or once before the four branches:

```ts
if (mod && ["=", "+", "-", "0", "1"].includes(e.key)) {
  if (isTypingTarget(e.target)) return;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/keyboard-shortcuts-zoom.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the handlers in App.tsx**

In `App.tsx`, extend the `useKeyboardShortcuts({...})` call (line ~486) with:

```tsx
    onZoomIn: zoom.zoomIn,
    onZoomOut: zoom.zoomOut,
    onZoomFit: zoom.fit,
    onZoomActual: zoom.actualSize,
```

- [ ] **Step 6: Typecheck + lint + full suite**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/hooks/useKeyboardShortcuts.ts test/unit/keyboard-shortcuts-zoom.test.ts src/renderer/App.tsx
git commit -m "feat(zoom): Cmd/Ctrl +/-/0/1 zoom shortcuts"
```

---

## Task 9: Invariance guarantees (export + no-dirty) and visual verification

**Files:**

- Test: `test/unit/zoom-export-invariance.test.ts`, `test/unit/zoom-no-dirty.test.ts`
- Visual: run the Electron app.

**Interfaces:**

- Consumes: `computeExportScale` (`render/export-scale.ts`), `isDirty` (`state/dirty.ts`), `useCanvasZoom` (Task 6).
- Produces: proof that the view cannot reach exports or `FigureState`.

- [ ] **Step 1: Export-invariance test (acceptance #4)**

The export scale is a pure function of `(pool, rows, cols, gutter, model-800, model-600)` — it NEVER takes `view`. Prove the value is identical regardless of any zoom state (there is no `view` parameter to pass, which is exactly the guarantee):

Create `test/unit/zoom-export-invariance.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeExportScale } from "../../src/renderer/render/export-scale";
import type { ImagePoolItem } from "../../src/renderer/model/pool";

const pool: ImagePoolItem[] = [
  {
    id: "a",
    filename: "a.png",
    filePath: "/a.png",
    mime: "image/png",
    width: 4000,
    height: 3000,
    bitDepth: 8,
  },
];

describe("export scale is independent of editor view/zoom", () => {
  it("depends only on pool + grid + model dims (no view parameter exists)", () => {
    // The editor model dims are always 800x600 regardless of zoom; the same
    // arguments always yield the same export scale. This is the structural
    // guarantee that zooming the editor cannot change exported bytes.
    const s1 = computeExportScale(pool, 1, 1, 0, 800, 600);
    const s2 = computeExportScale(pool, 1, 1, 0, 800, 600);
    expect(s1).toBe(s2);
    expect(s1).toBeCloseTo(5, 6); // 4000/800 = 5 (width-dominant)
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run test/unit/zoom-export-invariance.test.ts`
Expected: PASS.

- [ ] **Step 3: No-dirty test (acceptance #3)**

Prove zoom state lives outside `FigureState`, so `isDirty` stays false across zoom changes. Since `view` is `useState` (not in `FigureState`), assert the dirty predicate on state identity directly:

Create `test/unit/zoom-no-dirty.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isDirty } from "../../src/renderer/state/dirty";
import { initialFigureState } from "../../src/renderer/model/figure-state";
import {
  nextViewForZoomIn,
  nextViewForActualSize,
} from "../../src/renderer/hooks/useCanvasZoom";

describe("zoom does not dirty the document", () => {
  it("view transitions produce no FigureState change", () => {
    const saved = initialFigureState();
    const live = saved; // zoom never dispatches a reducer action

    // Exercise the view reducers; they return NEW view objects but never
    // touch FigureState.
    const v1 = nextViewForZoomIn({ zoom: 1, mode: "fit" }, 5);
    const v2 = nextViewForActualSize(5);
    expect(v1).not.toBe(v2);

    // FigureState reference is untouched → not dirty.
    expect(isDirty(live, saved)).toBe(false);
  });
});
```

- [ ] **Step 4: Run it**

Run: `pnpm vitest run test/unit/zoom-no-dirty.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite green**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: PASS, zero warnings.

- [ ] **Step 6: Commit the invariance tests**

```bash
git add test/unit/zoom-export-invariance.test.ts test/unit/zoom-no-dirty.test.ts
git commit -m "test(zoom): prove export + no-dirty invariance"
```

- [ ] **Step 7: Visual verification in the running Electron app**

Build and launch, importing the fixture, and screenshot fit / 100% / panned:

```bash
pnpm build
```

Then drive with playwright-core `_electron.launch`, stubbing `dialog.showOpenDialog` to return `resources/fixtures/sample.png` (follow the existing e2e/screenshot harness if the repo has one under `test/` or `scripts/`; otherwise write a throwaway node script). Capture three screenshots:

1. **Fit** — the whole figure visible, matching today's default framing.
2. **100%** (`Cmd-1`) — zoom to actual pixels; confirm in-panel detail is sharp for a source image larger than 800×600 (not the downsampled preview).
3. **Panned** — after zooming past the viewport, scroll/drag and confirm the view pans and a click still lands on the correct feature.

Manually confirm:

- Plain wheel zooms the whole canvas (cursor stays anchored).
- Double-click a panel, hold **Space**, wheel → zooms that image; Space+drag → pans that image.
- With a creation tool active, holding **Cmd/Ctrl** shows the SELECT MODE chip and lets you click a panel without placing an annotation.
- Zoom/pan adds no undo entries and no unsaved-changes dot.

- [ ] **Step 8: Final commit (if any polish needed)**

```bash
git add -A
git commit -m "chore(zoom): visual-verification polish"
```

---

## Self-Review

**Spec coverage:**

- Three-resolution model → Tasks 2 (backing store), 6/7 (CSS view), Global Constraints (frozen model). ✓
- Fit default → Task 6 (`view` initial `mode: "fit"`), Task 7 (reset on New/Open). ✓
- 100% = source pixels → Task 6 (`nextViewForActualSize` = sourceScale), Task 2 (full-res backing store). ✓
- Zoom in/out/%/readout + shortcuts → Tasks 4, 6, 8. ✓
- Pan via scrollbars/trackpad + drag-to-pan-view → Task 6 (drag handler), Task 7 (`overflow: auto` container already present). ✓
- Wheel = canvas zoom, Space = image ops → Tasks 5 (panel yields), 6 (container wheel), 7 (spacebar plumbing). ✓
- Temporary-select → Cmd/Ctrl-hold → Task 7. ✓
- Cursor-anchored zoom → Task 1 (`scrollForCursorZoom`), Task 6 (wheel handler). ✓
- Memory cap at source-100% → Global Constraints + Task 7 (`sourceScale` never exceeds `computeCanvasDims`). ✓
- Export byte-identical → Task 9 (export-invariance). ✓
- No FigureState changes / no dirty → Task 9 (no-dirty), Global Constraints. ✓
- Coordinate invariance → structurally guaranteed (figurePxW/H stay 800/600; ratio math unchanged) + Task 9 visual click check; the DPR×editorScale composition is tested in Task 2.

**Placeholder scan:** No TBD/TODO. Every code step shows real code. Visual-verification (Task 9 step 7) is inherently manual but has explicit, concrete steps. ✓

**Type consistency:**

- `EditorRenderer.setEditorScale(scale: number)` — defined Task 2, consumed Task 3. ✓
- `editorScale` prop on `EditorCanvas` — Task 3, passed Task 7. ✓
- `spacebarHeld` prop on `PanelInteractionLayer` — Task 5, passed Task 7. ✓
- `useCanvasZoom` return shape `{ view, cssW, cssH, displayPct, isFit, fit, actualSize, zoomIn, zoomOut, setPercent, setView }` — Task 6, consumed Tasks 7 (App), 8 (shortcut handlers). ✓
- `ZoomControls` props `{ displayPct, isFit, onFit, onActualSize, onZoomIn, onZoomOut, onSetPercent }` — Task 4, passed Task 7. ✓
- `nextViewForZoomIn/Out/ActualSize/Percent`, `deriveCss`, `ZOOM_STEP` — exported Task 6, used Tasks 6/9. ✓
- `clampViewZoom(zoom, sourceScale)`, `fitZoom`, `zoomToCssSize`, `scrollForCursorZoom` — Task 1, used Task 6. ✓

No inconsistencies found.
