import type { FigureState } from "../model/figure-state";

/**
 * Whether the document has unsaved changes.
 *
 * The signal is reference identity: `figureReducer` returns the same `===`
 * state on no-ops and a fresh reference on any real change (and undo/redo
 * restore the *stored* snapshot reference, not a copy). So the state
 * reference captured at the last clean point — app start, save, load, or New —
 * is a faithful "clean marker": the document is dirty iff the live state is a
 * different reference from that marker.
 *
 * Seeding the marker with the initial state (rather than null) means an
 * unsaved, never-saved figure the user has started editing correctly reads as
 * dirty. The failure mode of reference comparison is a false positive (an
 * undo that lands structurally-equal but reference-distinct state reads dirty);
 * for an unsaved-changes guard that is the safe direction — one extra confirm,
 * never silent data loss.
 */
export function isDirty(
  current: FigureState,
  savedRef: FigureState,
): boolean {
  return current !== savedRef;
}
