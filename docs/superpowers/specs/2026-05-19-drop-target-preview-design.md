# Drop-target ghost preview

Date: 2026-05-19
Status: approved

## Problem

While dragging an image from the Tray or between panels, the user has no in-place feedback showing **which image will end up where**. The hover outline tells you the target panel but not what it will contain. Users frequently release on the wrong panel.

## Solution

While a drag is in progress, render a translucent ghost of the dragged image inside the panel currently under the cursor. For panel→panel drags, also render a ghost of the target's image inside the source panel — visualising the swap. Suppress the ghost and switch the outline to a "not allowed" treatment when the drop would be rejected.

## Architecture

### State lifts to App

Two pieces of UI-only state move from `GridCells` to `App.tsx` so both the grid and a new ghost layer can read them:

- `dragSource: { kind: "tray", imageId } | { kind: "panel", panelId } | null`
- `hoverPanelId: string | null`

This state is **not** in `FigureState` — it is ephemeral, non-undoable, not persisted, same lifetime rules as `PanelInteraction`.

### New module: `dnd/preview-for-drop.ts`

Pure function:

```ts
previewForDrop(state, source, hoverPanelId) →
  { valid: false }
  | { valid: true, targetImageId: string, sourceGhost?: { panelId, imageId } }
```

Encodes the same validity rules as `dispatchDrop`:

- panel→same-panel ⇒ invalid
- tray drag whose `imageId` is already placed ⇒ invalid
- panel→panel ⇒ valid, both sides get ghosts (sourceGhost is target's image at source panel; the dragged image at target panel)
- tray→empty or tray→occupied ⇒ valid, no sourceGhost

Both `DropGhostLayer` and the GridCells outline-decider call this helper, so validity stays single-sourced.

### New component: `components/Grid/DropGhostLayer.tsx`

Absolutely positioned sibling of `GridCells` inside the canvas wrapper. `pointerEvents: "none"` — never intercepts drag events.

Renders one `<canvas>` per ghost (max 2: target, plus source for swaps). Each canvas is positioned to its panel rect using the same `computePanelRects` / `rectsFromUniform` math `GridCells` uses. Paints once per `(bitmap, rect)` change via `useEffect`:

```ts
ctx.drawImage(bitmap, x, y, w, h)   // object-fit: cover
canvas.style.opacity = "0.45"
```

No panel transforms (rotation, pan, zoom) applied — the dragged image hasn't been placed yet so its transform will be the default. For swaps, both ghosts use cover-fit without source transforms, keeping the visualisation legible.

### Drag-source plumbing

Tray drags currently don't bubble up; `Thumbnail.onDragStart` just writes `dataTransfer`. We add an `onDragSourceChange?(src | null)` callback to:

- `Thumbnail` (called from its `onDragStart` / `onDragEnd`) — `Tray` forwards it
- `GridCells` (called from its panel `onDragStart` / `onDragEnd`)

`App` owns the resulting `dragSource` state.

We do **not** read `dataTransfer.getData()` on dragover; it's restricted in some browsers and the callback flow is cleaner.

### Invalid-drop visual

When `previewForDrop` returns `{ valid: false }` for the hovered panel:

- `GridCells` swaps the hover outline from `3px solid var(--c-hover-stroke)` to `2px dashed var(--c-danger)` (existing token).
- `onDragOver` sets `dropEffect = "none"` so the OS cursor reflects it.
- `DropGhostLayer` renders nothing.

### Files touched

| File | Change |
|------|--------|
| `src/renderer/dnd/preview-for-drop.ts` | new — pure helper |
| `src/renderer/components/Grid/DropGhostLayer.tsx` | new — ghost overlay |
| `src/renderer/components/Grid/GridCells.tsx` | lift `hoverPanelId` out, add `onHoverPanelChange`, `onDragSourceChange` props, invalid-drop outline branch |
| `src/renderer/components/Sidebar/Tray.tsx` | accept + forward `onDragSourceChange` |
| `src/renderer/components/Sidebar/Thumbnail.tsx` | call `onDragSourceChange` on dragstart / dragend |
| `src/renderer/App.tsx` | own `dragSource` + `hoverPanelId`; mount `DropGhostLayer` |
| `test/unit/preview-for-drop.test.ts` | new — pure helper tests |

### Tests

- `preview-for-drop.test.ts`: invalid cases (same-panel, already-placed tray), valid cases (tray→empty, tray→occupied, panel→panel swap with sourceGhost).
- Existing `GridCells` hover tests update to use the lifted prop API.

### Out of scope

- Animations / fade-in (drag is short-lived; transitions lag).
- Multi-target preview (HTML5 dnd is single-target).
- Preview when dragging onto the Tray (unplace) — Tray already has its own `data-drop-active` indicator.
- Showing the **final** transform of the dragged image (cover-fit is the closest honest preview without speculating on user intent).
