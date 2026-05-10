# 01 — Drag image from panel back to tray

## Problem

Once an image is placed into a panel, it can only be moved (swap), replaced
(by another tray image), or removed entirely from the project (via
"remove from pool"). There is no way to **unplace** an image — keep it in
the pool but free its panel.

The user expects the natural inverse of "drag from tray onto panel": grab
the image and drag it back into the tray; the panel becomes empty, the
image becomes "Unplaced" again.

## Goal

Add a drag gesture from a placed panel to the tray that unplaces the
image. The image stays in the pool (Unplaced section); the panel becomes
empty (no `imageId`, no `transform`).

## Design

### Reducer changes

Add a single new action:

```ts
| { type: "UNPLACE_PANEL"; panelId: string }
```

Semantics:

- If panel has no `imageId`, no-op.
- Else: clear `imageId` and `transform`. The image is **not** removed
  from `pool[]`. Scale-bar annotations anchored to that panel are
  dropped (same logic as `REMOVE_FROM_POOL` for the affected panel id).
  Per-image annotations bound to that image (see spec 05) are also
  dropped, because the image no longer occupies any panel; if spec 05
  is not yet shipped, this clause has no effect.

### DnD payload

The existing drag system uses `DRAG_MIME` + `serializeDrag`. Add a new
drag-source kind:

```ts
{
  kind: "panel";
  panelId: string;
}
```

emitted by the panel renderer (the image area inside `GridCells.tsx`)
when the user starts dragging. The tray must then accept this kind on
its drop zone — currently the tray is not a drop target. Wire
`onDragOver` / `onDrop` on the `Tray` aside element. On drop:

1. Parse the dragged payload.
2. If it is `{ kind: "panel"; panelId }`, dispatch `UNPLACE_PANEL`.
3. If it is anything else, ignore (don't `preventDefault`).

### Visual feedback

- While dragging from a panel, the source panel renders at 50% opacity.
- The tray's wrapper gets a `data-drop-active="true"` attribute when a
  panel-drag enters; CSS shows a dashed accent border so the user
  knows the drop target is valid.

### Edge cases

- Drag-back works on merged panels (rowSpan/colSpan > 1) — no special
  case, the panel still has a single `imageId`.
- Drag-back during an in-flight panel swap should be impossible: the
  current swap path uses pointer-down on a panel, not HTML5 drag.
  Confirm by reading [`GridCells.tsx`](../../../src/renderer/components/Grid/GridCells.tsx)
  — if the swap uses HTML5 drag too, the dispatcher needs to
  disambiguate by drop target, which it already does (tray vs panel).

## Files touched

- `src/renderer/model/figure-actions.ts` — new action + creator.
- `src/renderer/model/figure-actions.test.ts` — coverage: unplace clears
  image+transform, leaves pool untouched, drops scale bars on the panel.
- `src/renderer/dnd/drag-payload.ts` — extend `DragPayload` union.
- `src/renderer/components/Grid/GridCells.tsx` — emit `panel` drag
  payload when the image area is dragged.
- `src/renderer/components/Sidebar/Tray.tsx` — accept drops; wire
  dispatch.
- `src/renderer/styles.css` — `[data-drop-active]` rule for the tray.

## Acceptance

- Drag a placed image from its panel into the tray → panel goes empty;
  image appears under "Unplaced" in the sidebar.
- Drag from tray back onto an empty panel → roundtrip works.
- Scale bar on the freed panel is gone after unplacing.
- Existing tray drop behavior (image into panel) is unaffected.

## Out of scope

- Trash icon / right-click menu alternative — drag-back is the canonical
  gesture in this spec.
- Undo of the unplace — the existing history reducer handles this for
  free since the action goes through `useHistoryReducer`.

## Depends on

Nothing.
