# 13 — Hold-spacebar Select + click-on-anno selects

## Problem

When a creation tool (Text/Box/Symbol) is active, every click on the
canvas creates a new annotation. To move an existing annotation, the
user has to switch to the Select tool first, do the move, then switch
back. The current pointer-events policy disables the annotation
layer's auto-handlers for already-existing annotations when a creation
tool is active — so even direct clicks on a placed annotation create
a new one nearby.

## Goal

Two complementary improvements:

1. **Click-on-existing-annotation always selects** — even with a
   creation tool active. Click on empty space still creates.
2. **Hold spacebar = temporarily switch to Select** — release returns
   to the previous tool. Visual feedback shows which mode is active.

The user can rely on either approach. The two compose: spacebar gives
a strong "Select-everywhere" mode for cases where the click-on-anno
approach is fiddly (small annos, overlap).

## Design

### Click-on-existing-annotation behavior

In `AnnotationInteractionLayer`, the current `pointer-events` policy
puts the layer at `pointer-events: none` in select mode and `auto` in
creation mode, with each annotation's hit-rect at `auto`. The fix:

**The annotation hit-rects always have `pointer-events: auto`,
regardless of active tool.** Their click handler:

- Stops propagation.
- Sets selection to that annotation (or shift-add per spec 07).
- Does NOT call the creation-tool path.

The layer backdrop's behavior depends on the active tool:

- Select tool: backdrop click clears selection.
- Creation tool: backdrop click creates a new annotation.

This means the annotation hit-rects "intercept" clicks before the
backdrop sees them. The current code already supports this for
select mode; we just stop disabling the hit-rects in creation mode.

### Hold-spacebar mode

Add window-level keyboard listeners (in `App.tsx` or the
interaction layer):

```ts
useEffect(() => {
  function onKeyDown(e: KeyboardEvent): void {
    if (e.code !== "Space") return;
    if (isFormElementFocused()) return; // don't steal space from inputs
    if (e.repeat) return; // ignore key-repeat
    e.preventDefault();
    setSpacebarHeld(true);
  }
  function onKeyUp(e: KeyboardEvent): void {
    if (e.code !== "Space") return;
    setSpacebarHeld(false);
  }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}, []);
```

`isFormElementFocused()` checks `document.activeElement` against
`HTMLInputElement`, `HTMLTextAreaElement`, contenteditable. Critical
to avoid stealing space from the text-annotation editor.

The effective tool is `spacebarHeld ? "select" : activeTool`.
Pass that into the interaction layer instead of the raw
`activeTool`.

### Visual mode indicator

The current toolbar already shows the active tool via `aria-pressed`.
Add a transient outline / banner when in spacebar-Select mode:

- Cursor on the canvas changes to a "select" cursor (default arrow).
- A small floating chip near the top-left of the canvas: **SELECT
  MODE (release ␣)**. Disappears on key-up.

Make the chip a subtle accent — visible but not distracting. Reuses
existing tokens.

### Edge cases

- User presses spacebar while dragging an arrow's endpoint → ignore
  spacebar (keep dragging). Implementation: the keydown is gated on
  "no in-flight pointer drag" via the existing `dragRef` check.
- User releases spacebar while dragging an annotation → keep drag in
  Select mode until pointer-up; the pre-drag tool resumes after.
- Tab loses focus → reset `spacebarHeld` to false (keyup may not
  fire). Add a `blur` window listener that resets it.

## Files touched

- `src/renderer/App.tsx` — spacebar tracking; pass effective tool.
- `src/renderer/components/Annotations/AnnotationInteractionLayer.tsx`
  — hit-rect pointer-events always auto; click handlers select
  unconditionally.
- `src/renderer/components/Toolbar/AnnotationToolbar.tsx` (or App)
  — visual mode chip when spacebar held.
- `src/renderer/styles.css` — chip + canvas-cursor rules.

## Acceptance

- With Box tool active, click on an existing arrow → arrow becomes
  selected, no new box is created.
- With Box tool active, click on empty canvas → new box (existing
  behavior preserved).
- Hold spacebar while in Box tool → cursor changes, "Select mode"
  chip appears, every click selects/moves; release → back to Box
  tool.
- Spacebar inside the text-annotation editor → inserts a space;
  doesn't trigger Select mode.

## Out of scope

- Other modal-key shortcuts (V for Select, etc.). Spacebar-hold
  matches the user's request; full keymap is a future spec.
- Spacebar-toggle (vs spacebar-hold). Hold matches the request;
  toggle would need an explicit toolbar persistence.

## Depends on

Spec 07 not required, but spec 07's selection set composes naturally
with this change.
