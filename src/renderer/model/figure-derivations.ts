import type {
  Figure,
  FigureCanvas,
  FigureGrid,
  HardCodedPanel,
} from "./types";
import { cellKey, type FigureState } from "./figure-state";

export interface DeriveOptions {
  canvas: FigureCanvas;
  grid: Pick<FigureGrid, "gutterPx" | "gutterColor">;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function emptyLabel(index: number): string {
  return LETTERS[index] ?? "?";
}

export function deriveFigure(
  state: FigureState,
  opts: DeriveOptions,
): Figure {
  const panels: HardCodedPanel[] = [];
  let i = 0;
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      const placed = state.placements.get(cellKey(row, col));
      if (placed !== undefined) {
        panels.push({ row, col, kind: "image", imageId: placed });
      } else {
        panels.push({
          row,
          col,
          kind: "placeholder",
          label: emptyLabel(i),
        });
      }
      i++;
    }
  }
  return {
    canvas: opts.canvas,
    grid: {
      rows: state.rows,
      cols: state.cols,
      gutterPx: opts.grid.gutterPx,
      gutterColor: opts.grid.gutterColor,
    },
    panels,
  };
}
