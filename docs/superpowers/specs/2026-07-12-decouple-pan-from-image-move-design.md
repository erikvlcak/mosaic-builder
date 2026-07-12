# Decouple canvas panning from image moving

**Date:** 2026-07-12
**Status:** Design approved, ready for implementation plan

## Problem

When the editor is zoomed in, a plain left-drag on the canvas pans the view —
except on a **selected occupied panel**, where the same gesture triggers an
HTML5 image drag-to-swap instead. Selecting a panel silently arms a
destructive image move that shares the exact gesture (left-drag) used for
panning. While navigating a zoomed-in figure, the user can accidentally move
or swap an image into another panel when they only meant to pan.

Root cause (`GridCells.tsx`): a panel is HTML5-`draggable` when
`occupied && isSelected` (the "drag-to-swap" affordance). A native dragstart
on that element pre-empts the pointer-drag pan handler in `useCanvasZoom`, so
on a selected image panel the drag moves the image instead of panning.

## Goal

Plain left-drag on the canvas **always pans**, everywhere, regardless of what
is under the cursor or selected. Moving/swapping images between panels remains
possible, but only through a physically separate surface — the tray — so the
two gestures can never collide.

Both capabilities are preserved; they no longer overlap.

## Approach

Three changes across the drag/drop layer plus a small affordance tweak.

### Change 1 — Panels are never draggable (removes the collision)

In `src/renderer/components/Grid/GridCells.tsx`:

- Remove the `draggable = occupied && isSelected` computation; panels render
  with `draggable={false}` always.
- Remove the panel `onDragStart` handler and the
  `onDragSourceChange({ kind: "panel", panelId })` emission.
- Remove the `grab`/`grabbing` cursor for selected occupied panels — the
  cursor no longer implies "grab to move" (drag = pan everywhere now). The
  selected-panel outline (accent border) is unchanged.

Consequences:

- A left-drag beginning on a selected image panel is no longer intercepted by
  a native dragstart, so it falls through to the `useCanvasZoom` pan handler.
  **Panning works over every part of the canvas, including selected image
  panels.**
- Panel **selection** (single-click), **edit mode** (double-click →
  `PanelInteractionLayer` image pan/zoom), unmerge, crop badge, and the
  properties panel are all unchanged. Only the panel *drag* behavior is gone.

The `{ kind: "panel"; panelId }` variant of `DragPayload`
(`src/renderer/dnd/drag-payload.ts`) becomes unused in production. Leave the
type and its `parseDrag` branch in place for now (harmless, and drops the risk
of touching the wire format); the `dispatch-drop` panel branch is removed in
Change 2. A follow-up cleanup may delete the dead variant.

### Change 2 — Tray drag moves/swaps already-placed images

Today `dispatch-drop.ts` **refuses** a tray drag whose image is already
placed (guard: `state.panels.some(p => p.imageId === imageId)` → `null`).
That guard existed because panel-to-panel drag owned rearranging. With panel
drag gone, the tray must own it.

New `dispatchDrop` semantics for a `{ kind: "tray"; imageId }` payload dropped
on `targetPanelId`:

1. Resolve the image's current panel: `sourcePanel = panels.find(p =>
   p.imageId === imageId)`.
2. **Image not currently placed** (`sourcePanel === undefined`): unchanged
   behavior — `placeIntoPanel` if the target is empty, `replaceIntoPanel` if
   the target is occupied.
3. **Image already placed** (`sourcePanel !== undefined`):
   - Dropped on its **own** panel (`sourcePanel.id === targetPanelId`) →
     no-op (`null`).
   - Dropped on any **other** panel → `swapPanels(sourcePanel.id,
     targetPanelId)`. `SWAP_PANELS` already handles both sub-cases with no
     reducer change:
     - target **empty** → the image moves there, source panel empties;
     - target **occupied** → the two images swap.
     It also relocates image-bound annotations, so scale bars / labels follow
     their images.

The `ev.from.kind === "panel"` branch in `dispatchDrop` is removed (no panel
payloads are produced anymore).

**`previewForDrop` must be updated in lockstep.** `src/renderer/dnd/
preview-for-drop.ts` holds its own copy of the accept/reject logic (it drives
the live drop preview and the hover outline) and is kept in sync with
`dispatchDrop` via shared tests. It currently returns `{ valid: false }` for a
tray drag whose image is already placed — the same guard being removed. Update
it to mirror the new semantics:

- Placed-image tray drag onto its **own** panel → `{ valid: false }`.
- Placed-image tray drag onto a **different** panel → `{ valid: true,
  targetImageId: <dragged image>, sourceGhost: <target's old image → source
  panel> when the target is occupied }`. This matches how the removed
  `kind: "panel"` swap branch populated `sourceGhost`, so the preview renders
  the swap on both panels.
- Remove the now-dead `source.kind === "panel"` branch here too.

### Change 3 — Placed thumbnails become draggable (discoverability)

In `src/renderer/components/Sidebar/Thumbnail.tsx`:

- Placed thumbnails are currently inert: `draggable={!placed}`, and
  `onDragStart` early-returns when `placed`. Make **placed** thumbnails
  draggable too, emitting the existing `{ kind: "tray", imageId }` payload
  (the same payload already carries an `imageId`, so no new payload kind is
  needed — Change 2 routes it by whether the image is placed).
- Give placed thumbnails a `grab` cursor (they currently read as inert). Keep
  the existing "(placed)" title/badge so the placed state is still legible;
  the thumbnail communicates "drag me to move/swap."
- Unplaced-thumbnail behavior (click-to-place arming, Enter-to-place, hover
  ×-to-remove) is unchanged. The ×-remove control stays gated to unplaced
  thumbnails.

## Data flow (after the change)

```
Canvas
  left-drag (anywhere)  → useCanvasZoom pan            (never an image move)
  click panel           → select (properties/unmerge/crop)
  double-click panel    → PanelInteractionLayer (image pan/zoom within panel)

Tray
  drag UNPLACED thumb   → place (empty target) / replace (occupied target)
  drag PLACED thumb     → move (empty target) / swap (occupied target)
                          via SWAP_PANELS(sourcePanel, targetPanel)
  drag onto own panel   → no-op
```

## What is intentionally NOT changed

- The reducer (`figure-actions.ts`) — `SWAP_PANELS`, `PLACE_INTO_PANEL`,
  `REPLACE_INTO_PANEL` already cover every needed transition.
- `PanelInteractionLayer` edit-mode image pan/zoom (a separate, deliberate
  mode entered by double-click).
- The `.mosaic` file format, export pipeline, and annotation model.
- The `DragPayload` wire format (the `panel` variant is left in place but
  unused; optional later cleanup).

## Testing

Unit:

- `dispatch-drop.test.ts`:
  - tray drag of an **unplaced** image → `placeIntoPanel` (empty) /
    `replaceIntoPanel` (occupied) — existing cases still pass.
  - tray drag of a **placed** image onto a **different empty** panel →
    `SWAP_PANELS(source, target)` (move).
  - tray drag of a **placed** image onto a **different occupied** panel →
    `SWAP_PANELS(source, target)` (swap).
  - tray drag of a placed image onto **its own** panel → `null` (no-op).
  - Remove/replace the former "refuse if already placed → null" assertion and
    any `kind: "panel"` swap assertion (panel payloads no longer produced).
- `preview-for-drop.test.ts`: mirror the `dispatch-drop` cases — placed-image
  tray drag onto a different empty panel → `{ valid: true, targetImageId }`;
  onto a different occupied panel → adds `sourceGhost` for the target's old
  image; onto its own panel → `{ valid: false }`. Remove the former
  "already-placed tray drag → invalid" and `kind: "panel"` assertions.
- `GridCells` test: assert placed+selected panels render `draggable={false}`
  (replaces any test asserting they are draggable / emit a panel payload).
- `Thumbnail` test: a **placed** thumbnail is `draggable` and its `onDragStart`
  emits `{ kind: "tray", imageId }` and calls `onDragSourceChange`.

End-to-end (browser harness):

- Zoom in; press-drag starting on a **selected image panel** → the view pans
  (scrollLeft/scrollTop change) and the image does **not** change panels.
- Drag a **placed** thumbnail from the tray onto another **occupied** panel →
  the two images swap. Onto an **empty** panel → the image moves.

## Risks / edge cases

- **Drop target eligibility while dragging a placed thumbnail:** the hover
  outline / invalid-drop styling in `GridCells` reads `previewForDrop`. With
  the lockstep update above, a placed-image tray drag reads as valid on any
  panel except the image's own (which returns `{ valid: false }`, i.e. neutral
  — no "danger" outline for a self-drop).
- **Preview-on-hover (`previewState` in App):** the live drop preview derives
  from `dispatchDrop` while the hover outline derives from `previewForDrop`.
  Both are updated in Change 2, so the preview and the committed drop stay
  consistent — confirm a swap preview updates both panels.
- **`kind: "panel"` dead code:** left intentionally to avoid touching the wire
  format; flagged for optional follow-up cleanup so it is not mistaken for a
  live path.
