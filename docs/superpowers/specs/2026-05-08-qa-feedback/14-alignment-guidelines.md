# 14 — Alignment guidelines while dragging

## Problem

When the user drags an annotation (or, in spec 07, multiple
annotations) across the canvas, there's no visual aid for aligning it
with related elements in neighbor panels. Aligning a box on panel B
with the equivalent box on panel A requires eyeballing it.

## Goal

Show transient alignment guidelines while the user is actively
dragging an annotation. Lines extend from the moving annotation's
edges/centers to nearby annotations whose corresponding edges/centers
are within a snap-distance threshold. Snapping is **soft** — the user
can move past the line without resistance, but a small tick at the
threshold is "satisfying" and clearly marks alignment.

## Design

### Trigger

While a `pointermove`-driven annotation drag is in progress (in
`AnnotationInteractionLayer`), recompute on every move:

- The moving annotation's bbox edges + center (top, middle-y,
  bottom, left, center-x, right).
- All other annotations on the figure (excluding the moving one),
  their corresponding edges + centers in figure-px.

For each pair (moving-edge, other-edge) where the values match
within a threshold of `±SNAP_PX = 4 figure-px`:

- Render a 1-px guideline along that axis from the moving anno's
  bbox to the other anno's bbox.
- Optionally **snap** the moving anno's drag offset to make the
  match exact (snap is on by default; a Shift-held drag disables
  snap).

### Visual

Guidelines use the accent color at low opacity (`var(--c-accent)` at
~50% alpha), 1px thin, no dashes. Guidelines disappear at pointer-up.

When more than one guideline is showing, render them all
simultaneously — common case is "horizontal centers of two boxes
align" + "left edges of three boxes align."

### Performance

Worst case: 50 annotations × 6 edges × 6 edges = 1800 comparisons
per pointermove. Trivial — pure arithmetic on numbers, no DOM. We
just keep a guideline-list React state at the layer level and let
React render the SVG lines.

To avoid re-rendering on every sub-pixel move, debounce or throttle:

- Recompute guidelines only when the moving anno's bbox actually
  changes by ≥ 1 px (bucketed to integer figure-px). Cheap
  short-circuit.

### Snap behavior

```ts
function snapDelta(movingBbox, others, raw): { dx, dy, lines } {
  let dx = raw.dx, dy = raw.dy;
  let bestX = null;  // closest x-snap candidate
  let bestY = null;
  for (const other of others) {
    for (const [movingEdge, candidateEdge] of edgePairs(movingBbox, other)) {
      const diff = candidateEdge - (movingEdge + raw.dx);
      if (Math.abs(diff) <= SNAP_PX && (bestX === null || Math.abs(diff) < bestX.absDiff)) {
        bestX = { absDiff: Math.abs(diff), correction: diff };
      }
      // ... same for y
    }
  }
  if (bestX !== null) dx = raw.dx + bestX.correction;
  if (bestY !== null) dy = raw.dy + bestY.correction;
  return { dx, dy, lines: collectLinesAfterSnap(...) };
}
```

Implemented as a pure function in `src/renderer/render/snap.ts`,
testable in isolation.

### What snaps to what

- All annotation kinds participate (text, symbol, box, scalebar,
  letter — yes, letters are valid alignment targets too).
- Image-bound annotations (spec 05): for the snap source values, use
  the resolved figure-px position, not the original-image coords.

### Gating

Snap is disabled when the user holds Shift during the drag. The
guidelines still render to indicate alignment opportunities, but no
correction is applied. This is the standard convention in design
tools (Figma, Sketch).

When dragging a multi-selection (spec 07), snap operates on the
**bbox of the entire selection**, not per-annotation. Same edges +
centers, just on the union.

When dragging panels (spec 11 free-form resize), the same snap math
runs against panel rects. Out of scope for the first version of
this spec; ship the annotation case first.

## Files touched

- `src/renderer/render/snap.ts` — new pure module.
- `src/renderer/render/snap.test.ts` — coverage.
- `src/renderer/components/Annotations/AnnotationInteractionLayer.tsx`
  — call into the snap module on drag; render guideline overlays
  via SVG inside the existing layer.
- `src/renderer/styles.css` — guideline style.

## Acceptance

- Drag a box near the y-coordinate of another box → a faint
  horizontal line appears spanning both boxes; the dragged box snaps
  to align.
- Drag a text annotation near the center-x of a symbol → vertical
  guideline; snap.
- Hold Shift while dragging → guidelines still appear; no snap.
- Multiple guidelines render simultaneously when multiple alignments
  are possible.
- Pointer-up → guidelines disappear.

## Out of scope

- Equal-spacing distribution guides ("⫶ ⫶ ⫶" between 3 elements
  evenly spaced).
- Snap to figure canvas edges (could be added; default off to avoid
  surprise).
- Snap to panel-rect edges (spec 11 territory).
- Animated guideline appearance.

## Depends on

- Spec 07 only if you want multi-select drag to snap on the bounding
  box of the selection.
- Spec 13 doesn't conflict; both improve the drag experience.
