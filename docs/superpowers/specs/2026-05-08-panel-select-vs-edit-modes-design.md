# Panel Select vs Edit Modes

**Date:** 2026-05-08
**Status:** Draft

## Problem

Today, single-clicking an image panel immediately enters pan-and-zoom mode. Side effect: the panel's HTML5 `draggable` attribute is disabled the moment you click, so users cannot click-and-drag the image to swap it into another panel. Their drag is interpreted as a pan instead.

Source of the conflict:

- [GridCells.tsx](../../../src/renderer/components/Grid/GridCells.tsx): `draggable = occupied && !isFocused` — drag-to-swap requires the panel to be unfocused.
- [App.tsx](../../../src/renderer/App.tsx): a single click sets `focusedPanelId`, which mounts [PanelInteractionLayer.tsx](../../../src/renderer/components/Grid/PanelInteractionLayer.tsx) and disables drag.

## Goal

Split panel focus into two distinct modes:

- **Selected** — entered by single-click. Drag-to-swap enabled. Pan/zoom disabled.
- **Editing** — entered by double-click. Pan/zoom enabled. Drag-to-swap disabled.

Visually distinguish the two modes with outline style and cursor.

## Non-goals

- Free-position images outside the panel grid.
- Keyboard shortcut to promote selected → editing (e.g. Enter). Future polish.
- First-run hint / tutorial UI.
- Changes to the serialized `FigureState` shape or any reducer action.
- Touch/long-press semantics. The app is Electron desktop; pointer events suffice.

## State change

In [App.tsx](../../../src/renderer/App.tsx), replace the binary `focusedPanelId: string | null` with a discriminated tristate:

```ts
type PanelInteraction =
  | { mode: "selected"; panelId: string }
  | { mode: "editing"; panelId: string }
  | null;
```

Helper derivations (memoized as needed):

- `selectedPanelId` — non-null only when `mode === "selected"`.
- `editingPanelId` — non-null only when `mode === "editing"`.
- `focusedPanelId` — `panelInteraction?.panelId ?? null`. Used by code paths that don't care about the distinction (e.g. PropertiesPanel, panel toolbar).

## Behavior matrix

| User action                  | Current `panelInteraction`             | Result                                                                              |
| ---------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------- |
| Click empty (no-image) panel | any                                    | Same as today. Sets focus for merge-selection / properties; no select-or-edit mode. |
| Single-click image panel     | `null` or different panel              | `{ mode: "selected", panelId }`                                                     |
| Single-click image panel     | `{ mode: "selected", panelId }` (same) | No-op                                                                               |
| Single-click image panel     | `{ mode: "editing", panelId }` (same)  | No-op (stay in editing)                                                             |
| Single-click image panel B   | `{ mode: "editing", panelId: A }`      | `{ mode: "selected", panelId: B }`                                                  |
| Double-click image panel     | any                                    | `{ mode: "editing", panelId }`                                                      |
| HTML5 drag image panel       | `selected`                             | Drag-to-swap (existing native DnD path in GridCells).                               |
| Pointer-drag inside panel    | `editing`                              | Pan the image (existing PanelInteractionLayer code).                                |
| Wheel inside panel           | `editing`                              | Zoom (existing).                                                                    |
| Wheel inside panel           | `selected` or other                    | Pass through (no zoom).                                                             |
| `Esc`                        | non-null                               | `null`                                                                              |
| Click outside grid           | non-null                               | `null`                                                                              |
| Shift-click 1×1 panel        | any                                    | Existing merge-selection toggle. Does NOT enter selected/editing.                   |

Single-click on the same panel while in `editing` is intentionally a no-op so users do not accidentally lose their edit state mid-pan. Exits from editing require Esc, clicking another panel, or clicking outside the grid.

## Component changes

### 1. App.tsx

- Replace `focusedPanelId` state with `panelInteraction`.
- Update `selectedImagePanel` derivation to use `panelInteraction.panelId` when mode is `selected` or `editing` and the panel has an image.
- Existing `onPanelClick` becomes the "single-click" handler:
  - If the clicked panel is already in `editing`, no-op.
  - Else if the clicked panel has an image, set `{ mode: "selected", panelId }`.
  - Else (empty panel) preserve existing behavior (assigns focus for properties / merge UI but does NOT enter `selected`).
- Add `onPanelDoubleClick(panelId)` handler:
  - If the panel has an image, set `{ mode: "editing", panelId }`.
  - Else no-op.
- Mount `PanelInteractionLayer` only when `panelInteraction?.mode === "editing"`.
- Esc handler clears `panelInteraction`.

### 2. GridCells.tsx

- Accept `panelInteraction` (or two derived ids: `selectedPanelId`, `editingPanelId`) instead of just `focusedPanelId`.
- Wire `onDoubleClick` on each panel `div` to call `onPanelDoubleClick(panel.id)`.
- Adjust draggable condition:
  - **Today:** `draggable = occupied && !isFocused`.
  - **New:** `draggable = occupied && mode !== "editing"`.
  - Net effect: panels in `selected` mode remain HTML5-draggable. This is the core fix.
- Apply outline + cursor based on per-panel mode:
  - `selected`: `outline: 2px solid <focus-blue>`, `cursor: grab`. Browser switches to `grabbing` automatically while a native drag is in progress.
  - `editing`: outline drawn by PanelInteractionLayer (see below); cursor is set by that layer to `move`. GridCells does not draw an outline for the editing panel.
  - Neither: existing default styles.

### 3. PanelInteractionLayer.tsx

- No change to pan/zoom math, wheel handling, or pointer capture logic.
- Change the focus outline (currently solid blue, ~line 202) to **2px dashed** in an accent color distinct from the `selected` blue. This is the only visual change in this layer.
- Verify cursor remains `move` for the layer's interactive area.

### 4. No reducer / state-shape changes

- `FigureState`, `Panel`, `PanelTransform`, action types, and the action history are untouched.
- Project file format unchanged. Existing saved files continue to load.

## Visual spec

| Mode       | Outline              | Cursor                                                 | Drawn by              |
| ---------- | -------------------- | ------------------------------------------------------ | --------------------- |
| (no mode)  | none                 | default                                                | —                     |
| `selected` | 2px solid focus-blue | `grab` (`grabbing` during native DnD, browser-managed) | GridCells             |
| `editing`  | 2px dashed accent    | `move`                                                 | PanelInteractionLayer |

The two outline styles must remain visually distinct under all panel sizes and gutter widths. Pick the accent color from the existing palette so it doesn't clash; a warm accent (e.g. an orange used elsewhere in the toolbar) works.

## Edge cases

- **Annotation tool active.** When an annotation tool is the active tool, the annotation layer captures pointer events at a higher z-index and panel selection/editing is suppressed. Today's behavior carries over unchanged. Verify during implementation that `onPanelClick` and `onPanelDoubleClick` aren't fired while a tool is active.
- **Drag started in `selected`, dropped over the same panel.** Native DnD no-op. Same as today's behavior for unfocused panels.
- **Drag started in `selected`, dropped outside the canvas / on a non-droppable target.** Native DnD cancels; mode stays `selected`.
- **Empty panel single-click.** No `selected` mode (nothing to drag). Existing focus/merge-selection behavior preserved.
- **Shift-click on 1×1 panel.** Reserved for merge-selection. Does not change `panelInteraction`.
- **Click another image panel while in `editing`.** Exits editing on old panel, sets `selected` on new panel. Double-click goes straight to `editing`.
- **Undo/redo while in `selected` or `editing`.** UI-only state — not part of history. Mode persists across undo/redo unless the underlying panel disappears (e.g. row/col change merges it away), in which case clear `panelInteraction`.
- **Panel that loses its image** (e.g. via a replace/clear action): if it was `selected` or `editing`, clear `panelInteraction`.

## Testing notes

- Manual: single-click image panel → cursor becomes `grab`, solid blue outline, drag-to-another-panel swaps.
- Manual: double-click image panel → cursor becomes `move`, dashed accent outline, drag pans, wheel zooms.
- Manual: from `editing`, click a different image panel → previous editing exits, new panel is `selected`.
- Manual: Esc clears mode in both states.
- Existing pan/zoom tests in [PanelInteractionLayer](../../../src/renderer/components/Grid/PanelInteractionLayer.tsx) remain valid (no math changes).
- Add a test (or manual check) confirming that clicking a `selected` panel and then dragging triggers the existing DnD swap path and dispatches `SWAP_PANELS`.

## Risks

- **Double-click vs single-click latency.** Browsers fire both `click` and `dblclick`. The single-click handler may set `selected` momentarily before `dblclick` upgrades to `editing`. This is acceptable — the visual flicker is brief and the end state is correct. If it proves jarring, defer the `selected` transition by ~200ms or use a click-counter pattern.
- **HTML5 DnD ghost image.** Native drag uses the panel `div` as the drag image. Today this works because focused panels are non-draggable; selected panels will be draggable. Verify the drag ghost looks acceptable; if not, fall back to a custom drag image via `setDragImage`.
- **Discoverability.** Users who knew the old single-click-pans behavior will need to learn the new gesture. Mitigated by the cursor change (`grab` is conventionally "you can drag this"). No in-app hint per design decision.
