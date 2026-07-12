/**
 * UI-layer state for which panel the user is interacting with.
 *
 * - `selected`: single-click. Solid accent outline + corner resize
 *   handles; drag picks up the image (HTML5 dnd); Delete unplaces.
 * - `editing`: Frame mode (double-click or Enter). Scroll/drag/keys
 *   retarget onto the panel's image, position-independently — see
 *   interaction/useFrameGestures. (The literal stays "editing" to limit
 *   churn; the UI calls this "Framing".)
 * - `null`: nothing.
 *
 * Lives outside FigureState because it is UI-only (not part of undo/redo
 * history, not serialized to .mosaic files).
 */
export type PanelInteraction =
  | { mode: "selected"; panelId: string }
  | { mode: "editing"; panelId: string }
  | null;

export function selectedIdOf(pi: PanelInteraction): string | null {
  return pi !== null && pi.mode === "selected" ? pi.panelId : null;
}

export function editingIdOf(pi: PanelInteraction): string | null {
  return pi !== null && pi.mode === "editing" ? pi.panelId : null;
}

export function focusedIdOf(pi: PanelInteraction): string | null {
  return pi !== null ? pi.panelId : null;
}
