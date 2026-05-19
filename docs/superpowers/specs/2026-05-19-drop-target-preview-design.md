# Drop-target live preview

Date: 2026-05-19
Status: implemented

## Problem

While dragging an image from the Tray or between panels, the user has no in-place feedback showing **which image will end up where**. The hover outline tells you the target panel but not what it will contain. Users frequently release on the wrong panel.

## Solution

While a drag is in progress and the cursor hovers a valid drop target, render the figure **as it would look if the drop were committed**. The dragged image appears in its target panel at its actual post-drop dimensions, fit, and transform — no ghost overlay, no opacity tricks. For panel→panel drags, both panels live-swap. On dragleave or release, the preview reverts (or commits, on release).

For invalid drops (e.g., tray image already placed elsewhere), no preview is shown; the target panel's hover outline switches to a `dashed var(--c-danger)` treatment and `dropEffect` becomes `"none"` so the OS cursor reflects rejection.

## Architecture

### State lifts to App

Two pieces of UI-only state move from `GridCells` to `App.tsx`:

- `dragSource: DragPayload | null`
- `hoverPanelId: string | null`

This state is **not** in `FigureState`. Ephemeral, non-undoable, not persisted.

### Derived `previewState`

In `App.tsx`, we compute the hypothetical post-drop state on every dragover via the **existing reducer + dispatchDrop**:

```ts
previewState = useMemo(() => {
  if (dragSource === null || hoverPanelId === null) return null;
  const action = dispatchDrop(state, { from: dragSource, targetPanelId: hoverPanelId });
  if (action === null) return null;  // invalid → no preview
  return figureReducer(state, action);
}, [state, dragSource, hoverPanelId]);
```

The figure passed to `EditorCanvas` derives from `previewState ?? state`. The render pipeline then paints the dragged image with the same dimensions, transform, and pixel-faithful framing it would have post-drop. SWAP keeps each image's per-panel transform; PLACE/REPLACE applies `DEFAULT_TRANSFORM` (the reducer's existing rule). No new render code.

`GridCells` continues to consume the real `state` (so its outline/chrome reflects truth — including the dashed invalid-drop treatment).

### Module: `dnd/preview-for-drop.ts`

Now only used by `GridCells` to decide whether to apply the invalid-drop outline. Returns `{ valid: boolean, ... }`. `dispatchDrop` is the single source of truth for *what* would happen; `previewForDrop` is a thin "is this allowed?" helper kept in lockstep via tests.

### Drag-source plumbing

- `Thumbnail` (tray) — calls `onDragSourceChange` on `dragstart` / `dragend`. `Tray` forwards the prop.
- `GridCells` — calls `onDragSourceChange` on per-panel `dragstart` / `dragend` / `drop`.
- `AnnotationInteractionLayer` — when it handles `dragover` via its hit-test passthrough (zIndex 3), it now also forwards a hover-panel change via `onTrayDragHoverChange` so the preview triggers even when the annotation layer is the topmost hit target.

### Drop commit & revert

- **Commit** (release on valid panel) — `onDrop` clears `hoverPanelId` + `dragSource` and dispatches the action through the real reducer. Because `previewState` is recomputed and now `null`, the figure is derived from the real post-drop `state` — visually identical to the preview, so there is **no flicker** between hover and commit.
- **Revert** (dragleave, cancel, drop on invalid panel) — `dragend` clears `dragSource`; `dragleave` clears `hoverPanelId`. `previewState` becomes `null`, the figure derives from the real (unchanged) `state` — instant revert.

### Files touched

| File | Change |
|------|--------|
| `src/renderer/dnd/preview-for-drop.ts` | helper for "is this drop valid?" |
| `src/renderer/components/Grid/GridCells.tsx` | accepts lifted hover/dragSource props; invalid-drop outline branch |
| `src/renderer/components/Sidebar/Tray.tsx` | accepts + forwards `onDragSourceChange` |
| `src/renderer/components/Sidebar/Thumbnail.tsx` | calls `onDragSourceChange` on dragstart/dragend |
| `src/renderer/components/Annotations/AnnotationInteractionLayer.tsx` | `onTrayDragHoverChange` callback for the passthrough |
| `src/renderer/App.tsx` | owns drag state; derives `previewState`; threads it into figure derivation |
| `test/unit/preview-for-drop.test.ts` | unit tests for the validity helper |

### Tests

- `preview-for-drop.test.ts`: same-panel, tray-already-placed → invalid; tray onto empty/occupied → valid; panel↔panel swap → valid.
- Existing `dispatch-drop.test.ts` continues to cover the **action** decisions (the live preview piggybacks on these).

### Out of scope

- Animations on swap (the redraw is instant; CSS transitions on the canvas would lag drag movement).
- Preview when dragging onto the Tray (unplace) — the Tray already has its own `data-drop-active` outline.
- Dragging while a panel is in editing mode (`PanelInteractionLayer` owns gestures there; drag-to-swap is already disabled).
