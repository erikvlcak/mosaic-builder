import type { Panel } from "./panels";
import { findPanelAt } from "./panels";

export interface CellCoord {
  row: number;
  col: number;
}
export interface Rect {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

export type MergeCheck =
  | { ok: true; rect: Rect }
  | { ok: false; reason: string };

let __mergeIdCounter = 0;
function freshId(): string {
  __mergeIdCounter += 1;
  return `panel-merge-${__mergeIdCounter}`;
}

/**
 * Validates that a selection of cell coords (a) contains at least 2 cells,
 * (b) forms a contiguous rectangle, (c) every cell maps to a 1×1 panel
 * (no merged panels inside the selection — user must unmerge first).
 */
export function canMergeSelection(
  panels: readonly Panel[],
  selection: readonly CellCoord[],
): MergeCheck {
  if (selection.length < 2)
    return { ok: false, reason: "select at least 2 cells" };

  let minRow = Infinity,
    maxRow = -Infinity,
    minCol = Infinity,
    maxCol = -Infinity;
  for (const c of selection) {
    if (c.row < minRow) minRow = c.row;
    if (c.row > maxRow) maxRow = c.row;
    if (c.col < minCol) minCol = c.col;
    if (c.col > maxCol) maxCol = c.col;
  }
  const rowSpan = maxRow - minRow + 1;
  const colSpan = maxCol - minCol + 1;
  if (rowSpan * colSpan !== selection.length) {
    return { ok: false, reason: "selection is not a filled rectangle" };
  }
  // Dedup check + coverage check.
  const seen = new Set<string>();
  for (const c of selection) {
    const k = `${c.row},${c.col}`;
    if (seen.has(k))
      return { ok: false, reason: "duplicate cell in selection" };
    seen.add(k);
    const p = findPanelAt(panels, c.row, c.col);
    if (p === null) return { ok: false, reason: "cell out of grid" };
    if (p.rowSpan !== 1 || p.colSpan !== 1) {
      return { ok: false, reason: "cell already in a merged panel" };
    }
  }
  return {
    ok: true,
    rect: { row: minRow, col: minCol, rowSpan, colSpan },
  };
}

/**
 * Replace every panel inside `rect` with one merged panel. The new panel's
 * imageId is the imageId of the panel currently at `rect.row,rect.col`
 * (top-left); other cells' images are dropped (the reducer's caller must
 * track this and release them back to the unplaced tray section by NOT
 * removing them from the pool).
 *
 * Pure: returns a new array; does not mutate input.
 */
export function mergePanels(panels: readonly Panel[], rect: Rect): Panel[] {
  const inside = (p: Panel): boolean =>
    p.row >= rect.row &&
    p.col >= rect.col &&
    p.row + p.rowSpan <= rect.row + rect.rowSpan &&
    p.col + p.colSpan <= rect.col + rect.colSpan;

  const tl = findPanelAt(panels, rect.row, rect.col);
  const merged: Panel = {
    id: freshId(),
    row: rect.row,
    col: rect.col,
    rowSpan: rect.rowSpan,
    colSpan: rect.colSpan,
  };
  if (tl?.imageId !== undefined) {
    merged.imageId = tl.imageId;
    if (tl.transform !== undefined) merged.transform = tl.transform;
  }

  const out = panels.filter((p) => !inside(p));
  out.push(merged);
  out.sort((a, b) => a.row - b.row || a.col - b.col);
  return out;
}

/**
 * Replace one merged panel with rowSpan*colSpan 1x1 panels. The merged
 * panel's imageId (if any) goes to the top-left cell. No-op on a 1x1.
 */
export function unmergePanel(
  panels: readonly Panel[],
  panelId: string,
): Panel[] {
  const target = panels.find((p) => p.id === panelId);
  if (target === undefined) return panels as Panel[];
  if (target.rowSpan === 1 && target.colSpan === 1) return panels as Panel[];

  const out = panels.filter((p) => p.id !== panelId);
  for (let r = target.row; r < target.row + target.rowSpan; r++) {
    for (let c = target.col; c < target.col + target.colSpan; c++) {
      const p: Panel = {
        id: freshId(),
        row: r,
        col: c,
        rowSpan: 1,
        colSpan: 1,
      };
      if (
        r === target.row &&
        c === target.col &&
        target.imageId !== undefined
      ) {
        p.imageId = target.imageId;
        if (target.transform !== undefined) p.transform = target.transform;
      }
      out.push(p);
    }
  }
  out.sort((a, b) => a.row - b.row || a.col - b.col);
  return out;
}
