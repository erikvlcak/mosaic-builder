# Mosaic Builder — M5: Per-panel Transforms + Selection

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make placed panels interactive. Click a panel to select it; drag to pan; scroll to zoom; rotate in 90° steps and flip H/V from the toolbar; switch between Contain / Cover / Stretch fits per panel. The editor and exporter both honour the resulting per-panel transform, with Cover-fit pan/zoom clamped so the gutter color never leaks through.

**Source of truth:** Implements milestone **M5** from [/Users/erikvlcak/.claude/plans/i-want-to-build-playful-kahan.md](../../.claude/plans/i-want-to-build-playful-kahan.md) (line 391) and the math from sections 5 and 7 of that document. Does NOT implement annotations, scale bars, TIFF metadata, undo/redo, or `.mosaic` save — those are M6/M7.

**Working directory:** `/Users/erikvlcak/Desktop/mosaic-builder/`. Branch off `main`. Build a feature branch (e.g. `feat/m5-per-panel-transforms`) and merge once the manual checklist passes.

**Predecessor state (M4):**

- [src/renderer/model/figure-state.ts](../../src/renderer/model/figure-state.ts) — `Panel` carries `id, row, col, rowSpan, colSpan, imageId?` and nothing else; no transform.
- [src/renderer/model/figure-derivations.ts](../../src/renderer/model/figure-derivations.ts) — projects `FigureState` → `Figure` (the M2-shaped render input).
- [src/renderer/model/types.ts:22-38](../../src/renderer/model/types.ts#L22-L38) — `HardCodedPanel` is the input shape `drawFigure` consumes; today it has no transform.
- [src/renderer/render/draw-figure.ts:76-94](../../src/renderer/render/draw-figure.ts#L76-L94) — `drawImageContain` is the only fit, hard-coded.
- [src/renderer/render/coords.ts](../../src/renderer/render/coords.ts) — only does grid layout, no per-panel image transform yet.
- [src/renderer/components/Grid/GridCells.tsx:156-168](../../src/renderer/components/Grid/GridCells.tsx#L156-L168) — already has a "click to focus a panel" handler (`onPanelClick`) used by Unmerge; M5 reuses it as the canonical selection.
- [src/renderer/hooks/useKeyboardShortcuts.ts](../../src/renderer/hooks/useKeyboardShortcuts.ts) — handles M/U/Escape; early-returns on any modifier so we can add R/F safely.
- [src/renderer/render/editor-renderer.ts](../../src/renderer/render/editor-renderer.ts) — sizes the backing store to figure pixels; CSS scales it. No `editorScale` math yet; the editor is rendered at 1:1 backing-store-to-figure, and the wrapping `<div>` (`CANVAS_CSS_W × CANVAS_CSS_H` in [App.tsx:32-33](../../src/renderer/App.tsx#L32-L33)) controls visual size. M5 keeps that approximation: pointer math converts CSS px → figure px via the `cssW/figurePxW` ratio that `GridCells` already uses.

---

## Definition of done for M5

- `pnpm typecheck` exits 0.
- `pnpm test` exits 0; new unit tests cover `coords` transform math, Cover-fit clamp, and the `figureReducer` transform actions (≥ 18 new test cases).
- `pnpm lint` exits 0.
- A user can:
  1. Click a panel containing an image → it shows a selection chrome distinct from the existing focus outline.
  2. Drag inside a selected panel → the image pans within the panel; the gutter never bleeds through in **Cover** mode (clamped).
  3. Scroll the wheel inside a selected panel → the image zooms about the cursor in **Contain** and **Cover**; clamp prevents `zoom < 1`.
  4. Click `Rotate 90°` (toolbar) or press `R` → image rotates 0 → 90 → 180 → 270 → 0; layout unchanged; pan/zoom re-clamped for new rotated dims.
  5. Click `Flip H` / `Flip V` or press `H` / `V` → mirrors the image without moving the panel.
  6. Switch fit mode (Contain / Cover / Stretch) from a per-panel control; transitioning to Cover snaps the image into the clamp envelope; Stretch hides zoom/pan controls.
  7. Press `Escape` → clears panel selection.
  8. Export PNG → exported pixels match the editor pixel-for-pixel at the figure's backing-store size.
- Manual checklist in §"Verification" passes.

Out of scope: annotations, scale bars, TIFF, undo/redo, project save/load, properties side-panel beyond a thin per-panel transform pad.

---

## Architecture for this milestone

Three concerns, three layers:

1. **Model (`model/`).** Add `PanelTransform` to `Panel`; add transform actions to `figureReducer`; default a transform on every newly-placed image; keep clamp logic out of the reducer (reducer takes pre-clamped values), with a pure clamp function in `render/coords.ts` that the input layer calls before dispatching.
2. **Render (`render/`).** Replace `drawImageContain` with a parameterised `drawPanelImage(ctx, bitmap, rect, transform)`. Move all transform math into `coords.ts` as pure functions: `baseScale`, `panelToImage`, `imageToPanel`, `clampCoverPan`, `clampZoom`. Both editor and exporter call the same draw routine — WYSIWYG.
3. **Input (`components/Grid/`, `hooks/`).** A new `PanelInteractionLayer` component (or extension of `GridCells`) attaches `pointerdown/move/up`, `wheel`, and click handlers to the focused panel. Drag updates `panX/panY` (via clamp) on every move; commits through the reducer without batching (M5 has no undo so coalescing isn't needed yet — a single `SET_PANEL_TRANSFORM` action per pointer event is fine).

`★ Insight ─────────────────────────────────────`
The plan keeps math out of the reducer deliberately. Pure transform functions in `coords.ts` are easy to unit-test (no DOM, no canvas, no React); the reducer just stores numbers. When M7 adds undo, we'll wrap interactions in `beginInteraction()/endInteraction()` to coalesce — but that scaffolding is intentionally not built here.
`─────────────────────────────────────────────────`

---

## Data model changes

### `src/renderer/model/panels.ts` — extend `Panel`

```ts
export type FitMode = "contain" | "cover" | "stretch";
export type Rotation = 0 | 90 | 180 | 270;

export interface PanelTransform {
  fit: FitMode;
  panX: number; // figure-px, panel-local; 0,0 = panel center
  panY: number;
  zoom: number; // 1.0 = baseline (Contain or Cover baseline depending on `fit`)
  rotation: Rotation;
  flipH: boolean;
  flipV: boolean;
}

export interface Panel {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  imageId?: string;
  transform?: PanelTransform; // present iff imageId is set
}

export const DEFAULT_TRANSFORM: PanelTransform = {
  fit: "contain",
  panX: 0,
  panY: 0,
  zoom: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
};
```

**Invariant:** `transform === undefined` ⇔ `imageId === undefined`. Reducer enforces.

### `src/renderer/model/types.ts` — extend `HardCodedPanel`

The image variant gains `transform`:

```ts
| { row, col, kind: "image", imageId, rowSpan?, colSpan?, transform: PanelTransform }
```

`transform` is required on the image variant (so render code never branches on `undefined`); `figure-derivations.ts` substitutes `DEFAULT_TRANSFORM` for any panel whose state-side transform is missing — shouldn't happen post-migration, but defensive.

### `src/renderer/model/figure-actions.ts` — new actions

```ts
| { type: "SET_PANEL_TRANSFORM"; panelId: string; transform: PanelTransform }
| { type: "SET_PANEL_FIT"; panelId: string; fit: FitMode }
| { type: "ROTATE_PANEL_90"; panelId: string }    // CW; cycles 0→90→180→270→0
| { type: "FLIP_PANEL_H"; panelId: string }
| { type: "FLIP_PANEL_V"; panelId: string }
| { type: "RESET_PANEL_TRANSFORM"; panelId: string }
```

Reasoning for the granularity:

- `SET_PANEL_TRANSFORM` is the workhorse for pan/zoom (the input layer computes the clamped result and dispatches the whole transform).
- The other actions are **derived mutations** — they compute small state changes the reducer can do without external math. `SET_PANEL_FIT` resets `panX/panY/zoom` to identity for the new mode (changing fit from Contain to Cover with non-zero pan would violate clamp); `RESET_PANEL_TRANSFORM` snaps to defaults for the current `fit`.

Action creators follow the existing pattern in [figure-actions.ts:19-59](../../src/renderer/model/figure-actions.ts#L19-L59).

### Reducer updates

- `PLACE_INTO_PANEL` now stamps `DEFAULT_TRANSFORM` on the panel.
- `SWAP_PANELS` swaps both `imageId` and `transform` together (a panel's transform belongs to its image, not its grid position).
- `REPLACE_INTO_PANEL` — the previous image returns to the tray as unplaced; the new image gets a fresh `DEFAULT_TRANSFORM` (we discard the prior transform; user expectation is "fresh image, fresh framing").
- `REMOVE_FROM_POOL` — when clearing `imageId`, also clear `transform`.
- `RESIZE_GRID` — released panels lose their image; transforms go with them.
- `MERGE_CELLS` — the merged panel inherits no transform (it has no image); if the user later places an image, it gets `DEFAULT_TRANSFORM` as usual.
- `UNMERGE_PANEL` — the unmerged 1×1 cells inherit no transform; the original panel had at most one image, which now sits in the cell at the original `(row, col)` (this is M4 behaviour) and keeps its transform.

For each action, `assertPanelsCoverGrid` and the new "transform iff imageId" check should run in tests, not at runtime in the reducer (M2 didn't, M5 follows suit).

---

## Render math (pure, testable)

Add these to `src/renderer/render/coords.ts`. All functions are pure; all dimensions are in **figure-canvas pixels**; pointer-space conversion lives in the input layer, not here.

```ts
// Image dimensions after rotation only (flip preserves aspect).
export function rotatedImageDims(
  imgW: number,
  imgH: number,
  rotation: 0 | 90 | 180 | 270,
): { w: number; h: number } {
  return rotation === 90 || rotation === 270
    ? { w: imgH, h: imgW }
    : { w: imgW, h: imgH };
}

// Multiplier from source-image px to panel-local px before user zoom.
export function baseScale(
  panelW: number,
  panelH: number,
  rotImgW: number,
  rotImgH: number,
  fit: FitMode,
): number | { sx: number; sy: number } {
  if (fit === "contain") return Math.min(panelW / rotImgW, panelH / rotImgH);
  if (fit === "cover") return Math.max(panelW / rotImgW, panelH / rotImgH);
  // stretch — anisotropic; zoom is locked to 1 in the input layer
  return { sx: panelW / rotImgW, sy: panelH / rotImgH };
}

// Cover-mode clamp envelope (panel-local px). With S = baseScaleCover * zoom:
//   panX ∈ [-(hx - pw), (hx - pw)], same for panY.
export function clampCoverPan(
  panX: number,
  panY: number,
  panelW: number,
  panelH: number,
  rotImgW: number,
  rotImgH: number,
  zoom: number,
): { panX: number; panY: number } {
  const S = Math.max(panelW / rotImgW, panelH / rotImgH) * zoom;
  const hx = (rotImgW * S) / 2;
  const hy = (rotImgH * S) / 2;
  const pw = panelW / 2;
  const ph = panelH / 2;
  return {
    panX: clamp(panX, -(hx - pw), hx - pw),
    panY: clamp(panY, -(hy - ph), hy - ph),
  };
}

// Apply zoom limits per fit mode.
export function clampZoom(zoom: number, fit: FitMode): number {
  if (fit === "stretch") return 1;
  // Cover: zoom >= 1 prevents gutter bleed-through.
  // Contain: zoom >= 1 prevents zooming further out (no purpose; gutter would show).
  // Cap at 50 to avoid runaway pinch math; revisit in M6.
  return clamp(zoom, 1, 50);
}

// One-shot "snap a transform back into the legal envelope". Called by the
// reducer-input layer after a fit change or rotation, and after every
// pan/zoom interaction in Cover mode.
export function snapTransform(
  t: PanelTransform,
  panelW: number,
  panelH: number,
  imgW: number,
  imgH: number,
): PanelTransform {
  const { w: rw, h: rh } = rotatedImageDims(imgW, imgH, t.rotation);
  const zoom = clampZoom(t.zoom, t.fit);
  if (t.fit === "stretch") return { ...t, zoom: 1, panX: 0, panY: 0 };
  if (t.fit === "contain") return { ...t, zoom, panX: t.panX, panY: t.panY };
  // cover
  const { panX, panY } = clampCoverPan(
    t.panX,
    t.panY,
    panelW,
    panelH,
    rw,
    rh,
    zoom,
  );
  return { ...t, zoom, panX, panY };
}

// (Optional, used by export math + future hit testing.)
// Forward transform: source-image (sx,sy) → panel-local (px,py).
// Composes Translate(panX,panY) ∘ Scale(zoom*baseScale) ∘ Rotate(rot)
//          ∘ FlipMaybe(flipH,flipV) ∘ Translate(-imgCenter).
// Returns a 2D affine [a,b,c,d,e,f] suitable for ctx.setTransform.
export function panelImageMatrix(
  t: PanelTransform,
  imgW: number,
  imgH: number,
  panelW: number,
  panelH: number,
): [number, number, number, number, number, number];
```

`clamp` is a tiny local helper. **None of this code touches the DOM or canvas.**

`★ Insight ─────────────────────────────────────`
`baseScale` returns a number for Contain/Cover but `{sx, sy}` for Stretch — a tagged-union shape. This forces the consumer (the draw routine) to handle Stretch's anisotropy explicitly, which is exactly what the spec wants. An alternative was `{ sx, sy }` always, but losing the "isotropic" signal makes reasoning about Cover-clamp math harder — you always want a single `S` there.
`─────────────────────────────────────────────────`

---

## Render pipeline updates

### `src/renderer/render/draw-figure.ts`

Replace `drawImageContain` with `drawPanelImage(ctx, bitmap, rect, transform)`:

```ts
function drawPanelImage(
  ctx: DrawCtx,
  bitmap: ImageBitmap,
  rect: PanelRect,
  t: PanelTransform,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  // Translate so panel center is the origin for image transforms.
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  // Pan in panel-local px (post-rotation, pre-flip).
  ctx.translate(t.panX, t.panY);

  if (t.fit === "stretch") {
    ctx.scale(rect.w / bitmap.width, rect.h / bitmap.height);
  } else {
    const { w: rw, h: rh } = rotatedImageDims(
      bitmap.width,
      bitmap.height,
      t.rotation,
    );
    const S =
      t.fit === "cover"
        ? Math.max(rect.w / rw, rect.h / rh)
        : Math.min(rect.w / rw, rect.h / rh);
    ctx.scale(S * t.zoom, S * t.zoom);
  }

  ctx.rotate((t.rotation * Math.PI) / 180);
  if (t.flipH || t.flipV) {
    ctx.scale(t.flipH ? -1 : 1, t.flipV ? -1 : 1);
  }
  ctx.translate(-bitmap.width / 2, -bitmap.height / 2);

  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
  ctx.restore();
}
```

**`DrawCtx` additions** (extend the interface in [draw-figure.ts:9-30](../../src/renderer/render/draw-figure.ts#L9-L30)):

```ts
translate(x: number, y: number): void;
scale(x: number, y: number): void;
rotate(rad: number): void;
```

The recorder fake in [test/unit/draw-figure.test.ts](../../test/unit/draw-figure.test.ts) gets stubs for these and records call sequences for assertions.

### `src/renderer/render/editor-renderer.ts`

No structural change. The renderer still sizes `canvas` to figure pixels and CSS scales it. Selection chrome (the focused-panel outline + handles, if we add any) is **rendered by `GridCells`** as DOM, not by the canvas — keeps the canvas pure pixels (matches §3 of the source plan: "React never touches figure pixels"). The visual selection outline already exists in [GridCells.tsx:189-196](../../src/renderer/components/Grid/GridCells.tsx#L189-L196) (`focusedPanelId === panel.id ? "2px solid #00875A"`); we only need to re-style it for the M5 "selected" affordance and add a cursor change.

---

## Input layer

A new component `src/renderer/components/Grid/PanelInteractionLayer.tsx`, mounted alongside `GridCells` (sibling, same wrapper). It takes the focused panel id, the panel rect, the source-image dims, the current transform, the figure-px↔CSS-px ratio, and `dispatch`. It binds:

- `onPointerDown` (when over the focused panel + that panel has an image): set `dragging=true`, capture the pointer, record `startPanX, startPanY, startClientX, startClientY`.
- `onPointerMove`: `dx = (e.clientX - startClientX) / cssRatioX`, same for dy → new `panX = startPanX + dx`. Cover-mode clamps via `snapTransform`. Dispatch `SET_PANEL_TRANSFORM`.
- `onPointerUp` / `onPointerCancel`: release capture, `dragging=false`. (No coalescing yet — M7 wraps this in `beginInteraction()/endInteraction()`.)
- `onWheel`: `zoomFactor = Math.exp(-e.deltaY * 0.001)` → `newZoom = clampZoom(t.zoom * zoomFactor, t.fit)`. The pivot is the cursor; in Cover mode, snapping happens after.
  - Cursor-pivot zoom: convert cursor CSS coords → panel-local figure-px → adjust `panX/panY` so that point stays under the cursor. Math goes in `coords.ts` as `panForCursorZoom(t, panelRect, cursorPanelLocal, newZoom)`.
- Stretch mode: `pointerdown` does nothing; `wheel` does nothing. The cursor is `default`.

The interaction layer is `position: absolute; inset: 0; pointer-events: auto` only over the focused panel's rect; otherwise `pointer-events: none` so drag-and-drop on other panels still works.

`★ Insight ─────────────────────────────────────`
We deliberately don't use React drag events here because they bubble inconsistently with the existing dnd `dataTransfer` on `GridCells`. Pointer Events have separate semantics — `setPointerCapture` lets us drag past the panel's edges without losing the gesture, and the dnd listeners on the same element won't see pointer events at all.
`─────────────────────────────────────────────────`

---

## UI: per-panel transform toolbar

A new `src/renderer/components/Toolbar/PanelControls.tsx` rendered in the header next to `MergeControls`. Disabled when no panel with an image is focused. Buttons:

- Fit: a 3-button segmented control `Contain | Cover | Stretch`.
- `↻ 90°` (rotate CW) — bound to `R` key.
- `⇄` Flip H — bound to `H` key.
- `⇅` Flip V — bound to `V` key.
- `Reset` — back to `DEFAULT_TRANSFORM` for current fit.

`useKeyboardShortcuts` extends:

```ts
export interface ShortcutHandlers {
  onMerge: () => void;
  onUnmerge: () => void;
  onEscape: () => void;
  onRotate90?: () => void;
  onFlipH?: () => void;
  onFlipV?: () => void;
  onResetTransform?: () => void;
}
```

Existing modifier-guard at the top of the handler stays — these keys also early-return if `metaKey/ctrlKey/altKey`.

`Escape` clears `focusedPanelId` (currently it only clears the merge selection). Update `onEscape` to do both.

---

## Task breakdown

Each task ends with `pnpm typecheck && pnpm test && pnpm lint` exiting 0.

### Task 1: Extend the data model

**Files:**

- Edit: [src/renderer/model/panels.ts](../../src/renderer/model/panels.ts)
- Edit: [src/renderer/model/types.ts](../../src/renderer/model/types.ts)

- [ ] **Step 1.1:** Add `FitMode`, `Rotation`, `PanelTransform`, `DEFAULT_TRANSFORM` exports to `panels.ts`. Add the `transform?: PanelTransform` field to `Panel`.
- [ ] **Step 1.2:** In `types.ts`, change the image variant of `HardCodedPanel` to require `transform: PanelTransform`. Re-export `PanelTransform` from this file too so render code only imports from `model/types`.
- [ ] **Step 1.3:** Run `pnpm typecheck`. Existing call sites that build `HardCodedPanel` (only [figure-derivations.ts](../../src/renderer/model/figure-derivations.ts) and the M2 [hardcoded.ts](../../src/renderer/model/hardcoded.ts) leftover) will fail to compile — leave them failing for the next task.

### Task 2: Wire transforms through the reducer

**Files:**

- Edit: [src/renderer/model/figure-actions.ts](../../src/renderer/model/figure-actions.ts)
- Edit: [test/unit/figure-actions.test.ts](../../test/unit/figure-actions.test.ts)

- [ ] **Step 2.1:** Add the five new action types and creators (per "Data model changes"). Keep them grouped at the bottom of the existing union for diff-readability.
- [ ] **Step 2.2:** Update the existing reducer cases as listed under "Reducer updates":
  - `PLACE_INTO_PANEL` writes `transform: DEFAULT_TRANSFORM`.
  - `SWAP_PANELS` swaps `imageId` AND `transform`.
  - `REPLACE_INTO_PANEL` writes a fresh `DEFAULT_TRANSFORM` for the incoming image.
  - `REMOVE_FROM_POOL` clears both `imageId` and `transform`.
- [ ] **Step 2.3:** Implement the new cases. Keep them dumb — they trust the dispatcher to have called `snapTransform` already; the reducer just stores numbers.
  - `SET_PANEL_TRANSFORM`: lookup panel; if `imageId` undefined, no-op; else replace `transform`.
  - `SET_PANEL_FIT`: same, but reset `panX=0, panY=0, zoom=1` whenever fit changes (preserve `rotation, flipH, flipV`). If new fit equals old, no-op.
  - `ROTATE_PANEL_90`: `(rotation + 90) % 360 as Rotation`. Reset `panX=0, panY=0` to avoid post-rotation pan landing outside the new clamp envelope. Keep `zoom` (user expectation: 90° rotates _the image_, not the framing).
  - `FLIP_PANEL_H` / `FLIP_PANEL_V`: toggle the bool. No pan reset.
  - `RESET_PANEL_TRANSFORM`: replace with `DEFAULT_TRANSFORM`.
- [ ] **Step 2.4:** Add tests. Cover at minimum:
  - `PLACE_INTO_PANEL` stamps `DEFAULT_TRANSFORM`.
  - `SWAP_PANELS` swaps transforms with images.
  - `REPLACE_INTO_PANEL` resets transform.
  - `REMOVE_FROM_POOL` strips transform.
  - Each new action: happy path + no-op on unknown panel id + no-op when panel has no image.
  - `SET_PANEL_FIT` to same fit is a referential no-op (returns same object).
  - `ROTATE_PANEL_90` cycles 0→90→180→270→0 across four dispatches.
  - Flips toggle.

### Task 3: Pure transform math in `coords.ts`

**Files:**

- Edit: [src/renderer/render/coords.ts](../../src/renderer/render/coords.ts)
- Create: [test/unit/coords-transform.test.ts](../../test/unit/coords-transform.test.ts)

- [ ] **Step 3.1:** Add `clamp`, `rotatedImageDims`, `baseScale`, `clampCoverPan`, `clampZoom`, `snapTransform`, `panForCursorZoom` (the cursor-pivot helper).
- [ ] **Step 3.2:** Tests:
  - `rotatedImageDims`: `(100, 50, 0)` → `{100, 50}`; `(100, 50, 90)` → `{50, 100}`; `(100, 50, 270)` → `{50, 100}`; `(100, 50, 180)` → `{100, 50}`.
  - `baseScale` Contain on a wide image in a square panel uses height ratio; Cover uses width ratio. Stretch returns `{sx, sy}`.
  - `clampCoverPan`: square image bigger than square panel allows non-zero pan; image equal to panel clamps pan to 0; image smaller than panel (impossible in Cover, but defensive) clamps to a degenerate range.
  - `clampZoom`: `(0.5, "contain")` → `1`; `(2, "cover")` → `2`; `(99, "contain")` → `50`; `(7, "stretch")` → `1`.
  - `snapTransform`: stretch always zeros pan and zoom-1's; cover clamps; contain leaves pan alone but raises zoom to ≥ 1.
  - `panForCursorZoom`: zooming with the cursor at the panel center keeps `panX/panY` unchanged; zooming with the cursor at the right edge shifts `panX` toward the new zoomed-out value such that the right-edge pixel stays under the cursor (one numerical case is enough).
- [ ] **Step 3.3:** Run new tests; expect all green.

### Task 4: Update the draw routine

**Files:**

- Edit: [src/renderer/render/draw-figure.ts](../../src/renderer/render/draw-figure.ts)
- Edit: [test/unit/draw-figure.test.ts](../../test/unit/draw-figure.test.ts)

- [ ] **Step 4.1:** Extend `DrawCtx` with `translate`, `scale`, `rotate`. Update the recorder fake in tests to record these calls.
- [ ] **Step 4.2:** Replace `drawImageContain` with `drawPanelImage` per "Render pipeline updates". Image-variant panels now read `transform` from the panel object.
- [ ] **Step 4.3:** Tests:
  - With identity transform + Contain, the bitmap is drawn at the same final rect as the M4 path (regression: capture call sequence; should match existing assertion shape minus the new transform calls).
  - Cover fit on a wide image clips to panel; the recorded `drawImage` arguments + transforms produce a panel-filling result (assert via the matrix or via offsets).
  - Stretch mode produces anisotropic scale calls.
  - Rotation = 90 swaps effective dims (assert via the recorded `rotate` arg = π/2).

### Task 5: Wire derivations + remove M2 leftovers

**Files:**

- Edit: [src/renderer/model/figure-derivations.ts](../../src/renderer/model/figure-derivations.ts)
- Edit: [src/renderer/model/hardcoded.ts](../../src/renderer/model/hardcoded.ts) — keep the file (used by [test/unit/figure-layout.test.ts](../../test/unit/figure-layout.test.ts)) but update the placeholder image variants to include `transform: DEFAULT_TRANSFORM`.
- Edit: [test/unit/figure-derivations.test.ts](../../test/unit/figure-derivations.test.ts)

- [ ] **Step 5.1:** In `deriveFigure`, copy `p.transform ?? DEFAULT_TRANSFORM` onto image-variant `HardCodedPanel`s. (Defensive default for any code path that builds a panel without going through the reducer.)
- [ ] **Step 5.2:** Update derivation tests — image-variant projections now contain `transform`.

### Task 6: Selection state hoisted; toolbar; keyboard

**Files:**

- Edit: [src/renderer/App.tsx](../../src/renderer/App.tsx)
- Create: [src/renderer/components/Toolbar/PanelControls.tsx](../../src/renderer/components/Toolbar/PanelControls.tsx)
- Edit: [src/renderer/hooks/useKeyboardShortcuts.ts](../../src/renderer/hooks/useKeyboardShortcuts.ts)

- [ ] **Step 6.1:** In `App.tsx`, extend `focusedPanelId` to be the canonical selection. Compute `selectedPanel` derived state (with `imageId` and `transform`). Compute `canTransform = selectedPanel !== undefined && selectedPanel.imageId !== undefined`.
- [ ] **Step 6.2:** Render `<PanelControls>` next to `<MergeControls>`. Props: `selected: Panel | undefined`, `onSetFit, onRotate90, onFlipH, onFlipV, onReset`. All disabled when `!canTransform`. Wire each to the corresponding action creator.
- [ ] **Step 6.3:** Extend `ShortcutHandlers` with the four optional callbacks. Add R/H/V/0 (Reset) handlers in the keydown listener (same modifier guard, same typing-target guard). The existing `onEscape` now clears both merge selection AND focused panel; do this in `App.tsx`'s `onEscape` callback, not in the hook.
- [ ] **Step 6.4:** Quick smoke render check via existing tests (no new tests for the toolbar component itself — it's a thin presentational layer; behaviour is covered by reducer tests).

### Task 7: Pointer + wheel input on focused panel

**Files:**

- Create: [src/renderer/components/Grid/PanelInteractionLayer.tsx](../../src/renderer/components/Grid/PanelInteractionLayer.tsx)
- Edit: [src/renderer/App.tsx](../../src/renderer/App.tsx) — mount it.
- Edit: [src/renderer/components/Grid/GridCells.tsx](../../src/renderer/components/Grid/GridCells.tsx) — the existing focus outline becomes the "selected" chrome; bump from 2px to 3px and add an inset shadow or contrasting color. Cursor on focused panel becomes `grab` (`grabbing` while dragging).

- [ ] **Step 7.1:** Build `PanelInteractionLayer`. Props: `panel`, `panelRect` (figure-px), `bitmap`, `cssToFigureScale`, `dispatch`. Renders one `<div>` covering the panel rect (in CSS px), with `pointer-events: auto` only when the panel has an image and a non-Stretch fit.
- [ ] **Step 7.2:** Implement drag:
  - `onPointerDown`: `e.target.setPointerCapture(e.pointerId)`. Save start state.
  - `onPointerMove`: compute `dx, dy` in figure-px (`(clientX - startX) / cssToFigureScale.x`), apply to start `panX/panY`, run `snapTransform`, dispatch `SET_PANEL_TRANSFORM`.
  - `onPointerUp` / cancel: release capture.
- [ ] **Step 7.3:** Implement wheel:
  - `onWheel` with `passive: false` (use `useEffect` + `addEventListener` since React's `onWheel` is passive by default; `e.preventDefault()` is required to stop the editor pane from scrolling).
  - Compute `zoomFactor = Math.exp(-e.deltaY * 0.0015)`.
  - Compute cursor-panel-local figure-px from `(e.clientX, e.clientY)`.
  - Call `panForCursorZoom` to get new `panX/panY`, then `snapTransform` for clamps; dispatch.
- [ ] **Step 7.4:** Mount `<PanelInteractionLayer>` in `App.tsx` only when `selectedPanel?.imageId !== undefined`. Pass the rect from a freshly-computed `computePanelRects` (we already do this in `GridCells`; refactor into a shared `useFigureLayout` hook to avoid double computation, OR pass the rect down via props from `GridCells` — pick whichever is less code).
- [ ] **Step 7.5:** Edit `GridCells` to pass through pointer events on the focused panel (`pointer-events: none` when `focusedPanelId === panel.id` AND `panel.imageId !== undefined`), so the interaction layer wins. Drag-and-drop (`onDrop` etc.) on the same panel still works because dnd uses `dragstart/dragover/drop`, not pointer events — they're on a separate event channel.

`★ Insight ─────────────────────────────────────`
This is the subtle bit: HTML drag-and-drop and Pointer Events are independent. A focused panel can both accept HTML5 drops (tray → cell, swap from another cell) AND receive pointer-drags for pan, because the layers process different event types. Moving `pointer-events: none` between them only disables hit testing for click/pointer, not drag-and-drop.
`─────────────────────────────────────────────────`

### Task 8: Selection chrome refinement

**Files:**

- Edit: [src/renderer/components/Grid/GridCells.tsx](../../src/renderer/components/Grid/GridCells.tsx)

- [ ] **Step 8.1:** Distinguish the M5 "selected for editing" chrome from the M4 "focused for unmerge" outline (currently the same green border). Two states now:
  - Empty panel focused: thin outline, "Unmerge" enabled if merged.
  - Image panel selected: 3px solid `#0066FF`, cursor `grab`.
- [ ] **Step 8.2:** Hover outline (`#4C9AFF`) is unchanged.

### Task 9: Manual verification + GIF

- [ ] **Step 9.1:** Run `pnpm dev`. Walk through the manual checklist in §"Verification". Capture 1–2 screen recordings (mp4 or gif) for the PR description.
- [ ] **Step 9.2:** Update `docs/m4.md` (or create `docs/m5.md`) with a one-paragraph "what shipped" note and a link to the recording.

### Task 10: Commit

- [ ] **Step 10.1:** Squash the working commits to one or two clean commits. Suggested messages:
  - `feat(m5): per-panel transforms (fit/pan/zoom/rotate/flip) + selection`
  - `test(m5): coords transform math + reducer transform actions`
- [ ] **Step 10.2:** Open PR against `main`. Title: `M5 — Per-panel transforms + selection`. Body: include the verification checklist with each box ticked.

---

## Verification

**Manual end-to-end checklist (run on `pnpm dev`):**

1. New session; drag in 2 PNGs.
2. Place both in a 2×2 grid. Click one → it gains the blue selection chrome; cursor becomes `grab`.
3. Press `R` four times → image cycles through 90/180/270/0; panel layout unchanged.
4. Press `H`, then `V` → image flips horizontally then vertically.
5. Click `Cover` in the toolbar → image fills the panel; switch to `Contain` → image fits with letterbox.
6. In Cover mode, drag inside the panel — image pans; the gutter color **never** appears inside the panel rect, including at the extremes.
7. Scroll wheel up over the panel → image zooms in around the cursor; scroll down → zoom drops; clamps at `1.0` so gutter never bleeds.
8. Switch to Stretch → cursor returns to `default`; pan/zoom/rotate disabled in toolbar (rotate/flip stay enabled).
9. Press `Escape` → selection clears.
10. Click `Reset` (or press `0`) on a panel mid-zoom → snaps to `DEFAULT_TRANSFORM` for current fit.
11. Drag the placed image to a _different_ panel → image moves; transform travels with it (rotation, flips, zoom preserved). Drag tray-onto-occupied-panel → previous image returns to tray; new image starts at default transform.
12. Merge two cells (M4 still works), place an image in the merged panel, pan/zoom inside it. Unmerge → image lands in the top-left 1×1 with its transform preserved.
13. Click `Export PNG` → exported PNG matches the editor pixel-for-pixel for at least one Cover-zoomed panel (visual diff manually).

**Automated coverage targets:**

- `coords-transform.test.ts` — ≥ 12 cases.
- `figure-actions.test.ts` — ≥ 6 new cases for the transform actions.
- `draw-figure.test.ts` — ≥ 3 new cases for fit modes + rotation.
- Existing tests (`grid-resize`, `merge`, `dispatch-drop`, etc.) keep passing — they touch `Panel` only via field reads of row/col/span/imageId, which are unchanged.

---

## Risks and mitigations

- **Wheel event scrolls the page.** React `onWheel` is passive in modern Chromium; `preventDefault` is a no-op. Mitigation: bind via `addEventListener("wheel", handler, { passive: false })` in a `useEffect`. Confirm with a manual test in step 7 of the checklist.
- **Pointer drag conflicts with HTML5 drag.** A user starting a pointer-drag on a focused panel that also accepts HTML drops could fire both. Mitigation: `setPointerCapture` on `pointerdown` ensures pointer events route to the interaction layer; HTML drag only starts on a separate `dragstart`, which we don't fire from the interaction layer. If issues appear, gate `draggable={occupied && !isFocused}` in `GridCells` so the focused panel disables HTML drag while selected.
- **Transform field bloats `Panel` even for unplaced cells.** It's optional, so `undefined` overhead is just one slot. The image-variant of `HardCodedPanel` requires it (defensive default in `deriveFigure`). No memory concern for 100 panels.
- **Cover-fit clamp races on rapid wheel events.** Each wheel dispatch reads stable React state — no race on a single event. If `setPanelTransform` batches across multiple `onWheel` callbacks, the clamp is computed against the _committed_ state, which is fine; the worst case is a brief one-frame overshoot.
- **Stretch mode disables zoom but not rotation.** Intentional — rotation in Stretch produces the same anisotropic fill at 90°/270°, which is a useful effect. Document with a comment in `drawPanelImage`.
- **Editor-canvas backing size still equals figure size.** No `editorScale` yet (see [editor-renderer.ts:14](../../src/renderer/render/editor-renderer.ts#L14)). M5 doesn't add it. If the figure is larger than the viewport, the wrapper's `overflow: auto` kicks in (existing behaviour). True high-DPI editor rendering arrives with M6 or M8.
- **Test coverage on the input layer is light.** Pointer and wheel handlers are tested manually only — Vitest + JSDOM don't faithfully simulate pointer capture. Playwright (M1's tech stack pin, not yet used) would be the right harness; defer to M8 packaging when E2E lands.

---

## Out of scope (explicit)

- Annotations, scale bars, TIFF, calibration — **M6**.
- Project save/load, undo/redo, relink modal — **M7**.
- Properties side-panel (just a toolbar in M5) — **M8**.
- ICC color management, font loading, full memory accounting — post-1.0.
- Editor `editorScale` (renderer rendering at sub-figure resolution) — **M8** if needed.
