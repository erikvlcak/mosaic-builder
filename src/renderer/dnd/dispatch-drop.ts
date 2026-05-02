import {
  cellKey,
  type CellCoord,
  type FigureState,
} from "../model/figure-state";
import {
  placeFromTray,
  replaceFromTray,
  swapCells,
  type FigureAction,
} from "../model/figure-actions";
import type { DragPayload } from "./drag-payload";

export interface DropEvent {
  from: DragPayload;
  target: CellCoord;
}

export function dispatchDrop(
  state: FigureState,
  ev: DropEvent,
): FigureAction | null {
  const tk = cellKey(ev.target.row, ev.target.col);
  if (ev.from.kind === "cell") {
    if (ev.from.row === ev.target.row && ev.from.col === ev.target.col) {
      return null;
    }
    return swapCells({ row: ev.from.row, col: ev.from.col }, ev.target);
  }
  for (const v of state.placements.values()) {
    if (v === ev.from.imageId) return null;
  }
  if (state.placements.has(tk)) {
    return replaceFromTray(ev.from.imageId, ev.target);
  }
  return placeFromTray(ev.from.imageId, ev.target);
}
