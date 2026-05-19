# M3 — Image Pool + Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the M2 hard-coded figure with a real, user-driven workflow: open a native file picker, load PNG/JPEG bytes from disk, list them in a left sidebar tray, drag a tray thumbnail onto a 2×2 grid cell to place it (Contain fit), drag cell↔cell to swap, drag tray→occupied cell to replace (kicked image returns to tray as unplaced).

**Architecture:** A new typed IPC channel `mosaic:open-images` lets the main process show `dialog.showOpenDialog`, read each picked file's bytes off disk, and return `{ filePath, bytes, mime }[]` to the renderer. The renderer decodes bytes into an `ImageBitmap` via `createImageBitmap(new Blob([bytes], { type: mime }))`, stores `ImagePoolItem` records (plus their bitmap, kept out-of-band) in a single React `useReducer`, and renders three things: a `Tray` of thumbnails, a `Grid` of cells whose body is the existing `EditorCanvas`, and the export button. Drag-and-drop uses **native HTML5 DnD** (no `dnd-kit` yet — M3's drags are coarse, single-target, no sortables; dnd-kit lands when M5/M7 need its overlays and sensors). All drag sources serialize a small JSON payload `{ kind: "tray"|"cell", id|row|col }` into the dataTransfer; drop targets parse it and dispatch one of three actions: `PLACE_FROM_TRAY`, `SWAP_CELLS`, `REPLACE_FROM_TRAY`. Zustand + immer + undo are deliberately deferred to M5/M7 — `useReducer` is enough state for M3 and avoids landing infrastructure the next two milestones will reshape.

**Tech Stack:** TypeScript 5.6 strict, React 18.3 (`useReducer`, native HTML5 DnD), Electron 32 (`dialog.showOpenDialog`, `fs.promises.readFile`, `ipcMain.handle`, `contextBridge`), HTML5 Canvas 2D + `OffscreenCanvas`, Vitest.

---

## File Structure

**Create:**

- `src/renderer/model/pool.ts` — `ImagePoolItem` type and the in-memory `ImageBitmap` registry (`bitmaps: Map<string, ImageBitmap>`). Renderer-only.
- `src/renderer/model/figure-state.ts` — the M3 mutable model: `Figure` minus the hard-coded panels, plus `pool: ImagePoolItem[]` and `placements: Map<cellKey, imageId>` where `cellKey = "row,col"`. Pure data, no React.
- `src/renderer/model/figure-actions.ts` — typed reducer + action creators: `ADD_TO_POOL`, `PLACE_FROM_TRAY`, `SWAP_CELLS`, `REPLACE_FROM_TRAY`, `REMOVE_FROM_POOL`. Pure function, exhaustively unit-tested.
- `src/renderer/model/figure-derivations.ts` — `deriveFigure(state): Figure` that converts the M3 mutable state into the existing `Figure` shape consumed by `drawFigure`. Keeps the renderer pipeline untouched.
- `src/renderer/image/decode-bytes.ts` — `decodeImageBytes(bytes: Uint8Array, mime: string): Promise<ImageBitmap>`. Wraps `createImageBitmap(new Blob(...))` with mime allow-listing (PNG, JPEG only — TIFF lands in M6).
- `src/renderer/dnd/drag-payload.ts` — `serialize`/`parse` for the native DnD payload. Small typed wrapper around `dataTransfer.setData("application/x-mosaic-drag", JSON.stringify(...))`.
- `src/renderer/components/Sidebar/Tray.tsx` — left-column React component: header with "Add images…" button, scrollable list of `Thumbnail`s grouped unplaced-first.
- `src/renderer/components/Sidebar/Thumbnail.tsx` — single tray entry. `<img>` + filename + greyed-out style when placed. `draggable=true` when unplaced; placed thumbnails are draggable too (so user can yank one off the grid back into the tray? no — placed thumbnails are _display only_; drag from the cell instead). For M3: `draggable=true` only when the item is unplaced.
- `src/renderer/components/Grid/GridCells.tsx` — overlay above the canvas: an absolutely-positioned `<div>` per cell that owns drop targets and drag sources for occupied cells. The canvas underneath stays the source of truth for pixels; this overlay only handles pointer + DnD events.
- `src/main/open-images.ts` — `pickAndReadImages(parentWindow)`: shows `dialog.showOpenDialog` filtered to PNG/JPEG, reads each picked file's bytes via `fs.promises.readFile`, returns `OpenImagesResult`.
- `src/main/mime.ts` — tiny pure helper `mimeFromExt(filePath): "image/png" | "image/jpeg" | null`. (We don't trust filename alone in production, but for M3 our open dialog already restricts extensions — magic-byte sniffing arrives with TIFF in M6.)

**Modify:**

- `src/preload/api.ts` — add `openImages(): Promise<OpenImagesResult>` to `MosaicApi`; add `mosaic:open-images` to `API_CHANNELS`. Define the result type.
- `src/preload/preload.ts` — wire `openImages` through `ipcRenderer.invoke`.
- `src/main/index.ts` — register the new IPC handler in `registerIpc()` calling `pickAndReadImages`.
- `src/renderer/App.tsx` — replace the `useEffect`-loads-one-bundled-image flow with a `useReducer(figureReducer, initialState)` and a three-pane layout (tray | canvas | export header).
- `src/renderer/model/types.ts` — leave the existing `Figure` shape intact (still consumed by `drawFigure`) but add the M3 layer of types in the new files above. **No breaking changes to `Figure`** — that's M4's job.
- `src/renderer/render/draw-figure.ts` — **no change**. The derivation in `figure-derivations.ts` produces the same `Figure` shape it already consumes.
- `src/renderer/components/Canvas/EditorCanvas.tsx` — accept an optional `overlay` render prop (or sibling) so `GridCells` can be positioned over the canvas at the correct CSS scale. Use a wrapper `<div style={{position:"relative"}}>` and forward the canvas's rendered CSS size. Simpler: keep `EditorCanvas` unchanged and have `App.tsx` compose `<canvas>` + `<GridCells>` inside a positioned wrapper.

**Test (Vitest):**

- `test/unit/figure-actions.test.ts` — exhaustive reducer tests: ADD_TO_POOL, PLACE_FROM_TRAY into empty cell, SWAP two occupied cells, REPLACE occupied cell from tray (kicked image returns to pool unplaced), no-op when source/target identical, error when imageId not in pool.
- `test/unit/figure-derivations.test.ts` — `deriveFigure(state)` produces the right `panels` array: `kind: "image"` for occupied cells, `kind: "placeholder"` with row-major label "A","B","C","D" for empty cells.
- `test/unit/drag-payload.test.ts` — round-trip serialize/parse; rejects malformed JSON; rejects unknown `kind`.
- `test/unit/decode-bytes.test.ts` — happy path with a tiny inline 1×1 PNG byte array (fixture); rejects unsupported mime; rejects empty bytes.
- `test/unit/mime.test.ts` — `.png`→`image/png`, `.PNG`→`image/png`, `.jpg`/`.jpeg`→`image/jpeg`, anything else→`null`.
- `test/unit/preload-api-shape.test.ts` — extend: assert `openImages` channel name and method exist.
- `test/unit/open-images.test.ts` — `pickAndReadImages` with a stubbed `dialog.showOpenDialog` and a temp-dir fixture file; asserts `bytes.length > 0`, correct `mime`, returned in pick order. Cancel path returns `{ canceled: true }`.

**Fixtures:**

- `resources/fixtures/sample.png` — already exists from M2, reused in tests.
- `resources/fixtures/red.png`, `resources/fixtures/blue.jpg` — two more tiny (1×1 or 2×2) images, written by a one-shot Node script in Task 0. Used by the open-images test and useful for manual testing.

---

## Conventions for this plan

- All new files use ES module imports, no CommonJS.
- Renderer code: no Node imports. Main code: no DOM imports.
- Strict mode is on; we satisfy `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (already enabled in `tsconfig.main.json` and `tsconfig.renderer.json`).
- Each task ends with a commit. Commit messages follow the existing `feat(scope): summary (M3.N)` style visible in `git log`.
- Tests live in `test/unit/`, matching the existing layout.
- Reducer tests use plain literal state objects — no React, no fakes.
- DnD logic is split: `drag-payload.ts` is pure (testable in Node); the React DnD wiring (`onDragStart`, `onDrop`) is glued in components and exercised manually.

---

## Task 0: Generate two more PNG/JPEG fixtures

**Files:**

- Create: `scripts/make-m3-fixtures.mjs`
- Create: `resources/fixtures/red.png`
- Create: `resources/fixtures/blue.jpg`

We need two more tiny image files so the open-images test has more than one input and so manual testing has multiple images to drag. We generate them with `sharp` (already a transitive dep through `electron`? no — assume not, use `pngjs` or hand-write PNG bytes). Simpler: hand-write a 1×1 PNG and a 1×1 JPEG using their well-known minimum byte sequences, no deps needed.

- [ ] **Step 1: Write the script**

Create `scripts/make-m3-fixtures.mjs`:

```js
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// Smallest valid 1x1 red PNG (8-bit RGB, no transparency).
// Source: https://www.w3.org/TR/PNG/ minimal example, hand-verified.
const RED_PNG = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a, // signature
  0x00,
  0x00,
  0x00,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52, // IHDR len + type
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01, // 1x1
  0x08,
  0x02,
  0x00,
  0x00,
  0x00,
  0x90,
  0x77,
  0x53, // 8bpp RGB + CRC
  0xde,
  0x00,
  0x00,
  0x00,
  0x0c,
  0x49,
  0x44,
  0x41,
  0x54, // IDAT len + type
  0x08,
  0x99,
  0x63,
  0xf8,
  0xcf,
  0xc0,
  0x00,
  0x00,
  0x00,
  0x03,
  0x00,
  0x01,
  0x5b,
  0x6e,
  0x2c,
  0xfe, // CRC
  0x00,
  0x00,
  0x00,
  0x00,
  0x49,
  0x45,
  0x4e,
  0x44, // IEND
  0xae,
  0x42,
  0x60,
  0x82,
]);

// Smallest valid 1x1 blue JPEG. Generated with `magick -size 1x1 canvas:blue out.jpg`
// then committed as a byte literal here so tests don't depend on an external tool.
const BLUE_JPG = Buffer.from(
  "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d0d1832211c213232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232ffc00011080001000103012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00fbfc28a28a00ffd9",
  "hex",
);

const out = "resources/fixtures";
await mkdir(out, { recursive: true });
await writeFile(path.join(out, "red.png"), RED_PNG);
await writeFile(path.join(out, "blue.jpg"), BLUE_JPG);
console.log("wrote", out, "red.png + blue.jpg");
```

- [ ] **Step 2: Run it**

Run: `node scripts/make-m3-fixtures.mjs`
Expected: `wrote resources/fixtures red.png + blue.jpg`

- [ ] **Step 3: Sanity-check the bytes**

Run: `file resources/fixtures/red.png resources/fixtures/blue.jpg`
Expected:

```
resources/fixtures/red.png:  PNG image data, 1 x 1, 8-bit/color RGB, non-interlaced
resources/fixtures/blue.jpg: JPEG image data, JFIF standard 1.01, ...
```

If `file` reports anything else, the inline bytes are wrong. Fix by regenerating with `magick` or `convert` — both are commonly available — and replace the byte literal.

- [ ] **Step 4: Commit**

```bash
git add scripts/make-m3-fixtures.mjs resources/fixtures/red.png resources/fixtures/blue.jpg
git commit -m "chore: M3 fixture images for tray/open-dialog tests (M3.0)"
```

---

## Task 1: Mime helper in main

**Files:**

- Create: `src/main/mime.ts`
- Test: `test/unit/mime.test.ts`

Tiny pure helper. Used by `pickAndReadImages` to tag bytes with the mime the renderer's `createImageBitmap` needs. We restrict to PNG/JPEG for M3 — TIFF arrives in M6 once the UTIF worker is in place.

- [ ] **Step 1: Write the failing test**

Create `test/unit/mime.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mimeFromExt } from "../../src/main/mime";

describe("mimeFromExt", () => {
  it("recognizes png (any case)", () => {
    expect(mimeFromExt("/x/foo.png")).toBe("image/png");
    expect(mimeFromExt("/x/FOO.PNG")).toBe("image/png");
  });

  it("recognizes jpg and jpeg", () => {
    expect(mimeFromExt("/x/foo.jpg")).toBe("image/jpeg");
    expect(mimeFromExt("/x/foo.jpeg")).toBe("image/jpeg");
    expect(mimeFromExt("/x/FOO.JPEG")).toBe("image/jpeg");
  });

  it("returns null for anything else", () => {
    expect(mimeFromExt("/x/foo.tif")).toBe(null);
    expect(mimeFromExt("/x/foo.tiff")).toBe(null);
    expect(mimeFromExt("/x/foo.gif")).toBe(null);
    expect(mimeFromExt("/x/foo")).toBe(null);
    expect(mimeFromExt("")).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- mime.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/main/mime.ts`:

```ts
import path from "node:path";

export type ImageMime = "image/png" | "image/jpeg";

/**
 * Returns the image mime type for a known extension, or null.
 * M3 supports PNG + JPEG only; TIFF arrives in M6 with the UTIF worker.
 */
export function mimeFromExt(filePath: string): ImageMime | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- mime.test`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/mime.ts test/unit/mime.test.ts
git commit -m "feat(main): mime helper for png/jpeg (M3.1)"
```

---

## Task 2: Open-images dialog + reader in main

**Files:**

- Create: `src/main/open-images.ts`
- Test: `test/unit/open-images.test.ts`

The renderer is sandboxed (`nodeIntegration: false`, `sandbox: true` per `window.ts`). Reading user-picked files therefore goes through the main process: `dialog.showOpenDialog` → `fs.readFile` for each pick → return `{ filePath, bytes, mime }[]` over IPC.

- [ ] **Step 1: Write the failing test**

Create `test/unit/open-images.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  pickAndReadImages,
  type ShowOpenDialog,
} from "../../src/main/open-images";

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe("pickAndReadImages", () => {
  it("returns canceled when the dialog is canceled", async () => {
    const showOpenDialog: ShowOpenDialog = vi
      .fn()
      .mockResolvedValue({ canceled: true, filePaths: [] });
    const r = await pickAndReadImages({
      parentWindow: null,
      showOpenDialog,
    });
    expect(r).toEqual({ canceled: true });
  });

  it("reads bytes for each picked file and tags with mime", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mosaic-open-"));
    const a = path.join(dir, "a.png");
    const b = path.join(dir, "b.JPG");
    await writeFile(a, PNG_SIG);
    await writeFile(b, Buffer.from([0xff, 0xd8, 0xff]));

    const showOpenDialog: ShowOpenDialog = vi
      .fn()
      .mockResolvedValue({ canceled: false, filePaths: [a, b] });
    const r = await pickAndReadImages({
      parentWindow: null,
      showOpenDialog,
    });
    expect(r.canceled).toBe(false);
    if (r.canceled) return;
    expect(r.files).toHaveLength(2);
    expect(r.files[0]?.filePath).toBe(a);
    expect(r.files[0]?.mime).toBe("image/png");
    expect(r.files[0]?.bytes.byteLength).toBe(PNG_SIG.byteLength);
    expect(r.files[1]?.mime).toBe("image/jpeg");
  });

  it("skips files whose extension is not png/jpeg", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mosaic-open-"));
    const ok = path.join(dir, "ok.png");
    const bad = path.join(dir, "bad.gif");
    await writeFile(ok, PNG_SIG);
    await writeFile(bad, Buffer.from([0]));

    const showOpenDialog: ShowOpenDialog = vi
      .fn()
      .mockResolvedValue({ canceled: false, filePaths: [ok, bad] });
    const r = await pickAndReadImages({
      parentWindow: null,
      showOpenDialog,
    });
    if (r.canceled) throw new Error("expected not canceled");
    expect(r.files).toHaveLength(1);
    expect(r.files[0]?.filePath).toBe(ok);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- open-images`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/main/open-images.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  BrowserWindow,
  OpenDialogOptions,
  OpenDialogReturnValue,
} from "electron";
import { mimeFromExt, type ImageMime } from "./mime";

/**
 * Decoupled from `electron.dialog` so tests can stub it. Production wires
 * this to `dialog.showOpenDialog` in `src/main/index.ts`.
 */
export type ShowOpenDialog = (
  parent: BrowserWindow | null,
  options: OpenDialogOptions,
) => Promise<OpenDialogReturnValue>;

export interface OpenedFile {
  filePath: string;
  bytes: Uint8Array;
  mime: ImageMime;
}

export type OpenImagesResult =
  | { canceled: true }
  | { canceled: false; files: OpenedFile[] };

export interface PickAndReadInput {
  parentWindow: BrowserWindow | null;
  showOpenDialog: ShowOpenDialog;
}

const FILTERS = [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }];

export async function pickAndReadImages(
  input: PickAndReadInput,
): Promise<OpenImagesResult> {
  const r = await input.showOpenDialog(input.parentWindow, {
    title: "Add images to figure",
    filters: FILTERS,
    properties: ["openFile", "multiSelections"],
  });
  if (r.canceled || r.filePaths.length === 0) return { canceled: true };

  const files: OpenedFile[] = [];
  for (const filePath of r.filePaths) {
    const mime = mimeFromExt(filePath);
    if (mime === null) continue; // belt-and-suspenders; filter should prevent
    const buf = await readFile(filePath);
    files.push({
      filePath: path.resolve(filePath),
      bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
      mime,
    });
  }
  return { canceled: false, files };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- open-images`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/open-images.ts test/unit/open-images.test.ts
git commit -m "feat(main): pickAndReadImages reads PNG/JPEG bytes via dialog (M3.2)"
```

---

## Task 3: Add `openImages` to the preload IPC contract

**Files:**

- Modify: `src/preload/api.ts`
- Modify: `src/preload/preload.ts`
- Modify: `test/unit/preload-api-shape.test.ts`

The renderer reaches `pickAndReadImages` through a typed `window.api.openImages()`.

- [ ] **Step 1: Extend the API shape test**

Edit `test/unit/preload-api-shape.test.ts` to read:

```ts
import { describe, it, expect } from "vitest";
import { API_CHANNELS, type MosaicApi } from "../../src/preload/api";

describe("preload API contract", () => {
  it("declares stable channel names", () => {
    expect(API_CHANNELS.ping).toBe("mosaic:ping");
    expect(API_CHANNELS.exportPng).toBe("mosaic:export-png");
    expect(API_CHANNELS.openImages).toBe("mosaic:open-images");
  });

  it("MosaicApi shape", () => {
    const fake: MosaicApi = {
      ping: () => Promise.resolve(123),
      exportPng: () =>
        Promise.resolve({ ok: true, filePath: "/tmp/x.png", bytesWritten: 0 }),
      openImages: () => Promise.resolve({ canceled: true }),
    };
    expect(typeof fake.ping).toBe("function");
    expect(typeof fake.exportPng).toBe("function");
    expect(typeof fake.openImages).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- preload-api-shape`
Expected: FAIL — `openImages` missing on `MosaicApi`; `API_CHANNELS.openImages` undefined.

- [ ] **Step 3: Extend the API contract**

Edit `src/preload/api.ts`:

```ts
/**
 * Single source of truth for the preload→main IPC contract.
 * Imported as a type by the renderer (no runtime code crosses the boundary).
 */

export const API_CHANNELS = {
  ping: "mosaic:ping",
  exportPng: "mosaic:export-png",
  openImages: "mosaic:open-images",
} as const;

export type ApiChannel = (typeof API_CHANNELS)[keyof typeof API_CHANNELS];

export type ExportPngResult =
  | { ok: true; filePath: string; bytesWritten: number }
  | {
      ok: false;
      reason: "canceled" | "render-failed" | "ipc-failed" | "write-failed";
      message?: string;
    };

export type OpenImagesMime = "image/png" | "image/jpeg";

export interface OpenedFileDto {
  filePath: string;
  bytes: Uint8Array;
  mime: OpenImagesMime;
}

export type OpenImagesResult =
  | { canceled: true }
  | { canceled: false; files: OpenedFileDto[] };

export interface MosaicApi {
  ping(): Promise<number>;
  exportPng(bytes: Uint8Array, defaultName: string): Promise<ExportPngResult>;
  openImages(): Promise<OpenImagesResult>;
}
```

- [ ] **Step 4: Wire the preload bridge**

Edit `src/preload/preload.ts`:

```ts
import { contextBridge, ipcRenderer } from "electron";
import {
  API_CHANNELS,
  type ExportPngResult,
  type MosaicApi,
  type OpenImagesResult,
} from "./api";

const api: MosaicApi = {
  ping: () => ipcRenderer.invoke(API_CHANNELS.ping) as Promise<number>,
  exportPng: (bytes, defaultName) =>
    ipcRenderer.invoke(
      API_CHANNELS.exportPng,
      bytes,
      defaultName,
    ) as Promise<ExportPngResult>,
  openImages: () =>
    ipcRenderer.invoke(API_CHANNELS.openImages) as Promise<OpenImagesResult>,
};

contextBridge.exposeInMainWorld("api", api);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- preload-api-shape`
Expected: PASS, both tests.

- [ ] **Step 6: Commit**

```bash
git add src/preload/api.ts src/preload/preload.ts test/unit/preload-api-shape.test.ts
git commit -m "feat(ipc): openImages channel + preload binding (M3.3)"
```

---

## Task 4: Register the `openImages` IPC handler in main

**Files:**

- Modify: `src/main/index.ts`

Wires the renderer-facing channel to the tested `pickAndReadImages` function, supplying the real `dialog.showOpenDialog`.

- [ ] **Step 1: Edit `src/main/index.ts`**

Add the import and handler. The full `registerIpc` becomes:

```ts
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { resolveWindowConfig } from "./window";
import { API_CHANNELS } from "../preload/api";
import { pickPngSavePath } from "./dialogs";
import { writePngFile } from "./fs-write";
import { pickAndReadImages } from "./open-images";

// ... DEV_URL, mainWindow, createWindow unchanged ...

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

  ipcMain.handle(API_CHANNELS.openImages, async (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    return pickAndReadImages({
      parentWindow: senderWindow,
      showOpenDialog: (parent, options) =>
        parent !== null
          ? dialog.showOpenDialog(parent, options)
          : dialog.showOpenDialog(options),
    });
  });
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(ipc): register openImages handler with electron dialog (M3.4)"
```

---

## Task 5: Decode bytes → ImageBitmap in the renderer

**Files:**

- Create: `src/renderer/image/decode-bytes.ts`
- Test: `test/unit/decode-bytes.test.ts`

`createImageBitmap` is a renderer-only DOM API. We wrap it so the import surface is `Uint8Array → ImageBitmap` and so we can allow-list mimes once.

The Vitest config currently uses Node env. `createImageBitmap` doesn't exist there, so the test stubs `globalThis.createImageBitmap` and `globalThis.Blob` (Node 22 has `Blob` natively — verify with `console.log(typeof Blob)` if anything is odd).

- [ ] **Step 1: Write the failing test**

Create `test/unit/decode-bytes.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  decodeImageBytes,
  type ImageMime,
} from "../../src/renderer/image/decode-bytes";

const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

let originalCreate: unknown;

beforeAll(() => {
  originalCreate = (globalThis as unknown as { createImageBitmap?: unknown })
    .createImageBitmap;
  (
    globalThis as unknown as {
      createImageBitmap: (b: Blob) => Promise<ImageBitmap>;
    }
  ).createImageBitmap = async (blob: Blob) =>
    ({
      width: 1,
      height: 1,
      _mime: blob.type,
    }) as unknown as ImageBitmap;
});

afterAll(() => {
  (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap =
    originalCreate;
});

describe("decodeImageBytes", () => {
  it("decodes png bytes via createImageBitmap with the given mime", async () => {
    const bm = await decodeImageBytes(PNG_SIG, "image/png");
    expect(bm.width).toBe(1);
    expect(bm.height).toBe(1);
    expect((bm as unknown as { _mime: string })._mime).toBe("image/png");
  });

  it("rejects unsupported mimes", async () => {
    await expect(
      decodeImageBytes(PNG_SIG, "image/tiff" as unknown as ImageMime),
    ).rejects.toThrow(/unsupported mime/i);
  });

  it("rejects empty bytes", async () => {
    await expect(
      decodeImageBytes(new Uint8Array(0), "image/png"),
    ).rejects.toThrow(/empty/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- decode-bytes`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/renderer/image/decode-bytes.ts`:

```ts
export type ImageMime = "image/png" | "image/jpeg";

const SUPPORTED: ReadonlySet<ImageMime> = new Set(["image/png", "image/jpeg"]);

/**
 * Decodes raw image bytes into an ImageBitmap. M3 supports PNG + JPEG;
 * TIFF arrives in M6 with the UTIF web worker.
 */
export async function decodeImageBytes(
  bytes: Uint8Array,
  mime: ImageMime,
): Promise<ImageBitmap> {
  if (bytes.byteLength === 0) {
    throw new Error("decodeImageBytes: empty bytes");
  }
  if (!SUPPORTED.has(mime)) {
    throw new Error(`decodeImageBytes: unsupported mime "${mime}"`);
  }
  const blob = new Blob([bytes], { type: mime });
  return createImageBitmap(blob);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- decode-bytes`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/image/decode-bytes.ts test/unit/decode-bytes.test.ts
git commit -m "feat(image): decodeImageBytes wraps createImageBitmap (M3.5)"
```

---

## Task 6: Image pool data model

**Files:**

- Create: `src/renderer/model/pool.ts`

The persistent pool holds metadata (`ImagePoolItem`); decoded `ImageBitmap`s live out-of-band in a parallel `Map<id, ImageBitmap>` so mutating the pool array doesn't invalidate bitmaps. This mirrors the design's "bitmap caches live outside snapshots" rule (will matter for M7's undo).

- [ ] **Step 1: Implement (no test yet — used by Task 7 reducer tests)**

Create `src/renderer/model/pool.ts`:

```ts
export type ImageMime = "image/png" | "image/jpeg";

export interface ImagePoolItem {
  id: string; // uuid v4 string; generated on add
  filename: string;
  filePath: string; // absolute, for relink later (M7)
  mime: ImageMime;
  width: number;
  height: number;
}

/**
 * Generates a v4 uuid. We use crypto.randomUUID (available in Node 22
 * and modern Chromium); no extra dep needed.
 */
export function newImageId(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/model/pool.ts
git commit -m "feat(model): ImagePoolItem type + newImageId (M3.6)"
```

---

## Task 7: Figure state + reducer

**Files:**

- Create: `src/renderer/model/figure-state.ts`
- Create: `src/renderer/model/figure-actions.ts`
- Test: `test/unit/figure-actions.test.ts`

The M3 mutable model. Crucially, the M2 hard-coded `Figure` shape stays unchanged; this state is derived into a `Figure` via `figure-derivations.ts` (Task 8) so `drawFigure` doesn't move.

The grid is fixed at 2×2 for M3 (configurable rows/cols arrives in M4). Placements are keyed by `"row,col"`. We do NOT support merged cells in M3 — every cell is a single 1×1 panel.

- [ ] **Step 1: Write the failing test**

Create `test/unit/figure-actions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { ImagePoolItem } from "../../src/renderer/model/pool";
import {
  initialFigureState,
  figureReducer,
  cellKey,
  type FigureState,
} from "../../src/renderer/model/figure-state";
import {
  addToPool,
  placeFromTray,
  swapCells,
  replaceFromTray,
  removeFromPool,
} from "../../src/renderer/model/figure-actions";

const IMG_A: ImagePoolItem = {
  id: "a",
  filename: "a.png",
  filePath: "/x/a.png",
  mime: "image/png",
  width: 100,
  height: 100,
};
const IMG_B: ImagePoolItem = {
  id: "b",
  filename: "b.jpg",
  filePath: "/x/b.jpg",
  mime: "image/jpeg",
  width: 200,
  height: 100,
};

function withPool(...items: ImagePoolItem[]): FigureState {
  let s = initialFigureState();
  for (const it of items) s = figureReducer(s, addToPool(it));
  return s;
}

describe("figureReducer", () => {
  it("ADD_TO_POOL appends to pool, no placement", () => {
    const s = figureReducer(initialFigureState(), addToPool(IMG_A));
    expect(s.pool).toEqual([IMG_A]);
    expect(s.placements.size).toBe(0);
  });

  it("ADD_TO_POOL ignores duplicate ids", () => {
    let s = figureReducer(initialFigureState(), addToPool(IMG_A));
    s = figureReducer(s, addToPool(IMG_A));
    expect(s.pool).toHaveLength(1);
  });

  it("PLACE_FROM_TRAY into empty cell sets placement", () => {
    const s0 = withPool(IMG_A);
    const s1 = figureReducer(s0, placeFromTray("a", { row: 0, col: 1 }));
    expect(s1.placements.get(cellKey(0, 1))).toBe("a");
  });

  it("PLACE_FROM_TRAY no-op when image not in pool", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, placeFromTray("ghost", { row: 0, col: 0 }));
    expect(s1).toBe(s0); // identity preserved
  });

  it("SWAP_CELLS swaps two occupied cells", () => {
    let s = withPool(IMG_A, IMG_B);
    s = figureReducer(s, placeFromTray("a", { row: 0, col: 0 }));
    s = figureReducer(s, placeFromTray("b", { row: 1, col: 1 }));
    s = figureReducer(s, swapCells({ row: 0, col: 0 }, { row: 1, col: 1 }));
    expect(s.placements.get(cellKey(0, 0))).toBe("b");
    expect(s.placements.get(cellKey(1, 1))).toBe("a");
  });

  it("SWAP_CELLS moves image into empty cell when one side is empty", () => {
    let s = withPool(IMG_A);
    s = figureReducer(s, placeFromTray("a", { row: 0, col: 0 }));
    s = figureReducer(s, swapCells({ row: 0, col: 0 }, { row: 0, col: 1 }));
    expect(s.placements.has(cellKey(0, 0))).toBe(false);
    expect(s.placements.get(cellKey(0, 1))).toBe("a");
  });

  it("SWAP_CELLS is a no-op when source equals target", () => {
    let s = withPool(IMG_A);
    s = figureReducer(s, placeFromTray("a", { row: 0, col: 0 }));
    const s2 = figureReducer(
      s,
      swapCells({ row: 0, col: 0 }, { row: 0, col: 0 }),
    );
    expect(s2).toBe(s);
  });

  it("REPLACE_FROM_TRAY puts new image in cell, kicked image stays in pool unplaced", () => {
    let s = withPool(IMG_A, IMG_B);
    s = figureReducer(s, placeFromTray("a", { row: 0, col: 0 }));
    s = figureReducer(s, replaceFromTray("b", { row: 0, col: 0 }));
    expect(s.placements.get(cellKey(0, 0))).toBe("b");
    // 'a' is still in pool (it was never removed) and now unplaced — i.e.
    // not present as a placement value anywhere.
    const placedIds = new Set(s.placements.values());
    expect(placedIds.has("a")).toBe(false);
    expect(s.pool.map((i) => i.id)).toContain("a");
  });

  it("REMOVE_FROM_POOL drops the item and clears any placement", () => {
    let s = withPool(IMG_A, IMG_B);
    s = figureReducer(s, placeFromTray("a", { row: 0, col: 0 }));
    s = figureReducer(s, removeFromPool("a"));
    expect(s.pool.map((i) => i.id)).toEqual(["b"]);
    expect(s.placements.has(cellKey(0, 0))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- figure-actions`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement state + reducer**

Create `src/renderer/model/figure-state.ts`:

```ts
import type { ImagePoolItem } from "./pool";

export interface CellCoord {
  row: number;
  col: number;
}

export type CellKey = string; // "row,col"

export function cellKey(row: number, col: number): CellKey {
  return `${row},${col}`;
}

export interface FigureState {
  /**
   * Insertion-ordered. New uploads append; placement state lives separately
   * so reordering placements never reshuffles the tray.
   */
  pool: ImagePoolItem[];

  /**
   * Map<cellKey, imageId>. Absent key = empty cell. Values reference
   * `pool[*].id` and must always exist in the pool (reducer enforces).
   */
  placements: Map<CellKey, string>;

  /**
   * Fixed at 2×2 for M3. M4 will turn this into a configurable grid.
   */
  rows: number;
  cols: number;
}

export function initialFigureState(): FigureState {
  return {
    pool: [],
    placements: new Map(),
    rows: 2,
    cols: 2,
  };
}

// Action types live in figure-actions.ts so this module stays a pure
// data-shape definition. See `figureReducer` there.
```

Create `src/renderer/model/figure-actions.ts`:

```ts
import type { ImagePoolItem } from "./pool";
import { cellKey, type CellCoord, type FigureState } from "./figure-state";

export type FigureAction =
  | { type: "ADD_TO_POOL"; item: ImagePoolItem }
  | { type: "PLACE_FROM_TRAY"; imageId: string; target: CellCoord }
  | { type: "SWAP_CELLS"; a: CellCoord; b: CellCoord }
  | { type: "REPLACE_FROM_TRAY"; imageId: string; target: CellCoord }
  | { type: "REMOVE_FROM_POOL"; imageId: string };

export const addToPool = (item: ImagePoolItem): FigureAction => ({
  type: "ADD_TO_POOL",
  item,
});
export const placeFromTray = (
  imageId: string,
  target: CellCoord,
): FigureAction => ({ type: "PLACE_FROM_TRAY", imageId, target });
export const swapCells = (a: CellCoord, b: CellCoord): FigureAction => ({
  type: "SWAP_CELLS",
  a,
  b,
});
export const replaceFromTray = (
  imageId: string,
  target: CellCoord,
): FigureAction => ({ type: "REPLACE_FROM_TRAY", imageId, target });
export const removeFromPool = (imageId: string): FigureAction => ({
  type: "REMOVE_FROM_POOL",
  imageId,
});

function inBounds(c: CellCoord, s: FigureState): boolean {
  return c.row >= 0 && c.row < s.rows && c.col >= 0 && c.col < s.cols;
}

function withPlacements(
  s: FigureState,
  next: Map<string, string>,
): FigureState {
  return { ...s, placements: next };
}

export function figureReducer(s: FigureState, a: FigureAction): FigureState {
  switch (a.type) {
    case "ADD_TO_POOL": {
      if (s.pool.some((p) => p.id === a.item.id)) return s;
      return { ...s, pool: [...s.pool, a.item] };
    }
    case "PLACE_FROM_TRAY": {
      if (!inBounds(a.target, s)) return s;
      if (!s.pool.some((p) => p.id === a.imageId)) return s;
      // Refuse if the image is already placed somewhere; caller should
      // have used SWAP_CELLS or REPLACE_FROM_TRAY. Defensive no-op.
      for (const v of s.placements.values()) {
        if (v === a.imageId) return s;
      }
      const k = cellKey(a.target.row, a.target.col);
      // Refuse if target is occupied; caller must use REPLACE_FROM_TRAY.
      if (s.placements.has(k)) return s;
      const next = new Map(s.placements);
      next.set(k, a.imageId);
      return withPlacements(s, next);
    }
    case "SWAP_CELLS": {
      if (!inBounds(a.a, s) || !inBounds(a.b, s)) return s;
      if (a.a.row === a.b.row && a.a.col === a.b.col) return s;
      const ka = cellKey(a.a.row, a.a.col);
      const kb = cellKey(a.b.row, a.b.col);
      const va = s.placements.get(ka);
      const vb = s.placements.get(kb);
      if (va === undefined && vb === undefined) return s;
      const next = new Map(s.placements);
      if (va === undefined) next.delete(kb);
      else next.set(kb, va);
      if (vb === undefined) next.delete(ka);
      else next.set(ka, vb);
      return withPlacements(s, next);
    }
    case "REPLACE_FROM_TRAY": {
      if (!inBounds(a.target, s)) return s;
      if (!s.pool.some((p) => p.id === a.imageId)) return s;
      const k = cellKey(a.target.row, a.target.col);
      // Don't allow replacing with an image already placed elsewhere —
      // caller should SWAP_CELLS instead.
      for (const [otherKey, v] of s.placements) {
        if (v === a.imageId && otherKey !== k) return s;
      }
      const next = new Map(s.placements);
      next.set(k, a.imageId); // overwrites; kicked image returns to pool unplaced
      return withPlacements(s, next);
    }
    case "REMOVE_FROM_POOL": {
      if (!s.pool.some((p) => p.id === a.imageId)) return s;
      const next = new Map(s.placements);
      for (const [k, v] of next) {
        if (v === a.imageId) next.delete(k);
      }
      return {
        ...s,
        pool: s.pool.filter((p) => p.id !== a.imageId),
        placements: next,
      };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- figure-actions`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/model/figure-state.ts src/renderer/model/figure-actions.ts test/unit/figure-actions.test.ts
git commit -m "feat(state): figure reducer with place/swap/replace (M3.7)"
```

---

## Task 8: Derive a `Figure` from `FigureState`

**Files:**

- Create: `src/renderer/model/figure-derivations.ts`
- Test: `test/unit/figure-derivations.test.ts`

`drawFigure` consumes the existing `Figure` shape from `model/types.ts`. We derive that shape from `FigureState` so the renderer pipeline doesn't change.

Empty cells become `kind: "placeholder"` with the row-major label (A, B, C, D for the 2×2 grid). Occupied cells become `kind: "image"`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/figure-derivations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Figure } from "../../src/renderer/model/types";
import {
  cellKey,
  initialFigureState,
} from "../../src/renderer/model/figure-state";
import { deriveFigure } from "../../src/renderer/model/figure-derivations";

const CANVAS = { widthPx: 800, heightPx: 600, background: "#FFFFFF" } as const;
const GRID = { gutterPx: 12, gutterColor: "#FFFFFF" } as const;

describe("deriveFigure", () => {
  it("derives all-placeholder figure from empty state", () => {
    const s = initialFigureState();
    const f: Figure = deriveFigure(s, { canvas: CANVAS, grid: GRID });
    expect(f.canvas).toEqual(CANVAS);
    expect(f.grid.rows).toBe(2);
    expect(f.grid.cols).toBe(2);
    expect(f.panels).toHaveLength(4);
    expect(f.panels.map((p) => p.kind)).toEqual([
      "placeholder",
      "placeholder",
      "placeholder",
      "placeholder",
    ]);
    expect(
      f.panels.map((p) => (p.kind === "placeholder" ? p.label : "")),
    ).toEqual(["A", "B", "C", "D"]);
  });

  it("derives image panels for occupied cells", () => {
    const s = initialFigureState();
    s.placements.set(cellKey(0, 1), "img-1");
    s.placements.set(cellKey(1, 0), "img-2");
    const f = deriveFigure(s, { canvas: CANVAS, grid: GRID });
    expect(f.panels[0]).toEqual({
      row: 0,
      col: 0,
      kind: "placeholder",
      label: "A",
    });
    expect(f.panels[1]).toEqual({
      row: 0,
      col: 1,
      kind: "image",
      imageId: "img-1",
    });
    expect(f.panels[2]).toEqual({
      row: 1,
      col: 0,
      kind: "image",
      imageId: "img-2",
    });
    expect(f.panels[3]).toEqual({
      row: 1,
      col: 1,
      kind: "placeholder",
      label: "D",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- figure-derivations`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/renderer/model/figure-derivations.ts`:

```ts
import type { Figure, FigureCanvas, FigureGrid, HardCodedPanel } from "./types";
import { cellKey, type FigureState } from "./figure-state";

export interface DeriveOptions {
  canvas: FigureCanvas;
  grid: Pick<FigureGrid, "gutterPx" | "gutterColor">;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Builds the row-major label for an empty cell. With 2×2: A,B,C,D.
 * Falls back to "?" past Z (we never hit that in M3 — grid is 2×2 —
 * but be tidy for M4 which expands to 10×10).
 */
function emptyLabel(index: number): string {
  return LETTERS[index] ?? "?";
}

export function deriveFigure(state: FigureState, opts: DeriveOptions): Figure {
  const panels: HardCodedPanel[] = [];
  let i = 0;
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      const placed = state.placements.get(cellKey(row, col));
      if (placed !== undefined) {
        panels.push({ row, col, kind: "image", imageId: placed });
      } else {
        panels.push({
          row,
          col,
          kind: "placeholder",
          label: emptyLabel(i),
        });
      }
      i++;
    }
  }
  return {
    canvas: opts.canvas,
    grid: {
      rows: state.rows,
      cols: state.cols,
      gutterPx: opts.grid.gutterPx,
      gutterColor: opts.grid.gutterColor,
    },
    panels,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- figure-derivations`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/model/figure-derivations.ts test/unit/figure-derivations.test.ts
git commit -m "feat(model): deriveFigure(state) -> Figure for renderer (M3.8)"
```

---

## Task 9: Drag payload (pure)

**Files:**

- Create: `src/renderer/dnd/drag-payload.ts`
- Test: `test/unit/drag-payload.test.ts`

A tiny serializer for the `dataTransfer` payload. Keeping it pure means components stay thin and we can unit-test all the malformed-input cases.

The MIME type for the dataTransfer is `application/x-mosaic-drag` so the app's drops never collide with native file drops or browser-internal drag types.

- [ ] **Step 1: Write the failing test**

Create `test/unit/drag-payload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DRAG_MIME,
  serializeDrag,
  parseDrag,
  type DragPayload,
} from "../../src/renderer/dnd/drag-payload";

describe("drag payload", () => {
  it("exposes a stable mime", () => {
    expect(DRAG_MIME).toBe("application/x-mosaic-drag");
  });

  it("round-trips a tray drag", () => {
    const p: DragPayload = { kind: "tray", imageId: "abc" };
    expect(parseDrag(serializeDrag(p))).toEqual(p);
  });

  it("round-trips a cell drag", () => {
    const p: DragPayload = { kind: "cell", row: 1, col: 0 };
    expect(parseDrag(serializeDrag(p))).toEqual(p);
  });

  it("returns null for malformed json", () => {
    expect(parseDrag("not json")).toBe(null);
  });

  it("returns null for unknown kind", () => {
    expect(parseDrag(JSON.stringify({ kind: "wat" }))).toBe(null);
  });

  it("returns null for missing fields", () => {
    expect(parseDrag(JSON.stringify({ kind: "tray" }))).toBe(null);
    expect(parseDrag(JSON.stringify({ kind: "cell", row: 0 }))).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- drag-payload`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/renderer/dnd/drag-payload.ts`:

```ts
export const DRAG_MIME = "application/x-mosaic-drag";

export type DragPayload =
  | { kind: "tray"; imageId: string }
  | { kind: "cell"; row: number; col: number };

export function serializeDrag(p: DragPayload): string {
  return JSON.stringify(p);
}

export function parseDrag(raw: string): DragPayload | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.kind === "tray") {
    if (typeof o.imageId !== "string") return null;
    return { kind: "tray", imageId: o.imageId };
  }
  if (o.kind === "cell") {
    if (typeof o.row !== "number" || typeof o.col !== "number") return null;
    return { kind: "cell", row: o.row, col: o.col };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- drag-payload`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/dnd/drag-payload.ts test/unit/drag-payload.test.ts
git commit -m "feat(dnd): drag payload serializer + parser (M3.9)"
```

---

## Task 10: Sidebar Tray + Thumbnail components

**Files:**

- Create: `src/renderer/components/Sidebar/Thumbnail.tsx`
- Create: `src/renderer/components/Sidebar/Tray.tsx`

The tray displays the pool grouped: unplaced first, placed below (greyed). New uploads append to unplaced. Each unplaced thumbnail is a drag source emitting `{ kind: "tray", imageId }`.

Thumbnails render the `ImageBitmap` via a small `<canvas>` (we can't put an `ImageBitmap` directly into an `<img>`). For M3 we use a 64×64 thumbnail canvas drawn once when the bitmap arrives.

- [ ] **Step 1: Implement `Thumbnail`**

Create `src/renderer/components/Sidebar/Thumbnail.tsx`:

```tsx
import { useEffect, useRef } from "react";
import type { ImagePoolItem } from "../../model/pool";
import { DRAG_MIME, serializeDrag } from "../../dnd/drag-payload";

interface Props {
  item: ImagePoolItem;
  bitmap: ImageBitmap | undefined;
  placed: boolean;
}

const SIZE = 64;

export function Thumbnail({ item, bitmap, placed }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (c === null || bitmap === undefined) return;
    c.width = SIZE;
    c.height = SIZE;
    const ctx = c.getContext("2d");
    if (ctx === null) return;
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, SIZE, SIZE);
    const scale = Math.min(SIZE / bitmap.width, SIZE / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  }, [bitmap]);

  function onDragStart(e: React.DragEvent<HTMLDivElement>): void {
    if (placed) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(
      DRAG_MIME,
      serializeDrag({ kind: "tray", imageId: item.id }),
    );
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <div
      draggable={!placed}
      onDragStart={onDragStart}
      data-testid={`thumb-${item.id}`}
      title={item.filename}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 6,
        borderRadius: 4,
        cursor: placed ? "default" : "grab",
        opacity: placed ? 0.45 : 1,
        background: placed ? "transparent" : "#F5F5F5",
        userSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        style={{
          width: SIZE,
          height: SIZE,
          background: "#222",
          borderRadius: 2,
          flex: "0 0 auto",
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontSize: 12,
          }}
        >
          {item.filename}
        </div>
        <div style={{ fontSize: 10, color: "#888" }}>
          {placed ? "placed" : "unplaced"}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `Tray`**

Create `src/renderer/components/Sidebar/Tray.tsx`:

```tsx
import type { ImagePoolItem } from "../../model/pool";
import { Thumbnail } from "./Thumbnail";

interface Props {
  pool: ImagePoolItem[];
  bitmaps: Map<string, ImageBitmap>;
  placedIds: Set<string>;
  onAddImagesClick: () => void;
}

export function Tray({
  pool,
  bitmaps,
  placedIds,
  onAddImagesClick,
}: Props): JSX.Element {
  const unplaced = pool.filter((p) => !placedIds.has(p.id));
  const placed = pool.filter((p) => placedIds.has(p.id));

  return (
    <aside
      data-testid="tray"
      style={{
        width: 220,
        borderRight: "1px solid #DDD",
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        overflowY: "auto",
      }}
    >
      <button
        type="button"
        onClick={onAddImagesClick}
        data-testid="add-images"
        style={{ padding: "6px 10px" }}
      >
        Add images…
      </button>
      <SectionLabel text="Unplaced" />
      {unplaced.length === 0 ? (
        <Empty text="No images yet. Click Add images…" />
      ) : (
        unplaced.map((it) => (
          <Thumbnail
            key={it.id}
            item={it}
            bitmap={bitmaps.get(it.id)}
            placed={false}
          />
        ))
      )}
      <SectionLabel text="Placed" />
      {placed.length === 0 ? (
        <Empty text="—" />
      ) : (
        placed.map((it) => (
          <Thumbnail key={it.id} item={it} bitmap={bitmaps.get(it.id)} placed />
        ))
      )}
    </aside>
  );
}

function SectionLabel({ text }: { text: string }): JSX.Element {
  return (
    <div
      style={{
        fontSize: 11,
        textTransform: "uppercase",
        color: "#888",
        marginTop: 6,
      }}
    >
      {text}
    </div>
  );
}

function Empty({ text }: { text: string }): JSX.Element {
  return <div style={{ fontSize: 12, color: "#AAA" }}>{text}</div>;
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/Sidebar/Thumbnail.tsx src/renderer/components/Sidebar/Tray.tsx
git commit -m "feat(ui): sidebar tray + thumbnail with drag source (M3.10)"
```

---

## Task 11: Grid drop overlay

**Files:**

- Create: `src/renderer/components/Grid/GridCells.tsx`

This is an absolutely-positioned overlay with one `<div>` per cell, positioned to match `computePanelRects`. Each cell:

- Is a drop target. On drop, it parses the payload and calls `onDrop({ from, target })`.
- Is a drag source if it has an image. Drag emits `{ kind: "cell", row, col }`.
- Highlights on drag-over.

The overlay sits inside a wrapper that also contains the `<canvas>`. Both share the wrapper's width/height in CSS px. We pass the figure's pixel size and the wrapper's _displayed_ CSS size in so the overlay can scale rect coordinates correctly.

- [ ] **Step 1: Implement**

Create `src/renderer/components/Grid/GridCells.tsx`:

```tsx
import { useState } from "react";
import {
  cellKey,
  type CellCoord,
  type FigureState,
} from "../../model/figure-state";
import { computePanelRects } from "../../render/coords";
import {
  DRAG_MIME,
  parseDrag,
  serializeDrag,
  type DragPayload,
} from "../../dnd/drag-payload";

export interface DropEvent {
  from: DragPayload;
  target: CellCoord;
}

interface Props {
  state: FigureState;
  /** Figure pixel dimensions (used to compute panel rects). */
  figurePxW: number;
  figurePxH: number;
  /** Wrapper's actual rendered CSS width/height in px. */
  cssW: number;
  cssH: number;
  gutterPx: number;
  onDrop: (e: DropEvent) => void;
}

export function GridCells({
  state,
  figurePxW,
  figurePxH,
  cssW,
  cssH,
  gutterPx,
  onDrop,
}: Props): JSX.Element {
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  // Compute panel rects in figure-pixel space, then scale to css px.
  const rects = computePanelRects({
    canvas: { widthPx: figurePxW, heightPx: figurePxH, background: "#000" },
    grid: { rows: state.rows, cols: state.cols, gutterPx, gutterColor: "#000" },
    panels: Array.from({ length: state.rows * state.cols }, (_, i) => ({
      row: Math.floor(i / state.cols),
      col: i % state.cols,
      kind: "placeholder" as const,
      label: "",
    })),
  });

  const sx = cssW / figurePxW;
  const sy = cssH / figurePxH;

  return (
    <div
      data-testid="grid-overlay"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none", // children opt back in
      }}
    >
      {rects.map((r, i) => {
        const row = Math.floor(i / state.cols);
        const col = i % state.cols;
        const k = cellKey(row, col);
        const occupied = state.placements.has(k);

        function onDragOver(e: React.DragEvent<HTMLDivElement>): void {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (hoverKey !== k) setHoverKey(k);
        }
        function onDragLeave(): void {
          if (hoverKey === k) setHoverKey(null);
        }
        function onDropEvt(e: React.DragEvent<HTMLDivElement>): void {
          e.preventDefault();
          setHoverKey(null);
          const raw = e.dataTransfer.getData(DRAG_MIME);
          const from = parseDrag(raw);
          if (from === null) return;
          onDrop({ from, target: { row, col } });
        }
        function onDragStart(e: React.DragEvent<HTMLDivElement>): void {
          if (!occupied) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData(
            DRAG_MIME,
            serializeDrag({ kind: "cell", row, col }),
          );
          e.dataTransfer.effectAllowed = "move";
        }

        return (
          <div
            key={k}
            draggable={occupied}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDropEvt}
            data-testid={`cell-${row}-${col}`}
            style={{
              position: "absolute",
              left: r.x * sx,
              top: r.y * sy,
              width: r.w * sx,
              height: r.h * sy,
              pointerEvents: "auto",
              cursor: occupied ? "grab" : "default",
              outline:
                hoverKey === k ? "3px solid #4C9AFF" : "1px dashed transparent",
              outlineOffset: -2,
              transition: "outline-color 80ms ease",
              boxSizing: "border-box",
            }}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/Grid/GridCells.tsx
git commit -m "feat(ui): grid drop overlay with hover highlight (M3.11)"
```

---

## Task 12: Drop dispatcher

**Files:**

- Create: `src/renderer/dnd/dispatch-drop.ts`
- Test: `test/unit/dispatch-drop.test.ts`

A pure function from `(state, DropEvent)` to a `FigureAction | null`. Centralizes the rules:

| from.kind | target empty      | target occupied     |
| --------- | ----------------- | ------------------- |
| `tray`    | `PLACE_FROM_TRAY` | `REPLACE_FROM_TRAY` |
| `cell`    | `SWAP_CELLS`      | `SWAP_CELLS`        |

Cell→same cell = no-op. Tray→cell where image is already placed = no-op (the reducer also rejects, but rejecting earlier keeps the action stream clean).

- [ ] **Step 1: Write the failing test**

Create `test/unit/dispatch-drop.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { ImagePoolItem } from "../../src/renderer/model/pool";
import {
  cellKey,
  initialFigureState,
  type FigureState,
} from "../../src/renderer/model/figure-state";
import { dispatchDrop } from "../../src/renderer/dnd/dispatch-drop";

const A: ImagePoolItem = {
  id: "a",
  filename: "a.png",
  filePath: "/a.png",
  mime: "image/png",
  width: 1,
  height: 1,
};
const B: ImagePoolItem = {
  ...A,
  id: "b",
  filename: "b.png",
  filePath: "/b.png",
};

function withPool(...items: ImagePoolItem[]): FigureState {
  const s = initialFigureState();
  return { ...s, pool: items };
}

describe("dispatchDrop", () => {
  it("tray → empty cell ⇒ PLACE_FROM_TRAY", () => {
    const s = withPool(A);
    const r = dispatchDrop(s, {
      from: { kind: "tray", imageId: "a" },
      target: { row: 0, col: 0 },
    });
    expect(r).toEqual({
      type: "PLACE_FROM_TRAY",
      imageId: "a",
      target: { row: 0, col: 0 },
    });
  });

  it("tray → occupied cell ⇒ REPLACE_FROM_TRAY", () => {
    const s = withPool(A, B);
    s.placements.set(cellKey(0, 0), "a");
    const r = dispatchDrop(s, {
      from: { kind: "tray", imageId: "b" },
      target: { row: 0, col: 0 },
    });
    expect(r).toEqual({
      type: "REPLACE_FROM_TRAY",
      imageId: "b",
      target: { row: 0, col: 0 },
    });
  });

  it("cell → cell ⇒ SWAP_CELLS", () => {
    const s = withPool(A);
    s.placements.set(cellKey(0, 0), "a");
    const r = dispatchDrop(s, {
      from: { kind: "cell", row: 0, col: 0 },
      target: { row: 1, col: 1 },
    });
    expect(r).toEqual({
      type: "SWAP_CELLS",
      a: { row: 0, col: 0 },
      b: { row: 1, col: 1 },
    });
  });

  it("cell → same cell ⇒ null", () => {
    const r = dispatchDrop(initialFigureState(), {
      from: { kind: "cell", row: 0, col: 0 },
      target: { row: 0, col: 0 },
    });
    expect(r).toBe(null);
  });

  it("tray → cell where image already placed elsewhere ⇒ null", () => {
    const s = withPool(A);
    s.placements.set(cellKey(0, 1), "a");
    const r = dispatchDrop(s, {
      from: { kind: "tray", imageId: "a" },
      target: { row: 1, col: 0 },
    });
    expect(r).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- dispatch-drop`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/renderer/dnd/dispatch-drop.ts`:

```ts
import {
  cellKey,
  type CellCoord,
  type FigureState,
} from "../model/figure-state";
import {
  placeFromTray,
  replaceFromTray,
  swapCells,
  type FigureAction,
} from "../model/figure-actions";
import type { DragPayload } from "./drag-payload";

export interface DropEvent {
  from: DragPayload;
  target: CellCoord;
}

export function dispatchDrop(
  state: FigureState,
  ev: DropEvent,
): FigureAction | null {
  const tk = cellKey(ev.target.row, ev.target.col);
  if (ev.from.kind === "cell") {
    if (ev.from.row === ev.target.row && ev.from.col === ev.target.col) {
      return null;
    }
    return swapCells({ row: ev.from.row, col: ev.from.col }, ev.target);
  }
  // tray
  // Refuse if the dragged image is already placed somewhere.
  for (const v of state.placements.values()) {
    if (v === ev.from.imageId) return null;
  }
  if (state.placements.has(tk)) {
    return replaceFromTray(ev.from.imageId, ev.target);
  }
  return placeFromTray(ev.from.imageId, ev.target);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- dispatch-drop`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/dnd/dispatch-drop.ts test/unit/dispatch-drop.test.ts
git commit -m "feat(dnd): drop event dispatcher (M3.12)"
```

---

## Task 13: Wire it all in `App.tsx`

**Files:**

- Modify: `src/renderer/App.tsx`

Bring it together: the `useReducer` holds `FigureState`, an out-of-band `Map<id, ImageBitmap>` holds decoded bitmaps, the tray's "Add images…" button calls `window.api.openImages()`, and the canvas + grid overlay render side-by-side.

We size the editor canvas's CSS at a fixed visible width (e.g. 800 CSS px) and let the canvas internally render at the figure's pixel dimensions (the `EditorCanvas` already does this). The overlay must match the canvas's CSS box.

- [ ] **Step 1: Replace the file**

Replace `src/renderer/App.tsx` with:

```tsx
import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { EditorCanvas } from "./components/Canvas/EditorCanvas";
import { ExportButton } from "./components/Toolbar/ExportButton";
import { Tray } from "./components/Sidebar/Tray";
import { GridCells, type DropEvent } from "./components/Grid/GridCells";
import { initialFigureState, type FigureState } from "./model/figure-state";
import { addToPool, figureReducer } from "./model/figure-actions";
import { newImageId, type ImagePoolItem } from "./model/pool";
import { deriveFigure } from "./model/figure-derivations";
import { decodeImageBytes } from "./image/decode-bytes";
import { dispatchDrop } from "./dnd/dispatch-drop";
import path from "path-browserify"; // see Task 14 — until then, inline basename

const FIGURE_PX_W = 800;
const FIGURE_PX_H = 600;
const GUTTER_PX = 12;
const CANVAS_BG = "#FFFFFF";
const GUTTER_COLOR = "#FFFFFF";
const CANVAS_CSS_W = 800; // matches figure px for now (no editorScale until M5)
const CANVAS_CSS_H = 600;

function basename(p: string): string {
  const ix = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return ix >= 0 ? p.slice(ix + 1) : p;
}

export function App(): JSX.Element {
  const [state, dispatch] = useReducer(figureReducer, undefined, () =>
    initialFigureState(),
  );
  const [bitmaps, setBitmaps] = useState<Map<string, ImageBitmap>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<FigureState>(state);
  stateRef.current = state;

  const figure = useMemo(
    () =>
      deriveFigure(state, {
        canvas: {
          widthPx: FIGURE_PX_W,
          heightPx: FIGURE_PX_H,
          background: CANVAS_BG,
        },
        grid: { gutterPx: GUTTER_PX, gutterColor: GUTTER_COLOR },
      }),
    [state],
  );

  const placedIds = useMemo(
    () => new Set(state.placements.values()),
    [state.placements],
  );

  const onAddImagesClick = useCallback(async (): Promise<void> => {
    setError(null);
    let result;
    try {
      result = await window.api.openImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (result.canceled) return;
    for (const f of result.files) {
      let bm: ImageBitmap;
      try {
        bm = await decodeImageBytes(f.bytes, f.mime);
      } catch (err) {
        setError(
          `decode failed for ${f.filePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }
      const item: ImagePoolItem = {
        id: newImageId(),
        filename: basename(f.filePath),
        filePath: f.filePath,
        mime: f.mime,
        width: bm.width,
        height: bm.height,
      };
      setBitmaps((prev) => {
        const next = new Map(prev);
        next.set(item.id, bm);
        return next;
      });
      dispatch(addToPool(item));
    }
  }, []);

  const onDrop = useCallback((ev: DropEvent): void => {
    const action = dispatchDrop(stateRef.current, ev);
    if (action !== null) dispatch(action);
  }, []);

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        height: "100vh",
        margin: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: 8,
          borderBottom: "1px solid #DDD",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 16 }}>Mosaic Builder</h1>
        <ExportButton figure={figure} images={bitmaps} />
        {error !== null && (
          <span style={{ color: "#B00", fontSize: 12 }}>{error}</span>
        )}
      </header>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Tray
          pool={state.pool}
          bitmaps={bitmaps}
          placedIds={placedIds}
          onAddImagesClick={() => {
            void onAddImagesClick();
          }}
        />
        <section
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: 16,
            overflow: "auto",
          }}
        >
          <div
            style={{
              position: "relative",
              width: CANVAS_CSS_W,
              height: CANVAS_CSS_H,
            }}
          >
            <EditorCanvas figure={figure} images={bitmaps} />
            <GridCells
              state={state}
              figurePxW={FIGURE_PX_W}
              figurePxH={FIGURE_PX_H}
              cssW={CANVAS_CSS_W}
              cssH={CANVAS_CSS_H}
              gutterPx={GUTTER_PX}
              onDrop={onDrop}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
```

Note: this file imports `path-browserify` only as a hypothetical — it's not actually used (we wrote our own `basename`). Delete the unused import:

- [ ] **Step 2: Remove the unused import**

Edit `src/renderer/App.tsx`: delete the line `import path from "path-browserify";`. (It was a leftover from drafting; the real `basename` is hand-written above and needs no dep.)

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

The `EditorCanvas` currently sizes itself with `width: auto; max-width: 100%`. Inside the relative wrapper that's `width: 800` we want it to fill the wrapper. Let's also make the canvas stretch:

- [ ] **Step 4: Adjust `EditorCanvas` styling**

Edit `src/renderer/components/Canvas/EditorCanvas.tsx`. Change the inline `style` to:

```tsx
style={{
  display: "block",
  width: "100%",
  height: "100%",
  border: "1px solid #DDD",
}}
```

(Existing `maxWidth`/`maxHeight` are removed; the parent wrapper now controls sizing so the overlay rects line up.)

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Run all tests**

Run: `pnpm test`
Expected: all tests pass — none of the existing tests touch CSS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/Canvas/EditorCanvas.tsx
git commit -m "feat(ui): wire tray + grid overlay + open dialog in App (M3.13)"
```

---

## Task 14: Manual smoke test

**Files:** none (manual verification).

- [ ] **Step 1: Start the app**

Run: `pnpm dev`
Expected: window opens; tray on the left ("No images yet. Click Add images…"); 2×2 grid of placeholder cells (A, B, C, D) on the right; "Export as PNG" button in the header.

- [ ] **Step 2: Add images**

Click **Add images…** Pick `resources/fixtures/red.png`, `resources/fixtures/blue.jpg`, and `resources/fixtures/sample.png` (Cmd-click for multi-select). Confirm:

- Three thumbnails appear under "Unplaced" in pick order.
- "Placed" section is empty.

- [ ] **Step 3: Place from tray**

Drag the `red.png` thumbnail onto cell **A** (top-left). Confirm:

- Cell A now displays the image (Contain fit, centred).
- The thumbnail moves to "Placed" and is greyed out.
- The thumbnail is no longer draggable.

Drag `sample.png` onto cell **D** (bottom-right). Confirm same behaviour.

- [ ] **Step 4: Swap cells**

Drag from cell **A** to cell **D**. Confirm:

- The two images swap.
- The tray's placed/unplaced grouping is unchanged (both still placed).

- [ ] **Step 5: Replace from tray**

Drag `blue.jpg` from the tray onto cell **A** (currently `sample.png` after the swap). Confirm:

- Cell A now shows `blue.jpg`.
- `sample.png` is back in "Unplaced" (the kicked image returned to the tray).
- `blue.jpg` is now greyed-out under "Placed".

- [ ] **Step 6: Cancel dialog**

Click **Add images…**, hit Cancel. Confirm: no error, no state change.

- [ ] **Step 7: Export still works**

Click **Export as PNG**, save to a temp file, open it. Confirm: the exported PNG matches the on-screen figure (red in B, blue in A, placeholders C and D, sample in D after the latest swap state).

- [ ] **Step 8: Commit nothing — manual checklist only**

(No code change in this task. If anything in steps 1–7 fails, return to the relevant earlier task and fix.)

---

## Task 15: Lint + final typecheck + record GIF

**Files:** none beyond docs.

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: 0 errors, 0 warnings.

If lint complains about the new files, fix in place — common issues:

- `@typescript-eslint/no-misused-promises` on `onClick={() => { void onAddImagesClick(); }}` — already handled with `void`.
- `@typescript-eslint/no-floating-promises` on the `void onAddImagesClick()` call — already handled with `void`.
- `react/no-unknown-property` on `data-testid` — allowed; if the rule flags it, add `"data-testid"` to the rule's allowlist or use `dataset` (not necessary; `data-*` is valid HTML).

- [ ] **Step 2: Typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: both pass.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: `dist/renderer/` and `dist-electron/{main,preload}/` produced without errors.

- [ ] **Step 4: Record a 10–20s screencap**

Use macOS Screenshot.app (Shift-Cmd-5 → Record Selected Portion). Capture: open dialog → place → swap → replace → export. Save to `docs/m3-demo.mov` (or `.gif` if you prefer; not committed).

- [ ] **Step 5: Final commit**

If anything was tweaked during lint/typecheck:

```bash
git add -A
git commit -m "chore: M3 — image pool + drag complete (M3.14)"
```

---

## Out of scope for M3 (deferred per design doc)

- TIFF decode (M6, with UTIF web worker)
- Configurable grid dimensions / merge cells (M4)
- Per-panel transforms — pan, zoom, rotate, flip, fit modes (M5)
- Selection chrome / Cover-fit clamp (M5)
- Undo/redo (M7)
- Project save/load (M7)
- Annotations, scale bars (M6)
- Drag thumbnails _back_ from tray's "Placed" section (the design says cell→cell drag handles unplacement implicitly; explicit "remove from grid" is M5/UX polish)
- Reordering within the tray (not a stated requirement)
- Image bytes embedded in `.mosaic` (design says path refs only; M7 deals with this)

---

## Self-review notes

**Spec coverage** (from design doc M3 line: "Native file picker → load PNG/JPEG → sidebar tray → drag onto cell with Contain fit. Cell↔cell swap. Tray→occupied = replace (returns to tray)."):

- Native file picker → Tasks 2, 4, 13.
- Load PNG/JPEG → Tasks 1, 5.
- Sidebar tray → Task 10.
- Drag onto cell with Contain fit → Tasks 9, 11, 12, 13. Contain fit comes free from M2's `drawImageContain` in `draw-figure.ts`.
- Cell↔cell swap → Tasks 11, 12 (`SWAP_CELLS`).
- Tray→occupied = replace, kicked returns to tray → Tasks 7 (`REPLACE_FROM_TRAY` reducer test explicitly covers this), 12.
- Tray grouping: unplaced first, placed greyed-out below → Task 10 (`Tray.tsx`).
- New uploads append to unplaced → Task 7 (`ADD_TO_POOL` appends; `Tray` filters by `placedIds`).

**Type consistency check:**

- `ImageMime` defined in `src/main/mime.ts` and `src/renderer/image/decode-bytes.ts` — both `"image/png" | "image/jpeg"`. `OpenImagesMime` in `src/preload/api.ts` is the same shape (deliberately structurally compatible across the IPC boundary, no shared import since main and renderer have separate tsconfigs).
- `OpenImagesResult` defined in `src/preload/api.ts` and `src/main/open-images.ts` — both `{ canceled: true } | { canceled: false; files: ... }`. The shapes match field-for-field.
- `CellCoord`, `cellKey`, `FigureState` — defined once in `figure-state.ts`, imported everywhere.
- `DragPayload` — defined once in `drag-payload.ts`.
- `figureReducer` action names match between `figure-actions.ts`, `dispatch-drop.ts`, and the tests.
