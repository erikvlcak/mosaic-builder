import type { ImagePoolItem } from "./pool";
import type { Panel } from "./panels";
import type { FigureState } from "./figure-state";
import { resizePanels } from "./grid-resize";
import { canMergeSelection, mergePanels, unmergePanel, type CellCoord } from "./merge";

export type FigureAction =
  | { type: "ADD_TO_POOL"; item: ImagePoolItem }
  | { type: "PLACE_INTO_PANEL"; imageId: string; panelId: string }
  | { type: "SWAP_PANELS"; aPanelId: string; bPanelId: string }
  | { type: "REPLACE_INTO_PANEL"; imageId: string; panelId: string }
  | { type: "REMOVE_FROM_POOL"; imageId: string }
  | { type: "RESIZE_GRID"; rows: number; cols: number }
  | { type: "SET_GUTTER_PX"; gutterPx: number }
  | { type: "SET_GUTTER_COLOR"; gutterColor: string }
  | { type: "MERGE_CELLS"; cells: CellCoord[] }
  | { type: "UNMERGE_PANEL"; panelId: string };

export const addToPool = (item: ImagePoolItem): FigureAction => ({
  type: "ADD_TO_POOL",
  item,
});
export const placeIntoPanel = (
  imageId: string,
  panelId: string,
): FigureAction => ({ type: "PLACE_INTO_PANEL", imageId, panelId });
export const swapPanels = (
  aPanelId: string,
  bPanelId: string,
): FigureAction => ({ type: "SWAP_PANELS", aPanelId, bPanelId });
export const replaceIntoPanel = (
  imageId: string,
  panelId: string,
): FigureAction => ({ type: "REPLACE_INTO_PANEL", imageId, panelId });
export const removeFromPool = (imageId: string): FigureAction => ({
  type: "REMOVE_FROM_POOL",
  imageId,
});
export const resizeGrid = (rows: number, cols: number): FigureAction => ({
  type: "RESIZE_GRID",
  rows,
  cols,
});
export const setGutterPx = (gutterPx: number): FigureAction => ({
  type: "SET_GUTTER_PX",
  gutterPx,
});
export const setGutterColor = (gutterColor: string): FigureAction => ({
  type: "SET_GUTTER_COLOR",
  gutterColor,
});
export const mergeCells = (cells: CellCoord[]): FigureAction => ({
  type: "MERGE_CELLS",
  cells,
});
export const unmergePanelAction = (panelId: string): FigureAction => ({
  type: "UNMERGE_PANEL",
  panelId,
});

function isImageInPool(s: FigureState, imageId: string): boolean {
  return s.pool.some((p) => p.id === imageId);
}

function findPanelById(panels: Panel[], id: string): Panel | undefined {
  return panels.find((p) => p.id === id);
}

function isImagePlaced(panels: readonly Panel[], imageId: string): boolean {
  return panels.some((p) => p.imageId === imageId);
}

function setPanelImage(
  panels: Panel[],
  panelId: string,
  imageId: string | undefined,
): Panel[] {
  return panels.map((p) =>
    p.id === panelId
      ? imageId === undefined
        ? omitImageId(p)
        : { ...p, imageId }
      : p,
  );
}

function omitImageId(p: Panel): Panel {
  const { imageId: _drop, ...rest } = p;
  return { ...rest, rowSpan: p.rowSpan, colSpan: p.colSpan };
}

export function figureReducer(s: FigureState, a: FigureAction): FigureState {
  switch (a.type) {
    case "ADD_TO_POOL": {
      if (s.pool.some((p) => p.id === a.item.id)) return s;
      return { ...s, pool: [...s.pool, a.item] };
    }

    case "PLACE_INTO_PANEL": {
      if (!isImageInPool(s, a.imageId)) return s;
      if (isImagePlaced(s.panels, a.imageId)) return s;
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined) return s;
      if (target.imageId !== undefined) return s;
      return { ...s, panels: setPanelImage(s.panels, a.panelId, a.imageId) };
    }

    case "SWAP_PANELS": {
      if (a.aPanelId === a.bPanelId) return s;
      const pa = findPanelById(s.panels, a.aPanelId);
      const pb = findPanelById(s.panels, a.bPanelId);
      if (pa === undefined || pb === undefined) return s;
      if (pa.imageId === undefined && pb.imageId === undefined) return s;
      const next = s.panels.map((p) => {
        if (p.id === pa.id) return assignImage(p, pb.imageId);
        if (p.id === pb.id) return assignImage(p, pa.imageId);
        return p;
      });
      return { ...s, panels: next };
    }

    case "REPLACE_INTO_PANEL": {
      if (!isImageInPool(s, a.imageId)) return s;
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined) return s;
      if (target.imageId === a.imageId) return s;
      // If the new image is already placed in some *other* panel, this is a no-op:
      // a "replace" is from the tray, not a 2-cell move. Use SWAP_PANELS for that.
      const placedElsewhere = s.panels.some(
        (p) => p.id !== a.panelId && p.imageId === a.imageId,
      );
      if (placedElsewhere) return s;
      return { ...s, panels: setPanelImage(s.panels, a.panelId, a.imageId) };
    }

    case "REMOVE_FROM_POOL": {
      if (!s.pool.some((p) => p.id === a.imageId)) return s;
      const panels = s.panels.map((p) =>
        p.imageId === a.imageId ? assignImage(p, undefined) : p,
      );
      return {
        ...s,
        pool: s.pool.filter((p) => p.id !== a.imageId),
        panels,
      };
    }

    case "RESIZE_GRID": {
      const rows = clampInt(a.rows, 1, 10);
      const cols = clampInt(a.cols, 1, 10);
      if (rows === s.rows && cols === s.cols) return s;
      const r = resizePanels(s.panels, s.rows, s.cols, rows, cols);
      // Released imageIds simply stay in the pool unplaced — no pool mutation.
      return { ...s, rows, cols, panels: r.panels };
    }

    case "SET_GUTTER_PX": {
      const gutterPx = clampInt(a.gutterPx, 0, 40);
      if (gutterPx === s.gutterPx) return s;
      return { ...s, gutterPx };
    }

    case "SET_GUTTER_COLOR": {
      if (!isHexColor(a.gutterColor)) return s;
      if (a.gutterColor === s.gutterColor) return s;
      return { ...s, gutterColor: a.gutterColor };
    }

    case "MERGE_CELLS": {
      const check = canMergeSelection(s.panels, a.cells);
      if (!check.ok) return s;
      return { ...s, panels: mergePanels(s.panels, check.rect) };
    }

    case "UNMERGE_PANEL": {
      const next = unmergePanel(s.panels, a.panelId);
      if (next === s.panels) return s;
      return { ...s, panels: next };
    }
  }
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  const i = Math.round(n);
  return Math.max(lo, Math.min(hi, i));
}

function isHexColor(s: string): boolean {
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s);
}

function assignImage(p: Panel, imageId: string | undefined): Panel {
  if (imageId === undefined) {
    const { imageId: _drop, ...rest } = p;
    return rest;
  }
  return { ...p, imageId };
}
