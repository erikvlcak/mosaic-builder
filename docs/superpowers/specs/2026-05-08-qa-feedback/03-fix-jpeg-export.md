# 03 — Fix JPEG export (dark image)

## Problem

JPEG export produces a completely black (or near-black) image. The PNG
path renders correctly with the same figure and same scale.

## Root cause hypothesis

JPEG has no alpha channel. `OffscreenCanvas` starts fully transparent.
`drawFigure` does paint `figure.canvas.background` as the first
operation (`draw-figure.ts:67`), but the value is a `Hex` string and
the schema permits `#RRGGBBAA` — if the user picked a background with
alpha or the default is alpha-bearing, the canvas remains
partially-transparent under the figure content and the JPEG encoder
flattens that to black.

A second possibility: `ctx.scale(exportScale, exportScale)` runs before
`drawFigure` (in `renderFigureToOffscreen`), so the
`fillRect(0, 0, widthPx, heightPx)` covers the figure-px area but in
the scaled canvas; if `exportScale > 1` this should still cover the
whole bitmap, but worth verifying with one assert.

## Goal

JPEG export produces the visually-correct image at the configured
quality, with no transparent (=black) regions. Match what the user
sees in the editor.

## Design

In `renderFigureToOffscreen` (used by JPEG, TIFF, PDF), before any
figure draw and before any `ctx.scale`:

```ts
ctx.save();
ctx.fillStyle = "#FFFFFF"; // opaque flatten background
ctx.fillRect(0, 0, w, h); // canvas-px coords, pre-scale
ctx.restore();
if (exportScale !== 1) ctx.scale(exportScale, exportScale);
drawFigure(ctx, figure, images, pool);
```

Rationale:

- Painting an opaque base layer in canvas-px BEFORE `ctx.scale` is the
  bulletproof "no transparent pixels reach the encoder" guarantee.
- White is the conventional flatten color for figures going to print.
  We could expose this as a parameter later, but for the first fix
  white is the right default.
- `renderFigureToPngBlob` does **not** get this change — PNG should
  preserve alpha.

Add an explicit comment noting the JPEG/TIFF/PDF flatten requirement.

### Verification

1. Export a figure with the default settings → JPEG no longer dark.
2. Export a figure with the canvas background set to a non-white
   opaque hex → the white flatten is overwritten by the
   `figure.canvas.background` fill in `drawFigure`, so the user's
   background still wins. Verify by exporting with `#000000` and
   confirming a black output (not white).
3. Export a figure with an `#RRGGBBAA` background where alpha < 1 →
   the white flatten shows through; the user-set tint sits on top.
   This is acceptable; alpha backgrounds for JPEG are inherently
   ill-defined.

### Smoke test

Add a Vitest case that drives `renderFigureToOffscreen` with a
1x1-grid figure containing a single all-blue ImageBitmap and asserts:

- The center pixel of the resulting JPEG-encoded blob (round-tripped
  back through `createImageBitmap`) is approximately blue, not black.

If the harness can't easily decode a JPEG blob, settle for asserting
the post-`drawFigure` ImageData on the OffscreenCanvas has no zero-
alpha pixels.

## Files touched

- `src/renderer/render/export-renderer.ts` — opaque fill before scale.
- `src/renderer/render/export-renderer.test.ts` (new or extended) —
  smoke test.

## Acceptance

- JPEG export of any figure produces the same visual content as PNG,
  modulo expected JPEG compression artifacts.
- TIFF and PDF (which use the same path) also benefit; no regression.

## Out of scope

- Exposing flatten color in the export menu. Default white is fine for
  now.
- A separate "alpha matte" toggle for JPEG.

## Depends on

Nothing.
