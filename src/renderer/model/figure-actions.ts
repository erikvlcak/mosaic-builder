import type { ImagePoolItem } from "./pool";
import { cellKey, type CellCoord, type FigureState } from "./figure-state";

export type FigureAction =
  | { type: "ADD_TO_POOL"; item: ImagePoolItem }
  | { type: "PLACE_FROM_TRAY"; imageId: string; target: CellCoord }
  | { type: "SWAP_CELLS"; a: CellCoord; b: CellCoord }
  | { type: "REPLACE_FROM_TRAY"; imageId: string; target: CellCoord }
  | { type: "REMOVE_FROM_POOL"; imageId: string };

export const addToPool = (item: ImagePoolItem): FigureAction => ({
  type: "ADD_TO_POOL",
  item,
});
export const placeFromTray = (
  imageId: string,
  target: CellCoord,
): FigureAction => ({ type: "PLACE_FROM_TRAY", imageId, target });
export const swapCells = (a: CellCoord, b: CellCoord): FigureAction => ({
  type: "SWAP_CELLS",
  a,
  b,
});
export const replaceFromTray = (
  imageId: string,
  target: CellCoord,
): FigureAction => ({ type: "REPLACE_FROM_TRAY", imageId, target });
export const removeFromPool = (imageId: string): FigureAction => ({
  type: "REMOVE_FROM_POOL",
  imageId,
});

function inBounds(c: CellCoord, s: FigureState): boolean {
  return c.row >= 0 && c.row < s.rows && c.col >= 0 && c.col < s.cols;
}

function withPlacements(
  s: FigureState,
  next: Map<string, string>,
): FigureState {
  return { ...s, placements: next };
}

export function figureReducer(s: FigureState, a: FigureAction): FigureState {
  switch (a.type) {
    case "ADD_TO_POOL": {
      if (s.pool.some((p) => p.id === a.item.id)) return s;
      return { ...s, pool: [...s.pool, a.item] };
    }
    case "PLACE_FROM_TRAY": {
      if (!inBounds(a.target, s)) return s;
      if (!s.pool.some((p) => p.id === a.imageId)) return s;
      for (const v of s.placements.values()) {
        if (v === a.imageId) return s;
      }
      const k = cellKey(a.target.row, a.target.col);
      if (s.placements.has(k)) return s;
      const next = new Map(s.placements);
      next.set(k, a.imageId);
      return withPlacements(s, next);
    }
    case "SWAP_CELLS": {
      if (!inBounds(a.a, s) || !inBounds(a.b, s)) return s;
      if (a.a.row === a.b.row && a.a.col === a.b.col) return s;
      const ka = cellKey(a.a.row, a.a.col);
      const kb = cellKey(a.b.row, a.b.col);
      const va = s.placements.get(ka);
      const vb = s.placements.get(kb);
      if (va === undefined && vb === undefined) return s;
      const next = new Map(s.placements);
      if (va === undefined) next.delete(kb);
      else next.set(kb, va);
      if (vb === undefined) next.delete(ka);
      else next.set(ka, vb);
      return withPlacements(s, next);
    }
    case "REPLACE_FROM_TRAY": {
      if (!inBounds(a.target, s)) return s;
      if (!s.pool.some((p) => p.id === a.imageId)) return s;
      const k = cellKey(a.target.row, a.target.col);
      for (const [otherKey, v] of s.placements) {
        if (v === a.imageId && otherKey !== k) return s;
      }
      const next = new Map(s.placements);
      next.set(k, a.imageId);
      return withPlacements(s, next);
    }
    case "REMOVE_FROM_POOL": {
      if (!s.pool.some((p) => p.id === a.imageId)) return s;
      const next = new Map(s.placements);
      for (const [k, v] of next) {
        if (v === a.imageId) next.delete(k);
      }
      return {
        ...s,
        pool: s.pool.filter((p) => p.id !== a.imageId),
        placements: next,
      };
    }
  }
}
