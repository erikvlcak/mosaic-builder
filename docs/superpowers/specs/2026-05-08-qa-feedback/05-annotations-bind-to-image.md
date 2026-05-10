# 05 — Annotations bind to image when created over one

## Problem

Today an annotation is anchored to a panel via `BaseAnnotation.panelId`,
or has no panel id and lives in the figure-canvas margin. When the user
moves an image to a different panel (drag-swap), the annotations stay
on the old panel — visually disconnected from the image they were
drawn on.

Scale bars are a special case: they are already image-bound (require a
panelId, but their meaningful binding is the calibration on the image
underneath). Letters are panel-bound and should stay that way (letter
"A" labels the top-left panel, regardless of which image is there).

## Goal

Annotations created **on top of an image** are bound to that image.
When the image moves to a different panel, those annotations follow,
preserving their position relative to the image's source pixels.

## Design

### Model change

Add an optional `imageId` to `BaseAnnotation`:

```ts
interface BaseAnnotation {
  id: string;
  panelId?: string; // existing: for letters & for image-bound annos that haven't moved
  imageId?: string; // NEW: when set, the annotation follows the image
  z: number;
  kind: AnnotationKind;
}
```

Coordinates remain in figure-canvas px. When `imageId` is set, the
coordinates are interpreted **relative to the image's panel rect at the
time of creation, in image-source pixel space**. We persist them in
figure-px for editor convenience, but on resolve we re-project them
through the new panel's transform.

Concretely, store one extra pair of fields on image-bound annos:

```ts
interface ImageBoundAnchor {
  imageId: string;
  /** 0..1, fraction of source image extent. 0,0 = top-left of image, 1,1 = bottom-right. */
  imgU: number;
  imgV: number;
}
```

For `text`, `imgU/imgV` is the anchor (top-left). For `arrow`, two
anchor pairs (start + end). For `box`, two anchor pairs (top-left +
bottom-right corners). Stored alongside the existing `x/y/w/h` —
those remain the source of truth in the editor; the image-bound
fields are recomputed on every commit so they stay in sync.

When the image moves to a new panel (or its transform changes), a
resolver re-derives `x/y/w/h` from `imgU/imgV` + the new panel's
transform.

### Creation logic

In `AnnotationInteractionLayer`, when the user drops a new annotation
inside a panel rect that contains an image, set the new annotation's
`imageId` and compute the `imgU/imgV` anchor(s) at creation time.

If the click/drag happens in the figure margin, on a hidden/empty
panel, or on a panel without an image, leave `imageId` undefined and
the annotation is plain panel-bound (or unbound).

### Movement: image moves between panels

The reducer handles `SWAP_PANELS` and `REPLACE_INTO_PANEL` (and
`UNPLACE_PANEL` from spec 01). On any of these, walk
`s.annotations`; for each anno where `anno.imageId !== undefined`:

- If the image is now placed on **some** panel, recompute the anno's
  `x/y/w/h` from `imgU/imgV` + that panel's rect + transform.
  `panelId` is updated to the new panel; the anno follows.
- If the image is no longer placed on any panel (unplace, or
  remove-from-pool, or an in-progress drag-back-to-tray), drop the
  annotation. (Same way scale bars are dropped today on
  REMOVE_FROM_POOL.)

This is one new pure helper: `relocateImageBoundAnnotations(state,
imageId): annotations[]`. The reducer calls it in the affected
actions.

### Letters — explicitly NOT image-bound

Letters stay panel-bound; their resolution path doesn't change.

### Scale bars — already image-bound, simplify

Scale bars currently require a `panelId`. With `imageId` available,
the natural model is to make scale bars `imageId`-bound too: they
still get a `panelId` for hit-testing convenience but the source of
truth becomes `imageId`. Update `figure-derivations` to fall through
`imageId → panelId` when computing the active scale bar location.

This is an internal cleanup; the user-visible behavior is the same as
today (scale bars already follow their image because of how
calibration is resolved).

### Editor visualization

When an image-bound annotation's image is visible (placed somewhere),
nothing special. When the image is currently unplaced (in the tray),
its annotations are also invisible — they reappear when the user
re-places the image on any panel.

## Files touched

- `src/renderer/model/annotations.ts` — `imageId` + `imgU/imgV`
  fields on user annotation kinds.
- `src/renderer/model/figure-derivations.ts` — relocator helper.
- `src/renderer/model/figure-actions.ts` — call relocator from
  SWAP*PANELS, REPLACE_INTO_PANEL, UNPLACE_PANEL, ROTATE_PANEL_90,
  FLIP_PANEL*\*. Drop image-bound annos when image leaves all panels.
- `src/renderer/components/Annotations/AnnotationInteractionLayer.tsx`
  — at creation time, detect image-over-cursor and stamp
  `imageId/imgU/imgV` on the new annotation.
- `src/renderer/model/serialize.ts` — bump schema if needed and
  ensure roundtrip preserves the new fields.

## Acceptance

- Draw an arrow on an image. Swap that image to another panel via
  drag. Arrow follows the image to the new panel; relative position on
  the image is preserved.
- Rotate the panel 90° → arrow rotates with the image.
- Drag a third image into the panel where the arrow was originally
  → arrow does NOT stay there; it now lives on its bound image.
- Letters labeled A,B,C,D never move with images (the panel still has
  letter "A" regardless of which image is there).
- Saved + reloaded projects preserve image-bound annos.

## Out of scope

- Letting users explicitly untie an annotation from its image
  (downgrade to panel-bound). Could be a "Detach from image" button
  later, but ships with auto-binding only.
- Image-bound annos that survive `REMOVE_FROM_POOL`. The image is
  gone; its annotations go too.

## Depends on

Spec 01 (because UNPLACE_PANEL is in the relocator's call list, but
the spec works without it: just call the relocator from existing
swap/replace actions only).
