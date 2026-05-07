/**
 * UI-layer state for which panel the user is interacting with.
 *
 * - `selected`: single-click; HTML5 drag-to-swap enabled, pan/zoom NOT.
 * - `editing`: double-click; pan/zoom enabled, drag-to-swap NOT.
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
