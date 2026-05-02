import type { ImagePoolItem } from "./pool";
import type { Panel } from "./panels";

export interface CellCoord {
  row: number;
  col: number;
}

export type CellKey = string;

export function cellKey(row: number, col: number): CellKey {
  return `${row},${col}`;
}

/**
 * Panel-centric figure state. A panel covers one or more cells; merged
 * panels have rowSpan/colSpan > 1. Invariant: panels partition
 * [0,rows) × [0,cols) exactly. The reducer enforces this.
 */
export interface FigureState {
  /**
   * Insertion-ordered. New uploads append; placement state lives on
   * `panels[*].imageId` so reordering placements never reshuffles the tray.
   */
  pool: ImagePoolItem[];

  /**
   * Non-overlapping rectangular panels covering the rows×cols grid.
   * Order is irrelevant for correctness but stable insertion order helps
   * deterministic rendering.
   */
  panels: Panel[];

  /** 1..10 in M4. */
  rows: number;
  cols: number;

  /** Gutter is figure-canvas pixels. */
  gutterPx: number;
  /** Hex color, "#RRGGBB" or "#RRGGBBAA". */
  gutterColor: string;
}

let __panelIdCounter = 0;
function nextPanelId(): string {
  __panelIdCounter += 1;
  return `panel-${__panelIdCounter}`;
}

/**
 * Test-only seam: lets the reducer tests reset the id counter so panel
 * ids in assertions stay stable. Production never calls this.
 */
export function __resetPanelIdsForTests(): void {
  __panelIdCounter = 0;
}

function defaultPanels(rows: number, cols: number): Panel[] {
  const out: Panel[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ id: nextPanelId(), row: r, col: c, rowSpan: 1, colSpan: 1 });
    }
  }
  return out;
}

export function initialFigureState(): FigureState {
  return {
    pool: [],
    panels: defaultPanels(2, 2),
    rows: 2,
    cols: 2,
    gutterPx: 12,
    gutterColor: "#FFFFFF",
  };
}

export { newPanelId };

function newPanelId(): string {
  return nextPanelId();
}

export { figureReducer } from "./figure-actions";
