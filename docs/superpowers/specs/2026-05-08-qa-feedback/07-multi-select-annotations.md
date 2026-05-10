# 07 — Multi-select annotations + bulk edit

## Problem

The annotation layer tracks a single `selectedAnnotationId`. The user
cannot select multiple annotations at once, so adjusting a group of
similar annotations requires editing each one. Two specific user
flows are blocked:

1. Shift-click on the canvas to add to / remove from selection.
2. From the sidebar (or properties panel), "select all annotations of
   kind X" so that bulk style edits cover the whole figure.

## Goal

Replace the single-id selection state with a `Set<string>`. Both
patterns (shift-click on canvas, "select all of kind X" sidebar
button) populate the set. The properties panel shows a multi-edit
form when the set has > 1 entry, with controls that operate on the
full set.

## Design

### State

In `App.tsx` (or wherever `selectedAnnotationId` lives today):

```ts
const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<
  ReadonlySet<string>
>(() => new Set());
```

A small helper module with utilities: `addToSelection`,
`removeFromSelection`, `toggleInSelection`, `replaceSelection`.

### Selection gestures

In `AnnotationInteractionLayer`:

- Plain click on an annotation hit-rect → replace selection with that
  one id.
- Shift-click on an annotation → toggle that id in the set.
- Click on empty space (with Select tool, or in spacebar-hold mode
  per spec 13) → clear selection unless shift is held.
- Marquee selection (drag a rectangle from empty canvas with Select
  tool) → set selection to all annos whose hit-rect intersects the
  marquee. Shift+marquee adds to selection.

### Sidebar — "select all of kind"

Add a small new sidebar section (or extend the properties panel
default state when nothing is selected) called **Annotation
overview**:

```
Annotations
  Letters (12)         [Select all]
  Symbols (5)          [Select all]
  Boxes (3)            [Select all]
  Text (8)             [Select all]
  Scale bars (1)       [Select all]
```

Counts come from `state.annotations` grouped by kind. "Select all"
for a kind populates `selectedAnnotationIds` with every annotation of
that kind. Shift-click on the row adds to existing selection
instead.

For the "letters" row specifically, "Select all" fills the selection
with derived `LetterAnnotation` ids. Letters become first-class
edit-targets via spec 08; this spec assumes that path is in place.
If shipping order goes 07 → 08, the letters row should be hidden
until 08 lands.

### Properties panel — multi-edit form

When `selectedAnnotationIds.size > 1`, render a **MultiAnnoForm**:

- Header: `N annotations selected — kinds: text, symbol, box`
- Common controls: Color, Size scale (multiplicative %, default 100%),
  Delete all.
- Kind-specific controls only rendered if the selection is
  homogeneous:
  - Text-only: font, weight.
  - Symbol-only: symbol picker (changes all to the chosen symbol).
  - Box-only: stroke width.

Each control issues a single new reducer action: `BULK_UPDATE_ANNOS`.

```ts
| { type: "BULK_UPDATE_ANNOS"; ids: string[]; patch: Partial<Annotation> }
| { type: "BULK_REMOVE_ANNOS"; ids: string[] }
```

The reducer applies the patch to every matching annotation, ignoring
fields that aren't valid for that annotation's kind (e.g. setting
`stroke` on a text anno is dropped). One history entry per bulk
action.

### Bulk drag

When > 1 annotation is selected and the user drags one of them, all
selected annos translate by the same delta. Implementation: in the
existing drag handler, when the dragged anno's id is in the
selection set, apply the dx/dy patch to every selected anno on
pointer-up. (During the drag, render the visual offset only — don't
dispatch UPDATE on every pointermove for every anno; that's enough
to be smooth.)

### Visual feedback

Each selected annotation gets the existing accent outline. When > 1
is selected, also show a single bounding rectangle around the
group's combined bbox, in a faint accent stroke.

### Keyboard

- `Esc` → clear selection.
- `Delete` / `Backspace` → bulk-remove selection (gated behind the
  existing "not editing text" guard).

## Files touched

- `src/renderer/components/Annotations/AnnotationInteractionLayer.tsx`
  — selection set, shift-click, marquee, bulk drag.
- `src/renderer/components/Properties/PropertiesPanel.tsx` — route to
  MultiAnnoForm when set size > 1.
- `src/renderer/components/Properties/MultiAnnoForm.tsx` (new).
- `src/renderer/components/Sidebar/Tray.tsx` (or a new
  `AnnotationOverviewPanel.tsx`) — annotation overview section with
  per-kind counts + select-all buttons.
- `src/renderer/model/figure-actions.ts` — `BULK_UPDATE_ANNOS`,
  `BULK_REMOVE_ANNOS`.
- `src/renderer/model/figure-actions.test.ts` — coverage including
  the heterogeneous-patch case.
- `src/renderer/App.tsx` — selection state migration.

## Acceptance

- Shift-click on annotations toggles them in/out of the selection.
- Drag-rectangle from empty canvas selects all crossed annotations.
- "Select all boxes" button selects every box.
- Properties panel shows a multi-edit form when > 1 selected; common
  fields apply to all; kind-specific fields appear only when
  homogeneous.
- Drag any selected annotation → all selected annotations move
  together.
- Esc clears, Delete removes all selected.
- Single-select behavior unchanged when only one annotation is in
  the set.

## Out of scope

- Group/ungroup as a persistent concept (selection is ephemeral).
- Aligning / distributing selected annotations (could be a future
  spec).

## Depends on

- Spec 06 strongly recommended first (so the "Symbols" overview row
  exists from day one).
- Spec 08 recommended first if "Select all letters" is to work.
- This spec works without either, but the sidebar overview rows for
  not-yet-shipped items should be hidden behind feature flags.
