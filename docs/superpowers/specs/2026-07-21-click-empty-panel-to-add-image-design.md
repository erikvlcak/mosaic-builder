# Click an empty panel to add an image — design (2026-07-21)

Today the only ways to get an image into a panel are: import via the tray's
**Add images…** button and then drag a thumbnail onto a panel, or arm a
thumbnail and click a panel. Both require the pool to be populated first.
A first-time user faces an empty grid whose only guidance is the canvas
caption "Drag an image here" — with nothing in the tray to drag.

This spec adds a direct path: **click the centre of an empty panel → native
file picker → the chosen image lands in that panel and in the tray.**

## Goals

- Clicking an empty panel's centre opens the OS file picker.
- Images picked this way join the pool (side tray) exactly like any image
  imported via **Add images…** — same `ImagePoolItem`, same decode path,
  same thumbnail.
- The empty-panel caption states both affordances.
- Do not regress: click-to-select on empty panels, drag-to-pan on empty
  panels, drop targeting, armed-thumbnail click-to-place, annotation
  placement tools.

## Non-goals

- No new IPC. `window.api.openImages()` already returns exactly what is
  needed (`{canceled} | {canceled:false, files:[{filePath,bytes,mime}]}`).
- No change to the drag-and-drop pipeline (`dnd/`).
- No change to occupied-panel behavior.
- No wrap-around when filling forward (see §4).

---

## Context: why a plain `<button>` does not work

In select mode the annotation layer (`AnnotationInteractionLayer`, `zIndex:
3`) mounts a backdrop with `pointerEvents: auto` that covers empty panels
and gutters. `GridCells` sits underneath. Empty-panel clicks reach
`onPanelClick` only because the backdrop's pointer-up handler explicitly
**forwards** them (`panelAt(panelRectsById, endFx, endFy)`), after
discriminating click from drag at `CLICK_DRAG_MIN_PX = 4`.

The layer already solves the "let something underneath be clickable"
problem for occupied panels: `carveBackdropStrips(cssW, cssH, holes)`
decomposes the backdrop into strips that tile around a set of holes, so
HTML5 `dragstart` on a `<div draggable>` panel reaches `GridCells`. The
browse target uses the same mechanism — it must be a **hole**, not merely a
div rendered underneath.

## 1. Geometry — `browseZoneRect`

New pure function in `render/coords.ts`, alongside the other layout math:

```ts
export function browseZoneRect(rect: PanelRect): PanelRect;
```

Returns a box centred in `rect`, sized **70% of the panel width** (capped
at 280 figure-px) × **60% of the panel height** (capped at 120 figure-px).

- Percentage-based, so the target scales with panel size.
- Capped, so a full-bleed single panel still leaves a wide border for
  click-to-select and drag-to-pan.
- Purely geometric — no coupling to canvas text metrics, so caption
  wording can change without touching hit geometry.

```
┌────────────────────────────┐
│  ← click = select          │
│    ┌──────────────────┐    │    drag = pan viewport
│    │        A         │    │
│    │  Drag an image   │    │  ← browse zone
│    │  here or click…  │    │    hover: tint + ring, cursor pointer
│    └──────────────────┘    │
└────────────────────────────┘
```

Consumed by `GridCells` (renders it) and `AnnotationInteractionLayer`
(carves it). One definition, no drift.

## 2. Hit routing

**`GridCells`** — for every panel that is empty (`imageId === undefined`)
and not hidden, render a transparent button inside the panel div:

```tsx
<button
  type="button"
  className="panel-browse-zone"
  data-interactive="browse"
  data-testid={`browse-zone-${panel.row}-${panel.col}`}
  aria-label={`Add image to panel at row ${panel.row + 1}, column ${panel.col + 1}`}
  onClick={(e) => {
    e.stopPropagation();
    onPanelBrowseClick(panel.id);
  }}
  style={/* browseZoneRect(r) scaled by sx/sy, positioned absolute */}
/>
```

`Panel` (`model/panels.ts`) carries no letter — the A/B/C label is
synthesised later by `deriveFigure` — so the accessible name is built from
the 1-based grid position instead.

Being a real `<button>` gives hover, `:focus-visible`, `cursor: pointer`,
and Tab/Enter activation from CSS and the platform rather than from
bespoke pointer code. Styling lives in `styles.css` next to the existing
`.grid-panel-crop-badge` / `.grid-hole-glyph` chrome rules, using theme
tokens so it works in both themes.

`data-interactive="browse"` is required — `useViewportGestures` starts a
background pan only on targets without that attribute.

**`AnnotationInteractionLayer`** — extend the backdrop `holes` list with
`browseZoneRect` for each empty, non-hidden panel, converted to CSS px by
the same conversion the occupied-panel holes already use. Without this the
button never receives a click in select mode.

**Drag-and-drop is unaffected.** The button is a _child_ of the panel div,
so `dragover` / `drop` bubble to the handlers already on that div. The
button sets no `draggable` attribute and does not stop propagation of drag
events, so drop targeting, `dropEffect`, and the live drop preview keep
working over the panel centre.

**Placement tools are unaffected.** With a tool armed, the layer wrapper
switches to `pointerEvents: auto` and eclipses everything beneath,
including the button. Stamping wins with no special-casing.

### One Rule check

Dragging from inside the browse zone no longer pans the viewport. This is
the One Rule working as written — _drag moves the thing under the cursor_,
and the thing under the cursor is a button. `Space`+drag and middle-drag
still pan from anywhere, which is the escape hatch the rule guarantees.

## 3. Click behavior — `App.onPanelBrowseClick(panelId)`

1. **An armed tray thumbnail wins.** If `selectedThumbId !== null` and the
   panel is empty and not hidden, place that image here and disarm —
   identical to the existing branch at the top of `onPanelSingleClick`.
   The user has already said "place _this_"; popping an OS dialog would
   contradict them.
2. Otherwise call `window.api.openImages()`.
   - `canceled` → no-op, no state change.
   - Otherwise run the shared decode helper below, merge all decoded
     bitmaps into `bitmaps` with **one** `setBitmaps` call, and dispatch
     **one** `IMPORT_IMAGES` action.
   - A thrown `openImages` rejection pushes an error toast, as today.

On success (and only on this path, not the tray button's) set
`panelInteraction` to `{mode: "selected", panelId}` so the newly filled
panel is focused — matching what click-to-place already does.

### Shared decode helper

There are now two callers of "turn picked files into pool items", so the
loop currently inlined in `onAddImagesClick` moves to its own module,
`image/decode-picked-files.ts`:

```ts
export interface DecodedPick {
  items: ImagePoolItem[];
  bitmaps: Map<string, ImageBitmap>;
  /** Basenames that failed to decode, in input order. */
  failures: string[];
}
export async function decodePickedFiles(
  files: readonly OpenedFileDto[],
): Promise<DecodedPick>;
```

`OpenedFileDto` is the renderer-facing type from `preload/api.ts` (the
single source of truth for the IPC contract), not main's `OpenedFile`.

Behavior is lifted unchanged from today's loop: per-file `decodeImageBytes`,
a fresh `newImageId()` per item, `calibration` included only when present,
and failures collected rather than thrown so one bad file cannot abort the
batch. Both call sites then render the same batched failure toast (existing
wording, 3-item truncation, `+N more` suffix).

This is what makes the wiring testable without mounting `App`, which no
test currently does.

## 4. `IMPORT_IMAGES` action

New variant in `model/figure-actions.ts`:

```ts
| { type: "IMPORT_IMAGES"; items: ImagePoolItem[]; startPanelId?: string }
```

with a colocated creator `importImages(items, startPanelId?)`.

Reducer semantics:

1. If `items` is empty, return `s` unchanged (`===`, per the codebase's
   no-op convention).
2. Append every item whose id is not already in the pool, preserving the
   given order (insertion-ordered pool invariant).
3. If `startPanelId` is absent, stop — pool-only import. This is the
   `Add images…` path.
4. If `startPanelId` does not resolve to a panel that is itself empty and
   not hidden, stop — pool additions only, no placement.
5. Otherwise build the candidate list: panels that are empty
   (`imageId === undefined`) and not hidden, sorted by `(row, col)`, then
   truncated to those at or after the start panel in that order (the start
   panel is always the first candidate, by step 4). Sorting explicitly
   rather than relying on `state.panels` array order keeps the fill order
   equal to the auto-letter order users see on the canvas.
6. Zip images against candidates, placing one image per panel until either
   runs out. Leftover images remain unplaced in the pool (visible in the
   tray's "In tray" section). **No wrap-around** — clicking the last panel
   with four images selected fills that panel and leaves three in the tray.

The existing `ADD_TO_POOL` and `PLACE_INTO_PANEL` variants stay; other call
sites (drop dispatch, relink, project load) are untouched.

### Undo granularity

`useHistoryReducer` pushes one snapshot per non-transient action and
`MAX_HISTORY` is 10. Today `onAddImagesClick` dispatches `ADD_TO_POOL` per
file, so importing four images consumes four of the ten undo slots; adding
per-image placements on top would consume eight.

`IMPORT_IMAGES` is a single non-transient action, so the whole
import-and-fill is one undo step. **`Add images…` is routed through it too**
(with `startPanelId` omitted), which fixes the pre-existing undo-stack
churn on that path. `IMPORT_IMAGES` is _not_ added to `TRANSIENT_ACTIONS`.

The batching means the renderer decodes all files before dispatching,
rather than dispatching as each decode completes. For the batch sizes this
app handles the difference is not perceptible, and it is what makes the
single undo step possible.

## 5. Caption

`draw-figure.ts` currently paints one fixed string, `DRAG_HINT_TEXT =
"Drag an image here"`, at 13px with no overflow guard. The new copy is
about 40% longer, so the caption becomes size-aware. Tiers are evaluated
**in order** and the first match wins, so a wide-but-short panel resolves
to "none" rather than matching on width:

| #   | Condition (figure-px) | Caption                                 |
| --- | --------------------- | --------------------------------------- |
| 1   | `w < 96` or `h < 64`  | none                                    |
| 2   | `w ≥ 240`             | `Drag an image here or click to browse` |
| 3   | otherwise             | `Drag or click to add`                  |

This stays inside `drawPlaceholder`, still gated behind
`opts.editorHints`, so exports remain unaffected — the caption is editor
chrome and must never reach output. The letter keeps its existing
`cy - 14` nudge whenever a caption is drawn and stays dead-centre when one
is not.

The caption remains canvas-painted rather than moving into the DOM button.
Keeping it on canvas preserves its zoom-scaled sizing and its position
relative to the canvas-drawn panel letter; splitting the pair across two
coordinate systems would make them drift apart at high zoom.

`HintBar`'s `empty-panel` line gains the new affordance:

```
Drag an image here from the tray · Click the centre to browse · ⇧Click cells to merge
```

## 6. Testing

Vitest, following the one-test-file-per-module convention.

- **`coords-transform.test.ts`** — `browseZoneRect`: table-driven over
  small, typical, and oversized panels; verifies centring, the 70%/60%
  ratios, both caps, and that the zone is always contained by its panel.
- **`figure-actions.test.ts`** — `IMPORT_IMAGES`: fill-forward from a mid
  grid panel; hidden and occupied panels skipped; leftovers stay unplaced;
  more panels than images; `startPanelId` omitted adds to pool only;
  `startPanelId` pointing at an occupied or hidden panel adds to the pool
  and places nothing; empty `items` returns the same state reference;
  duplicate ids are not re-added.
- **`draw-figure.test.ts`** — the three caption tiers, including the
  wide-but-short panel that must fall to tier 1; still nothing drawn
  without `editorHints` (the export-safety assertion, updated for the new
  strings).
- **`grid-cells-modes.test.tsx`** — a browse zone renders for empty
  non-hidden panels and not for occupied or hidden ones; clicking it calls
  `onPanelBrowseClick` with the panel id and does not also fire
  `onPanelClick`.
- **`annotation-layer-browse-zone-passthrough.test.tsx`** (new, following
  the existing `annotation-layer-*-passthrough` family) — a click inside a
  browse zone reaches the button rather than the backdrop; a click on the
  same empty panel _outside_ its browse zone still forwards to
  `onPanelClick`; a drop over the zone still reaches the panel's drop
  handler by bubbling.
- **`decode-picked-files.test.ts`** (new) — items built in input order with
  filename/mime/dimensions/bitDepth populated; `calibration` present only
  when the decoder returns it; one failing file is reported in `failures`
  without aborting the batch.

## Files touched

| File                                                    | Change                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `render/coords.ts`                                      | add `browseZoneRect`                                                                         |
| `render/draw-figure.ts`                                 | width-aware caption tiers                                                                    |
| `model/figure-actions.ts`                               | `IMPORT_IMAGES` variant, creator, reducer case                                               |
| `image/decode-picked-files.ts`                          | new — shared decode/pool-item loop                                                           |
| `components/Grid/GridCells.tsx`                         | render browse-zone button, `onPanelBrowseClick` prop                                         |
| `components/Annotations/AnnotationInteractionLayer.tsx` | add browse zones to backdrop holes                                                           |
| `components/StatusHints/HintBar.tsx`                    | empty-panel hint copy                                                                        |
| `App.tsx`                                               | `onPanelBrowseClick`; route `onAddImagesClick` through `decodePickedFiles` + `IMPORT_IMAGES` |
| `styles.css`                                            | `.panel-browse-zone` hover / focus-visible, both themes                                      |

Plus the test files listed in §6.
