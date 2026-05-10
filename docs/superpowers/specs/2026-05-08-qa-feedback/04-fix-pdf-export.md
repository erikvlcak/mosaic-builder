# 04 — Fix PDF export (image too small)

## Problem

The PDF export produces a page where the figure renders at a very
small physical size — much smaller than the user expects from a
"figure." Reproducible by exporting any default project to PDF.

## Root cause

In `pdf.ts:34-36`:

```ts
const wPt = (figure.canvas.widthPx / PDF_DPI) * PT_PER_INCH;
const hPt = (figure.canvas.heightPx / PDF_DPI) * PT_PER_INCH;
```

`PDF_DPI = 300`. For a typical editor canvas (e.g. 1200 × 900 figure
px), this yields `wPt = (1200/300) * 72 = 288 pt`, i.e. **4 inches**
wide. PDF readers display that physical size; on a US Letter page
worth of viewer area, the figure looks tiny.

The intent in the comment ("figure prints at that density on standard
PDF tools") is correct in principle, but `figure.canvas.widthPx` is
the **editor canvas** size — typically a few hundred to ~1200 px,
_not_ the source resolution of the underlying images. The export
already uses `exportScale` to upsample the bitmap to source-image
resolution, but the PDF page math still uses the unscaled figure-px
dimensions.

Two consequences:

- The PDF page is small (4 inches when the user wants a print-sized
  figure ~7-8 inches).
- The embedded PNG is at a much higher pixel resolution than the PDF
  page expects, so it's effectively downsampled by the viewer.

## Goal

PDF export produces a page sized for the figure's natural print size
— not its editor-canvas pixel size. The page should match the
high-resolution embedded PNG so the viewer doesn't scale it down.

## Design

Two corrections.

### 1. Page size accounts for `exportScale`

The actually-rendered PNG is `figure.canvas.widthPx * exportScale` ×
`figure.canvas.heightPx * exportScale` pixels. At PDF_DPI = 300:

```ts
const renderedWPx = figure.canvas.widthPx * exportScale;
const renderedHPx = figure.canvas.heightPx * exportScale;
const wPt = (renderedWPx / PDF_DPI) * PT_PER_INCH;
const hPt = (renderedHPx / PDF_DPI) * PT_PER_INCH;
```

This makes the page physically large enough that the embedded PNG
draws 1:1 in pixels at 300 DPI, which is the standard print density
the figure was authored for.

### 2. Choose `PDF_DPI` so the editor figure prints at a reasonable size

Even with the fix above, if `exportScale = 1` (no source images, or
all images smaller than their panel rect), the page comes out at the
editor-canvas ÷ 300 inches — still small. A 600-px-wide tray-test
figure at exportScale=1 would yield a 2-inch page.

Drop `PDF_DPI` to a more reasonable default that produces a roughly
**8-inch wide** page for the typical editor canvas:

- Compute target: most journals print figures 6.5–8 inches wide. At
  `figure.canvas.widthPx ≈ 1200`, a page of 7.5 inches needs DPI =
  1200/7.5 = 160. So PDF_DPI = 160 is a sensible default.
- This is independent of exportScale; the upscaled PNG just becomes
  higher effective DPI on the same physical page. (Exactly the
  intent in the original comment, now actually true.)

Alternative: make PDF page size configurable via the export menu (US
Letter, A4, "fit to figure," custom inches). Out of scope here; ship
the sane default first.

### 3. Verify centering / orientation

`page.drawImage(img, { x: 0, y: 0, width: wPt, height: hPt })` puts
the image at the bottom-left of the page in PDF's bottom-up
coordinate system. Since the page is sized exactly to the image,
that's fine — the image fills the page. No change needed.

## Files touched

- `src/renderer/export/pdf.ts` — apply both corrections; lower
  `PDF_DPI` default; updated comment.
- `src/renderer/export/pdf.test.ts` (new) — assert page dimensions
  match `figure.canvas.widthPx * exportScale / 160 * 72` (and same
  for height) for a representative input.

## Acceptance

- Default project (whatever `initialFigureState()` produces) exports
  to a PDF whose page is between 6 and 9 inches wide on the long
  axis when opened in a PDF reader at 100% zoom on a standard
  display.
- A figure with high-resolution source images produces a page that's
  physically the same size; the embedded PNG is just denser pixels.
- No black/dark regions (handled by spec 03).

## Out of scope

- Multi-page PDFs (one figure per page, or multiple figures per page).
  Out of scope.
- Vector PDF output (drawing the figure with PDF primitives instead
  of an embedded PNG). Out of scope; rasterized PNG-in-PDF is fine.
- Page-size picker in the export menu. Future enhancement.

## Depends on

Spec 03 should land first so the embedded PNG isn't dark.
