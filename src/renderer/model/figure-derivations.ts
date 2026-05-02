import type { Figure, FigureCanvas, HardCodedPanel } from "./types";
import type { FigureState } from "./figure-state";
import { cellLabel } from "../render/letters";

export interface DeriveOptions {
  canvas: FigureCanvas;
}

export function deriveFigure(
  state: FigureState,
  opts: DeriveOptions,
): Figure {
  const panels: HardCodedPanel[] = state.panels.map((p) => {
    const tlIndex = p.row * state.cols + p.col;
    if (p.imageId !== undefined) {
      return {
        row: p.row,
        col: p.col,
        kind: "image" as const,
        imageId: p.imageId,
        rowSpan: p.rowSpan,
        colSpan: p.colSpan,
      };
    }
    return {
      row: p.row,
      col: p.col,
      kind: "placeholder" as const,
      label: cellLabel(tlIndex),
      rowSpan: p.rowSpan,
      colSpan: p.colSpan,
    };
  });
  return {
    canvas: opts.canvas,
    grid: {
      rows: state.rows,
      cols: state.cols,
      gutterPx: state.gutterPx,
      gutterColor: state.gutterColor,
    },
    panels,
  };
}
