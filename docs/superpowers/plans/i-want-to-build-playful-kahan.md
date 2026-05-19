# Mosaic Builder — Implementation Plan

## Context

You want a standalone, fully-offline desktop program that helps scientists assemble publication-quality multi-panel image figures from a collection of source images. The current ecosystem (matplotlib `gridspec`, ImageJ Montage, PowerPoint, Illustrator) each fall short for this workflow: matplotlib is scriptable but rigid, ImageJ Montage is rough around figure aesthetics, and Illustrator/PowerPoint don't preserve image quality or scientific calibration. The goal is a focused tool that hits the sweet spot — interactive layout, per-panel image controls (pan/zoom/rotate/flip), proper scale bars driven by TIFF metadata, customizable grid spacing, and lossless high-DPI export to PNG/JPEG/TIFF/PDF — with a reopen-and-edit project file so figures aren't one-shot artifacts.

The intended outcome: a single user (and their lab/group) can drag image files into the app, choose a grid (e.g., 3×4 with two cells merged into a wide hero panel), adjust each panel's framing, add subpanel letters, scale bars, arrows and boxes, and export a journal-ready figure at 300 DPI — entirely offline, with the project saveable and reopenable.

## Confirmed requirements

- **Platform**: Electron + HTML5 Canvas + TypeScript. Cross-platform (mac/Windows/Linux). Fully offline.
- **Image formats**: JPEG, PNG, TIFF (incl. 16-bit microscope TIFFs). TIFF decoded via UTIF.js inside a Web Worker.
- **Big images**: decode at full resolution into RAM; render editor preview from a downsampled `ImageBitmap` (~2K long edge); use full-res only at export time.
- **Grid model**: rectangular, up to 10×10. Cells can be **merged** into rectangular panels (rowspan/colspan). Each panel holds 0 or 1 image.
- **Merge UX**: shift-click to multi-select cells → "Merge" toolbar button OR `M`. "Unmerge"/`U` to split.
- **Spacing**: uniform gutter only (configurable width and color, alpha allowed). No outer frame.
- **Image placement**: persistent left sidebar tray, larger pool than grid. Drag tray→cell to place, cell→cell to **swap**, tray→occupied-cell to **replace** (previous image returns to tray as unplaced).
- **Tray order**: grouped — unplaced first; placed below, greyed/marked in-use. New uploads append to unplaced.
- **Per-panel controls**: fit (Contain/Cover/Stretch), pan + zoom (selected-panel-only mode), rotation in 90° steps, horizontal/vertical flip. In Cover fit, pan/zoom is **clamped** so the panel always remains fully filled.
- **Annotations**: subpanel letters (auto row-major, manual override, global on/off), free text (font/size/color/bold/italic/optional bg), arrows (color/thickness/arrowhead), boxes (stroke + optional fill), scale bars (length in µm/mm/px, calibrated from TIFF metadata with manual fallback, **bar length recomputed on zoom**). Style for letters and scale bars is **per-figure global**; per-instance content varies.
- **Canvas size**: physical mode (in/cm/mm + DPI) and pixel mode, switchable.
- **Exports**: PNG, JPEG (quality slider), TIFF, PDF (raster). All honor user-chosen DPI in physical mode.
- **Project save/load**: `.mosaic` JSON file with relative paths preferred + absolute fallback + content hash. Schema-versioned from v1.
- **Undo/redo**: full history. `Cmd/Ctrl-Z` / `Cmd/Ctrl-Shift-Z`. Immutable snapshots via immer.

## Architecture overview

Single-window Electron app with a privileged **main process** (file system, native dialogs, menus, project IO) and a sandboxed **renderer process** (React UI + an imperative canvas-rendering core). The renderer holds the figure state in a Zustand store with immer drafts; every mutation produces a new immutable snapshot pushed onto an undo stack. React drives the surrounding UI (sidebar, properties panel, modals, toolbar) and dnd-kit drives drag interactions, but the figure itself is drawn imperatively on `<canvas>` — React never touches figure pixels.

Two render pipelines share one `draw-panel` routine (parameterized by quality and target context):

1. **Editor pipeline** — `requestAnimationFrame`-coalesced; draws into the on-screen `<canvas>` from downsampled `ImageBitmap`s for snappy interaction.
2. **Export pipeline** — runs once on demand inside an `OffscreenCanvas` sized to final pixels; uses full-resolution `ImageBitmap`s; produces PNG/JPEG/TIFF/PDF outputs.

```
+----------------------- Electron Main Process -----------------------+
|  app lifecycle | native menu | IPC handlers | fs read/write | dialogs|
+--------------------------------|------------------------------------+
                                 | contextBridge (preload.ts)
+--------------------------------v------------------------------------+
|                       Renderer Process (React)                      |
|  +--------------+   +-----------------+   +----------------------+  |
|  | Sidebar Tray |   | Properties Pane |   | Toolbar / Menus      |  |
|  | (dnd-kit)    |   | (panel/anno)    |   |                      |  |
|  +------+-------+   +--------+--------+   +----------+-----------+  |
|         |                    |                       |              |
|  +------v--------------------v-----------------------v-----------+  |
|  |              Zustand Store + Immer + Undo Stack               |  |
|  +------+--------------------+-----------------------+-----------+  |
|         |                    |                       |              |
|  +------v------+   +---------v--------+   +----------v-----------+  |
|  | Image Loader|   | Editor Renderer  |   | Export Engine        |  |
|  | (worker:    |   | (HTMLCanvas,     |   | (OffscreenCanvas,    |  |
|  |  UTIF +     |   |  downsampled     |   |  full-res, PNG/JPEG/ |  |
|  |  bitmap     |   |  ImageBitmaps)   |   |  TIFF/PDF)           |  |
|  |  cache)     |   +------------------+   +----------------------+  |
|  +-------------+                                                    |
+---------------------------------------------------------------------+
```

## Tech stack (pinned)

- **Electron 32+** (Chromium 128+, Node 20+). `contextIsolation: true`, `nodeIntegration: false`, preload-only IPC.
- **TypeScript 5.5+** strict mode.
- **React 18.3** + `react-dom`. Chosen because the surrounding UI (tray, properties, modals, undo, dnd) benefits from declarative rendering and dnd-kit's React API.
- **Zustand 4.5 + immer middleware** for state. Lightweight, draft-style mutations producing immutable snapshots that share structure — perfect for cheap undo. Hand-rolled undo stack on top.
- **dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`) — tray↔grid and cell↔cell swap.
- **UTIF.js** (`/photopea/utif.js`) — TIFF decode + IFD metadata. Verified API: `UTIF.decode(buffer)` → IFDs; `UTIF.decodeImage(buffer, ifd)`; `UTIF.toRGBA8(ifd)` → `Uint8Array` for `putImageData`. IFD tags `t282`/`t283` (X/YResolution), `t296` (ResolutionUnit) provide calibration.
- **pdf-lib** (`/hopding/pdf-lib`) — PDF export. `addPage([wPt, hPt])` where 72pt = 1 inch; `embedPng(bytes)` then `page.drawImage(img, {x,y,width,height})`.
- **Vite + vite-plugin-electron** — dev cycle with HMR; main-process restart on change.
- **electron-builder** — packaging (.dmg, .nsis, .AppImage).
- **Vitest** for unit tests (transforms, scale-bar math, history, schema migrations); **Playwright + electron driver** for E2E.
- **ESLint + Prettier + typescript-eslint**.

## Project layout

```
mosaic-builder/
  package.json
  tsconfig.json
  tsconfig.main.json
  tsconfig.renderer.json
  vite.config.ts
  electron-builder.yml
  src/
    main/
      index.ts                 # app lifecycle, BrowserWindow
      menu.ts                  # native menu + accelerators
      ipc.ts                   # registerIpc(), file dialogs, fs read/write
      project-io.ts            # .mosaic load/save, path resolution
    preload/
      preload.ts               # contextBridge: { fs, dialog, project }
    renderer/
      index.html
      main.tsx                 # React root
      app/
        App.tsx
        Layout.tsx
      components/
        Sidebar/Tray.tsx
        Sidebar/Thumbnail.tsx
        Toolbar/Toolbar.tsx
        Properties/PanelProperties.tsx
        Properties/AnnotationProperties.tsx
        Properties/CanvasProperties.tsx
        Canvas/EditorCanvas.tsx     # mounts <canvas>, hands ref to renderer
        Modals/ExportModal.tsx
        Modals/CalibrationModal.tsx
      state/
        store.ts                # Zustand + immer
        history.ts              # undo/redo stacks
        selectors.ts
        actions.ts              # typed action creators
      model/
        types.ts                # Project, Grid, Panel, Annotation...
        defaults.ts
        schema.ts               # JSON schema + validators + migrations
      render/
        editor-renderer.ts      # main-thread render loop
        export-renderer.ts      # offscreen, full-res
        draw-panel.ts           # shared draw routine
        draw-annotations.ts
        coords.ts               # transform math (pure)
        scalebar.ts             # scale-bar geometry
      image/
        loader.ts               # dispatches by mime
        tiff-worker.ts          # Web Worker entry
        tiff-decode.ts          # UTIF wrapper, metadata extract
        bitmap-cache.ts         # full-res + preview ImageBitmap cache
      dnd/
        dnd-context.tsx
        drag-types.ts
      export/
        png.ts
        jpeg.ts
        tiff.ts                 # encode via UTIF.encodeImage
        pdf.ts                  # pdf-lib
      utils/
        units.ts                # in/cm/mm/px <-> px conversions
        color.ts                # hex/rgba parsing
        ids.ts                  # uuid v4
  test/
    unit/ {coords,scalebar,history,schema}.test.ts
    e2e/  smoke.spec.ts
  resources/icons/
```

## Data model (TypeScript)

```ts
type UUID = string;
type Hex = string; // "#RRGGBB" or "#RRGGBBAA"
type FitMode = "contain" | "cover" | "stretch";
type Unit = "in" | "cm" | "mm" | "px";

interface ImagePoolItem {
  id: UUID;
  sourcePath: string; // absolute on disk
  relPath?: string; // relative to .mosaic file when saved
  filename: string;
  mime: "image/png" | "image/jpeg" | "image/tiff";
  width: number;
  height: number;
  bitDepth: 8 | 16 | 32;
  sha256?: string;
  calibration?: {
    unit: "um" | "mm" | "px";
    pixelsPerUnit: number;
    source: "tiff-meta" | "manual";
  };
  // bitmaps cached out-of-band by id; not persisted.
}

interface PanelTransform {
  fit: FitMode;
  panX: number;
  panY: number; // panel-local px, 0,0 = panel center
  zoom: number; // 1.0 = fit baseline
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

interface Panel {
  id: UUID;
  row: number;
  col: number; // top-left in grid (0-based)
  rowSpan: number;
  colSpan: number; // >= 1
  imageId?: UUID;
  transform: PanelTransform;
  letterOverride?: string;
}

interface Grid {
  rows: number;
  cols: number; // 1..10
  gutterPx: number;
  gutterColor: Hex;
  panels: Panel[]; // covers grid; merged cells = single panel
}

type Annotation =
  | TextAnnotation
  | ArrowAnnotation
  | BoxAnnotation
  | ScaleBarAnnotation;

interface BaseAnno {
  id: UUID;
  panelId?: UUID;
  z: number;
}
interface TextAnnotation extends BaseAnno {
  kind: "text";
  x: number;
  y: number;
  text: string;
  font: string;
  sizePt: number;
  bold: boolean;
  italic: boolean;
  color: Hex;
  bgColor?: Hex;
}
interface ArrowAnnotation extends BaseAnno {
  kind: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: Hex;
  thicknessPx: number;
  head: "none" | "open" | "filled";
}
interface BoxAnnotation extends BaseAnno {
  kind: "box";
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: Hex;
  strokeWidthPx: number;
  fill?: Hex;
}
interface ScaleBarAnnotation extends BaseAnno {
  kind: "scalebar";
  panelId: UUID;
  lengthValue: number;
  lengthUnit: "um" | "mm" | "px";
  cornerOverride?: "tl" | "tr" | "bl" | "br";
}

interface GlobalAnnoStyle {
  letters: {
    enabled: boolean;
    font: string;
    sizePt: number;
    color: Hex;
    bgColor?: Hex;
    corner: "tl" | "tr" | "bl" | "br";
    paddingPx: number;
    bold: boolean;
  };
  scalebar: {
    font: string;
    sizePt: number;
    color: Hex;
    barColor: Hex;
    thicknessPx: number;
    corner: "tl" | "tr" | "bl" | "br";
    paddingPx: number;
    showLabel: boolean;
  };
}

interface FigureCanvas {
  mode: "physical" | "pixel";
  widthPhys?: number;
  heightPhys?: number;
  unit?: Unit;
  dpi?: number;
  widthPx?: number;
  heightPx?: number;
  background: Hex;
}

interface Project {
  schemaVersion: 1;
  id: UUID;
  createdAt: string;
  modifiedAt: string;
  canvas: FigureCanvas;
  grid: Grid;
  imagePool: ImagePoolItem[];
  annotations: Annotation[];
  globalStyle: GlobalAnnoStyle;
  exportDefaults: {
    format: "png" | "jpeg" | "tiff" | "pdf";
    jpegQuality: number;
    dpi: number;
  };
}
```

The runtime store wraps `Project` plus ephemeral fields (selection, hover, drag state, bitmap-cache refs) that are NOT persisted.

## Coordinate systems

Five spaces, transforms compose right-to-left:

1. **Source-image** `(sx, sy)` — original pixels, top-left origin.
2. **Image-display** `(ix, iy)` — after rotation/flip and zoom centered on image center.
3. **Panel-local** `(px, py)` — origin at panel center.
4. **Figure-canvas** `(fx, fy)` — origin at canvas top-left, units = export-canvas pixels.
5. **Screen** `(ex, ey)` — editor canvas CSS px, after `editorScale = editorCanvasW / figureCanvasW`.

Per-panel forward transform `source → figure`:

```
T_panel(sx, sy) =
  Translate(panelCenter_fig)
  * Translate(panX, panY)
  * Scale(zoom * baseScale)
  * Rotate(rotation)
  * Scale(flipH ? -1 : 1, flipV ? -1 : 1)
  * Translate(-imageCenterX, -imageCenterY)
  * (sx, sy)
```

`baseScale`:

- **Contain**: `min(panelW/imgW, panelH/imgH)`
- **Cover**: `max(panelW/imgW, panelH/imgH)`
- **Stretch**: anisotropic — separate sx, sy with `zoom` locked to 1.

For 90°/270° rotations, swap `imgW` and `imgH` in `baseScale`. Hit-tests run in figure-canvas space using the per-panel inverse transform.

## Scale-bar formula

Given `pixelsPerUnit` (source pixels per micron) and effective scale `S = zoom * baseScale`:

```
barLengthFigurePx = lengthValue * pixelsPerUnit * S
```

When `lengthUnit === "px"`, `barLengthFigurePx = lengthValue * S`. Convert mm↔µm at the input. The scale bar is a **derived selector**, not stored state — it recomputes on every zoom change.

## Cover-fit pan limits

With `S = zoom * baseScale_cover`, displayed image half-extents in panel-local coords are `hx = imgW*S/2`, `hy = imgH*S/2` (rotated dims). Panel half-extents are `pw = panelW/2`, `ph = panelH/2`. Clamp:

```
panX ∈ [-(hx - pw), (hx - pw)]
panY ∈ [-(hy - ph), (hy - ph)]
zoom >= 1   (Cover) — prevents gutter bleed-through
```

Apply clamp after every pan/zoom action. Contain mode: no pan clamp; enforce `zoom >= 1` (zooming further out has no purpose).

## Render loops

**Editor loop** (`editor-renderer.ts`):

- Mounted once on `<canvas ref>`. Subscribes to relevant store slices; schedules a single `requestAnimationFrame` per change (coalescing).
- Each frame: clear → fill background → for each panel: clip to panel rect, draw image with the section-5 transform using preview `ImageBitmap`s, restore → draw gutter (if `gutterColor !== background`) → draw annotations → draw selection chrome.
- Applies `editorScale` once via `ctx.setTransform` so the figure can be larger than the viewport.

**Export loop** (`export-renderer.ts`):

- On demand. Uses `OffscreenCanvas` sized to final figure pixels (physical: `inches*dpi`; pixel: literal).
- Uses **full-resolution** `ImageBitmap`s from the cache. No `editorScale`.
- Calls the same `draw-panel`/`draw-annotations` routines, parameterized by `(targetCtx, scaleFactor=1, useFullRes=true)`. WYSIWYG by construction.
- Output: PNG/JPEG via `canvas.convertToBlob({type, quality})`; TIFF via `UTIF.encodeImage`; PDF via pdf-lib (`addPage([w*72, h*72])` + `embedPng` + `drawImage` filling the page).

## Undo/redo

**Immutable snapshot stack** (not command pattern). With immer, snapshots share unchanged structure cheaply; no inverse ops to write; replay is trivial.

```
history = { past: Project[], future: Project[], max: 100 }
commit(label, mutator)  // pushes current → past, applies via immer, clears future
undo()  // project → future, pop past → project
redo()  // symmetric
```

**Coalescing**: pan/zoom/drag emit interim states without committing; commit only on `pointerup` via a `beginInteraction()/endInteraction()` pair. Bitmap caches live outside snapshots — undo never reloads images. Cap at 100 snapshots.

## .mosaic JSON schema (v1)

UTF-8 JSON. Image bytes are NOT embedded; only path refs + sha256 for integrity warnings. Schema-versioned from day one with a migration table `migrations[fromVersion] → nextVersion`.

```json
{
  "schemaVersion": 1,
  "app": "mosaic-builder",
  "appVersion": "0.1.0",
  "id": "9c1...",
  "createdAt": "2026-05-01T10:00:00Z",
  "modifiedAt": "2026-05-01T10:42:00Z",
  "canvas": {
    "mode": "physical",
    "widthPhys": 7,
    "heightPhys": 5,
    "unit": "in",
    "dpi": 300,
    "background": "#FFFFFF"
  },
  "grid": {
    "rows": 2,
    "cols": 3,
    "gutterPx": 12,
    "gutterColor": "#FFFFFF",
    "panels": [
      {
        "id": "p1",
        "row": 0,
        "col": 0,
        "rowSpan": 1,
        "colSpan": 2,
        "imageId": "img1",
        "transform": {
          "fit": "cover",
          "panX": 0,
          "panY": 0,
          "zoom": 1.0,
          "rotation": 0,
          "flipH": false,
          "flipV": false
        }
      }
    ]
  },
  "imagePool": [
    {
      "id": "img1",
      "relPath": "./images/sample.tif",
      "sourcePath": "/Users/x/Desktop/proj/images/sample.tif",
      "filename": "sample.tif",
      "mime": "image/tiff",
      "width": 4096,
      "height": 3072,
      "bitDepth": 16,
      "sha256": "...",
      "calibration": {
        "unit": "um",
        "pixelsPerUnit": 6.45,
        "source": "tiff-meta"
      }
    }
  ],
  "annotations": [
    {
      "id": "a1",
      "kind": "scalebar",
      "panelId": "p1",
      "z": 10,
      "lengthValue": 50,
      "lengthUnit": "um"
    }
  ],
  "globalStyle": {
    "letters": {
      "enabled": true,
      "font": "Arial",
      "sizePt": 12,
      "color": "#000000",
      "corner": "tl",
      "paddingPx": 6,
      "bold": true
    },
    "scalebar": {
      "font": "Arial",
      "sizePt": 10,
      "color": "#FFFFFF",
      "barColor": "#FFFFFF",
      "thicknessPx": 4,
      "corner": "br",
      "paddingPx": 8,
      "showLabel": true
    }
  },
  "exportDefaults": { "format": "png", "jpegQuality": 0.92, "dpi": 300 }
}
```

On open: validate via `zod` (or hand validator), run migrations, attempt `relPath` first, fall back to `sourcePath`, else show **relink modal**. Compare sha256; warn if mismatch.

## Tracer-bullet milestones

Each milestone produces something demoable.

1. **M1 — Skeleton.** Electron + React + Vite scaffold; main/preload/renderer talking via `contextBridge`. Empty white window.
2. **M2 — Hard-coded export.** Hard-coded 2×2 grid with placeholder rectangles + one bundled PNG; "Export as PNG" writes to disk via IPC. _End-to-end pixel out._
3. **M3 — Image pool + drag.** Native file picker → load PNG/JPEG → sidebar tray → drag onto cell with Contain fit. Cell↔cell swap. Tray→occupied = replace (returns to tray).
4. **M4 — Grid model + merge.** Configurable rows/cols (up to 10×10), gutter px and color; shift-click multi-select; Merge/Unmerge with `M`/`U`.
5. **M5 — Per-panel transforms + selection.** Click to select, drag to pan, scroll to zoom, rotation/flip buttons; Cover-fit clamping; Contain/Cover/Stretch picker.
6. **M6 — Annotations & TIFF.** UTIF worker; auto-calibration from IFD; subpanel letters (auto + override + global toggle); free text; arrows; boxes; scale bars with the formula above. JPEG/TIFF/PDF exports.
7. **M7 — Project save/load + undo/redo.** `.mosaic` write/read with relative paths; undo/redo wired to all mutations; missing-image relink modal.
8. **M8 — Polish + packaging.** Properties panels finalized, keyboard shortcuts, error toasts, app icon, electron-builder configs, signed mac/win artifacts.

Each milestone ends with a recorded GIF and a manual-test checklist that passes.

## Build / run / package

- `pnpm install`
- `pnpm dev` — Vite serves renderer; Electron main launches with `--remote-debugging-port`. HMR for renderer; main restarts on change.
- `pnpm typecheck` — `tsc -b`.
- `pnpm test` — Vitest.
- `pnpm test:e2e` — Playwright + electron driver.
- `pnpm lint` — ESLint.
- `pnpm build` — `dist/main`, `dist/preload`, `dist/renderer`.
- `pnpm package` / `pnpm package:all` — electron-builder per OS.

## Critical files

- `/Users/erikvlcak/Desktop/mosaic-builder/src/renderer/model/types.ts` — data model.
- `/Users/erikvlcak/Desktop/mosaic-builder/src/renderer/render/coords.ts` — pure transform math (heavily tested).
- `/Users/erikvlcak/Desktop/mosaic-builder/src/renderer/render/draw-panel.ts` — shared editor + export draw routine.
- `/Users/erikvlcak/Desktop/mosaic-builder/src/renderer/render/scalebar.ts` — pixel-to-physical-unit math.
- `/Users/erikvlcak/Desktop/mosaic-builder/src/renderer/state/store.ts` + `history.ts` — Zustand + immer + undo.
- `/Users/erikvlcak/Desktop/mosaic-builder/src/renderer/image/tiff-decode.ts` + `tiff-worker.ts` — UTIF wrapper.
- `/Users/erikvlcak/Desktop/mosaic-builder/src/renderer/export/{png,jpeg,tiff,pdf}.ts` — exporters.
- `/Users/erikvlcak/Desktop/mosaic-builder/src/renderer/model/schema.ts` — `.mosaic` validation + migrations.
- `/Users/erikvlcak/Desktop/mosaic-builder/src/main/{ipc,project-io}.ts` — file dialogs, fs read/write.

## Risks and mitigations

- **TIFF variants** (LZW, ZIP, planar configs, BigTIFF): UTIF covers most; for unsupported, surface a clear error and allow manual calibration only — never crash. Test corpus of 6+ representative microscope TIFFs.
- **16-bit display**: Canvas is 8-bit per channel. On decode, normalize 16-bit → 8-bit with auto min/max for preview, but cache the original `Uint16Array` for TIFF export pass-through.
- **Memory blowup** (4 × 12-megapixel = ~200MB just for ImageBitmaps): cap N images decoded; preview-only by default with full-res lazy decode on export. Show a memory indicator. Free decoded data on image removal.
- **Drag-and-drop quirks**: dnd-kit smooths most issues. For OS-file drops, use Electron 32+'s `webUtils.getPathForFile` (`File.path` is removed in modern Electron).
- **Color management**: ignore embedded ICC profiles in v1 (document); render in sRGB. Add ICC-aware path post-1.0.
- **Font availability**: ship a safe set (Arial, Helvetica, Times New Roman, Courier, Georgia); optional "load TTF from disk" in a later milestone.
- **Path portability**: store both `relPath` and `sourcePath`; load tries rel, then absolute, then prompts.
- **DPI confusion**: explicitly compute `pxW = round(inches * dpi)` and show resulting pixel dims in the export modal.
- **Undo memory growth**: cap at 100 snapshots; immer share-by-ref; bitmaps live outside snapshots.

## Verification

**Manual end-to-end scenarios** (run before each release):

1. Launch; new 3×3 project at 7×5 in @ 300 DPI.
2. Drag in 5 PNG, 2 JPEG, 2 TIFF (one 16-bit microscope w/ resolution tags, one without).
3. Auto-calibration appears for the tagged TIFF; manual calibration modal works for the other.
4. Place by drag from tray; swap two; replace one (verify tray re-grouping: unplaced first, placed greyed below).
5. Merge top row (1×3); unmerge; re-merge top-left 2×2.
6. Per-panel: switch fit Contain/Cover/Stretch; pan + zoom in Cover (verify gutter never shows); rotate 90, flip H/V.
7. Subpanel letters: auto on; override one to "A1"; toggle global off/on.
8. Scale bar on a TIFF panel: confirm `50 µm` correct at zoom=1; zoom in 2×, confirm bar visually doubles in figure pixels.
9. Add text, arrow, box; edit colors, fonts; drag to reposition.
10. `Cmd-Z` 20× across all the above; `Cmd-Shift-Z` back; verify no orphan state.
11. Save `.mosaic`; close app; reopen project — verify exact reproduction.
12. Move source image folder; reopen — verify relink dialog and recovery.
13. Export PNG, JPEG (q=0.85), TIFF, PDF at 300 DPI. Open in Preview / Acrobat / ImageJ — verify dimensions in inches and physical scale-bar correct.
14. Open exported TIFF in ImageJ — verify resolution tags carried through.
15. Stress: 50 images in pool, 10×10 grid, all panels filled — editor stays > 30 fps; export completes under 30s.

**Automated coverage**:

- Vitest: `coords.ts`, `scalebar.ts`, `history.ts`, schema migrations, Cover-fit clamp math.
- Playwright (Electron driver): launch, drag-drop a fixture PNG, export PNG, assert exported file pixel dimensions match project setting.
