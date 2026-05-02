import type { ImagePoolItem } from "./pool";
import type { Panel, PanelTransform, FitMode, Rotation } from "./panels";
import { DEFAULT_TRANSFORM } from "./panels";
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
  | { type: "UNMERGE_PANEL"; panelId: string }
  | { type: "SET_PANEL_TRANSFORM"; panelId: string; transform: PanelTransform }
  | { type: "SET_PANEL_FIT"; panelId: string; fit: FitMode }
  | { type: "ROTATE_PANEL_90"; panelId: string }
  | { type: "FLIP_PANEL_H"; panelId: string }
  | { type: "FLIP_PANEL_V"; panelId: string }
  | { type: "RESET_PANEL_TRANSFORM"; panelId: string };

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
export const setPanelTransform = (
  panelId: string,
  transform: PanelTransform,
): FigureAction => ({ type: "SET_PANEL_TRANSFORM", panelId, transform });
export const setPanelFit = (panelId: string, fit: FitMode): FigureAction => ({
  type: "SET_PANEL_FIT",
  panelId,
  fit,
});
export const rotatePanel90 = (panelId: string): FigureAction => ({
  type: "ROTATE_PANEL_90",
  panelId,
});
export const flipPanelH = (panelId: string): FigureAction => ({
  type: "FLIP_PANEL_H",
  panelId,
});
export const flipPanelV = (panelId: string): FigureAction => ({
  type: "FLIP_PANEL_V",
  panelId,
});
export const resetPanelTransform = (panelId: string): FigureAction => ({
  type: "RESET_PANEL_TRANSFORM",
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

/**
 * Replace a panel's imageId AND transform together. They are paired:
 * `imageId === undefined` ⇔ `transform === undefined`.
 */
function setPanelImage(
  panels: Panel[],
  panelId: string,
  imageId: string | undefined,
): Panel[] {
  return panels.map((p) =>
    p.id === panelId
      ? imageId === undefined
        ? omitImage(p)
        : { ...p, imageId, transform: DEFAULT_TRANSFORM }
      : p,
  );
}

function omitImage(p: Panel): Panel {
  return {
    id: p.id,
    row: p.row,
    col: p.col,
    rowSpan: p.rowSpan,
    colSpan: p.colSpan,
  };
}

function withImage(
  p: Panel,
  imageId: string | undefined,
  transform: PanelTransform | undefined,
): Panel {
  if (imageId === undefined || transform === undefined) {
    return omitImage(p);
  }
  return { ...p, imageId, transform };
}

function mapPanel(
  panels: Panel[],
  panelId: string,
  fn: (p: Panel) => Panel,
): { panels: Panel[]; changed: boolean } {
  let changed = false;
  const next = panels.map((p) => {
    if (p.id !== panelId) return p;
    const updated = fn(p);
    if (updated !== p) changed = true;
    return updated;
  });
  return { panels: next, changed };
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
        if (p.id === pa.id) return withImage(p, pb.imageId, pb.transform);
        if (p.id === pb.id) return withImage(p, pa.imageId, pa.transform);
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
      // Fresh image, fresh framing — overwrite any prior transform.
      return { ...s, panels: setPanelImage(s.panels, a.panelId, a.imageId) };
    }

    case "REMOVE_FROM_POOL": {
      if (!s.pool.some((p) => p.id === a.imageId)) return s;
      const panels = s.panels.map((p) =>
        p.imageId === a.imageId ? omitImage(p) : p,
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

    case "SET_PANEL_TRANSFORM": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.imageId === undefined) return s;
      const r = mapPanel(s.panels, a.panelId, (p) => ({
        ...p,
        transform: a.transform,
      }));
      return r.changed ? { ...s, panels: r.panels } : s;
    }

    case "SET_PANEL_FIT": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.transform === undefined) return s;
      if (target.transform.fit === a.fit) return s;
      const r = mapPanel(s.panels, a.panelId, (p) => {
        if (p.transform === undefined) return p;
        return {
          ...p,
          transform: {
            ...p.transform,
            fit: a.fit,
            panX: 0,
            panY: 0,
            zoom: 1,
          },
        };
      });
      return r.changed ? { ...s, panels: r.panels } : s;
    }

    case "ROTATE_PANEL_90": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.transform === undefined) return s;
      const r = mapPanel(s.panels, a.panelId, (p) => {
        if (p.transform === undefined) return p;
        const next = ((p.transform.rotation + 90) % 360) as Rotation;
        return {
          ...p,
          transform: {
            ...p.transform,
            rotation: next,
            // Reset pan to avoid landing outside the new clamp envelope.
            panX: 0,
            panY: 0,
          },
        };
      });
      return r.changed ? { ...s, panels: r.panels } : s;
    }

    case "FLIP_PANEL_H": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.transform === undefined) return s;
      const r = mapPanel(s.panels, a.panelId, (p) =>
        p.transform === undefined
          ? p
          : { ...p, transform: { ...p.transform, flipH: !p.transform.flipH } },
      );
      return r.changed ? { ...s, panels: r.panels } : s;
    }

    case "FLIP_PANEL_V": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.transform === undefined) return s;
      const r = mapPanel(s.panels, a.panelId, (p) =>
        p.transform === undefined
          ? p
          : { ...p, transform: { ...p.transform, flipV: !p.transform.flipV } },
      );
      return r.changed ? { ...s, panels: r.panels } : s;
    }

    case "RESET_PANEL_TRANSFORM": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.transform === undefined) return s;
      const r = mapPanel(s.panels, a.panelId, (p) =>
        p.transform === undefined ? p : { ...p, transform: DEFAULT_TRANSFORM },
      );
      return r.changed ? { ...s, panels: r.panels } : s;
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
