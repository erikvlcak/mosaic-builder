import type { FigureState } from "../model/figure-state";
import {
  placeIntoPanel,
  replaceIntoPanel,
  swapPanels,
  type FigureAction,
} from "../model/figure-actions";
import type { DragPayload } from "./drag-payload";

export interface DropEvent {
  from: DragPayload;
  targetPanelId: string;
}

export function dispatchDrop(
  state: FigureState,
  ev: DropEvent,
): FigureAction | null {
  const target = state.panels.find((p) => p.id === ev.targetPanelId);
  if (target === undefined) return null;

  // Only tray drags exist now — panels are no longer draggable. (The
  // DragPayload "panel" variant is retained for wire-format stability but
  // is never produced by the UI.)
  if (ev.from.kind !== "tray") return null;

  const imageId = ev.from.imageId;
  const sourcePanel = state.panels.find((p) => p.imageId === imageId);

  // Already placed → this is a rearrange from the tray.
  if (sourcePanel !== undefined) {
    if (sourcePanel.id === ev.targetPanelId) return null; // dropped on itself
    // SWAP_PANELS covers both cases: target empty → move; occupied → swap.
    return swapPanels(sourcePanel.id, ev.targetPanelId);
  }

  // Not placed yet → place (empty target) or replace (occupied target).
  if (target.imageId !== undefined) {
    return replaceIntoPanel(imageId, ev.targetPanelId);
  }
  return placeIntoPanel(imageId, ev.targetPanelId);
}
