import type { ImagePoolItem } from "./pool";

export interface CellCoord {
  row: number;
  col: number;
}

export type CellKey = string;

export function cellKey(row: number, col: number): CellKey {
  return `${row},${col}`;
}

export interface FigureState {
  /**
   * Insertion-ordered. New uploads append; placement state lives separately
   * so reordering placements never reshuffles the tray.
   */
  pool: ImagePoolItem[];

  /**
   * Map<cellKey, imageId>. Absent key = empty cell. Values reference
   * `pool[*].id` and must always exist in the pool (reducer enforces).
   */
  placements: Map<CellKey, string>;

  /**
   * Fixed at 2×2 for M3. M4 will turn this into a configurable grid.
   */
  rows: number;
  cols: number;
}

export function initialFigureState(): FigureState {
  return {
    pool: [],
    placements: new Map(),
    rows: 2,
    cols: 2,
  };
}

export { figureReducer } from "./figure-actions";
