/**
 * M2 figure model — a deliberate subset of the full Project schema.
 * Expanded in M4 (configurable grid), M5 (per-panel transforms),
 * and M6 (annotations).
 */

export type Hex = string; // "#RRGGBB" or "#RRGGBBAA"

export interface FigureCanvas {
  widthPx: number;
  heightPx: number;
  background: Hex;
}

export interface FigureGrid {
  rows: number;
  cols: number;
  gutterPx: number;
  gutterColor: Hex;
}

export type HardCodedPanel =
  | { row: number; col: number; kind: "image"; imageId: string }
  | { row: number; col: number; kind: "placeholder"; label: string };

export interface Figure {
  canvas: FigureCanvas;
  grid: FigureGrid;
  panels: HardCodedPanel[];
}
