# 02 — Hide / delete empty panels

## Problem

The grid is always a full rows × cols partition. The user wants uneven
layouts (e.g. a 3×3 with one cell missing). Today every grid cell is
exported — empty panels render the placeholder graphic, which leaks into
exported PNG/JPEG/PDF.

Two distinct user needs:

1. **Hide** — temporarily make a panel render as empty; reversible.
2. **Delete** — actually drop the panel from the figure; cell becomes a
   permanent gap.

In both cases the cell must export as transparent (PNG/TIFF) or
gutter-color (JPEG/PDF).

## Goal

Two new operations on **empty** panels (panels with no `imageId`):

- `Hide` toggles a `hidden: true` flag on the panel.
- `Delete` removes the panel from `panels[]` entirely.

Both render the same way: no placeholder, no letter, no annotation
hit-area. The bg shows through. Neither operation is allowed on a panel
that has an image — the user must first unplace (spec 01) or replace
the image with nothing.

## Design

### Model changes

Extend `Panel`:

```ts
interface Panel {
  // ... existing
  hidden?: boolean; // optional; absent === false
}
```

Relax the partition invariant: `assertPanelsCoverGrid` becomes
`assertPanelsValid` — every cell is covered by **at most one** panel
(holes are allowed); panels still don't overlap; spans still positive
and in bounds. Add a new helper `cellsWithoutPanel(panels, rows, cols)`
that returns the holes for renderers and merge logic.

### Reducer changes

Two new actions:

```ts
| { type: "SET_PANEL_HIDDEN"; panelId: string; hidden: boolean }
| { type: "DELETE_PANEL"; panelId: string }
```

Semantics:

- `SET_PANEL_HIDDEN`: only valid when `panel.imageId === undefined`.
  Else no-op. Hidden panels still cover their cells (partition-wise);
  they just render empty.
- `DELETE_PANEL`: only valid when `panel.imageId === undefined`. Drops
  the panel from `panels[]`, removing its cells from the partition
  (creates a hole). Per-panel letter override is dropped. Annotations
  with `panelId === deletedId` are dropped (same logic as merge cleanup).

A re-add path: clicking on a hole cell mints a new panel covering just
that cell. This is handled by the existing panel-interaction layer with
a new action:

```ts
| { type: "RESTORE_PANEL_AT"; row: number; col: number }
```

which adds a fresh `Panel { rowSpan: 1, colSpan: 1, hidden: false }`
to that cell. No-op if the cell is already covered.

### Render changes

In `drawFigure` / `figure-derivations`:

- Hidden panels: skip placeholder draw, skip letter resolution, leave
  background untouched.
- Hole cells (no panel): skip entirely. The figure background
  (`figure.canvas.background` for opaque exports, transparent for PNG
  with no background) shows through. For JPEG/PDF the user-set gutter
  color fills the gap (because JPEG has no alpha); we draw the gutter
  fill across hole cells too.

In `EditorCanvas` / `GridCells`:

- Hidden panel cells: render with the `surface-muted` background and a
  dashed border, plus a subtle "hidden" badge in the corner — visible
  in the editor but never in the export.
- Hole cells: render as a darker dashed outline + small "+ add" icon
  on hover, dispatching `RESTORE_PANEL_AT` on click.

### UI surface

In the **Panel Properties** form (`PanelPropertiesForm.tsx`), when a
selected panel has no image, show a small section:

> Empty panel
> [ Hide ] [ Delete ]
> Hidden panels render as empty in exports. Delete removes the panel; click the gap to add it back.

When the panel has an image, hide the section entirely (no
"can't-delete-with-content" error state — just don't show the
controls).

### Test impact

- Update `assertPanelsCoverGrid` callers to use the relaxed
  `assertPanelsValid`. Search for usages and decide per call site
  whether holes are tolerated (most: yes; a few legacy fixtures may
  need updating).
- Add reducer tests for hide-toggle, hide-rejected-when-image-present,
  delete-rejected-when-image-present, delete-cleans-letter-override,
  restore-at-empty-cell.

## Files touched

- `src/renderer/model/panels.ts` — `hidden?` field, partition-relaxed
  invariant, `cellsWithoutPanel` helper.
- `src/renderer/model/figure-actions.ts` — three new actions + creators.
- `src/renderer/model/figure-actions.test.ts` — coverage.
- `src/renderer/render/draw-figure.ts` (and friends) — skip hidden /
  hole cells when drawing.
- `src/renderer/components/Grid/GridCells.tsx` — render empty/hole
  states, click-to-restore.
- `src/renderer/components/Properties/PanelPropertiesForm.tsx` — Hide
  / Delete buttons.
- `src/renderer/styles.css` — empty-panel + hole-cell styles, badge.

## Acceptance

- Select empty panel → see Hide/Delete buttons. Hide toggles a flag,
  cell becomes empty in the editor (with a hidden badge) and in
  exports. Delete removes the panel; cell becomes a hole.
- Click a hole → new panel appears at that cell.
- A panel with an image shows neither Hide nor Delete.
- PNG exports have transparent pixels in hidden/hole cells (when
  `figure.canvas.background` includes alpha or is fully transparent).
  JPEG/PDF have the gutter color.
- No regressions in merge/unmerge — both still work on the present
  panels and refuse to operate on hole cells.

## Out of scope

- A "row/column delete" bulk operation. Future enhancement.
- Visual grid "rebuild" tool for users to mass-delete cells. Out of scope.

## Depends on

Spec 01 strongly suggested first: most "I want to delete this panel"
moments come from "I have a placed image I want to remove" — spec 01
covers that path; this spec covers the genuinely-empty case.
