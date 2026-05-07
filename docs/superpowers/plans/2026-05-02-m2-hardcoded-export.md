# M2 — Hard-Coded Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a hard-coded 2×2 figure (three placeholder rectangles + one bundled PNG) into an on-screen `<canvas>`, then export the **same** figure to a user-chosen PNG file via the main process — proving the editor/export shared-draw pipeline end-to-end.

**Architecture:** The renderer owns a tiny pure draw routine, `drawFigure(ctx, figure, images)`, that the editor calls with a downsampled context and the export pipeline calls with an `OffscreenCanvas` sized to final pixels. The figure model is a hard-coded literal (no Zustand yet — that lands in M5). PNG bytes are produced in the renderer via `canvas.convertToBlob`, shipped to the main process over a new typed IPC channel, and the main process writes them to a path chosen by `dialog.showSaveDialog`. One bundled fixture PNG ships in `resources/fixtures/` so the figure has a real image to draw and the test suite has a deterministic input.

**Tech Stack:** TypeScript 5.6 strict, React 18.3, Electron 32 (`contextBridge`, `ipcMain.handle`, `dialog.showSaveDialog`, `fs.promises.writeFile`), HTML5 Canvas 2D + `OffscreenCanvas`, Vitest (Node env, jsdom for canvas tests via `happy-dom` if needed — but we keep canvas tests pure-math where possible).

---

## File Structure

**Create:**

- `src/renderer/model/types.ts` — minimal v0 types for M2 (`Figure`, `HardCodedPanel`, `FigureCanvas`). Subset of the full data model in the project plan; expanded in later milestones.
- `src/renderer/model/hardcoded.ts` — exports `HARDCODED_FIGURE`, the literal 2×2 figure used by M2.
- `src/renderer/render/draw-figure.ts` — pure `drawFigure(ctx, figure, images)`. Same routine for editor + export.
- `src/renderer/render/editor-renderer.ts` — mounts on a `<canvas>` ref, sizes the backing store, schedules a single `requestAnimationFrame` per state change, calls `drawFigure`.
- `src/renderer/render/export-renderer.ts` — `renderFigureToPngBlob(figure, images)`: `OffscreenCanvas` at full figure pixel size → `drawFigure` → `convertToBlob({type:"image/png"})`.
- `src/renderer/image/load-image.ts` — `loadImageBitmap(url): Promise<ImageBitmap>` thin wrapper around `fetch + createImageBitmap`.
- `src/renderer/components/Canvas/EditorCanvas.tsx` — React component that owns the `<canvas>` ref and wires it to `editor-renderer`.
- `src/renderer/components/Toolbar/ExportButton.tsx` — single button labelled "Export as PNG". Calls a renderer-side helper that produces the PNG blob and pushes its bytes to main.
- `src/renderer/export/png.ts` — `exportFigureAsPng(figure, images): Promise<{ ok: true } | { ok: false; reason: string }>`. Wraps the export-renderer + `window.api.exportPng`.
- `src/main/dialogs.ts` — pure-ish wrapper around `dialog.showSaveDialog` returning `{ canceled, filePath }`. Side-effecty but isolated for stubbing.
- `src/main/fs-write.ts` — `writePngFile(filePath, bytes): Promise<void>` — writes via `fs.promises.writeFile`. Validates `.png` extension; rejects path traversal outside the chosen directory.
- `resources/fixtures/sample.png` — small (256×256) bundled PNG. Created via a one-shot Node script in this plan; committed.

**Modify:**

- `src/preload/api.ts` — add `exportPng(bytes: Uint8Array, defaultName: string): Promise<ExportResult>` to `MosaicApi`; add the new channel name to `API_CHANNELS`.
- `src/preload/preload.ts` — wire the new method through `ipcRenderer.invoke`.
- `src/main/index.ts` — register the new IPC handler in `registerIpc()`.
- `src/renderer/App.tsx` — replace the M1 ping demo with the editor canvas + export button layout.
- `vite.config.ts` — make `resources/` available to the renderer (Vite's `publicDir` defaults to `public/`; we'll add `publicDir: "resources"` or copy the fixture into `public/`).
- `package.json` — add the `dependencies` we'll actually use (none new beyond React for M2; we may add `@types/node` is already devDep). Add `test:run` is already there. No new deps required.

**Test (Vitest):**

- `test/unit/draw-figure.test.ts` — pure tests of layout math: panel rect computation given grid + gutter + canvas size.
- `test/unit/figure-layout.test.ts` — tests for a small extracted `computePanelRects(figure)` helper.
- `test/unit/export-png-shape.test.ts` — tests that `renderFigureToPngBlob` produces a `Blob` of `type === "image/png"` and `size > 0` when given a 2×2 figure with one image. Uses `happy-dom` env or skips with a clear marker if `OffscreenCanvas` is unavailable in the test env (we'll use `node-canvas` polyfill — see Task 8).
- `test/unit/preload-api-shape.test.ts` — extend existing test: assert `exportPng` channel name and method exist.
- `test/unit/fs-write.test.ts` — `writePngFile` rejects non-`.png` paths, writes bytes to a temp dir.
- `test/unit/dialogs.test.ts` — `pickPngSavePath` is exported, returns `{ canceled, filePath }` shape (we mock `dialog.showSaveDialog`).

---

## Conventions for this plan

- All new files use ES module imports, no CommonJS.
- Renderer code: no Node imports. Main code: no DOM imports.
- Strict mode is on; we satisfy `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (these are already enabled in `tsconfig.main.json` and `tsconfig.renderer.json`).
- Each task ends with a commit. Commit messages follow the existing `feat(scope): summary (M2.N)` style visible in `git log` (`feat(main): wire app lifecycle and ping IPC (M1.7)`).
- Tests live in `test/unit/`, matching the existing layout.

---

## Task 1: Define the M2 figure types

**Files:**
- Create: `src/renderer/model/types.ts`

The full `Project`/`Panel` model from the project plan is bigger than M2 needs. We define a minimal `Figure` subset here — only what M2 renders and exports. M5+ will expand it (transforms, fit modes, annotations).

- [ ] **Step 1: Write the failing test**

Create `test/unit/figure-layout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Figure } from "../../src/renderer/model/types";

describe("Figure type", () => {
  it("accepts a 2x2 hard-coded figure literal", () => {
    const f: Figure = {
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      grid: { rows: 2, cols: 2, gutterPx: 12, gutterColor: "#FFFFFF" },
      panels: [
        { row: 0, col: 0, kind: "image", imageId: "sample" },
        { row: 0, col: 1, kind: "placeholder", label: "B" },
        { row: 1, col: 0, kind: "placeholder", label: "C" },
        { row: 1, col: 1, kind: "placeholder", label: "D" },
      ],
    };
    expect(f.grid.rows).toBe(2);
    expect(f.panels.length).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '../../src/renderer/model/types'`.

- [ ] **Step 3: Implement the types**

Create `src/renderer/model/types.ts`:

```ts
/**
 * M2 figure model — a deliberate subset of the full Project schema.
 * Expanded in M4 (configurable grid), M5 (per-panel transforms),
 * and M6 (annotations).
 */

export type Hex = string; // "#RRGGBB" or "#RRGGBBAA"

export interface FigureCanvas {
  widthPx: number;
  heightPx: number;
  background: Hex;
}

export interface FigureGrid {
  rows: number;
  cols: number;
  gutterPx: number;
  gutterColor: Hex;
}

export type HardCodedPanel =
  | { row: number; col: number; kind: "image"; imageId: string }
  | { row: number; col: number; kind: "placeholder"; label: string };

export interface Figure {
  canvas: FigureCanvas;
  grid: FigureGrid;
  panels: HardCodedPanel[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS for `figure-layout.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/model/types.ts test/unit/figure-layout.test.ts
git commit -m "feat(model): minimal Figure type for M2 (M2.1)"
```

---

## Task 2: Pure panel-rect layout math

**Files:**
- Create: `src/renderer/render/coords.ts`
- Test: `test/unit/figure-layout.test.ts` (extend)

Centralise the rect computation here. M5 will reuse this routine when computing per-panel transforms.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/figure-layout.test.ts`:

```ts
import { computePanelRects } from "../../src/renderer/render/coords";

describe("computePanelRects", () => {
  it("divides a 800x600 canvas into a 2x2 grid with 12px gutters", () => {
    const rects = computePanelRects({
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      grid: { rows: 2, cols: 2, gutterPx: 12, gutterColor: "#FFFFFF" },
      panels: [
        { row: 0, col: 0, kind: "placeholder", label: "A" },
        { row: 0, col: 1, kind: "placeholder", label: "B" },
        { row: 1, col: 0, kind: "placeholder", label: "C" },
        { row: 1, col: 1, kind: "placeholder", label: "D" },
      ],
    });

    // Available width = 800 - (cols+1)*gutter = 800 - 3*12 = 764; per cell = 382
    // Available height = 600 - 3*12 = 564; per cell = 282
    expect(rects).toHaveLength(4);
    expect(rects[0]).toEqual({ x: 12, y: 12, w: 382, h: 282 });
    expect(rects[1]).toEqual({ x: 12 + 382 + 12, y: 12, w: 382, h: 282 });
    expect(rects[2]).toEqual({ x: 12, y: 12 + 282 + 12, w: 382, h: 282 });
    expect(rects[3]).toEqual({ x: 12 + 382 + 12, y: 12 + 282 + 12, w: 382, h: 282 });
  });

  it("handles odd remainders by giving extra px to trailing cells", () => {
    const rects = computePanelRects({
      canvas: { widthPx: 101, heightPx: 50, background: "#FFFFFF" },
      grid: { rows: 1, cols: 2, gutterPx: 1, gutterColor: "#FFFFFF" },
      panels: [
        { row: 0, col: 0, kind: "placeholder", label: "A" },
        { row: 0, col: 1, kind: "placeholder", label: "B" },
      ],
    });
    // 101 - 3 = 98; 98/2 = 49 each, no remainder
    expect(rects[0]?.w).toBe(49);
    expect(rects[1]?.w).toBe(49);
    // y span: 50 - 2 = 48
    expect(rects[0]?.h).toBe(48);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '../../src/renderer/render/coords'`.

- [ ] **Step 3: Implement `computePanelRects`**

Create `src/renderer/render/coords.ts`:

```ts
import type { Figure, HardCodedPanel } from "../model/types";

export interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Computes the integer pixel rectangle for each panel in figure.panels,
 * in the same order. Outer gutter is included on all four edges.
 *
 * Width remainder distribution: cells get floor(avail/cols); the trailing
 * cell absorbs the remainder so the right edge lands on `widthPx - gutter`.
 */
export function computePanelRects(figure: Figure): PanelRect[] {
  const { widthPx, heightPx } = figure.canvas;
  const { rows, cols, gutterPx } = figure.grid;

  const availW = widthPx - gutterPx * (cols + 1);
  const availH = heightPx - gutterPx * (rows + 1);
  const cellW = Math.floor(availW / cols);
  const cellH = Math.floor(availH / rows);
  const wRemainder = availW - cellW * cols;
  const hRemainder = availH - cellH * rows;

  return figure.panels.map((p: HardCodedPanel): PanelRect => {
    const isLastCol = p.col === cols - 1;
    const isLastRow = p.row === rows - 1;
    const w = cellW + (isLastCol ? wRemainder : 0);
    const h = cellH + (isLastRow ? hRemainder : 0);
    const x = gutterPx + p.col * (cellW + gutterPx);
    const y = gutterPx + p.row * (cellH + gutterPx);
    return { x, y, w, h };
  });
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test`
Expected: PASS for both `computePanelRects` tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/render/coords.ts test/unit/figure-layout.test.ts
git commit -m "feat(render): computePanelRects pure layout (M2.2)"
```

---

## Task 3: Bundled fixture PNG

**Files:**
- Create: `resources/fixtures/sample.png`
- Modify: `vite.config.ts`

The fixture is a tiny generated PNG so M2 has a real image to draw. We generate it once via a Node one-liner and commit the bytes — no runtime generation, no extra deps.

- [ ] **Step 1: Generate a 256×256 PNG fixture**

Run from the repo root:

```bash
node -e '
const fs = require("node:fs");
const { PNG } = (() => { try { return require("pngjs"); } catch { return null; }})();
if (PNG === null) { console.error("pngjs not available; using minimal hand-rolled PNG"); process.exit(2); }
' || true
```

If `pngjs` is not available (likely), build a 256×256 PNG using only Node's `zlib`. Write a script `scripts/make-fixture-png.mjs`:

```js
// scripts/make-fixture-png.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

const W = 256, H = 256;
// Diagonal gradient so the test image is visually distinguishable.
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0; // filter byte: None
  for (let x = 0; x < W; x++) {
    const o = y * (1 + W * 3) + 1 + x * 3;
    raw[o]     = x;
    raw[o + 1] = y;
    raw[o + 2] = (x + y) >> 1;
  }
}
const idat = deflateSync(raw);

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, c]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 2;   // color type: truecolor RGB
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
mkdirSync("resources/fixtures", { recursive: true });
writeFileSync("resources/fixtures/sample.png", png);
console.log("wrote resources/fixtures/sample.png", png.length, "bytes");
```

Run: `node scripts/make-fixture-png.mjs`
Expected output: `wrote resources/fixtures/sample.png <N> bytes` where N is around 5–10 KB.

- [ ] **Step 2: Verify the file is a valid PNG**

Run: `file resources/fixtures/sample.png`
Expected: `PNG image data, 256 x 256, 8-bit/color RGB, non-interlaced`.

- [ ] **Step 3: Make the fixture available to the renderer at dev time**

Modify `vite.config.ts` — add `publicDir: "resources"` so `resources/fixtures/sample.png` is served at `/fixtures/sample.png` in dev and copied into `dist/renderer/fixtures/sample.png` on build.

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

export default defineConfig({
  publicDir: "resources",
  plugins: [
    react(),
    electron({
      main: {
        entry: "src/main/index.ts",
        vite: {
          build: {
            outDir: "dist-electron/main",
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
      preload: {
        input: "src/preload/preload.ts",
        vite: {
          build: {
            outDir: "dist-electron/preload",
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  build: {
    outDir: "dist/renderer",
  },
});
```

- [ ] **Step 4: Confirm the dev server serves the fixture**

Run: `pnpm dev` in one terminal, then in another: `curl -I http://localhost:5173/fixtures/sample.png`
Expected: `HTTP/1.1 200 OK` and `Content-Type: image/png`.

Stop the dev server after verifying.

- [ ] **Step 5: Commit**

```bash
git add resources/fixtures/sample.png scripts/make-fixture-png.mjs vite.config.ts
git commit -m "feat(resources): bundled 256x256 PNG fixture + serve via publicDir (M2.3)"
```

---

## Task 4: Image loader and the hard-coded figure literal

**Files:**
- Create: `src/renderer/image/load-image.ts`
- Create: `src/renderer/model/hardcoded.ts`

The loader is intentionally small for M2 — fetch a URL, return an `ImageBitmap`. M3 will replace this with a worker-based pipeline for TIFF; the function signature stays.

- [ ] **Step 1: Write the loader**

Create `src/renderer/image/load-image.ts`:

```ts
/**
 * Fetches an image URL and decodes it into an ImageBitmap.
 * Renderer-only (depends on fetch + createImageBitmap).
 */
export async function loadImageBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`loadImageBitmap: ${url} -> HTTP ${res.status}`);
  }
  const blob = await res.blob();
  return createImageBitmap(blob);
}
```

- [ ] **Step 2: Define the hard-coded figure**

Create `src/renderer/model/hardcoded.ts`:

```ts
import type { Figure } from "./types";

export const SAMPLE_IMAGE_URL = "/fixtures/sample.png";
export const SAMPLE_IMAGE_ID = "sample";

/**
 * The single, hard-coded figure rendered in M2. M3 replaces this with
 * a real, drag-driven image pool + grid state.
 */
export const HARDCODED_FIGURE: Figure = {
  canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
  grid: { rows: 2, cols: 2, gutterPx: 12, gutterColor: "#FFFFFF" },
  panels: [
    { row: 0, col: 0, kind: "image", imageId: SAMPLE_IMAGE_ID },
    { row: 0, col: 1, kind: "placeholder", label: "B" },
    { row: 1, col: 0, kind: "placeholder", label: "C" },
    { row: 1, col: 1, kind: "placeholder", label: "D" },
  ],
};
```

- [ ] **Step 3: Type-check**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/image/load-image.ts src/renderer/model/hardcoded.ts
git commit -m "feat(image): loadImageBitmap + hard-coded 2x2 figure literal (M2.4)"
```

---

## Task 5: Shared `drawFigure` routine

**Files:**
- Create: `src/renderer/render/draw-figure.ts`
- Test: `test/unit/draw-figure.test.ts`

This is the key M2 deliverable: **one** draw routine that runs unmodified for both the editor pipeline and the export pipeline. Editor passes the on-screen 2D context; export passes an `OffscreenCanvas` 2D context. Same pixels, by construction.

We test the draw routine via a `node-canvas`-backed `OffscreenCanvas` shim. To avoid adding a heavy dep, we instead test by **dependency-injecting** a minimal context interface — the test passes a fake context that records calls.

- [ ] **Step 1: Write the failing test**

Create `test/unit/draw-figure.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { drawFigure, type DrawCtx } from "../../src/renderer/render/draw-figure";
import type { Figure } from "../../src/renderer/model/types";

interface Call { op: string; args: unknown[]; }
function makeRecorder(): DrawCtx & { calls: Call[] } {
  const calls: Call[] = [];
  const rec = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); };
  return {
    calls,
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "left" as CanvasTextAlign,
    textBaseline: "top" as CanvasTextBaseline,
    fillRect: rec("fillRect") as DrawCtx["fillRect"],
    strokeRect: rec("strokeRect") as DrawCtx["strokeRect"],
    fillText: rec("fillText") as DrawCtx["fillText"],
    drawImage: rec("drawImage") as DrawCtx["drawImage"],
    save: rec("save") as DrawCtx["save"],
    restore: rec("restore") as DrawCtx["restore"],
    beginPath: rec("beginPath") as DrawCtx["beginPath"],
    rect: rec("rect") as DrawCtx["rect"],
    clip: rec("clip") as DrawCtx["clip"],
  };
}

const FIG: Figure = {
  canvas: { widthPx: 200, heightPx: 200, background: "#FAFAFA" },
  grid: { rows: 2, cols: 2, gutterPx: 10, gutterColor: "#FAFAFA" },
  panels: [
    { row: 0, col: 0, kind: "image", imageId: "sample" },
    { row: 0, col: 1, kind: "placeholder", label: "B" },
    { row: 1, col: 0, kind: "placeholder", label: "C" },
    { row: 1, col: 1, kind: "placeholder", label: "D" },
  ],
};

describe("drawFigure", () => {
  it("paints the canvas background first", () => {
    const ctx = makeRecorder();
    drawFigure(ctx, FIG, new Map());
    const first = ctx.calls[0];
    expect(first?.op).toBe("fillRect");
    expect(first?.args).toEqual([0, 0, 200, 200]);
  });

  it("draws the bundled image into panel (0,0) when provided", () => {
    const ctx = makeRecorder();
    const fakeBitmap = { width: 256, height: 256 } as unknown as ImageBitmap;
    drawFigure(ctx, FIG, new Map([["sample", fakeBitmap]]));
    const drew = ctx.calls.find((c) => c.op === "drawImage");
    expect(drew).toBeDefined();
    expect(drew?.args[0]).toBe(fakeBitmap);
  });

  it("falls back to a placeholder rect when an image is missing", () => {
    const ctx = makeRecorder();
    drawFigure(ctx, FIG, new Map()); // no images supplied
    // No drawImage calls; placeholder rects + labels instead
    expect(ctx.calls.some((c) => c.op === "drawImage")).toBe(false);
    // 4 placeholder strokeRects (one per cell) + 4 labels
    const strokes = ctx.calls.filter((c) => c.op === "strokeRect");
    expect(strokes.length).toBe(4);
    const labels = ctx.calls.filter((c) => c.op === "fillText");
    expect(labels.length).toBe(4);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '../../src/renderer/render/draw-figure'`.

- [ ] **Step 3: Implement `drawFigure`**

Create `src/renderer/render/draw-figure.ts`:

```ts
import type { Figure } from "../model/types";
import { computePanelRects, type PanelRect } from "./coords";

/**
 * Subset of CanvasRenderingContext2D / OffscreenCanvasRenderingContext2D
 * we depend on. Lets us unit-test with a recorder fake instead of a real
 * canvas, and lets one draw routine target both contexts at runtime.
 */
export interface DrawCtx {
  fillStyle: string;
  strokeStyle: string;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(
    img: CanvasImageSource,
    dx: number, dy: number, dw: number, dh: number,
  ): void;
  save(): void;
  restore(): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
}

const PLACEHOLDER_FILL = "#EEEEEE";
const PLACEHOLDER_STROKE = "#CCCCCC";
const PLACEHOLDER_LABEL = "#666666";

export function drawFigure(
  ctx: DrawCtx,
  figure: Figure,
  images: Map<string, ImageBitmap>,
): void {
  // 1. Background.
  ctx.fillStyle = figure.canvas.background;
  ctx.fillRect(0, 0, figure.canvas.widthPx, figure.canvas.heightPx);

  // 2. Each panel.
  const rects = computePanelRects(figure);
  for (let i = 0; i < figure.panels.length; i++) {
    const panel = figure.panels[i];
    const rect = rects[i];
    if (panel === undefined || rect === undefined) continue;

    if (panel.kind === "image") {
      const bitmap = images.get(panel.imageId);
      if (bitmap !== undefined) {
        drawImageContain(ctx, bitmap, rect);
      } else {
        drawPlaceholder(ctx, rect, "(missing)");
      }
    } else {
      drawPlaceholder(ctx, rect, panel.label);
    }
  }
}

function drawImageContain(
  ctx: DrawCtx,
  bitmap: ImageBitmap,
  rect: PanelRect,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  const scale = Math.min(rect.w / bitmap.width, rect.h / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  const x = rect.x + (rect.w - w) / 2;
  const y = rect.y + (rect.h - h) / 2;
  ctx.drawImage(bitmap, x, y, w, h);

  ctx.restore();
}

function drawPlaceholder(ctx: DrawCtx, rect: PanelRect, label: string): void {
  ctx.fillStyle = PLACEHOLDER_FILL;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = PLACEHOLDER_STROKE;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

  ctx.fillStyle = PLACEHOLDER_LABEL;
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test`
Expected: PASS for all three `drawFigure` cases.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/render/draw-figure.ts test/unit/draw-figure.test.ts
git commit -m "feat(render): shared drawFigure routine for editor + export (M2.5)"
```

---

## Task 6: Editor renderer mounted on `<canvas>`

**Files:**
- Create: `src/renderer/render/editor-renderer.ts`
- Create: `src/renderer/components/Canvas/EditorCanvas.tsx`

The editor renderer pure-functionally schedules a single `requestAnimationFrame` per state change. M2 has no Zustand yet, so we just expose `setFigure(...)` / `setImages(...)` and let the React component call them.

- [ ] **Step 1: Implement the renderer**

Create `src/renderer/render/editor-renderer.ts`:

```ts
import type { Figure } from "../model/types";
import { drawFigure } from "./draw-figure";

export interface EditorRenderer {
  setFigure(figure: Figure): void;
  setImages(images: Map<string, ImageBitmap>): void;
  dispose(): void;
}

/**
 * Mounts on an HTMLCanvasElement. Renders into a backing store sized to
 * the figure's pixel dimensions; CSS scales it down to fit the viewport.
 *
 * M2: single rAF coalescing. No editorScale yet — that lands in M5.
 */
export function createEditorRenderer(
  canvas: HTMLCanvasElement,
): EditorRenderer {
  let figure: Figure | null = null;
  let images: Map<string, ImageBitmap> = new Map();
  let rafHandle: number | null = null;
  let disposed = false;

  function schedule(): void {
    if (disposed || rafHandle !== null) return;
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      paint();
    });
  }

  function paint(): void {
    if (figure === null) return;
    if (canvas.width !== figure.canvas.widthPx) {
      canvas.width = figure.canvas.widthPx;
    }
    if (canvas.height !== figure.canvas.heightPx) {
      canvas.height = figure.canvas.heightPx;
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    drawFigure(ctx, figure, images);
  }

  return {
    setFigure(next: Figure): void { figure = next; schedule(); },
    setImages(next: Map<string, ImageBitmap>): void { images = next; schedule(); },
    dispose(): void {
      disposed = true;
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    },
  };
}
```

- [ ] **Step 2: Implement the React wrapper**

Create `src/renderer/components/Canvas/EditorCanvas.tsx`:

```tsx
import { useEffect, useRef } from "react";
import type { Figure } from "../../model/types";
import { createEditorRenderer, type EditorRenderer } from "../../render/editor-renderer";

interface Props {
  figure: Figure;
  images: Map<string, ImageBitmap>;
}

export function EditorCanvas({ figure, images }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<EditorRenderer | null>(null);

  useEffect(() => {
    if (canvasRef.current === null) return;
    const r = createEditorRenderer(canvasRef.current);
    rendererRef.current = r;
    return () => { r.dispose(); rendererRef.current = null; };
  }, []);

  useEffect(() => { rendererRef.current?.setFigure(figure); }, [figure]);
  useEffect(() => { rendererRef.current?.setImages(images); }, [images]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="editor-canvas"
      style={{
        display: "block",
        maxWidth: "100%",
        maxHeight: "calc(100vh - 120px)",
        width: "auto",
        height: "auto",
        border: "1px solid #DDD",
      }}
    />
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/render/editor-renderer.ts src/renderer/components/Canvas/EditorCanvas.tsx
git commit -m "feat(render): editor renderer + EditorCanvas component (M2.6)"
```

---

## Task 7: Wire the editor into `App.tsx`

**Files:**
- Modify: `src/renderer/App.tsx`

Replace the M1 ping demo with the actual M2 UI: title, the canvas, and a placeholder for the export button (added in Task 10).

- [ ] **Step 1: Replace `App.tsx`**

```tsx
import { useEffect, useState } from "react";
import { EditorCanvas } from "./components/Canvas/EditorCanvas";
import { HARDCODED_FIGURE, SAMPLE_IMAGE_ID, SAMPLE_IMAGE_URL } from "./model/hardcoded";
import { loadImageBitmap } from "./image/load-image";

export function App(): JSX.Element {
  const [images, setImages] = useState<Map<string, ImageBitmap>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadImageBitmap(SAMPLE_IMAGE_URL)
      .then((bitmap) => {
        if (cancelled) return;
        setImages(new Map([[SAMPLE_IMAGE_ID, bitmap]]));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: 16,
        color: "#333",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Mosaic Builder</h1>
        {loadError !== null && (
          <span style={{ color: "#B00" }}>image load error: {loadError}</span>
        )}
        {/* ExportButton lands in Task 10. */}
      </header>
      <EditorCanvas figure={HARDCODED_FIGURE} images={images} />
    </main>
  );
}
```

- [ ] **Step 2: Manual smoke check**

Run: `pnpm dev`
Expected: an Electron window opens showing a 2×2 grid. Top-left cell shows the diagonal-gradient PNG; the other three cells are grey with `B`, `C`, `D` labels. No console errors.

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(renderer): replace ping demo with EditorCanvas (M2.7)"
```

---

## Task 8: Export renderer (`OffscreenCanvas` → PNG blob)

**Files:**
- Create: `src/renderer/render/export-renderer.ts`
- Create: `src/renderer/export/png.ts`

The export pipeline runs the same `drawFigure` against a fresh `OffscreenCanvas` sized to the final figure pixels. No editor scaling, no DOM. Output is a `Blob` that `png.ts` then converts to `Uint8Array` for IPC.

- [ ] **Step 1: Implement `export-renderer.ts`**

```ts
import type { Figure } from "../model/types";
import { drawFigure } from "./draw-figure";

/**
 * Renders the figure into an OffscreenCanvas at full pixel size and
 * returns a PNG Blob. M2: pixel mode only. M6 will route physical
 * mode (inches * dpi) through the same path.
 */
export async function renderFigureToPngBlob(
  figure: Figure,
  images: Map<string, ImageBitmap>,
): Promise<Blob> {
  const off = new OffscreenCanvas(figure.canvas.widthPx, figure.canvas.heightPx);
  const ctx = off.getContext("2d");
  if (ctx === null) {
    throw new Error("renderFigureToPngBlob: failed to get 2D context");
  }
  drawFigure(ctx, figure, images);
  return off.convertToBlob({ type: "image/png" });
}
```

- [ ] **Step 2: Implement `export/png.ts`**

```ts
import type { Figure } from "../model/types";
import { renderFigureToPngBlob } from "../render/export-renderer";

export type ExportPngResult =
  | { ok: true; filePath: string; bytesWritten: number }
  | { ok: false; reason: "canceled" | "render-failed" | "ipc-failed"; message?: string };

const DEFAULT_NAME = "mosaic-figure.png";

export async function exportFigureAsPng(
  figure: Figure,
  images: Map<string, ImageBitmap>,
): Promise<ExportPngResult> {
  let blob: Blob;
  try {
    blob = await renderFigureToPngBlob(figure, images);
  } catch (err) {
    return { ok: false, reason: "render-failed", message: String(err) };
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  try {
    const result = await window.api.exportPng(bytes, DEFAULT_NAME);
    return result;
  } catch (err) {
    return { ok: false, reason: "ipc-failed", message: String(err) };
  }
}
```

- [ ] **Step 3: Write the export-shape test**

Create `test/unit/export-png-shape.test.ts`:

```ts
import { describe, it, expect } from "vitest";

// OffscreenCanvas is not available in Node by default. Skip cleanly so
// CI without a browser-like env still runs the rest of the suite.
const HAS_OFFSCREEN = typeof OffscreenCanvas !== "undefined";

describe.skipIf(!HAS_OFFSCREEN)("renderFigureToPngBlob", () => {
  it("produces a PNG blob with non-zero size for a 2x2 figure", async () => {
    const { renderFigureToPngBlob } = await import(
      "../../src/renderer/render/export-renderer"
    );
    const figure = (await import("../../src/renderer/model/hardcoded")).HARDCODED_FIGURE;

    const blob = await renderFigureToPngBlob(figure, new Map());
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run the suite**

Run: `pnpm test`
Expected: existing tests pass; the OffscreenCanvas test is skipped under Node (`describe.skipIf`). This is intentional — the IPC end-to-end test exercises the export path manually in Task 12.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/render/export-renderer.ts src/renderer/export/png.ts test/unit/export-png-shape.test.ts
git commit -m "feat(export): OffscreenCanvas PNG export pipeline (M2.8)"
```

---

## Task 9: Main-process file dialog and writer

**Files:**
- Create: `src/main/dialogs.ts`
- Create: `src/main/fs-write.ts`
- Test: `test/unit/dialogs.test.ts`, `test/unit/fs-write.test.ts`

Both modules are thin and isolated so they can be unit-tested without booting Electron.

- [ ] **Step 1: Write the failing `fs-write` test**

Create `test/unit/fs-write.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { writePngFile } from "../../src/main/fs-write";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("writePngFile", () => {
  it("writes bytes to disk at a .png path", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mosaic-test-"));
    const out = path.join(dir, "out.png");
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG sig
    await writePngFile(out, bytes);
    const back = await readFile(out);
    expect(back.equals(Buffer.from(bytes))).toBe(true);
  });

  it("rejects paths whose extension is not .png", async () => {
    await expect(writePngFile("/tmp/foo.txt", new Uint8Array([1]))).rejects.toThrow(
      /\.png/i,
    );
  });
});
```

- [ ] **Step 2: Implement `fs-write.ts`**

```ts
import { writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Writes raw bytes to a .png path. Refuses any other extension to
 * avoid silently producing files of the wrong format.
 */
export async function writePngFile(
  filePath: string,
  bytes: Uint8Array,
): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".png") {
    throw new Error(`writePngFile: refusing non-.png path "${filePath}"`);
  }
  await writeFile(filePath, bytes);
}
```

- [ ] **Step 3: Run `fs-write` tests**

Run: `pnpm test`
Expected: both `writePngFile` cases pass.

- [ ] **Step 4: Implement `dialogs.ts`**

```ts
import { dialog, type BrowserWindow } from "electron";

export interface PickPngPathInput {
  parentWindow: BrowserWindow | null;
  defaultName: string;
}

export interface PickPngPathResult {
  canceled: boolean;
  filePath: string | undefined;
}

export async function pickPngSavePath(
  input: PickPngPathInput,
): Promise<PickPngPathResult> {
  const opts = {
    title: "Export figure as PNG",
    defaultPath: input.defaultName,
    filters: [{ name: "PNG image", extensions: ["png"] }],
  };
  const r =
    input.parentWindow !== null
      ? await dialog.showSaveDialog(input.parentWindow, opts)
      : await dialog.showSaveDialog(opts);
  return { canceled: r.canceled, filePath: r.filePath };
}
```

- [ ] **Step 5: Write the dialogs test**

Create `test/unit/dialogs.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
  dialog: {
    showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: "/tmp/x.png" }),
  },
}));

describe("pickPngSavePath", () => {
  it("forwards filters and returns canonical shape", async () => {
    const { pickPngSavePath } = await import("../../src/main/dialogs");
    const r = await pickPngSavePath({ parentWindow: null, defaultName: "x.png" });
    expect(r).toEqual({ canceled: false, filePath: "/tmp/x.png" });
  });
});
```

- [ ] **Step 6: Run all unit tests**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/dialogs.ts src/main/fs-write.ts test/unit/dialogs.test.ts test/unit/fs-write.test.ts
git commit -m "feat(main): pickPngSavePath + writePngFile with tests (M2.9)"
```

---

## Task 10: Extend the IPC contract for `exportPng`

**Files:**
- Modify: `src/preload/api.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/main/index.ts`
- Modify: `test/unit/preload-api-shape.test.ts`

- [ ] **Step 1: Extend the existing preload-api-shape test**

Replace `test/unit/preload-api-shape.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { API_CHANNELS, type MosaicApi } from "../../src/preload/api";

describe("preload API contract", () => {
  it("declares stable channel names", () => {
    expect(API_CHANNELS.ping).toBe("mosaic:ping");
    expect(API_CHANNELS.exportPng).toBe("mosaic:export-png");
  });

  it("MosaicApi shape", () => {
    const fake: MosaicApi = {
      ping: () => Promise.resolve(123),
      exportPng: () =>
        Promise.resolve({ ok: true, filePath: "/tmp/x.png", bytesWritten: 0 }),
    };
    expect(typeof fake.ping).toBe("function");
    expect(typeof fake.exportPng).toBe("function");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test`
Expected: FAIL — `API_CHANNELS.exportPng` undefined; `MosaicApi` missing `exportPng`.

- [ ] **Step 3: Update `src/preload/api.ts`**

```ts
/**
 * Single source of truth for the preload→main IPC contract.
 * Imported as a type by the renderer (no runtime code crosses the boundary).
 */

export const API_CHANNELS = {
  ping: "mosaic:ping",
  exportPng: "mosaic:export-png",
} as const;

export type ApiChannel = (typeof API_CHANNELS)[keyof typeof API_CHANNELS];

export type ExportPngResult =
  | { ok: true; filePath: string; bytesWritten: number }
  | {
      ok: false;
      reason: "canceled" | "render-failed" | "ipc-failed" | "write-failed";
      message?: string;
    };

export interface MosaicApi {
  ping(): Promise<number>;
  exportPng(bytes: Uint8Array, defaultName: string): Promise<ExportPngResult>;
}
```

- [ ] **Step 4: Update `src/preload/preload.ts`**

```ts
import { contextBridge, ipcRenderer } from "electron";
import { API_CHANNELS, type MosaicApi, type ExportPngResult } from "./api";

const api: MosaicApi = {
  ping: () => ipcRenderer.invoke(API_CHANNELS.ping) as Promise<number>,
  exportPng: (bytes, defaultName) =>
    ipcRenderer.invoke(
      API_CHANNELS.exportPng,
      bytes,
      defaultName,
    ) as Promise<ExportPngResult>,
};

contextBridge.exposeInMainWorld("api", api);
```

- [ ] **Step 5: Update `src/main/index.ts` to register the handler**

Replace the `registerIpc` function:

```ts
function registerIpc(): void {
  ipcMain.handle(API_CHANNELS.ping, () => Date.now());

  ipcMain.handle(
    API_CHANNELS.exportPng,
    async (event, bytes: Uint8Array, defaultName: string) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      const picked = await pickPngSavePath({
        parentWindow: senderWindow,
        defaultName,
      });
      if (picked.canceled || picked.filePath === undefined) {
        return { ok: false as const, reason: "canceled" as const };
      }
      try {
        await writePngFile(picked.filePath, bytes);
        return {
          ok: true as const,
          filePath: picked.filePath,
          bytesWritten: bytes.byteLength,
        };
      } catch (err) {
        return {
          ok: false as const,
          reason: "write-failed" as const,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );
}
```

Add at the top of `src/main/index.ts`:

```ts
import { pickPngSavePath } from "./dialogs";
import { writePngFile } from "./fs-write";
```

- [ ] **Step 6: Run unit tests + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/preload/api.ts src/preload/preload.ts src/main/index.ts test/unit/preload-api-shape.test.ts
git commit -m "feat(ipc): exportPng channel — bytes -> save dialog -> disk (M2.10)"
```

---

## Task 11: Export button in the toolbar

**Files:**
- Create: `src/renderer/components/Toolbar/ExportButton.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Implement `ExportButton.tsx`**

```tsx
import { useState } from "react";
import type { Figure } from "../../model/types";
import { exportFigureAsPng } from "../../export/png";

interface Props {
  figure: Figure;
  images: Map<string, ImageBitmap>;
}

type Status =
  | { kind: "idle" }
  | { kind: "exporting" }
  | { kind: "success"; filePath: string }
  | { kind: "error"; message: string };

export function ExportButton({ figure, images }: Props): JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onClick(): Promise<void> {
    setStatus({ kind: "exporting" });
    const result = await exportFigureAsPng(figure, images);
    if (result.ok) {
      setStatus({ kind: "success", filePath: result.filePath });
    } else if (result.reason === "canceled") {
      setStatus({ kind: "idle" });
    } else {
      setStatus({
        kind: "error",
        message: result.message ?? result.reason,
      });
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={() => { void onClick(); }}
        disabled={status.kind === "exporting"}
        data-testid="export-png"
      >
        {status.kind === "exporting" ? "Exporting…" : "Export as PNG"}
      </button>
      {status.kind === "success" && (
        <span style={{ color: "#070" }}>saved → {status.filePath}</span>
      )}
      {status.kind === "error" && (
        <span style={{ color: "#B00" }}>error: {status.message}</span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Wire it into `App.tsx`**

In the existing `App.tsx`, replace the `{/* ExportButton lands in Task 10. */}` comment with:

```tsx
<ExportButton figure={HARDCODED_FIGURE} images={images} />
```

And add the import at the top:

```tsx
import { ExportButton } from "./components/Toolbar/ExportButton";
```

- [ ] **Step 3: Type-check**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/Toolbar/ExportButton.tsx src/renderer/App.tsx
git commit -m "feat(ui): Export as PNG button wired to IPC (M2.11)"
```

---

## Task 12: End-to-end manual verification

**Files:**
- (verification only — no source changes)

This task is the M2 demo gate. The spec calls for "End-to-end pixel out" — we confirm by exporting and inspecting the file.

- [ ] **Step 1: Build a clean dev environment**

Run: `pnpm install && pnpm typecheck && pnpm test && pnpm lint`
Expected: install succeeds, typecheck clean, **all** unit tests pass, lint reports zero warnings (`--max-warnings 0`).

- [ ] **Step 2: Launch the app**

Run: `pnpm dev`
Expected: a 1440×900 window opens. The 2×2 grid is visible: top-left = the gradient PNG; B/C/D placeholders elsewhere; 12px white gutters between cells; 1px grey border on the canvas.

- [ ] **Step 3: Export**

Click **Export as PNG**. Save dialog opens with default name `mosaic-figure.png`. Save to `/tmp/m2-export.png`.

Expected: button briefly shows "Exporting…", then "saved → /tmp/m2-export.png". No error toast.

- [ ] **Step 4: Inspect the exported file**

In a terminal:

```bash
file /tmp/m2-export.png
```

Expected: `PNG image data, 800 x 600, 8-bit/color RGB(A), non-interlaced` (alpha presence depends on the OS canvas — both are acceptable).

```bash
sips -g pixelWidth -g pixelHeight /tmp/m2-export.png   # macOS
# or
identify /tmp/m2-export.png                            # ImageMagick on any OS
```

Expected: `800 x 600`.

Open the PNG in Preview / your image viewer. **Visually compare** with the editor canvas: the bundled image is in the top-left cell at the same `Contain` framing; B/C/D placeholders match. Pixel dimensions match the figure's `widthPx`/`heightPx` exactly (no editor scaling leaked into export — this is the M2 acceptance criterion).

- [ ] **Step 5: Negative cases**

- Click **Export as PNG**, then click **Cancel** in the save dialog. Expected: status returns to idle. No file created. No console errors.
- (Optional) Manually patch `dialogs.ts` to return a path with a `.txt` extension to confirm `writePngFile` rejects it. Revert the patch.

- [ ] **Step 6: Commit a milestone marker**

No code changes — record the milestone with an empty commit so `git log` shows M2 closure.

```bash
git commit --allow-empty -m "chore: M2 — hard-coded export complete (M2.12)

Manual verification: 800x600 PNG written to disk via IPC matches the
on-screen figure pixel-for-pixel. Editor + export share drawFigure().
"
```

---

## Self-Review Checklist (run by the author of this plan)

**Spec coverage (M2 row of the milestones table):**

- "hard-coded 2×2 grid with placeholder rectangles" → Task 4 (`HARDCODED_FIGURE`), Task 5 (`drawPlaceholder`).
- "one bundled PNG" → Task 3 (`resources/fixtures/sample.png`), Task 4 (`SAMPLE_IMAGE_URL`).
- "Export as PNG writes to disk via IPC" → Tasks 8–11 (`renderFigureToPngBlob` → `exportPng` channel → `writePngFile`).
- "End-to-end pixel out" → Task 12 verification step.

**Architecture invariants from the project plan:**

- Editor and export share one draw routine → `drawFigure` is called from `editor-renderer.ts` **and** `export-renderer.ts`. ✓
- Renderer ↔ main only via `contextBridge` IPC → all fs/dialog calls are in `main/`, the renderer only sees `window.api`. ✓
- Strict secure defaults preserved → no changes to `resolveWindowConfig`. ✓
- `noUncheckedIndexedAccess` honored → loops index-guard; `panel === undefined` checks are explicit in `drawFigure`. ✓

**Placeholder scan:** No "TBD" / "implement later" / "similar to" / "appropriate error handling" found. Every code step shows runnable code.

**Type / name consistency:**
- `ExportPngResult` shape is identical in `src/preload/api.ts`, `src/renderer/export/png.ts`, and the main-process handler. ✓
- `SAMPLE_IMAGE_ID` constant flows from `hardcoded.ts` → `App.tsx` → `images` Map → `drawFigure`. ✓
- `pickPngSavePath` signature matches both its definition and call site in `index.ts`. ✓

**Out-of-scope (deferred to later milestones, intentionally):**
- File-dialog import (PNG/JPEG load via tray) → M3.
- Configurable grid + merge → M4.
- Per-panel pan/zoom/rotate/flip → M5.
- TIFF, calibration, annotations → M6.
- Project save/load + undo → M7.
- Packaging → M8.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-02-m2-hardcoded-export.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks. Use `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute tasks in this session with checkpoint reviews. Use `superpowers:executing-plans`.

Which approach?
