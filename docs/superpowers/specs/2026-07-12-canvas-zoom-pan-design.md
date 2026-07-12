# Canvas zoom & pan — design

> **Status (2026-07-12).** Design approved; implementation pending.
>
> This spec deliberately **lifts** the "no canvas zoom / fixed 800×600 editor"
> constraint from the UI/UX refresh spec
> (`2026-07-11-ui-ux-refresh-design.md`). Treat that lift as an explicit,
> approved decision — not a regression. It also completes the **editor half**
> of the full-resolution work that
> `2026-05-04-full-resolution-canvas-design.md` intentionally deferred (only
> the export half shipped). Zoom is what now justifies rendering the editor
> at full source resolution.

## Problem

The app promises "pixel-WYSIWYG between the editor and exports" (CLAUDE.md),
but the editor previews the figure into a fixed **800×600** backing store
while **exports already run at full source resolution** via `computeExportScale`
(`render/export-scale.ts`). So a researcher assembling a publication figure:

- makes alignment / scale-bar / crop decisions from a **lower-resolution
  preview** than the file they ship, and
- **cannot zoom in** to verify a band edge, a scale bar sitting exactly on a
  feature, or a sub-pixel panel seam.

This is the single biggest fidelity gap for the target user (scientists
assembling publication figures).

## Goal

Add **canvas zoom + pan** to the editor such that:

- **Fit-to-window** is the default view (matches today's behavior).
- **Zoom-to-100%** means **1 source pixel = 1 screen pixel** — true
  source-resolution inspection, not a magnified downsample.
- Zoom in / out, an exact-% readout, and keyboard shortcuts are available.
- **Pan** works when the figure exceeds the viewport.
- Zoom/pan is a **view transform only**: session-only UI state, never in
  `FigureState`, never serialized, never undoable.
- **Exports are provably unaffected** by editor zoom.

## The key insight

The zoom seam already exists. Every interaction layer
(`AnnotationInteractionLayer`, `PanelInteractionLayer`, `GridCells`) already
takes `cssW/cssH` **and** `figurePxW/figurePxH` as **separate** props and
converts pointer coordinates via `getBoundingClientRect()` + the ratio
`figurePxW / cssW` (see `AnnotationInteractionLayer.tsx` ~line 16:
"In M6 these are equal so the factor is 1.0, but the math is written
generally"). Today `App.tsx` forces `CANVAS_CSS_W/H = FIGURE_PX_W/H = 800/600`.

**Zoom = decoupling them.** Keep the model figure-px space fixed at 800×600;
make the CSS box a zoomable multiple; render the editor backing store at full
source resolution. The existing ratio math does the coordinate conversion
unchanged — a click at a fixed screen point maps to the same model figure-px
at any zoom because `getBoundingClientRect()` reports the scaled CSS box and
the ratio self-corrects. The plumbing is there; the constraint was a choice.

## Architecture — the three-resolution model

The design cleanly separates three resolutions that are conflated today:

| Resolution | What it is | Today | After |
| --- | --- | --- | --- |
| **Model figure-px** | Coordinate space of `FigureState` (annotations, panel transforms, gutter) and `.mosaic` files | 800×600 | **800×600 — UNCHANGED** |
| **Editor backing store** | Pixels the editor `<canvas>` actually rasterizes | 800×600 × dpr | **`computeCanvasDims(pool,…)` × dpr**, capped at source-100% |
| **CSS view size** | On-screen size of the canvas box — the zoom multiple | 800×600 (fixed = "fit") | **`800 × viewZoom` × `600 × viewZoom`** (variable) |

**The safety property.** The model figure-px space **never changes**.
`deriveFigure` keeps receiving `{ widthPx: 800, heightPx: 600 }`. `FigureState`,
`.mosaic` bytes, and `computeExportScale` all operate on that frozen 800×600
space. Zoom lives entirely in the *editor backing store* and *CSS view*
layers — pure rendering/view concerns that physically cannot reach the model.
This is what guarantees the "zero FigureState changes" and "byte-identical
exports" acceptance criteria: the view layer has no path to the model.

### Data flow

```
                     pool + grid + gutter
                             │
             computeCanvasDims() ──► editorBackingDims (full-res; SHARED with export math)
                             │
FigureState ─ deriveFigure(canvas: 800×600) ─► Figure (model-space, frozen)
                             │
   drawFigure(ctx scaled by editorScale·dpr)  ──► crisp full-res pixels in the backing store
                             │
  viewZoom (session UI state) ─► CSS box = 800·viewZoom × 600·viewZoom
                             │
     getBoundingClientRect() + figurePxW(800)/cssW  ──► pointer → model-px (self-correcting)
```

Because the editor renders the **same 800×600 model figure** into a **larger
backing store**, and every layer already maps pointers through
`figurePxW(=800) / cssW`, the coordinate math needs **no changes** — only
`cssW/cssH` become variable (`= 800·viewZoom`).

## Components & state

### Session-only UI state (`App.tsx`)

Mirrors `panelInteraction` / `selectedThumbId` — never in `FigureState`, never
serialized, never undoable:

```ts
type ViewTransform = { zoom: number; mode: "fit" | "free" };
const [view, setView] = useState<ViewTransform>({ zoom: 1, mode: "fit" });
```

- `mode: "fit"` — default; `zoom` is **derived** to fit the canvas in its
  container (re-derived on container resize via `ResizeObserver`). Preserves
  today's behavior exactly.
- `mode: "free"` — an explicit level the user set (buttons, wheel, % entry);
  `zoom` is authoritative.
- `zoom` is the **model→CSS** multiple: `zoom = 1` ⇒ 1 model-px = 1 CSS-px.
  Define `sourceScale = editorBackingDims.widthPx / 800` (identical to the
  export scale; `= 1` when the pool holds no image larger than the 800×600
  baseline). The UI's **"100%"** means **1 source-px = 1 screen-px**, which is
  `zoom = sourceScale`. The % readout is therefore `displayPct =
  round(100 · zoom / sourceScale)`, and the inverse (typing a %) is
  `zoom = (pct / 100) · sourceScale`.
- **Clamp units.** `ZOOM_MIN`/`ZOOM_MAX` are expressed in **display-%** terms
  (10%–800% of source-100%), so `clampViewZoom` clamps `zoom` to
  `[ZOOM_MIN · sourceScale, ZOOM_MAX · sourceScale]`. `sourceScale` is a
  parameter to the clamp, not a constant, because it depends on the pool.

### New pure module — `render/view-transform.ts`

The testable heart. No React, no DOM. Unit-tested first (TDD).

```ts
export const ZOOM_MIN = 0.1;   // 10% of source-100% (display-% terms)
export const ZOOM_MAX = 8;     // 800% of source-100% (display-% terms)

// Clamps the model→CSS `zoom`. Bounds depend on `sourceScale` because the
// display-% (which the user sees) is `zoom / sourceScale`.
export function clampViewZoom(zoom: number, sourceScale: number): number;
export function fitZoom(
  containerW: number, containerH: number,
  cssBaseW: number, cssBaseH: number,
): number;
export function zoomToCssSize(
  zoom: number, modelW: number, modelH: number,
): { cssW: number; cssH: number };

// Cursor-anchored zoom: given the container's pre-zoom scroll offset, the
// cursor position, and the old/new css sizes, return the scrollLeft/scrollTop
// that keeps the model point under the cursor fixed.
export function scrollForCursorZoom(args: {
  cursorX: number; cursorY: number;          // relative to the scroll container
  oldScrollLeft: number; oldScrollTop: number;
  oldCssW: number; oldCssH: number;
  newCssW: number; newCssH: number;
}): { scrollLeft: number; scrollTop: number };
```

Naming mirrors `render/coords.ts`'s existing per-panel `panForCursorZoom` so
the codebase idiom is consistent. (Named `scrollForCursorZoom` here to
distinguish "adjust the scroll container" from the per-panel "adjust the pan
transform".)

### New component — `components/Toolbar/ZoomControls.tsx`

Presentational cluster in the tool-ribbon: **Fit**, **100%**, **−**, **+**,
and an editable **% readout** (click to type an exact %). Props: `view`,
`sourceScale`, and callbacks (`onFit`, `onActualSize`, `onZoomIn`,
`onZoomOut`, `onSetPercent`). No business logic.

### New hook — `hooks/useCanvasZoom.ts`

Owns the imperative browser wiring:

- A `ResizeObserver` on the scroll container that re-derives `fitZoom` while
  `mode === "fit"`.
- A `wheel` listener bound `{ passive: false }` on the scroll container.
  **Plain wheel → cursor-anchored canvas zoom** (`e.preventDefault()`) — no
  modifier, matching the "scroll to zoom the whole canvas" mental model
  (Google-Maps/Miro idiom). The routing to *image* zoom is driven by
  **`spacebarHeld`** (see Interaction design): the panel's own wheel listener
  is gated to only consume the event while space is held; otherwise it lets
  the event bubble and the container's canvas-zoom listener begins with
  `if (e.defaultPrevented) return;`. So default wheel zooms the canvas
  everywhere (even over an active panel); space+wheel over an active panel
  zooms that image.
- A **drag-to-pan-view** pointer handler on the scroll container (new — see
  Pan). Press-drag translates `scrollLeft/scrollTop`. Gated to *not* run while
  `spacebarHeld` (space redirects the drag to the active image's pan).
- The cursor-anchored scroll adjustment (via `scrollForCursorZoom`).

Reads `spacebarHeld` (lifted in `App.tsx`) so its wheel/drag handlers know
whether the gesture targets the canvas (default) or the active image (space).

Returns `{ view, cssW, cssH, sourceScale, setPercent, zoomIn, zoomOut, fit,
actualSize }`.

### Editor renderer change — `render/editor-renderer.ts`

`paint()` currently sizes the backing store to `figure.canvas.widthPx × dpr`
(= 800×dpr) and imperatively sets `canvas.style.width/height`. It gains an
**`editorScale`** input — exactly the `M5` hook the file's own comment already
anticipates ("No editorScale yet — that lands in M5", line 16):

- Backing store: `round(figure.canvas.widthPx · editorScale · dpr)` ×
  `round(figure.canvas.heightPx · editorScale · dpr)`.
- Single transform: `ctx.setTransform(editorScale·dpr, 0, 0, editorScale·dpr, 0, 0)`
  so `drawFigure` still paints in the 800×600 model coordinate system and
  **never learns about zoom**.
- The renderer **stops** writing `canvas.style.width/height`; the CSS size is
  now owned by the wrapper `<div>`'s inline style (driven by `view`).

`editorScale` is plumbed through `EditorRenderer.setFigure` (or a new
`setEditorScale`) and `EditorCanvas`'s props.

### `App.tsx` wiring

- Replace the `CANVAS_CSS_W/H = 800/600` constants with `view`-derived
  `cssW/cssH` from `useCanvasZoom`.
- The wrapper `<div>` (App.tsx ~line 941) gets `width: cssW, height: cssH`.
- `figurePxW/figurePxH` passed to `GridCells` / `PanelInteractionLayer` /
  `AnnotationInteractionLayer` **stay** `800/600` (`FIGURE_PX_W/H`).
- `editorScale = sourceScale` (capped — see Memory) is passed to
  `EditorCanvas`.
- Reset `view` to `{ zoom: 1, mode: "fit" }` in `onNew` / `onOpenProject`
  (alongside the existing `setPanelInteraction(null)` resets), because `view`
  is session UI state that `RESET_TO_STATE` does not touch.
- Pass `spacebarHeld` to `useCanvasZoom` and `PanelInteractionLayer`; retarget
  temporary-select from space to Cmd/Ctrl-hold (see Interaction design).

**The coordinate-plumbing change is minimal** — the ratio math inside every
interaction layer is already correct; only `cssW/cssH` become variable and
the panel layer gains a `spacebarHeld` gate.

## Interaction design (the gesture model)

One consistent rule governs the whole canvas:

> **Default gestures operate on the canvas/view. Hold Space to redirect the
> same gestures to the active (double-clicked) image.**

This is deliberately the **inverse** of a modifier-to-zoom-canvas scheme: the
common case (navigate the whole figure) needs no key, and stepping into an
image's own pan/zoom is the explicit, held-key action.

### The gesture table

| Context | Gesture | Effect |
| --- | --- | --- |
| Anywhere on canvas | plain wheel | **Zoom the canvas** (cursor-anchored) |
| Anywhere on canvas | press-drag | **Pan the view** |
| Anywhere on canvas | scrollbars / two-finger trackpad drag | **Pan the view** |
| Panel in editing mode + **hold Space** | plain wheel | **Zoom the active image** in its frame |
| Panel in editing mode + **hold Space** | press-drag | **Pan the active image** in its frame |
| Creation tool active + **hold Cmd/Ctrl** | (temporary) | **Switch to Select** |
| unchanged | Shift-click | merge-cell toggle / anno multi-select / snap-disable |

### Space = "operate on the active image"

Today `spacebarHeld` drives temporary-select. It is **repurposed** to mean
"redirect canvas gestures to the active image":

- **Default (no space):** wheel zooms the canvas; press-drag pans the view —
  **even when the cursor is over an active (editing) panel.** To make this
  true, `PanelInteractionLayer`'s own wheel/pointer handlers are **gated on
  `spacebarHeld`**: without space, the panel layer does not `preventDefault`
  the wheel and does not `setPointerCapture` the drag, so both bubble to the
  canvas-level handlers.
- **Space held (over an active panel):** wheel zooms *that image*; press-drag
  pans *that image* — today's `PanelInteractionLayer` behavior, now
  space-gated. The `SELECT MODE` chip logic that keyed off `spacebarHeld` is
  removed (temporary-select moves to Cmd/Ctrl, below).

`spacebarHeld` stays lifted in `App.tsx` (its keydown/keyup/blur effect is
unchanged) and is passed to both `useCanvasZoom` and `PanelInteractionLayer`.

### Temporary-select → Cmd/Ctrl-hold

Temporary-select (switch to Select while a creation tool is active, so you can
click a panel without placing an annotation) moves from **space** to
**Cmd/Ctrl-hold** — the Illustrator/Figma convention. `effectiveTool` becomes
`(cmdOrCtrlHeld && activeTool !== "select") ? "select" : activeTool`. This has
**no collision**: Shift is already taken (merge/multi-select/snap), and the
Cmd/Ctrl **zoom shortcuts are `Cmd`+*key* presses**, not Cmd-hold-then-click,
so a held Cmd with no key-press unambiguously means temporary-select. The
`SELECT MODE (release …)` chip updates to say `⌘`/`Ctrl` instead of `␣`.

### Drag-to-pan-view (new handler)

Default press-drag must pan the *view*, which today has no handler — the
`overflow: auto` container only pans via scrollbars/trackpad. Add a pointer
drag handler (in `useCanvasZoom`, on the scroll container) that, on
`pointerdown`+drag (not while `spacebarHeld`), sets
`scrollLeft -= dx; scrollTop -= dy`. Because `PanelInteractionLayer` no longer
captures the pointer without space, a drag that starts over an active panel
bubbles to this handler and pans the view. Cursor shows `grab`/`grabbing`.

### Controls & keyboard shortcuts

Toolbar cluster (`ZoomControls`): **Fit**, **100%**, **−**, **+**, editable
**% readout**.

Keyboard (added to `hooks/useKeyboardShortcuts.ts` — must **not** collide with
the existing `M/U/R/H/V/0`, `Delete/Backspace`, `Escape`, `Cmd/Ctrl-Z/Shift-Z`
bindings, which are all non-modified except undo/redo):

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl` + `=` (`+`) | Zoom in |
| `Cmd/Ctrl` + `-` | Zoom out |
| `Cmd/Ctrl` + `0` | **Fit** to window |
| `Cmd/Ctrl` + `1` | **100%** (actual source pixels) |

These require a modifier, so they slot in beside the existing
`Cmd/Ctrl-Z` branch (which already runs before the "no modifier" guard) and
don't touch the bare-key `0` = reset-transform binding.

## Correctness traps & edge cases

### Trap A — DPR × editorScale stacking

The backing store now has **two** independent multipliers: `editorScale`
(full-res, from the pool) and `dpr` (Retina). Both must be applied to the
backing-store dimensions **and** composed into the single
`ctx.setTransform(editorScale·dpr, …)`, so `drawFigure` receives a plain
800×600 model coordinate system. Text stays crisp because glyphs rasterize at
`editorScale·dpr` device pixels. The CSS box size is **independent** of both
(`= 800·viewZoom`); the browser down/up-samples the backing store to the CSS
size — a cheap GPU blit — and that blit **is** the zoom scaling.

### Trap B — holes / marquee math in cssW/cssH space

`decomposeIntoHoles` / `carveBackdropStrips` / the marquee all compute in
`cssW × cssH`. They derive from `panelRect · (cssW / figurePxW)`, so when
`cssW = 800·viewZoom` every term scales together and the geometry stays
self-consistent. **Test obligation:** prove a marquee drag and an annotation
drop land on the same model-px at `viewZoom ≠ 1` as at `viewZoom = 1`
(acceptance #2).

### Cursor-anchored zoom + native scroll

On wheel zoom: compute the model-px under the cursor **before** resizing
the CSS box, then set `scrollLeft/scrollTop` on the `overflow: auto` container
so that same model-px stays under the cursor after. Implemented in
`scrollForCursorZoom` (pure, unit-tested).

### Trap C — `PanelInteractionLayer` must yield the gesture without space

Today the panel layer unconditionally `preventDefault`s the wheel and
`setPointerCapture`s the drag. For default gestures to reach the canvas, the
panel layer's wheel and pointer handlers must **early-return when
`spacebarHeld` is false** (so the wheel bubbles un-prevented and the pointer
is never captured). Care: `setPointerCapture` on pointerdown is the point of
no return — the gate must be checked *before* capture. The panel's pan-drag
math (`figurePxW / cssW`) already self-corrects for canvas zoom, so no change
is needed there beyond the space gate. **Test obligation:** without space, a
drag starting over an active panel pans the *view*; with space, it pans the
*image* (Trap C test below).

### Image-pan delta scales with canvas zoom (no change needed)

When space-panning an active image while the canvas is zoomed, the drag delta
is `(clientΔ) · (figurePxW / cssW)`. As `cssW = 800·viewZoom` grows, the same
screen movement yields a *smaller* figure-space delta — which is correct: at
high canvas zoom one screen-pixel is a smaller fraction of the figure. The
existing ratio already handles this; it is called out only so the plan does
not "fix" it.

### Edge cases

- **Fit mode + container resize** → `ResizeObserver` re-derives `fitZoom`.
  Any explicit zoom switches `mode` to `"free"`; clicking **Fit** returns to
  derived.
- **Empty figure / only small images** → `computeCanvasDims` returns
  `MIN_CANVAS` (800×600) ⇒ `sourceScale = 1` ⇒ 100% == fit. Cheap.
- **Zoom clamp** → `[10%, 800%]` of source-100% (`ZOOM_MIN/MAX`).
- **Load / New** → reset `view` to `{ zoom: 1, mode: "fit" }`.

## Memory

The editor backing store is now `editorScale·dpr` larger and is **persistent**
(unlike the transient export `OffscreenCanvas`). A 4000×3000 figure at dpr 2 ≈
96 MB resident. The full-resolution export spec already accepted "no clamps;
the user manages memory," and we match that stance for consistency — with one
guard the export path does not need:

- **Cap the backing-store multiplier at source-100%.** Never rasterize the
  backing store larger than `computeCanvasDims` (i.e. `editorScale =
  sourceScale`, not more). Zooming **past** 100% just CSS-upscales the
  backing store, which is correct — beyond source-100% there is no additional
  detail to reveal. This bounds resident memory at exactly "full source
  resolution," never above it, regardless of how far the user zooms in.

The Chromium ~268M-px per-canvas cap is a known, **unhandled** limit (mirrors
the export spec's stance). Beyond it the canvas silently fails to allocate;
we do not clamp it, consistent with the "no restrictions" decision.

## Testing plan (TDD, per repo convention)

Written test-first; each increment lands green
(`pnpm typecheck && pnpm test && pnpm lint`).

1. **`test/unit/view-transform.test.ts`** — `clampViewZoom`, `fitZoom`,
   `zoomToCssSize`, `scrollForCursorZoom` (pure, no DOM). *First.*
2. **Editor-renderer recorder test** — backing-store dims =
   `round(800·editorScale·dpr)`; the ctx transform composes `editorScale·dpr`;
   `drawFigure` receives **identical** model-space calls regardless of
   `editorScale` (proves zoom does not leak into the model).
3. **Export-invariance test (acceptance #4)** — via the offscreen recorder,
   render an export at `view` = fit and at `view.zoom = 4·source`; assert
   **byte-identical** recorder output. Proves the view cannot reach exports.
4. **Coordinate-invariance test (acceptance #2)** — testing-library/jsdom:
   the same client point resolves to the same model-px at zoom 1 and zoom 4
   for annotation placement **and** a marquee drag.
5. **No-dirty test (acceptance #3)** — zoom/pan produces no `FigureState`
   reference change, no dirty flag; the `.mosaic` round-trips identical bytes.
6. **Gesture-routing test (space model)** — over a panel in **editing** mode:
   plain wheel zooms the **canvas** (`view.zoom` changes, panel transform
   does not); **space+wheel** zooms the **image** (panel transform changes,
   `view.zoom` does not). Likewise plain press-drag pans the **view**
   (`scrollLeft/Top` change) while **space+drag** pans the **image** (panel
   `panX/panY` change). Asserts Trap C's space-gating.
7. **Temporary-select-on-Cmd test** — with a creation tool active, holding
   Cmd/Ctrl yields `effectiveTool === "select"`; releasing returns to the
   tool. Holding **space** does **not** trigger temporary-select anymore.
8. **Visual check in the running Electron app** — `playwright-core`
   `_electron.launch`, stub `dialog.showOpenDialog` →
   `resources/fixtures/sample.png`, screenshot **fit / 100% / panned** states.

## Acceptance criteria

- Zoom-to-100% on a figure holding a 4000×3000 source image shows
  **source-resolution** detail in-panel (not the 800×600 downsample).
- A pointer click at a fixed screen location resolves to the **same model
  figure-px** at every zoom level — annotation placement, drag-to-swap, and
  scale-bar placement all correct when zoomed.
- Zooming/panning produces **zero `FigureState` changes**: no undo entries, no
  dirty flag; the project round-trips to the same `.mosaic` bytes.
- An export at **any** editor zoom produces **byte-identical** output to the
  same export at fit-to-window (recorder/offscreen test proves it).
- Fit-to-window is the default view and matches today's behavior.

## Files touched

**New**

1. `src/renderer/render/view-transform.ts` — pure zoom/fit/scroll math.
2. `src/renderer/hooks/useCanvasZoom.ts` — `ResizeObserver`, space-gated
   plain-wheel canvas-zoom listener, drag-to-pan-view pointer handler,
   cursor-anchored scroll. Reads `spacebarHeld`.
3. `src/renderer/components/Toolbar/ZoomControls.tsx` — presentational
   controls.
4. `test/unit/view-transform.test.ts` and additions to renderer / app tests
   (see Testing plan).

**Modified**

5. `src/renderer/render/editor-renderer.ts` — accept `editorScale`; grow
   backing store; compose `editorScale·dpr` transform; stop setting
   `canvas.style` size.
6. `src/renderer/components/Canvas/EditorCanvas.tsx` — plumb `editorScale`.
7. `src/renderer/components/Grid/PanelInteractionLayer.tsx` — accept a
   `spacebarHeld` prop; **early-return** from the wheel listener and from
   `onPointerDown` (before `setPointerCapture`) when space is not held, so the
   default gesture bubbles to the canvas handlers. Pan-drag math unchanged.
8. `src/renderer/App.tsx` — `view` state via `useCanvasZoom`; wrapper `<div>`
   sized to `cssW/cssH`; pass `cssW/cssH` (variable) and `editorScale` down;
   keep `figurePxW/figurePxH` = 800/600; reset `view` on New/Open; mount
   `ZoomControls`; pass `spacebarHeld` to `useCanvasZoom` and
   `PanelInteractionLayer`; change `effectiveTool` to gate temporary-select on
   Cmd/Ctrl-hold instead of space; update the `SELECT MODE` chip label +
   trigger.
9. `src/renderer/hooks/useKeyboardShortcuts.ts` — add `Cmd/Ctrl` +
   `=`/`-`/`0`/`1` (guarded so they don't collide with existing bindings).

## Out of scope

- **Zoom-to-selected-panel** — nice fast-follow; not in this pass.
- **Any change to the model figure-px space, `.mosaic` schema, or export
  pipeline** — explicitly none; that is the design's safety property.
- **The per-panel pan/zoom *math*** — unchanged; only its *trigger* changes
  (now space-gated) and it now composes with canvas zoom via the existing
  `cssW` ratio.
