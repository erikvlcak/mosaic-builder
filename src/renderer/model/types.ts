/**
 * M2 figure model — a deliberate subset of the full Project schema.
 * Expanded in M4 (configurable grid + merged panels via rowSpan/colSpan),
 * M5 (per-panel transforms), and M6 (annotations).
 */

import type { PanelTransform } from "./panels";

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
  | {
      row: number;
      col: number;
      kind: "image";
      imageId: string;
      rowSpan?: number;
      colSpan?: number;
      transform: PanelTransform;
    }
  | {
      row: number;
      col: number;
      kind: "placeholder";
      label: string;
      rowSpan?: number;
      colSpan?: number;
    };

export interface Figure {
  canvas: FigureCanvas;
  grid: FigureGrid;
  panels: HardCodedPanel[];
}

export type { PanelTransform, FitMode, Rotation } from "./panels";
