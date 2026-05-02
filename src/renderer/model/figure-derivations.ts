import type { Figure, FigureCanvas, HardCodedPanel } from "./types";
import type { FigureState } from "./figure-state";
import { DEFAULT_TRANSFORM } from "./panels";
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
        // Defensive: any image-bearing panel that bypassed the reducer
        // (test harnesses, hand-built fixtures) gets a default transform
        // so downstream render code never branches on undefined.
        transform: p.transform ?? DEFAULT_TRANSFORM,
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
