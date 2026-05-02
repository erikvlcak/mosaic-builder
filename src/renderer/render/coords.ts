import type { Figure, HardCodedPanel } from "../model/types";

export interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Computes the integer pixel rectangle for each panel in figure.panels,
 * in the same order. Outer gutter is included on all four edges; internal
 * gutters between merged-panel cells are absorbed into the merged panel.
 *
 * Width remainder distribution: cells get floor(avail/cols); the panel
 * whose right edge sits on the grid's last column absorbs `wRemainder`,
 * so the right edge always lands on `widthPx - gutter`. Same for rows.
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
    const rowSpan = p.rowSpan ?? 1;
    const colSpan = p.colSpan ?? 1;
    const lastColInPanel = p.col + colSpan - 1;
    const lastRowInPanel = p.row + rowSpan - 1;

    const baseW = colSpan * cellW + (colSpan - 1) * gutterPx;
    const baseH = rowSpan * cellH + (rowSpan - 1) * gutterPx;
    const w = baseW + (lastColInPanel === cols - 1 ? wRemainder : 0);
    const h = baseH + (lastRowInPanel === rows - 1 ? hRemainder : 0);
    const x = gutterPx + p.col * (cellW + gutterPx);
    const y = gutterPx + p.row * (cellH + gutterPx);
    return { x, y, w, h };
  });
}
