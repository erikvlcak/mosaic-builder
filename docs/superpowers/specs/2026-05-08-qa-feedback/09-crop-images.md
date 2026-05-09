# 09 — Crop images (non-destructive panel transform)

## Problem

When an image is placed in a panel, the only fit options are stretch,
contain, and cover. The user wants a true crop: select a sub-rectangle
of the source image, and have the panel show only that sub-rectangle
(with the chosen fit mode applied to the crop, not the original).

## Goal

Crop is a **non-destructive panel transform**. The original
ImagePoolItem is unchanged. The crop lives on the panel's
`PanelTransform` as a normalized source rectangle. Two panels using
the same pool image can have independent crops.

## Design

### Model

Extend `PanelTransform`:

```ts
export interface PanelTransform {
  fit: FitMode;
  panX: number;
  panY: number;
  zoom: number;
  rotation: Rotation;
  flipH: boolean;
  flipV: boolean;
  /** Crop rectangle in normalized (0..1) image-source coords. Optional;
   *  absent = no crop = full source rect (0,0)-(1,1). */
  crop?: {
    /** All in [0,1], with x+w <= 1 and y+h <= 1. */
    x: number;
    y: number;
    w: number;
    h: number;
  };
}
```

Why normalized rather than pixel coords: the source image
dimensions might be unknown when the project is hand-constructed in
tests, and normalized values survive image re-imports cleanly.

### Reducer

New action:

```ts
| { type: "SET_PANEL_CROP"; panelId: string; crop: PanelTransform["crop"] | null }
| { type: "RESET_PANEL_CROP"; panelId: string }
```

Validation: `crop` (if present) requires `x, y, w, h ∈ [0, 1]`,
`w > 0`, `h > 0`, `x + w ≤ 1`, `y + h ≤ 1`. Out-of-range → no-op.

### Crop dialog

A new modal (`CropImageModal.tsx`), invoked from the Panel Properties
form via a "Crop…" button (only shown when the panel has an image).

The modal shows:

- The full source image at fit-to-modal scale.
- A draggable / resizable crop rectangle overlay (8 corner+edge
  handles). Initial state = current crop or full image.
- An aspect-ratio selector (Free, 1:1, 4:3, 16:9, "match panel").
- A live preview of how the cropped image would appear in the panel
  on the right side (small thumb).
- Buttons: Apply, Reset, Cancel.

The dialog operates entirely on normalized coords; on Apply it
dispatches `SET_PANEL_CROP`.

### Render

`drawPanelImage(ctx, bitmap, rect, transform)` already takes a
`bitmap` and panel rect. Extend the source-rect math:

- If `transform.crop` is set, the source rectangle for the
  `drawImage` call is `(crop.x * bitmap.width, crop.y *
bitmap.height, crop.w * bitmap.width, crop.h * bitmap.height)`
  rather than the full bitmap.
- The fit / pan / zoom / rotation / flip math then operates on the
  _cropped_ sub-bitmap as if it were the new source. No other code
  needs to change.

### Visual indicator in editor

When a panel's image has a non-default crop, show a small "crop"
glyph in the panel's corner (similar to the way a calibrated panel
gets a corner badge today, if any). Clicking the badge re-opens the
crop dialog.

### Interaction with image-bound annotations (spec 05)

Image-bound annotations anchor in normalized 0..1 coordinates of the
**original image**. Cropping the image doesn't move the annotation
relative to the source pixels. This means annotations sitting in the
cropped-out region of the image become invisible while the crop is
active — but they reappear if the crop is reset.

Implementation: the resolver converts `imgU, imgV` (full-image
normalized) to the displayed panel rect, accounting for the crop:
if the anchor falls outside the crop, it's drawn at the projected
position anyway (potentially outside the panel rect; clip to the
panel rect at draw time). This matches the user's mental model — the
annotation didn't move, the visible region of the image just
shrank.

### Interaction with calibration (scale bars)

Scale bar calibrations are pixels-per-unit on the **original**
image. If the user crops, pixels per unit don't change. Scale bar
length is unaffected. ✓ Nothing to fix.

## Files touched

- `src/renderer/model/panels.ts` — `crop?` field on
  `PanelTransform`, validation helper.
- `src/renderer/model/figure-actions.ts` — two new actions.
- `src/renderer/model/figure-actions.test.ts` — coverage.
- `src/renderer/render/draw-panel-image.ts` (or wherever
  `drawPanelImage` lives) — source-rect math.
- `src/renderer/components/Modals/CropImageModal.tsx` — new.
- `src/renderer/components/Properties/PanelPropertiesForm.tsx` —
  "Crop…" button, "Reset crop" button when crop is set.
- `src/renderer/components/Grid/GridCells.tsx` — crop badge in panel
  corner.
- `src/renderer/styles.css` — modal + badge styles.

## Acceptance

- Place an image, click Crop…, drag a sub-rect, click Apply → the
  panel shows only the cropped region with the panel's fit mode
  applied to the crop.
- Re-open Crop dialog — the rectangle is loaded from the persisted
  crop. Adjust, Apply.
- Reset crop → panel goes back to showing the full image.
- Same image placed in two panels → cropping panel A doesn't affect
  panel B.
- Saved/reloaded projects preserve the crop.
- Exports honor the crop.

## Out of scope

- Promoting a crop to a new pool item ("Save as new image"). User
  asked for the original to be preserved AND the cropped version
  saved; we satisfy "preserved" via the non-destructive model, and
  the cropped version is part of the project file. A "duplicate as
  new image" action can come later.
- Non-rectangular crops.
- Crop preview that respects rotation/flip simultaneously (we always
  crop in source coords, then apply rotation; that's the convention
  most editors use).

## Depends on

Spec 05 only if you want image-bound annotations to behave correctly
across crop changes.
