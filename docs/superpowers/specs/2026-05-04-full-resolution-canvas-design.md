# Full-resolution canvas — design

## Problem

The figure's pixel canvas is hardcoded at 800×600 in `src/renderer/App.tsx`
(`FIGURE_PX_W = 800`, `FIGURE_PX_H = 600`). Both the editor backing canvas
(`render/editor-renderer.ts`) and the export `OffscreenCanvas`
(`render/export-renderer.ts`) use those dims. The editor's CSS box is also
800×600, scaled to fit the viewport. Result:

- Large source TIFFs (e.g. 10000×10000) get downsampled into a panel rect
  that is at most a fraction of 800×600, so what the user sees in the grid
  is already low-resolution.
- Exporting just emits that same 800×600 backing store, so the saved file
  is unusable for any image larger than the panel rect that holds it.

## Goal

Use full source resolution end-to-end, in both the in-app preview AND the
exported file. No hard caps; the user is responsible for managing memory.

## Approach (option B/1c/2b)

Treat `figure.canvas.widthPx/heightPx` as a **derived value of the pool +
grid**, not a hardcoded constant. Recompute on every pool add. When the
canvas dims change, scale every annotation's coordinates proportionally so
on-screen positions remain stable.

### Sizing rule (1c — grid-aware)

For each axis, pick the canvas pixel size so that the *largest source
image* placed (or placeable) into a single cell maps 1:1 onto its cell rect
when fit:contain is in effect. This prevents downsampling for the
demanding case (one image per cell) and naturally accommodates merged
spans (a merged panel is *larger* than a single cell, so it has even more
pixels to work with).

Per-axis target (per *single cell*, not per merged panel — a merged panel
spans N cells so it automatically receives N× the pixels):
- `cellWidthPx ≥ max(source.width)` across the pool
- `cellHeightPx ≥ max(source.height)` across the pool

Inverting `computePanelRects`'s math:
- `widthPx  = max(MIN_CANVAS_W, cols * maxImgW + (cols + 1) * gutterPx)`
- `heightPx = max(MIN_CANVAS_H, rows * maxImgH + (rows + 1) * gutterPx)`

`MIN_CANVAS_W/H` are the existing 800×600 (the "empty figure" baseline so
the grid still has a usable size before any image is added).

We treat width and height independently rather than locking an aspect
ratio. The user picked 1c, which means: panels naturally match their
source aspect when one image per cell, with no global aspect lock. Mixed
aspect ratios across the pool are handled by taking the per-axis max
across all images — which gives every image at least the resolution it
needs in either axis. That over-provisions for some images, but never
under-provisions. Memory cost scales with the largest image; that's the
tradeoff the user accepted.

### Recompute trigger (2b — recompute on every pool change)

Recompute the canvas dims whenever the pool grows. Specifically:
- After `ADD_TO_POOL` (image added)
- After `REMOVE_FROM_POOL` (image removed; canvas may shrink)
- After `RESIZE_GRID` (rows/cols changed)
- After `SET_GUTTER_PX` (gutter changed)

When the dims change from `(W₀, H₀)` to `(W₁, H₁)`, scale all annotation
coordinates by `sx = W₁/W₀, sy = H₁/H₀`:
- text: `x *= sx; y *= sy`
- arrow: `x1, x2 *= sx; y1, y2 *= sy`
- box: `x, w *= sx; y, h *= sy`
- scalebar: no positional coordinates (corner-anchored), no scaling
- letter: derived, not stored — no scaling

Stroke widths, font sizes (in pt), and bar lengths (in real-world units)
are intentionally left unchanged — they are not "figure-coordinate"
values. Visually they will appear smaller relative to the larger canvas;
this matches what the user expects ("everything got bigger because the
canvas got bigger").

### Where the dims live

Move `widthPx/heightPx` out of the `App.tsx` constants and into derived
state computed from the `pool + rows + cols + gutterPx`. The simplest
landing spot is a memoized derivation in `App.tsx`:

```ts
const canvasDims = useMemo(
  () => computeCanvasDims(state.pool, state.rows, state.cols, state.gutterPx),
  [state.pool, state.rows, state.cols, state.gutterPx],
);
```

Pass `canvasDims` everywhere `FIGURE_PX_W/FIGURE_PX_H` are passed today:
- `deriveFigure(state, { canvas: { ...canvasDims, background: CANVAS_BG } })`
- `toMosaicFile({ ..., canvas: { ...canvasDims, background: CANVAS_BG }, ... })`
- `<GridCells figurePxW={canvasDims.widthPx} figurePxH={canvasDims.heightPx} ... />`
- `<PanelInteractionLayer figurePxW=... figurePxH=... />`
- `<AnnotationInteractionLayer figurePxW=... figurePxH=... />`

The CSS box stays at the existing 800×600 (`CANVAS_CSS_W/H`). The canvas
backing store grows; CSS scales it down to fit. This is exactly how the
existing `width: 100%; height: 100%` styling on the editor canvas already
behaves (`components/Canvas/EditorCanvas.tsx`).

### Annotation rescaling

This needs to happen as part of the same state transition that resizes
the canvas, otherwise we get a one-frame visual jump. Two options:

- **(a) In the reducer.** When `ADD_TO_POOL`/`REMOVE_FROM_POOL`/`RESIZE_GRID`/
  `SET_GUTTER_PX` fire, the reducer computes the new dims and scales
  annotations atomically. Requires the reducer to know about canvas
  dimensions, which it doesn't today.
- **(b) Derive everything outside the reducer.** Don't store annotations
  in figure-pixel units; store them in normalized [0,1] coordinates and
  scale at draw time. Bigger refactor.

Recommend (a). The reducer is already the right place to enforce
invariants like "panels partition the grid"; "annotations stay anchored
when canvas dims change" is the same kind of invariant. Implementation:
add `canvas: { widthPx; heightPx }` to `FigureState` (initialized to
`MIN_CANVAS_W/H`), recompute in the four affected actions, scale
annotations in the same action.

### Loading saved projects

`fromMosaicFile()` already returns `canvas: { widthPx, heightPx, background }`.
`applyLoadedProject()` currently throws this away (`dispatch(resetToState(r.state))`
ignores `r.canvas`). Fix: include the canvas in `FigureState` (per the
previous bullet), so `r.state.canvas` round-trips natively. Old saves at
800×600 will load at 800×600 — that's fine.

When loading, if the saved canvas dims are smaller than what the current
sizing rule would compute (e.g. the user opens an old 800×600 project),
do NOT auto-grow on load. Only grow on the next `ADD_TO_POOL`/etc.
Otherwise we'd retroactively shift annotations on every project open.

If a saved file has `canvas.widthPx`/`heightPx` missing or zero (no such
files exist today — the schema requires positive ints — but defensive),
fall back to `MIN_CANVAS_W/H`. The schema validator in
`src/renderer/model/schema.ts` already rejects non-positive ints, so this
fallback is belt-and-braces only.

### Performance / safety notes

- A 10000×10000 RGBA backing canvas is ~400 MB (4 bytes/pixel × 1e8 px).
  Two of them (editor + export OffscreenCanvas at export time) is ~800 MB.
  This is the tradeoff the user explicitly accepted. No clamps are added.
- `OffscreenCanvas.convertToBlob({ type: "image/png" })` works at this
  size in modern Chromium; PNG encoding is the slow path but bounded.
  No code change needed.
- The HTML editor canvas backing store can in principle hit Chromium's
  per-canvas pixel cap (~268M pixels), at which point the canvas silently
  fails to allocate and draws blank. We do not handle this — per the
  user's "no restrictions" stance.

## Out of scope

- Independent editor vs. export resolution (option C) — explicitly rejected.
- Memory-aware downscaling / warning UI — out of scope; can be added later.
- Manual canvas-dimension UI — out of scope; the dims become a derived
  value of the pool. Could be exposed later as a "lock canvas size" toggle.
- Stroke-width / font-size auto-scaling on canvas growth — left alone on
  purpose; these are visual-pt values, not figure-px values.

## Files touched

1. `src/renderer/model/figure-state.ts`
   Add `canvas: { widthPx; heightPx }` field. Update `initialFigureState()`
   to initialize at `MIN_CANVAS_W/H` (800×600).

2. `src/renderer/model/figure-actions.ts`
   - New helper `computeCanvasDims(pool, rows, cols, gutterPx)` (per-axis
     formula above).
   - New helper `scaleAnnotations(annotations, sx, sy)`.
   - In `ADD_TO_POOL`, `REMOVE_FROM_POOL`, `RESIZE_GRID`, `SET_GUTTER_PX`:
     recompute canvas dims; if changed, scale annotations.

3. `src/renderer/App.tsx`
   - Remove `FIGURE_PX_W`/`FIGURE_PX_H` constants.
   - Pass `state.canvas.widthPx/heightPx` everywhere those constants flowed.
   - `CANVAS_CSS_W/H` stay at 800×600.

4. `src/renderer/state/load-project.ts`
   No change to the function signature, but the dispatched `resetToState`
   now carries `canvas` natively (since it's part of `FigureState`). The
   loader-side `r.canvas` becomes redundant; we can keep returning it for
   any callers that want it, or remove it from `FromMosaicResult` —
   prefer remove for tidiness.

5. `src/renderer/model/serialize.ts`
   - `toMosaicFile` reads `inp.state.canvas` instead of `inp.canvas`.
   - `fromMosaicFile` puts `file.canvas` onto the returned state.

6. Tests:
   - New unit tests for `computeCanvasDims` (empty pool → min; one image
     larger than min → grows; multiple images → max per axis; merged
     panels don't change the rule because cell math is per-cell).
   - New unit tests for the annotation-scaling branch of the four
     reducer actions.
   - Update existing tests that assert on 800×600 canvas dims (search:
     `widthPx: 800` and `heightPx: 600` in `test/`). Most app-level tests
     pass an explicit canvas, so they should be unaffected; reducer tests
     that exercise pool/grid changes will need to assert the new
     `state.canvas` shape.
   - Snapshot/integration test: add a TIFF whose source size > 800×600
     and confirm the rendered backing-store size matches the source dims
     (within gutter math).

## Acceptance criteria

- Adding a 4000×3000 image to a 1×1 grid causes
  `state.canvas.widthPx ≥ 4000` and `state.canvas.heightPx ≥ 3000`.
- The editor canvas's backing-store `width`/`height` match
  `state.canvas.widthPx`/`heightPx`. The CSS box stays 800×600.
- Exporting PNG with that 4000×3000 image produces a PNG whose dims match
  `state.canvas` (≥ 4000 × ≥ 3000), and the panel pixels in that PNG are
  not blurry / not downsampled relative to the source.
- An annotation placed at figure-px (100, 100) on the empty 800×600
  canvas appears at the *same on-screen position* after a 4000×3000
  image is added — i.e. its stored coordinates have been scaled to
  (500, 500) ish so that under CSS-fit-to-800×600 it lands in the same
  spot.
- Saving and reloading the project preserves `state.canvas`. The reloaded
  figure renders identically.
- Removing the largest image from the pool shrinks the canvas back down.
  Annotations rescale back proportionally.
