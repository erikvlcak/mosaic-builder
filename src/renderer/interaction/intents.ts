/**
 * Gesture intents for the two global input verbs (wheel, pointer-drag).
 *
 * The whole interaction model enforces ONE RULE: verbs are fixed, modes
 * change only the subject. Scroll always pans; ⌘/Ctrl+scroll (and pinch)
 * always zooms; drag moves the thing under the cursor; Space+drag and
 * middle-drag always pan the viewport. Frame mode retargets the same verbs
 * from the viewport onto the framed image — position-independently.
 *
 * These unions name every possible outcome. `resolve.ts` is the only place
 * that maps inputs to them; DOM owners switch on the result and never
 * negotiate precedence among themselves.
 */

export type WheelIntent =
  | "pan-view"
  | "zoom-view"
  | "pan-image"
  | "zoom-image"
  | "native";

export type PointerIntent =
  | "pan-view"
  | "frame-drag"
  | "object-drag-passthrough"
  | "native-dnd"
  | "click-through";

/**
 * What sits under the pointer, pre-classified by the DOM hit-test
 * (`hit-test.ts`). "interactive" = anything stamped `data-interactive`
 * (annotations, handles, chips, popovers…); "placed-panel" = an
 * image-bearing panel (native HTML5 drag source); "background" = empty
 * panels, holes, gutters, and the canvas margin — the pannable surface.
 */
export type PointerHit = "interactive" | "placed-panel" | "background";
