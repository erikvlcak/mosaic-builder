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

  if (ev.from.kind === "panel") {
    if (ev.from.panelId === ev.targetPanelId) return null;
    return swapPanels(ev.from.panelId, ev.targetPanelId);
  }

  // Tray drop: refuse if the image is already placed somewhere.
  if (state.panels.some((p) => p.imageId === ev.from.imageId)) return null;

  if (target.imageId !== undefined) {
    return replaceIntoPanel(ev.from.imageId, ev.targetPanelId);
  }
  return placeIntoPanel(ev.from.imageId, ev.targetPanelId);
}
