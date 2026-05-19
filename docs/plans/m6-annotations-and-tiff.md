# Mosaic Builder — M6: Annotations + TIFF + Multi-format Export

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the M5 figure into a publication-grade scientific output. Three concerns ship together because they are coupled by the scale-bar formula:

1. **TIFF support.** Decode 8/16-bit TIFFs in a Web Worker via UTIF.js, including IFD metadata (`t282/t283/t296`) for auto-calibration in µm/mm.
2. **Annotation layer.** Subpanel letters (auto row-major + per-panel override + global toggle), free text, arrows, boxes, scale bars. Drawn over the panel image inside the same `drawFigure` pipeline. Scale bars recompute `barLengthFigurePx = lengthValue * pixelsPerUnit * (zoom * baseScale)` on every state change.
3. **Multi-format export.** PNG already ships in M2. M6 adds JPEG (quality slider), TIFF (lossless, with `XResolution`/`YResolution`/`ResolutionUnit` written through), and raster PDF (`pdf-lib`, `addPage([w*72, h*72])`, `embedPng` → `drawImage`). All routed through one `OffscreenCanvas` so the editor and every export remain pixel-WYSIWYG.

**Source of truth:** Implements milestone **M6** from [/Users/erikvlcak/.claude/plans/i-want-to-build-playful-kahan.md](../../.claude/plans/i-want-to-build-playful-kahan.md) (line 392) and the math from sections "Scale-bar formula" + "Render loops" + "Risks" of that document. Does NOT implement project save/load, undo/redo, relink modal — those are M7.

**Working directory:** `/Users/erikvlcak/Desktop/mosaic-builder/`. Branch off `main`. Build a feature branch (e.g. `feat/m6-annotations-and-tiff`) and merge once the manual checklist passes.

**Predecessor state (M5):**

- [src/renderer/model/panels.ts](../../src/renderer/model/panels.ts) — `Panel` carries `id, row, col, rowSpan, colSpan, imageId?, transform?` with `transform === undefined` ⇔ `imageId === undefined`.
- [src/renderer/model/pool.ts](../../src/renderer/model/pool.ts) — `ImagePoolItem` only has `id, filename, filePath, mime, width, height`. **No `bitDepth`, no `calibration`, no `sha256`.** M6 extends this.
- [src/renderer/model/figure-state.ts](../../src/renderer/model/figure-state.ts) — `FigureState` holds `pool`, `panels`, `rows`, `cols`, `gutterPx`, `gutterColor`. **No annotations slot.** M6 adds `annotations: Annotation[]` and `globalStyle: GlobalAnnoStyle`.
- [src/renderer/model/types.ts](../../src/renderer/model/types.ts) — `HardCodedPanel` is the render input. M6 keeps the panel shape unchanged but augments `Figure` with `annotations: ResolvedAnnotation[]` (a derived shape — see "Render input changes" below).
- [src/renderer/render/draw-figure.ts](../../src/renderer/render/draw-figure.ts) — paints background → gutter → panels (with M5 transform). M6 adds an annotation pass after panels and before any future selection chrome.
- [src/renderer/render/coords.ts](../../src/renderer/render/coords.ts) — already exports `baseScale`, `clampZoom`, `clampCoverPan`, `rotatedImageDims`, `snapTransform`, `panForCursorZoom`. M6 reuses these and adds **only** `effectivePanelScale` (a thin wrapper that returns the isotropic `S = zoom * baseScale` for Contain/Cover, or throws for Stretch — annotations on a Stretch panel use `min(panelW/imgW, panelH/imgH)` as a defensive fallback).
- [src/renderer/render/letters.ts](../../src/renderer/render/letters.ts) — `cellLabel(index)` produces `A, B, … Z, AA, …`. Today it's used as the **placeholder label** for empty cells. M6 promotes it to the auto-letter source for the subpanel-letter annotation pass.
- [src/renderer/image/decode-bytes.ts](../../src/renderer/image/decode-bytes.ts) — supports `image/png` and `image/jpeg` via `createImageBitmap`. **TIFF throws.** M6 routes TIFF through a worker.
- [src/renderer/export/png.ts](../../src/renderer/export/png.ts) — uses `renderFigureToPngBlob` → `OffscreenCanvas.convertToBlob`. M6 keeps PNG and adds JPEG/TIFF/PDF siblings.
- [src/main/mime.ts](../../src/main/mime.ts) — recognises `.png`, `.jpg`, `.jpeg`. M6 adds `.tif`, `.tiff`.
- [src/main/open-images.ts](../../src/main/open-images.ts) — file filter `["png", "jpg", "jpeg"]`. M6 extends to include `tif`, `tiff`.
- [src/main/index.ts](../../src/main/index.ts) — registers `mosaic:ping`, `mosaic:export-png`, `mosaic:open-images`. M6 adds `mosaic:export-jpeg`, `mosaic:export-tiff`, `mosaic:export-pdf`.
- [src/preload/api.ts](../../src/preload/api.ts) — declares the IPC contract types. M6 extends.
- [src/renderer/App.tsx](../../src/renderer/App.tsx) — composes Tray, GridCells, PanelInteractionLayer, ExportButton, GridControls, MergeControls, PanelControls. M6 adds an **AnnotationToolbar** and an **AnnotationInteractionLayer**, plus an updated **ExportMenu** (replacing the single PNG button with a dropdown).

---

## Definition of done for M6

- `pnpm typecheck` exits 0.
- `pnpm test` exits 0; new unit tests cover scale-bar math, annotation hit-testing, calibration extraction from a fixture IFD, JPEG/TIFF/PDF blob shapes, and reducer actions for annotations + global style. Aim for ≥ 30 new test cases.
- `pnpm lint` exits 0.
- A user can:
  1. Add a 16-bit TIFF (LZW-compressed, with `XResolution = 6.45 px/µm`, `ResolutionUnit = 3` (centimetres) → app converts to µm internally) → it appears in the tray with no UI block (decode runs in a worker), displays correctly in the panel, and reports an auto-detected pixel size.
  2. Add a TIFF without resolution tags → tray shows it; clicking the panel's "Calibrate…" button opens a modal where the user enters a known length, drags two points on the image, and clicks "Save" → the calibration appears as `manual`.
  3. Toggle "Subpanel letters" off and on globally → all auto-letters appear/disappear; per-panel `letterOverride` (e.g. `"A1"`) survives the toggle.
  4. Add free text on a panel by clicking the **Text** tool then clicking inside the panel → an editable text box appears; user can edit text, change font/size/colour/bold/italic; drag to reposition.
  5. Draw an arrow with the **Arrow** tool by click-drag (start → end) → arrow renders with the chosen colour/thickness/arrowhead. Drag either endpoint to reposition.
  6. Draw a box with the **Box** tool by click-drag → rectangle renders with stroke + optional fill. Drag corners to resize.
  7. Add a scale bar to a calibrated panel via the **Scale bar** tool → bar appears in the corner specified by `globalStyle.scalebar.corner`; user enters `lengthValue = 50`, `lengthUnit = "um"`. Bar geometry uses `barLengthFigurePx = 50 * pixelsPerUnit * (zoom * baseScale)`.
  8. Zoom the panel 2× → the scale bar's pixel length doubles in figure pixels (it's derived, not stored).
  9. Export the figure to PNG, JPEG (quality slider 0.50–1.00), TIFF, and PDF → each file lands on disk via the existing IPC pattern, and opens in Preview / Acrobat / ImageJ. The TIFF carries the figure's DPI via `XResolution`/`YResolution` tags. The PDF page is sized to the figure's physical dimensions in points (`72 pt = 1 in`).
- Manual checklist in §"Verification" passes.

Out of scope: project save/load (`.mosaic`), undo/redo, relink modal, properties side-panel beyond the annotation toolbar, ICC color management, font loading from disk, BigTIFF, ImageBitmap full-res / preview tiering for memory.

---

## Architecture for this milestone

Five concerns, five layers:

1. **Image-data model** (`model/pool.ts`). Extend `ImagePoolItem` with `bitDepth: 8 | 16`, `calibration?: { unit: "um"|"mm"|"px"; pixelsPerUnit: number; source: "tiff-meta"|"manual" }`. The full Project schema in the source plan also includes `sha256` and `relPath`, but those belong to M7 (project save/load) — leave them out here. Mime widens to `"image/png" | "image/jpeg" | "image/tiff"`.
2. **Annotation model** (`model/annotations.ts`, new). Discriminated union of `TextAnnotation | ArrowAnnotation | BoxAnnotation | ScaleBarAnnotation`. All carry `id, panelId?, z, kind`. Letters are NOT stored as annotations — they're a derivation from `panel.row, panel.col` + `globalStyle.letters` + per-panel `letterOverride`.
3. **TIFF worker** (`image/tiff-worker.ts`, `image/tiff-decode.ts`, new). UTIF.js runs in a Web Worker. Renderer posts `{ buffer, mime: "image/tiff" }` and gets back `{ rgba: Uint8ClampedArray, width, height, bitDepth, calibration? }`. The worker does the auto min/max normalize for 16-bit data so the canvas (which is 8-bit per channel) gets a viewable preview. The original `ArrayBuffer` is **not** retained in M6 (TIFF re-encoding for export pass-through is M8).
4. **Annotation render** (`render/draw-annotations.ts`, new). One pure function `drawAnnotations(ctx, figure, panels, panelRects, images)` runs after `drawFigure`'s panel pass. Internally it draws letters first (z=0), then user annotations sorted by `z`. Scale bars compute their figure-px length on the fly from the panel's transform, the image's calibration, and `globalStyle.scalebar`. The function is shared by editor + exporter.
5. **Multi-format export** (`export/png.ts`, `export/jpeg.ts`, `export/tiff.ts`, `export/pdf.ts`). All four call `renderFigureToImageBitmap(figure, images)` to produce one `ImageBitmap` from the offscreen pipeline, then encode. PNG/JPEG use `OffscreenCanvas.convertToBlob`; TIFF goes through `UTIF.encodeImage` + IFD assembly; PDF uses `pdf-lib`. The IPC channels and main-side `fs-write` paths add one entry per format with a refactored `writeBytesToPath(filePath, bytes, allowedExt)` helper.

`★ Insight ─────────────────────────────────────`
Annotations on a panel are stored in **figure-canvas coordinates**, not in image-source coordinates. This means a scale bar drawn at `(x=20, y=panelH-20)` keeps its position when the user pans/zooms inside the panel — but its _length_ recomputes because the formula reads `panel.transform.zoom` live. That is the design the source plan calls out: "bar length recomputed on zoom". Storing endpoints in image coords would mean the bar moves with the image, which is wrong for a figure-overlay element.
`─────────────────────────────────────────────────`

---

## Data model changes

### `src/renderer/model/pool.ts` — extend `ImagePoolItem`

```ts
export type ImageMime = "image/png" | "image/jpeg" | "image/tiff";

export interface Calibration {
  unit: "um" | "mm" | "px";
  /**
   * Source pixels per `unit`. For µm: a 6.45 means 6.45 source pixels span 1 µm.
   * Always positive; never zero. The reducer rejects non-finite or non-positive.
   */
  pixelsPerUnit: number;
  source: "tiff-meta" | "manual";
}

export interface ImagePoolItem {
  id: string;
  filename: string;
  filePath: string;
  mime: ImageMime;
  width: number;
  height: number;
  /** 8 for PNG/JPEG/8-bit TIFF; 16 for 16-bit TIFF. Surfaced for UI only. */
  bitDepth: 8 | 16;
  /** Present when extracted from TIFF IFD or saved by the user manually. */
  calibration?: Calibration;
}
```

The extra fields default to `bitDepth: 8` and `calibration: undefined` for PNG/JPEG inputs from M3. Existing `decodeImageBytes` callers in `App.tsx` get a small wrapping update.

### `src/renderer/model/annotations.ts` — new

```ts
export type AnnotationKind = "text" | "arrow" | "box" | "scalebar";

export interface BaseAnnotation {
  id: string; // crypto.randomUUID()
  panelId?: string; // omit for figure-global text/arrows/boxes (M6: scale bars REQUIRE panelId; others are optional)
  z: number; // higher draws on top; ties broken by array index
  kind: AnnotationKind;
}

export interface TextAnnotation extends BaseAnnotation {
  kind: "text";
  /** figure-canvas px (top-left origin). Anchored at the text's top-left. */
  x: number;
  y: number;
  text: string;
  font: string; // CSS font-family
  sizePt: number; // points; converted to px via dpi at draw time (px = pt * dpi/72)
  bold: boolean;
  italic: boolean;
  color: string; // "#RRGGBB" or "#RRGGBBAA"
  bgColor?: string; // optional pad-rect fill
}

export interface ArrowAnnotation extends BaseAnnotation {
  kind: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number; // figure-canvas px
  color: string;
  thicknessPx: number;
  head: "none" | "open" | "filled";
}

export interface BoxAnnotation extends BaseAnnotation {
  kind: "box";
  x: number;
  y: number;
  w: number;
  h: number; // figure-canvas px (top-left + size)
  stroke: string;
  strokeWidthPx: number;
  fill?: string;
}

export interface ScaleBarAnnotation extends BaseAnnotation {
  kind: "scalebar";
  panelId: string; // REQUIRED — calibration is per-image-on-panel
  /** Bar length in `lengthUnit`. e.g. 50, 100, 1.0. */
  lengthValue: number;
  lengthUnit: "um" | "mm" | "px";
  /** Override globalStyle.scalebar.corner just for this instance. */
  cornerOverride?: "tl" | "tr" | "bl" | "br";
}

export type Annotation =
  | TextAnnotation
  | ArrowAnnotation
  | BoxAnnotation
  | ScaleBarAnnotation;
```

### `src/renderer/model/global-style.ts` — new

```ts
export type Corner = "tl" | "tr" | "bl" | "br";

export interface LetterStyle {
  enabled: boolean;
  font: string;
  sizePt: number;
  color: string;
  bgColor?: string;
  corner: Corner;
  paddingPx: number; // distance from panel edge
  bold: boolean;
}

export interface ScaleBarStyle {
  font: string;
  sizePt: number;
  color: string;
  barColor: string;
  thicknessPx: number;
  corner: Corner;
  paddingPx: number;
  showLabel: boolean;
}

export interface GlobalAnnoStyle {
  letters: LetterStyle;
  scalebar: ScaleBarStyle;
}

export const DEFAULT_GLOBAL_STYLE: GlobalAnnoStyle = {
  letters: {
    enabled: true,
    font: "Arial, Helvetica, sans-serif",
    sizePt: 12,
    color: "#000000",
    corner: "tl",
    paddingPx: 6,
    bold: true,
  },
  scalebar: {
    font: "Arial, Helvetica, sans-serif",
    sizePt: 10,
    color: "#FFFFFF",
    barColor: "#FFFFFF",
    thicknessPx: 4,
    corner: "br",
    paddingPx: 8,
    showLabel: true,
  },
};
```

### `src/renderer/model/figure-state.ts` — extend `FigureState`

```ts
export interface FigureState {
  pool: ImagePoolItem[];
  panels: Panel[];
  rows: number;
  cols: number;
  gutterPx: number;
  gutterColor: string;

  // NEW in M6:
  annotations: Annotation[]; // append-only insertion order; rendered in z-then-array order
  globalStyle: GlobalAnnoStyle; // figure-wide letter + scale-bar style
  /** Optional per-panel override for the auto-letter; rendered when globalStyle.letters.enabled. */
  letterOverrides: Record<string, string>; // panelId → override (e.g. "A1")
}
```

`initialFigureState` initialises `annotations: []`, `globalStyle: DEFAULT_GLOBAL_STYLE`, `letterOverrides: {}`. Existing callers of `initialFigureState()` need no change.

`★ Insight ─────────────────────────────────────`
`letterOverrides` lives on `FigureState`, not on `Panel`, deliberately. Panels can be merged/unmerged/swapped — keeping the override map keyed by `panelId` means swapping two panels swaps their image+transform AND their letter override (because the override travels with the panel id). That matches the source plan's description of letters as "auto row-major, manual override, global on/off". An alternative (override on the Panel itself) would also work but blurs the boundary between figure-state-extras and per-panel-data.
`─────────────────────────────────────────────────`

### `src/renderer/model/figure-actions.ts` — new actions

Append to the existing `FigureAction` union (keep grouped at the bottom):

```ts
| { type: "ADD_ANNOTATION"; annotation: Annotation }
| { type: "UPDATE_ANNOTATION"; annotationId: string; patch: Partial<Annotation> }
| { type: "REMOVE_ANNOTATION"; annotationId: string }
| { type: "SET_LETTER_OVERRIDE"; panelId: string; override: string | null }
| { type: "SET_GLOBAL_STYLE"; style: GlobalAnnoStyle }
| { type: "SET_LETTERS_ENABLED"; enabled: boolean }
| { type: "SET_IMAGE_CALIBRATION"; imageId: string; calibration: Calibration | null }
```

Action creators follow the existing pattern in [figure-actions.ts:26-91](../../src/renderer/model/figure-actions.ts#L26-L91).

**Reducer behaviour:**

- `ADD_ANNOTATION`: validates that `panelId` (if present) refers to an existing panel; for `kind === "scalebar"`, validates `panelId` is set AND the panel has an `imageId` AND the image has `calibration` defined (otherwise no-op). Appends with deduped `id` (no-op on collision).
- `UPDATE_ANNOTATION`: shallow merges `patch` onto the existing annotation. Refuses to change `id` or `kind` (silently strips them from the patch). Rejects if `panelId` in the patch doesn't exist.
- `REMOVE_ANNOTATION`: filters it out. No-op if not found.
- `SET_LETTER_OVERRIDE`: writes / deletes the entry in `letterOverrides`. `null` means "remove the override, fall back to auto".
- `SET_GLOBAL_STYLE`: replaces wholesale. Validates the colors are hex (per [figure-actions.ts:339](../../src/renderer/model/figure-actions.ts#L339)).
- `SET_LETTERS_ENABLED`: toggles `globalStyle.letters.enabled` only.
- `SET_IMAGE_CALIBRATION`: writes/clears calibration on a pool item. `null` clears.
- **Existing actions affected:**
  - `RESIZE_GRID` releases panels — also delete any `letterOverrides[panelId]` for ids that are no longer in `state.panels`. Keep annotations whose `panelId` no longer exists; they become figure-global as a degenerate fallback (test asserts).
  - `MERGE_CELLS` retains the override of the resulting (top-left) cell; clears overrides for the cells that disappear into the merge.
  - `UNMERGE_PANEL` clears the override on the merged panel (the new 1×1 cells start blank); the image keeps its annotations because they reference panel id, which is preserved on the surviving 1×1 panel at the original (row, col) (per M4).
  - `REMOVE_FROM_POOL` removes any annotations whose `panelId` referenced the panel that previously held this image (because they're scale bars / letters anchored to the now-empty panel). **Decision (test asserts):** keep text/arrow/box annotations; remove scale bars only. Rationale: scale bars depend on calibration, the others are positional decorations.

`★ Insight ─────────────────────────────────────`
Scale bars are the only annotation type whose existence depends on image data. Removing the image from the panel removes the scale bar's only source of truth (the calibration), so the reducer auto-cleans them. Text/arrows/boxes are positional — they're still meaningful on an empty panel.
`─────────────────────────────────────────────────`

---

## TIFF worker

### `src/renderer/image/tiff-worker.ts` — new (Web Worker entry)

```ts
// Loaded as a module worker via `new Worker(new URL("./tiff-worker.ts", import.meta.url), { type: "module" })`.
import * as UTIF from "utif";

interface DecodeRequest {
  reqId: string;
  buffer: ArrayBuffer; // transferred, not copied
}

interface DecodeResponse {
  reqId: string;
  ok: true;
  rgba: Uint8ClampedArray; // length = width * height * 4
  width: number;
  height: number;
  bitDepth: 8 | 16;
  calibration?: Calibration;
}

interface DecodeError {
  reqId: string;
  ok: false;
  message: string;
}

self.onmessage = (e: MessageEvent<DecodeRequest>) => {
  try {
    const { reqId, buffer } = e.data;
    const ifds = UTIF.decode(buffer);
    if (ifds.length === 0) throw new Error("no IFD");
    const ifd0 = ifds[0]!;
    UTIF.decodeImage(buffer, ifd0);
    const rgba = UTIF.toRGBA8(ifd0); // Uint8Array, RGBA, 8-bit
    const width = ifd0.width as number;
    const height = ifd0.height as number;
    const bitDepth = (ifd0.t258?.[0] ?? 8) >= 16 ? 16 : 8;
    const calibration = readCalibrationFromIFD(ifd0);
    const out: DecodeResponse = {
      reqId,
      ok: true,
      rgba: new Uint8ClampedArray(
        rgba.buffer,
        rgba.byteOffset,
        rgba.byteLength,
      ),
      width,
      height,
      bitDepth,
      calibration,
    };
    // Transfer the rgba buffer to avoid a copy.
    (
      self as unknown as {
        postMessage: (m: unknown, t?: Transferable[]) => void;
      }
    ).postMessage(out, [out.rgba.buffer]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    (self as unknown as { postMessage: (m: unknown) => void }).postMessage({
      reqId: e.data.reqId,
      ok: false,
      message: msg,
    } satisfies DecodeError);
  }
};
```

### `src/renderer/image/tiff-decode.ts` — pure helpers (no DOM)

```ts
/**
 * Map UTIF IFD calibration tags to our Calibration type.
 *  - t282 = XResolution (rational pixels per unit)
 *  - t283 = YResolution (we use X; warn if X != Y; future M8 anisotropic-px-size feature)
 *  - t296 = ResolutionUnit (1=none, 2=inch, 3=cm)
 * The microscope convention is "pixels per cm" with cm reported, but many
 * tools store µm directly under "Description"; v1 trusts the standard tags
 * and exposes a manual fallback if absent or zero.
 */
export function readCalibrationFromIFD(ifd: UtifIfd): Calibration | undefined {
  const xres = ratioToFloat(ifd.t282);
  const unitTag = (ifd.t296?.[0] ?? 1) as 1 | 2 | 3;
  if (xres === undefined || xres <= 0 || !Number.isFinite(xres))
    return undefined;
  if (unitTag === 1) return undefined; // "no absolute unit"
  if (unitTag === 2) {
    // pixels per inch → pixels per µm: 1 in = 25400 µm
    return { unit: "um", pixelsPerUnit: xres / 25400, source: "tiff-meta" };
  }
  // unitTag === 3, pixels per cm
  return { unit: "um", pixelsPerUnit: xres / 10000, source: "tiff-meta" };
}

interface UtifIfd {
  t282?: [number, number] | number[]; // rational
  t283?: [number, number] | number[];
  t296?: number[];
  t258?: number[]; // BitsPerSample
  width: number;
  height: number;
}

function ratioToFloat(r: number[] | undefined): number | undefined {
  if (r === undefined) return undefined;
  if (r.length === 1) return r[0];
  if (r.length >= 2 && r[1] !== 0) return r[0]! / r[1]!;
  return undefined;
}
```

### `src/renderer/image/decode-bytes.ts` — extend

Replace the current PNG-only path with a dispatcher that returns both a bitmap and metadata:

```ts
export type DecodedImage = {
  bitmap: ImageBitmap;
  bitDepth: 8 | 16;
  calibration?: Calibration;
};

export async function decodeImageBytes(
  bytes: Uint8Array,
  mime: ImageMime, // now widened to include image/tiff
): Promise<DecodedImage> {
  if (mime === "image/tiff") {
    const r = await decodeTiffViaWorker(bytes.buffer);
    const bitmap = await rgbaToImageBitmap(r.rgba, r.width, r.height);
    return { bitmap, bitDepth: r.bitDepth, calibration: r.calibration };
  }
  const blob = new Blob([bytes], { type: mime });
  return { bitmap: await createImageBitmap(blob), bitDepth: 8 };
}

async function rgbaToImageBitmap(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
): Promise<ImageBitmap> {
  const data = new ImageData(rgba, w, h);
  return createImageBitmap(data);
}
```

A small `tiff-worker-host.ts` module owns a singleton `Worker` and a request map keyed by `reqId` for the `decodeTiffViaWorker` helper.

`★ Insight ─────────────────────────────────────`
Putting the worker behind a tiny request-map means M6 doesn't fan out to N workers per N images — UTIF.decode is fast enough to serialise. If a 50-image stress test in M8 shows blocking, swap the singleton for a `Worker` pool keyed by request count. The public API stays a `Promise<DecodedImage>`.
`─────────────────────────────────────────────────`

---

## Render input changes

### `src/renderer/model/types.ts` — extend `Figure`

Add a derived field `annotations: ResolvedAnnotation[]` and `globalStyle: GlobalAnnoStyle` to `Figure`. **Render-time** types (not stored). The `deriveFigure` step in `figure-derivations.ts` projects:

```ts
export type ResolvedAnnotation =
  | (TextAnnotation & { kind: "text" })
  | (ArrowAnnotation & { kind: "arrow" })
  | (BoxAnnotation & { kind: "box" })
  | (ScaleBarAnnotation & { kind: "scalebar"; resolvedPanelId: string })
  | (LetterAnnotation & { kind: "letter" }); // synthesised from row-major auto + override

interface LetterAnnotation extends BaseAnnotation {
  kind: "letter";
  panelId: string;
  text: string; // resolved: override || cellLabel(...)
}
```

`deriveFigure` returns letters as a separate pass — for each panel in row-major order, if `globalStyle.letters.enabled`:

- compute `tlIndex = p.row * cols + p.col` (existing logic in [figure-derivations.ts:15](../../src/renderer/model/figure-derivations.ts#L15)),
- `auto = cellLabel(tlIndex)`,
- `text = letterOverrides[p.id] ?? auto`,
- emit `{ id: "letter:"+p.id, kind: "letter", panelId: p.id, z: 0, text }`.

Other annotations come straight from `state.annotations` filtered to those whose `panelId` (if present) still resolves to a panel.

`Figure` becomes:

```ts
export interface Figure {
  canvas: FigureCanvas;
  grid: FigureGrid;
  panels: HardCodedPanel[];
  annotations: ResolvedAnnotation[]; // NEW
  globalStyle: GlobalAnnoStyle; // NEW (drawAnnotations needs corner + style)
}
```

Existing tests that build a `Figure` literal (e.g. [draw-figure.test.ts:39-48](../../test/unit/draw-figure.test.ts#L39-L48)) need `annotations: []` and `globalStyle: DEFAULT_GLOBAL_STYLE`.

---

## Annotation render

### `src/renderer/render/draw-annotations.ts` — new

```ts
import type { Figure, ResolvedAnnotation } from "../model/types";
import type { PanelRect } from "./coords";
import type { ImagePoolItem } from "../model/pool";

export interface AnnotationDrawDeps {
  /** Index of panel rect by panel id (matches figure.panels order). */
  panelRectsById: Map<string, PanelRect>;
  /** Pool items keyed by image id, for scale-bar calibration lookup. */
  imagesById: Map<string, ImagePoolItem>;
  /** Pre-loaded ImageBitmaps; used for image dims, not pixel data. */
  bitmaps: Map<string, ImageBitmap>;
}

export function drawAnnotations(
  ctx: DrawCtx,
  figure: Figure,
  deps: AnnotationDrawDeps,
): void {
  // Letters first (z=0), in row-major panel order so overlaps prefer earlier letters.
  const sorted = [...figure.annotations].sort((a, b) => a.z - b.z);
  for (const a of sorted) {
    switch (a.kind) {
      case "letter":
        drawLetter(ctx, a, figure, deps);
        break;
      case "text":
        drawText(ctx, a, figure, deps);
        break;
      case "arrow":
        drawArrow(ctx, a);
        break;
      case "box":
        drawBox(ctx, a);
        break;
      case "scalebar":
        drawScaleBar(ctx, a, figure, deps);
        break;
    }
  }
}
```

### Scale-bar geometry (`src/renderer/render/scalebar.ts` — new)

```ts
/**
 * Compute the figure-pixel length of the scale bar.
 *
 *   barLengthFigurePx = lengthValue_in_µm * pixelsPerUnit_(src_px_per_µm) * S
 *
 * where S = effective panel scale = zoom * baseScale_for_fit (rotated dims).
 *
 * - `lengthUnit` is normalised to µm (mm → ×1000) before multiplying.
 * - `lengthUnit === "px"` skips calibration entirely: barLengthFigurePx = lengthValue * S.
 * - Stretch fit uses min(panelW/imgW, panelH/imgH) as a defensive S — scale bars
 *   on stretched images are visually wrong by definition, but we still draw something.
 */
export function scaleBarFigurePx(
  lengthValue: number,
  lengthUnit: "um" | "mm" | "px",
  calibration: Calibration | undefined,
  panelTransform: PanelTransform,
  panelW: number,
  panelH: number,
  imgW: number,
  imgH: number,
): number {
  const { w: rw, h: rh } = rotatedImageDims(
    imgW,
    imgH,
    panelTransform.rotation,
  );
  const S = effectivePanelScale(panelTransform, panelW, panelH, rw, rh);
  if (lengthUnit === "px") return lengthValue * S;
  if (calibration === undefined) return 0;
  const valueInUm = lengthUnit === "mm" ? lengthValue * 1000 : lengthValue;
  // calibration.unit is "um" | "mm" | "px"; convert to "src px per µm".
  const srcPxPerUm =
    calibration.unit === "um"
      ? calibration.pixelsPerUnit
      : calibration.unit === "mm"
        ? calibration.pixelsPerUnit / 1000
        : 0; // "px" calibration with µm length is undefined; return 0.
  return valueInUm * srcPxPerUm * S;
}
```

The scale-bar position is computed from `globalStyle.scalebar.corner` (or `cornerOverride`) and `paddingPx`, anchored inside the panel rect with the bar's bounding box flush against the edge:

```
corner = "br":
  endX   = panel.x + panel.w - paddingPx
  endY   = panel.y + panel.h - paddingPx
  startX = endX - barLengthFigurePx
  startY = endY
```

The label (e.g. `"50 µm"`) draws above the bar by `sizePx + 2`. Symmetric for tl/tr/bl.

### `src/renderer/render/draw-figure.ts` — extend

After the panel-pass loop ends ([draw-figure.ts:62-77](../../src/renderer/render/draw-figure.ts#L62-L77)), call `drawAnnotations(ctx, figure, deps)`. Compute `panelRectsById` and `imagesById` once per call; pass `bitmaps` through from the existing `images: Map<string, ImageBitmap>` parameter.

`DrawCtx` adds three new methods used by annotations:

```ts
moveTo(x: number, y: number): void;
lineTo(x: number, y: number): void;
stroke(): void;
fill(): void;
closePath(): void;
lineWidth: number;
lineCap: CanvasLineCap;
lineJoin: CanvasLineJoin;
measureText(t: string): { width: number };
```

The recorder fake in [draw-figure.test.ts:10-37](../../test/unit/draw-figure.test.ts#L10-L37) gets stubs for these. `measureText` returns `{ width: text.length * sizePx * 0.6 }` as a deterministic stub (real metrics aren't needed for behaviour tests).

---

## Editor mounts annotation UI

### `src/renderer/components/Toolbar/AnnotationToolbar.tsx` — new

```ts
type Tool = "select" | "text" | "arrow" | "box" | "scalebar";

interface Props {
  active: Tool;
  onChange: (t: Tool) => void;
  lettersEnabled: boolean;
  onToggleLetters: () => void;
}
```

A 5-button group (`Select | Text | Arrow | Box | Scale bar`) plus a checkbox `[ ] Subpanel letters`. Style follows [PanelControls.tsx:21-29](../../src/renderer/components/Toolbar/PanelControls.tsx#L21-L29) (segmented control with active-blue / inactive-white).

### `src/renderer/components/Annotations/AnnotationInteractionLayer.tsx` — new

A sibling of `PanelInteractionLayer` mounted over the entire figure (not just the focused panel). When the active tool is:

- `select`: clicks select an annotation (sets `selectedAnnotationId`); drag moves it; delete key removes it.
- `text`: click in any panel/figure-area places a new `TextAnnotation` with `text: ""` and immediately enters an inline edit mode (a positioned `<input>` styled to match).
- `arrow`: click-down records `(x1, y1)`; click-up commits `(x2, y2)`. Pointer-move during drag draws a preview line on a transient overlay (DOM, not canvas).
- `box`: click-drag draws a rectangle.
- `scalebar`: click any panel that has `imageId !== undefined` and `calibration !== undefined`. Opens a small popover with `[length] [unit]` and "Add". On commit, dispatches `ADD_ANNOTATION`. (Drag does NOT move scale bars; they're corner-anchored. To move, change `cornerOverride` from a popover.)

Each interaction commits exactly one action per gesture (M6 has no undo coalescing yet).

### `src/renderer/components/Annotations/CalibrationModal.tsx` — new

Small modal opened from a "Calibrate…" button on `PanelControls` (only enabled when the focused image panel's image has no `calibration` or `source === "manual"`):

- Two click points on the panel image (figure-px) → distance in source-pixel space.
- User enters `known length` and `unit` (µm / mm).
- Save: `pixelsPerUnit = sourcePxBetweenPoints / lengthInChosenUnit`. Dispatches `SET_IMAGE_CALIBRATION`.

Out of scope for M6: live preview of the scale bar inside the modal — user adds the bar after saving.

### `src/renderer/components/Toolbar/ExportMenu.tsx` — replaces `ExportButton`

A dropdown with four items: **Export PNG**, **Export JPEG…**, **Export TIFF**, **Export PDF**. JPEG opens a tiny popover with a quality slider (0.50–1.00, default 0.92). PNG and TIFF are direct.

The existing `ExportButton` stays callable as a default for tests that already reference it; it becomes a thin wrapper around `ExportMenu` opened to PNG. Remove only when no test imports `ExportButton` after this milestone.

### `src/renderer/App.tsx` — wiring

- Add `useState` for `activeTool: Tool` (default `"select"`).
- Add `useState` for `selectedAnnotationId: string | null`.
- Mount `<AnnotationToolbar>` next to `<PanelControls>`.
- Mount `<AnnotationInteractionLayer>` after `<PanelInteractionLayer>`. Z-order: `EditorCanvas` (under) → `GridCells` → `PanelInteractionLayer` (over focused panel only) → `AnnotationInteractionLayer` (covers full figure, but `pointer-events: none` when `activeTool === "select"` and no annotation is hovered).
- Replace `<ExportButton>` with `<ExportMenu>`.
- `useKeyboardShortcuts`: extend with `onDeleteAnnotation` (Delete / Backspace when an annotation is selected and not typing). `Escape` now also clears `selectedAnnotationId` and resets `activeTool` to `"select"`.

---

## Multi-format export

### `src/renderer/render/export-renderer.ts` — extend

Replace `renderFigureToPngBlob` with a more general `renderFigureToOffscreen`:

```ts
export interface OffscreenRender {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** Source DPI that callers (TIFF, PDF) need for proper page sizing. */
  dpi: number;
}

export async function renderFigureToOffscreen(
  figure: Figure,
  images: Map<string, ImageBitmap>,
  dpi: number = 300,
): Promise<OffscreenRender> {
  const off = new OffscreenCanvas(
    figure.canvas.widthPx,
    figure.canvas.heightPx,
  );
  const ctx = off.getContext("2d");
  if (ctx === null) throw new Error("renderFigureToOffscreen: no 2D context");
  drawFigure(ctx, figure, images);
  const bitmap = await createImageBitmap(off);
  return { bitmap, width: off.width, height: off.height, dpi };
}

// Convenience for PNG (existing API preserved).
export async function renderFigureToPngBlob(
  figure: Figure,
  images: Map<string, ImageBitmap>,
): Promise<Blob> {
  const off = new OffscreenCanvas(
    figure.canvas.widthPx,
    figure.canvas.heightPx,
  );
  const ctx = off.getContext("2d");
  if (ctx === null) throw new Error("renderFigureToPngBlob: no 2D context");
  drawFigure(ctx, figure, images);
  return off.convertToBlob({ type: "image/png" });
}
```

### `src/renderer/export/jpeg.ts` — new

```ts
export async function exportFigureAsJpeg(
  figure: Figure,
  images: Map<string, ImageBitmap>,
  quality: number, // 0.50..1.00
): Promise<ExportResult>;
```

Pipeline: `renderFigureToOffscreen` → re-draw the bitmap into a fresh `OffscreenCanvas` (because `convertToBlob` belongs to the canvas, not the bitmap) → `convertToBlob({ type: "image/jpeg", quality })` → IPC.

### `src/renderer/export/tiff.ts` — new

```ts
export async function exportFigureAsTiff(
  figure: Figure,
  images: Map<string, ImageBitmap>,
  dpi: number,
): Promise<ExportResult>;
```

Pipeline:

1. `renderFigureToOffscreen` → `ImageBitmap`.
2. Draw the bitmap to a fresh `OffscreenCanvas`, `getImageData(0,0,w,h)` → `Uint8ClampedArray` (RGBA, 8-bit).
3. `UTIF.encodeImage(rgba.buffer, w, h)` → TIFF bytes.
4. **Patch IFD tags before encoding** so the TIFF carries DPI: UTIF exposes a low-level `_writeIFD` path; M6 uses the post-encoding approach: encode, then walk the resulting bytes once with a small TIFF tag-rewriter to insert/replace `XResolution`, `YResolution`, `ResolutionUnit`. Implementation in `image/tiff-encode-tags.ts` (pure, testable).
5. IPC over `mosaic:export-tiff`.

### `src/renderer/export/pdf.ts` — new

```ts
import { PDFDocument } from "pdf-lib";

export async function exportFigureAsPdf(
  figure: Figure,
  images: Map<string, ImageBitmap>,
): Promise<ExportResult>;
```

Pipeline:

1. `renderFigureToPngBlob` → PNG bytes.
2. `PDFDocument.create()`. Compute page size: if `figure.canvas` had a `physical` mode (M6 keeps the M5 pixel-mode `widthPx/heightPx`; physical mode arrives later — M6 takes `dpi` as an argument with default 300, computes `pageWidthPt = (widthPx / dpi) * 72`).
3. `addPage([wPt, hPt])`, `embedPng(bytes)`, `drawImage(img, { x: 0, y: 0, width: wPt, height: hPt })`.
4. `pdfDoc.save()` → `Uint8Array`.
5. IPC over `mosaic:export-pdf`.

### `src/main/fs-write.ts` — generalise

Replace the single `writePngFile` with:

```ts
export async function writeBytesToPath(
  filePath: string,
  bytes: Uint8Array,
  allowedExt: readonly string[], // e.g. [".png"], [".jpg", ".jpeg"], [".tif", ".tiff"], [".pdf"]
): Promise<void>;
```

`writePngFile` remains as a one-liner wrapper for back-compat with existing tests until they're updated in Task 9.

### `src/main/dialogs.ts` — extend

Add `pickJpegSavePath`, `pickTiffSavePath`, `pickPdfSavePath` siblings of [pickPngSavePath](../../src/main/dialogs.ts) — each uses an appropriate file filter and default extension.

### `src/main/index.ts` — register IPC

Add three handlers mirroring `mosaic:export-png` ([index.ts:53-79](../../src/main/index.ts#L53-L79)). Each calls the matching dialog + `writeBytesToPath` with that format's extensions. Result type is the same shape as `ExportPngResult` (rename to `ExportResult` in `preload/api.ts` and re-export each as a typed alias).

### `src/preload/api.ts` — extend

```ts
export const API_CHANNELS = {
  ping: "mosaic:ping",
  exportPng: "mosaic:export-png",
  exportJpeg: "mosaic:export-jpeg",
  exportTiff: "mosaic:export-tiff",
  exportPdf: "mosaic:export-pdf",
  openImages: "mosaic:open-images",
} as const;

// Generic result type — the renderer-side error mapping is unchanged.
export type ExportResult =
  | { ok: true; filePath: string; bytesWritten: number }
  | {
      ok: false;
      reason: "canceled" | "render-failed" | "ipc-failed" | "write-failed";
      message?: string;
    };

// Open images now returns mime widened to include image/tiff.
export type OpenImagesMime = "image/png" | "image/jpeg" | "image/tiff";

export interface MosaicApi {
  ping(): Promise<number>;
  exportPng(bytes: Uint8Array, defaultName: string): Promise<ExportResult>;
  exportJpeg(bytes: Uint8Array, defaultName: string): Promise<ExportResult>;
  exportTiff(bytes: Uint8Array, defaultName: string): Promise<ExportResult>;
  exportPdf(bytes: Uint8Array, defaultName: string): Promise<ExportResult>;
  openImages(): Promise<OpenImagesResult>;
}
```

`src/preload/preload.ts` adds a `contextBridge` exposure for each new channel; the existing `exportPng` exposure stays.

### `src/main/mime.ts` + `src/main/open-images.ts`

- `mimeFromExt` recognises `.tif` and `.tiff` → `"image/tiff"`.
- `pickAndReadImages` filter becomes `[{ name: "Images", extensions: ["png", "jpg", "jpeg", "tif", "tiff"] }]`.

---

## Task breakdown

Each task ends with `pnpm typecheck && pnpm test && pnpm lint` exiting 0.

### Task 1: Extend the data model — annotations, calibration, global style

**Files:**

- Edit: [src/renderer/model/pool.ts](../../src/renderer/model/pool.ts) — add `bitDepth`, `calibration`; widen `ImageMime`.
- Create: [src/renderer/model/annotations.ts](../../src/renderer/model/annotations.ts).
- Create: [src/renderer/model/global-style.ts](../../src/renderer/model/global-style.ts).
- Edit: [src/renderer/model/figure-state.ts](../../src/renderer/model/figure-state.ts) — add `annotations`, `globalStyle`, `letterOverrides`.
- Edit: [src/renderer/model/types.ts](../../src/renderer/model/types.ts) — extend `Figure` with `annotations` + `globalStyle`; export `ResolvedAnnotation`.

- [ ] **Step 1.1:** Add `Calibration`, `bitDepth: 8 | 16` to `ImagePoolItem`. Widen `ImageMime` to include `"image/tiff"`. Existing M3 callers receive `bitDepth: 8` and no `calibration` automatically.
- [ ] **Step 1.2:** Define the `Annotation` discriminated union (4 kinds + `ResolvedAnnotation` adds `letter`). All coords in figure-canvas px.
- [ ] **Step 1.3:** Define `GlobalAnnoStyle` + `DEFAULT_GLOBAL_STYLE`.
- [ ] **Step 1.4:** Extend `FigureState` and `initialFigureState()`. `annotations: []`, `globalStyle: DEFAULT_GLOBAL_STYLE`, `letterOverrides: {}`.
- [ ] **Step 1.5:** Extend `Figure` with `annotations: ResolvedAnnotation[]` + `globalStyle: GlobalAnnoStyle`. Compile-fail every test fixture that builds a `Figure` literal — leave them failing for Task 8.
- [ ] **Step 1.6:** `pnpm typecheck` — many compile failures expected; do NOT fix them yet (next tasks land their setup first).

### Task 2: Annotation actions in the reducer

**Files:**

- Edit: [src/renderer/model/figure-actions.ts](../../src/renderer/model/figure-actions.ts).
- Edit: [test/unit/figure-actions.test.ts](../../test/unit/figure-actions.test.ts).

- [ ] **Step 2.1:** Append the seven new action types and creators per "Data model changes". Place at the bottom of the union for diff-readability.
- [ ] **Step 2.2:** Implement reducer cases:
  - `ADD_ANNOTATION`: validates `panelId` exists; for `kind === "scalebar"` validates `panelId` set, panel has image, image has calibration, otherwise no-op (returns `s`).
  - `UPDATE_ANNOTATION`: shallow merge; strip `id` and `kind` from the patch; reject patches that reference non-existent panels.
  - `REMOVE_ANNOTATION`: filter out.
  - `SET_LETTER_OVERRIDE`: write or delete; stable-key into a fresh object.
  - `SET_GLOBAL_STYLE`: validates colors via the existing `isHexColor` helper.
  - `SET_LETTERS_ENABLED`: toggle `globalStyle.letters.enabled` only.
  - `SET_IMAGE_CALIBRATION`: write or clear; reject `pixelsPerUnit <= 0` or non-finite.
- [ ] **Step 2.3:** Update affected existing actions:
  - `RESIZE_GRID`: when panels are removed, also delete their `letterOverrides` entries.
  - `MERGE_CELLS`: keep the override of the surviving (top-left) cell; clear the rest.
  - `UNMERGE_PANEL`: clear the merged panel's override.
  - `REMOVE_FROM_POOL`: filter `annotations` to drop scale bars whose panel referenced this image (look up via panel's prior `imageId`).
- [ ] **Step 2.4:** Write tests (≥ 14 cases):
  - `ADD_ANNOTATION` happy path for each of the 4 kinds.
  - `ADD_ANNOTATION` no-op for scale bar with no calibration.
  - `UPDATE_ANNOTATION` merges patch; rejects `kind` change.
  - `REMOVE_ANNOTATION` no-op on unknown id.
  - `SET_LETTER_OVERRIDE`: write + delete.
  - `SET_LETTERS_ENABLED` toggles only the one bool.
  - `SET_IMAGE_CALIBRATION` write + clear; rejects `pixelsPerUnit = 0`.
  - Resize that drops a panel removes its override.
  - Merge keeps top-left override.
  - `REMOVE_FROM_POOL` drops the panel's scale bar but preserves text/arrows/boxes anchored to the now-empty panel.

### Task 3: Pure scale-bar math + `effectivePanelScale`

**Files:**

- Edit: [src/renderer/render/coords.ts](../../src/renderer/render/coords.ts) — add `effectivePanelScale`.
- Create: [src/renderer/render/scalebar.ts](../../src/renderer/render/scalebar.ts).
- Create: [test/unit/scalebar.test.ts](../../test/unit/scalebar.test.ts).

- [ ] **Step 3.1:** Add `effectivePanelScale(t, panelW, panelH, rotImgW, rotImgH): number` to `coords.ts`. Returns `t.zoom * baseScaleAsScalar`. For Stretch, returns `Math.min(panelW/rotImgW, panelH/rotImgH) * t.zoom` (defensive — Stretch scale bars are documented as best-effort).
- [ ] **Step 3.2:** Add `scaleBarFigurePx` to `scalebar.ts` per "Scale-bar geometry". Pure; takes calibration as an optional argument; handles all three units; safely returns `0` for unsupported combinations (e.g. `lengthUnit = "um"` but `calibration === undefined`).
- [ ] **Step 3.3:** Add `scaleBarRect(corner, paddingPx, panelRect, barLengthPx, thicknessPx)` returning the `{ x, y, w, h }` of the bar's hit-rect (figure-canvas coords). Pure.
- [ ] **Step 3.4:** Tests (≥ 8 cases):
  - `pixelsPerUnit = 6.45` (µm), `lengthValue = 50`, `S = 1.0` → `barLengthFigurePx ≈ 322.5`.
  - Same with `zoom = 2` → ≈ 645.
  - `lengthUnit = "mm"` with `pixelsPerUnit` in µm-units → `1 mm` resolves to 1000 × the µm result.
  - `lengthUnit = "px"` ignores calibration; `lengthValue = 100` at `S = 0.5` → 50.
  - Missing calibration with µm length → 0.
  - Stretch fit → uses min-axis fallback; result is positive.
  - Rotated-90° image swaps base-scale dims; `S` recomputes accordingly.
  - `scaleBarRect("br", padding=10, panelRect={0,0,300,200}, bar=80, thickness=4)` → bar end at `(290, 190)`, start at `(210, 190)`.

### Task 4: TIFF worker + decode dispatch

**Files:**

- Add: `utif` dependency. `pnpm add utif` and `pnpm add -D @types/utif` (or hand-typed module declaration if no types ship — `src/renderer/types/utif.d.ts`).
- Create: [src/renderer/image/tiff-worker.ts](../../src/renderer/image/tiff-worker.ts).
- Create: [src/renderer/image/tiff-worker-host.ts](../../src/renderer/image/tiff-worker-host.ts).
- Create: [src/renderer/image/tiff-decode.ts](../../src/renderer/image/tiff-decode.ts) — `readCalibrationFromIFD` + helpers.
- Edit: [src/renderer/image/decode-bytes.ts](../../src/renderer/image/decode-bytes.ts) — return `DecodedImage` with metadata; route TIFF to worker.
- Edit: [src/main/mime.ts](../../src/main/mime.ts) — recognise `.tif`/`.tiff`.
- Edit: [src/main/open-images.ts](../../src/main/open-images.ts) — file filter.
- Edit: [src/preload/api.ts](../../src/preload/api.ts) — widen `OpenImagesMime`.
- Create: [test/unit/tiff-decode.test.ts](../../test/unit/tiff-decode.test.ts).
- Edit: [test/unit/decode-bytes.test.ts](../../test/unit/decode-bytes.test.ts) — return-shape changes.
- Edit: [test/unit/mime.test.ts](../../test/unit/mime.test.ts) — `.tif/.tiff` cases.

- [ ] **Step 4.1:** Install UTIF and verify the API shape (`UTIF.decode`, `UTIF.decodeImage`, `UTIF.toRGBA8`). If `@types/utif` is unavailable, write a minimal `.d.ts` for the three calls.
- [ ] **Step 4.2:** Write `tiff-decode.ts` with `readCalibrationFromIFD(ifd)` per the architecture section. Pure — no DOM, no globals, no UTIF runtime calls (UTIF is the caller; the helper only inspects an IFD-shaped object).
- [ ] **Step 4.3:** Tests (≥ 5 cases):
  - `t282 = [645, 100], t296 = [3]` (cm) → `pixelsPerUnit = 645/100/10000 = 0.000645` per µm. Wait — verify the µm-direction. Convention: `pixelsPerUnit` is **source pixels per µm**, so `xres pixels per cm / 10000 µm per cm = pixelsPerUm`. Encode this carefully and **assert against a hand-computed value**: 645 px per cm ÷ 10000 = **0.0645 px/µm** — store as `0.0645`. Also verify the round-trip: a 50 µm bar at zoom=1 in a 1:1 panel yields `50 * 0.0645 = 3.225 px` for the bar — small, but mathematically right; the test asserts the multiplication, not whether 3.225 px is "useful".
  - `t282 = [300, 1], t296 = [2]` (inch) → `300 / 25400 ≈ 0.01181 px/µm`.
  - `t296 = [1]` (no unit) → undefined.
  - missing `t282` → undefined.
  - `t282 = [0, 1]` → undefined.
- [ ] **Step 4.4:** Write `tiff-worker.ts` (web worker entry; `self.onmessage` handler). Use `transferable` for the rgba buffer in the response.
- [ ] **Step 4.5:** Write `tiff-worker-host.ts` — singleton worker, request-id map, `decodeTiff(buffer): Promise<DecodeResponse>`. The worker URL uses `new Worker(new URL("./tiff-worker.ts", import.meta.url), { type: "module" })`. Vite handles this idiom natively.
- [ ] **Step 4.6:** Replace `decodeImageBytes` to return `DecodedImage = { bitmap, bitDepth, calibration? }`. PNG/JPEG path returns `bitDepth: 8`; TIFF goes through the worker host.
- [ ] **Step 4.7:** Update [test/unit/decode-bytes.test.ts](../../test/unit/decode-bytes.test.ts) — assert the new return shape; keep PNG/JPEG cases. TIFF-bytes test is gated behind `vi.mock` of `tiff-worker-host` because real workers don't run in jsdom.
- [ ] **Step 4.8:** Extend `mime.ts` + tests; extend `open-images.ts` filter; widen `preload/api.ts` mime.

### Task 5: Annotation render — letters first

**Files:**

- Edit: [src/renderer/render/draw-figure.ts](../../src/renderer/render/draw-figure.ts) — extend `DrawCtx` with new methods; call `drawAnnotations` after the panel pass.
- Create: [src/renderer/render/draw-annotations.ts](../../src/renderer/render/draw-annotations.ts).
- Edit: [src/renderer/model/figure-derivations.ts](../../src/renderer/model/figure-derivations.ts) — emit `letter` annotations + carry `globalStyle`.
- Edit: [test/unit/draw-figure.test.ts](../../test/unit/draw-figure.test.ts) — extend recorder, add letter-pass assertions.

- [ ] **Step 5.1:** Extend `DrawCtx` with `moveTo`, `lineTo`, `stroke`, `fill`, `closePath`, `lineWidth`, `lineCap`, `lineJoin`, `measureText`. Update the recorder fake; assertions stay shape-only.
- [ ] **Step 5.2:** Refactor `figure-derivations.ts` to take a `FigureState` and produce a `Figure` containing `annotations: ResolvedAnnotation[]` and `globalStyle`. Stop emitting `cellLabel` as the **placeholder label** (placeholders now display nothing or a pale "(empty)"). Letters go through the annotation pass.
- [ ] **Step 5.3:** Write `drawAnnotations`. Implement just `letter`, `text`, `box` first (arrows + scale bars in Task 6). For letters, compute the corner position from `globalStyle.letters.corner + paddingPx` against the panel rect.
- [ ] **Step 5.4:** Tests (≥ 6 cases):
  - With `globalStyle.letters.enabled = false`, `drawAnnotations` performs no `fillText` calls.
  - Override "A1" replaces auto label "A" for panel (0,0).
  - `corner = "tl"` paints letter at `(panel.x + padding, panel.y + padding + sizePx)` (textBaseline = top).
  - Box draws stroke + (optional) fill.
  - Text without bg-color → no `fillRect` for background.
  - Text with bg-color → exactly one `fillRect` ≥ text bounds.

### Task 6: Arrows + scale bars

**Files:**

- Edit: [src/renderer/render/draw-annotations.ts](../../src/renderer/render/draw-annotations.ts) — add `drawArrow`, `drawScaleBar`.
- Edit: [test/unit/draw-figure.test.ts](../../test/unit/draw-figure.test.ts) — assert arrow head shapes, scale-bar geometry calls.
- Edit: [test/unit/scalebar.test.ts](../../test/unit/scalebar.test.ts) — wire to a fake DrawCtx for an integration check.

- [ ] **Step 6.1:** `drawArrow`: shaft from `(x1,y1)` to `(x2,y2)`; head at `(x2,y2)` for `head !== "none"`. Head is two lines for `"open"`, a filled triangle (path with three vertices) for `"filled"`. Head length = `max(8, thicknessPx*4)`; head angle = ±π/8.
- [ ] **Step 6.2:** `drawScaleBar`: compute `barLengthFigurePx` via `scaleBarFigurePx`; compute the rect via `scaleBarRect`; fill the bar and (if `showLabel`) draw the label above it. Label format: `"{lengthValue} {unit}"` with µm rendered as the literal `µm` glyph (UTF-8 0xC2 0xB5).
- [ ] **Step 6.3:** Tests (≥ 6 cases):
  - Arrow with `head: "filled"` records exactly one `fill()` call after a path of 3 vertices.
  - Arrow with `head: "none"` records `stroke()` only, no `fill()`.
  - Scale bar at `corner = "br", padding = 10` ends at `(panelW - 10, panelH - 10)`.
  - Doubling `panel.transform.zoom` doubles the bar's pixel length (assert via the recorded `fillRect` width arg).
  - Scale bar on a panel with no calibration draws nothing (no `fillRect` call inside the bar's hit-rect).
  - `showLabel = false` skips the `fillText` call for the unit label.

### Task 7: Editor wiring — toolbar, interaction layer, calibration modal

**Files:**

- Create: [src/renderer/components/Toolbar/AnnotationToolbar.tsx](../../src/renderer/components/Toolbar/AnnotationToolbar.tsx).
- Create: [src/renderer/components/Annotations/AnnotationInteractionLayer.tsx](../../src/renderer/components/Annotations/AnnotationInteractionLayer.tsx).
- Create: [src/renderer/components/Annotations/CalibrationModal.tsx](../../src/renderer/components/Annotations/CalibrationModal.tsx).
- Edit: [src/renderer/components/Toolbar/PanelControls.tsx](../../src/renderer/components/Toolbar/PanelControls.tsx) — add a "Calibrate…" button next to Reset, enabled when focused panel has an image.
- Edit: [src/renderer/App.tsx](../../src/renderer/App.tsx) — `activeTool`, `selectedAnnotationId`, mount the new components, wire dispatches.
- Edit: [src/renderer/hooks/useKeyboardShortcuts.ts](../../src/renderer/hooks/useKeyboardShortcuts.ts) — add `onDeleteAnnotation`. Update `Escape` to also reset tool + clear selected annotation (handled in the App-level `onEscape`, not in the hook).

- [ ] **Step 7.1:** `AnnotationToolbar` segmented control + letters checkbox. Style follows `PanelControls`. Dispatches `SET_LETTERS_ENABLED` on toggle.
- [ ] **Step 7.2:** `AnnotationInteractionLayer`. One element absolutely positioned over the figure, sized by the same `cssW × cssH` wrapper used by `GridCells`. Behaviour by tool (per "Editor mounts annotation UI"). For text, the inline edit is a positioned `<input>` styled to match; on blur or Enter, dispatch `UPDATE_ANNOTATION` with the final text (and remove the annotation if text is empty).
- [ ] **Step 7.3:** Selected-annotation chrome: draw a 2px dashed `#0066FF` outline as a sibling DOM element (no canvas). Drag updates `(x, y)` (or `(x1, y1)/(x2, y2)` for arrows) via `UPDATE_ANNOTATION`. Coalescing is M7 — for now, dispatch every move.
- [ ] **Step 7.4:** `CalibrationModal`. Two-click point-picking on a fixed-size still of the panel image rendered in the modal (use the existing bitmap; do NOT re-render via `drawFigure`). Compute distance in source-pixel space from the two points (apply the inverse transform to map panel-local clicks back to source-image coords — this is one new helper in `coords.ts`: `figureToSource(panelRect, transform, imgW, imgH, fx, fy): {sx, sy}`). On save, dispatch `SET_IMAGE_CALIBRATION`.
- [ ] **Step 7.5:** Wire keyboard: Delete/Backspace removes `selectedAnnotationId`. `Escape` → clear annotation selection + reset `activeTool = "select"`.

### Task 8: Replace M2 fixtures + propagate Figure shape changes

**Files:**

- Edit: every test that builds a `Figure` literal — they now need `annotations: []` and `globalStyle: DEFAULT_GLOBAL_STYLE`. Search: `rg "kind: \"image\"|kind: \"placeholder\"" test/`.
- Edit: [src/renderer/model/hardcoded.ts](../../src/renderer/model/hardcoded.ts) — `Figure` shape.
- Edit: [test/unit/figure-derivations.test.ts](../../test/unit/figure-derivations.test.ts) — assert annotations + globalStyle pass-through.
- Edit: [test/unit/figure-layout.test.ts](../../test/unit/figure-layout.test.ts), [test/unit/draw-figure.test.ts](../../test/unit/draw-figure.test.ts), [test/unit/export-png-shape.test.ts](../../test/unit/export-png-shape.test.ts).

- [ ] **Step 8.1:** Add `annotations: []` + `globalStyle: DEFAULT_GLOBAL_STYLE` to every `Figure` literal in tests. Ripgrep is the right tool: `rg -l "panels:.*kind: \"" test/unit/`.
- [ ] **Step 8.2:** Re-run `pnpm typecheck && pnpm test`. Expect green.

### Task 9: Multi-format export

**Files:**

- Edit: [src/renderer/render/export-renderer.ts](../../src/renderer/render/export-renderer.ts) — add `renderFigureToOffscreen`; keep `renderFigureToPngBlob` as a passthrough.
- Create: [src/renderer/export/jpeg.ts](../../src/renderer/export/jpeg.ts).
- Create: [src/renderer/export/tiff.ts](../../src/renderer/export/tiff.ts).
- Create: [src/renderer/export/pdf.ts](../../src/renderer/export/pdf.ts).
- Create: [src/renderer/image/tiff-encode-tags.ts](../../src/renderer/image/tiff-encode-tags.ts) — patch DPI tags.
- Edit: [src/main/fs-write.ts](../../src/main/fs-write.ts) — `writeBytesToPath`; keep `writePngFile`.
- Edit: [src/main/dialogs.ts](../../src/main/dialogs.ts) — add JPEG/TIFF/PDF dialogs.
- Edit: [src/main/index.ts](../../src/main/index.ts) — three new IPC handlers.
- Edit: [src/preload/api.ts](../../src/preload/api.ts) — `ExportResult`, new channels, `MosaicApi` methods.
- Edit: [src/preload/preload.ts](../../src/preload/preload.ts) — expose new methods.
- Create: [src/renderer/components/Toolbar/ExportMenu.tsx](../../src/renderer/components/Toolbar/ExportMenu.tsx).
- Edit: [src/renderer/App.tsx](../../src/renderer/App.tsx) — replace `<ExportButton>` with `<ExportMenu>`.
- Add: `pdf-lib` dependency. `pnpm add pdf-lib`.
- Create / extend: [test/unit/export-jpeg.test.ts](../../test/unit/export-jpeg.test.ts), [test/unit/export-tiff.test.ts](../../test/unit/export-tiff.test.ts), [test/unit/export-pdf.test.ts](../../test/unit/export-pdf.test.ts), [test/unit/tiff-encode-tags.test.ts](../../test/unit/tiff-encode-tags.test.ts), [test/unit/dialogs.test.ts](../../test/unit/dialogs.test.ts), [test/unit/fs-write.test.ts](../../test/unit/fs-write.test.ts), [test/unit/preload-api-shape.test.ts](../../test/unit/preload-api-shape.test.ts).

- [ ] **Step 9.1:** Refactor `export-renderer.ts` to expose `renderFigureToOffscreen`. Keep `renderFigureToPngBlob` calling the same `drawFigure` path so existing tests are unaffected.
- [ ] **Step 9.2:** Generalise `fs-write.ts`. `writeBytesToPath(filePath, bytes, allowedExt)`; `writePngFile` becomes `writeBytesToPath(filePath, bytes, [".png"])`.
- [ ] **Step 9.3:** Add JPEG/TIFF/PDF dialogs in `dialogs.ts`. Tests assert the file filter list per format.
- [ ] **Step 9.4:** Add three IPC handlers in `index.ts`. Each follows the structure of `mosaic:export-png` exactly, parametrised by the dialog and `allowedExt`.
- [ ] **Step 9.5:** Extend `preload/api.ts` types and `preload.ts` exposures.
- [ ] **Step 9.6:** Implement `export/jpeg.ts`. Tests assert (a) a `Blob` with `type === "image/jpeg"` is produced, (b) the IPC mock receives `bytes` of non-zero length and a `defaultName` ending in `.jpg`.
- [ ] **Step 9.7:** Implement `tiff-encode-tags.ts`. The function `injectResolutionTags(tiffBytes, dpi): Uint8Array` walks the IFD, finds or appends tags `t282`, `t283`, `t296` (=2 for inch), and rewrites the byte stream. Pure; tests use a fixture TIFF (or a UTIF.encode-produced sample) and assert the post-walk bytes parse back to the expected resolution under UTIF.decode.
- [ ] **Step 9.8:** Implement `export/tiff.ts`. Renders → `getImageData` → `UTIF.encodeImage` → `injectResolutionTags(_, dpi)` → IPC.
- [ ] **Step 9.9:** Implement `export/pdf.ts`. PNG → `PDFDocument.create` → `embedPng` → `addPage([wPt, hPt])` → `drawImage` filling the page → `pdfDoc.save()`. Page size: `wPt = (figure.canvas.widthPx / dpi) * 72`. Tests assert (a) `bytes.byteLength > 0`, (b) the first 4 bytes are `%PDF` (`0x25 0x50 0x44 0x46`).
- [ ] **Step 9.10:** Implement `ExportMenu.tsx`. Dropdown of four buttons. JPEG opens a small popover with a quality slider. Each button awaits its export function and mirrors the existing `ExportButton` status feedback.
- [ ] **Step 9.11:** Replace `<ExportButton>` with `<ExportMenu>` in `App.tsx`. Remove `ExportButton` if no test imports it (otherwise keep as a thin wrapper for one milestone).
- [ ] **Step 9.12:** `pnpm typecheck && pnpm test && pnpm lint` exits 0.

### Task 10: Manual verification + GIF + commit

- [ ] **Step 10.1:** Run `pnpm dev`. Walk through the manual checklist in §"Verification". Record one short clip showing the TIFF-with-calibration flow + a scale bar zooming with the panel.
- [ ] **Step 10.2:** Add `docs/m6.md` with a one-paragraph "what shipped" note + link to the recording (matches the M5 pattern in [docs/m5.md](../../docs/m5.md)).
- [ ] **Step 10.3:** Squash to two commits:
  - `feat(m6): annotations + TIFF + multi-format export`
  - `test(m6): scale-bar math, calibration, JPEG/TIFF/PDF blob shapes`
- [ ] **Step 10.4:** Open PR against `main`. Title: `M6 — Annotations + TIFF + multi-format export`. Body includes the verification checklist.

---

## Verification

**Manual end-to-end checklist (run on `pnpm dev`):**

1. Launch; confirm an empty 2×2 grid + tray.
2. Add 3 PNG, 2 JPEG, **1 TIFF with `XResolution`/`YResolution`/`ResolutionUnit` tags** (use a fixture TIFF in `test/fixtures/`), **1 TIFF with no resolution tags**, **1 16-bit TIFF**. All appear in the tray; the worker decodes without UI freeze (visible by attempting to scroll the tray during decode).
3. Place the TIFF-with-tags into panel (0,0). Expect the calibration to be auto-detected; the panel toolbar's "Calibrate…" button shows `auto: 0.0645 px/µm` (or similar).
4. Place the no-tags TIFF into panel (0,1). Click "Calibrate…" → modal opens. Pick two points 200 px apart in the source; enter "10 µm". Save. The calibration is now `manual: 20 px/µm`.
5. Subpanel letters: the panels show `A`, `B`, `C`, `D` in their `tl` corners. Toggle "Subpanel letters" off → letters disappear. Toggle on → they return.
6. Override letter: select panel (0,0) and (somehow, via right-click menu OR a small text input on the panel control bar — pick whichever ships) set the override to `"A1"`. Toggle letters off + on; override persists.
7. Add free text on panel (1,0): activate the Text tool, click in the panel, type "Live cells", press Enter. Switch to Select tool, drag the text 100 px right; it moves; the figure-canvas position updates.
8. Draw an arrow: activate Arrow tool, click-drag from `(x1, y1)` to `(x2, y2)` over a panel. Switch to Select; drag either endpoint to reposition.
9. Draw a box: activate Box tool, click-drag a rectangle. Switch to Select; drag a corner to resize (corners are 8×8 chrome handles).
10. Add a scale bar to the calibrated TIFF panel: activate Scale-bar tool, click the panel, popover opens with `[length=50] [unit=µm] [Add]`. Click Add. Bar appears in the bottom-right corner with label `50 µm`.
11. Zoom the panel 2× (scroll wheel inside the panel). The scale bar's length **doubles in figure pixels** — visually obvious. Zoom back to 1.0×; bar returns to original length.
12. Pan the panel image (Cover fit, drag inside). The scale bar **does not move** (it's anchored to the panel corner, not the image).
13. Switch panel rotation 90° (`R`). Bar's pixel length recomputes via the rotated `S` and stays anchored to the corner.
14. Export menu → PNG. Save. Open in Preview; verify dimensions in pixels match the figure's `widthPx × heightPx`.
15. Export menu → JPEG (quality slider at 0.85). Save. Open; visually similar with mild compression.
16. Export menu → TIFF. Save. Open in ImageJ; the resolution tags are present (300 dpi), the bar scale is intact.
17. Export menu → PDF. Save. Open in Preview / Acrobat; the page is sized to `(widthPx / 300) × (heightPx / 300)` inches. Zoom in; the embedded raster is sharp at the design DPI.
18. Stress: 30 image pool, all 16 panels filled (4×4 grid), 5 annotations per panel. Editor stays > 30 fps; export completes under 30s for each format.

**Automated coverage targets:**

- `figure-actions.test.ts` — ≥ 14 new cases for annotation actions + reducer side-effects.
- `scalebar.test.ts` — ≥ 8 cases.
- `tiff-decode.test.ts` — ≥ 5 cases.
- `draw-figure.test.ts` — ≥ 12 new cases for the annotation pass (letters, text, arrow, box, scale bar).
- `tiff-encode-tags.test.ts` — ≥ 4 cases (round-trip via UTIF.decode).
- `export-jpeg.test.ts` / `export-tiff.test.ts` / `export-pdf.test.ts` — ≥ 2 cases each (blob type + IPC shape).
- All existing tests in [test/unit/](../../test/unit/) keep passing once Figure literals carry the new fields.

---

## Risks and mitigations

- **UTIF doesn't load in Vitest.** UTIF is a UMD bundle that may not import cleanly under jsdom. Mitigation: gate the worker behind `tiff-worker-host` and unit-test only the **pure helpers** (`readCalibrationFromIFD`, `injectResolutionTags`) directly. The worker is exercised in manual verification only; M8 will add a Playwright E2E that uses a real Electron renderer to confirm the worker path end-to-end.
- **16-bit TIFF dynamic range collapses to 8-bit on display.** Acceptable for v1 — `UTIF.toRGBA8` does the conversion. Document that 16-bit precision is preserved nowhere in M6; M7+ may surface a per-image min/max slider.
- **TIFF resolution-tag injection can corrupt the file if offsets are wrong.** Mitigation: `injectResolutionTags` is heavily unit-tested with round-trip-via-UTIF.decode assertions. If injection ever fails, the export still produces a valid TIFF (no DPI tag) rather than a corrupted one — the function should `try { … } catch { return originalBytes }` with a console warn.
- **PDF physical-page sizing depends on a `dpi` argument that M6 doesn't yet plumb through the FigureCanvas.** Mitigation: hardcode `dpi = 300` in M6 with a TODO comment pointing to M8 (where physical-mode `FigureCanvas` lands). The export modal in M6 doesn't expose DPI choice.
- **Annotation interaction layer + PanelInteractionLayer fight for pointer events.** Z-order solves it: the AnnotationInteractionLayer sits above and gates `pointer-events: auto` to the active-tool's hit area. When `activeTool === "select"` and no annotation under the cursor, set `pointer-events: none` on the AnnotationInteractionLayer so PanelInteractionLayer wins.
- **Worker startup latency on first TIFF.** The first TIFF takes 100-300ms to decode because the worker boots. Mitigation: optionally warm the worker on app launch (post a `{ ping: true }` message). M6 ships the cold start; warmup is a one-line addition if it bothers a tester.
- **Color picker UX.** Browser-native `<input type="color">` is supported in Electron 32 and is good enough for M6. No external dep. Document the caveat that alpha is set via a separate slider (input[type=range] 0..1 → 8-bit alpha hex appended).
- **Memory: every annotation is a small object, but text annotations with very long text strings can balloon the FigureState.** In practice scientific figures have < 50 annotations; ignore.
- **`ResolvedAnnotation` includes `LetterAnnotation` which has no source in `state.annotations`.** Be explicit in `figure-derivations.ts` so a future code-reader doesn't search for letter records in the reducer. Comment it.

---

## Out of scope (explicit)

- Project save / load (`.mosaic`), undo/redo, relink modal — **M7**.
- Properties side-panel beyond toolbar pads, app icon, electron-builder configs — **M8**.
- ICC color management, font loading from disk, BigTIFF, planar configs — **post-1.0**.
- Annotation rotation / arbitrary-angle text — **post-1.0**.
- Live preview of scale bar inside the calibration modal — **post-1.0**.
- Multi-image-bitmap memory tiering (preview + full-res) — deferred unless stress test fails.
- Editor `editorScale` (renderer rendering at sub-figure resolution) — **M8**.
- Physical-mode `FigureCanvas` (in/cm/mm + DPI) and its export-time DPI plumbing — **M8**. M6 hardcodes `dpi = 300` for TIFF + PDF.
