import type { Figure, HardCodedPanel } from "../model/types";

export interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Computes the integer pixel rectangle for each panel in figure.panels,
 * in the same order. Outer gutter is included on all four edges.
 *
 * Width remainder distribution: cells get floor(avail/cols); the trailing
 * cell absorbs the remainder so the right edge lands on `widthPx - gutter`.
 */
export function computePanelRects(figure: Figure): PanelRect[] {
  const { widthPx, heightPx } = figure.canvas;
  const { rows, cols, gutterPx } = figure.grid;

  const availW = widthPx - gutterPx * (cols + 1);
  const availH = heightPx - gutterPx * (rows + 1);
  const cellW = Math.floor(availW / cols);
  const cellH = Math.floor(availH / rows);
  const wRemainder = availW - cellW * cols;
  const hRemainder = availH - cellH * rows;

  return figure.panels.map((p: HardCodedPanel): PanelRect => {
    const isLastCol = p.col === cols - 1;
    const isLastRow = p.row === rows - 1;
    const w = cellW + (isLastCol ? wRemainder : 0);
    const h = cellH + (isLastRow ? hRemainder : 0);
    const x = gutterPx + p.col * (cellW + gutterPx);
    const y = gutterPx + p.row * (cellH + gutterPx);
    return { x, y, w, h };
  });
}
