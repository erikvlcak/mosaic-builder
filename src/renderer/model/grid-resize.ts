import type { Panel } from "./panels";

export interface ResizeResult {
  panels: Panel[];
  releasedImageIds: string[];
}

let __resizeIdCounter = 0;
function freshId(): string {
  __resizeIdCounter += 1;
  return `panel-resize-${__resizeIdCounter}`;
}

/**
 * Resize the grid from (fromRows × fromCols) to (toRows × toCols).
 *
 * Rules:
 *  - For every existing panel, intersect its rectangle with [0,toRows) × [0,toCols).
 *  - If the intersection is empty, the panel is dropped and its imageId
 *    (if any) is added to releasedImageIds.
 *  - If the intersection is the full original rectangle, the panel is kept
 *    as-is.
 *  - Otherwise (merged panel straddling the new edge), the panel is split
 *    into 1×1 panels covering the intersection. The original imageId is
 *    assigned to the cell that was the panel's top-left if that cell is
 *    inside the intersection; otherwise releasedImageIds receives the image.
 *  - Any cell in [0,toRows) × [0,toCols) not covered by a kept/split panel
 *    gets a new empty 1×1 panel.
 */
export function resizePanels(
  panels: readonly Panel[],
  _fromRows: number,
  _fromCols: number,
  toRows: number,
  toCols: number,
): ResizeResult {
  const released: string[] = [];
  const cover: (Panel | null)[] = Array.from(
    { length: toRows * toCols },
    () => null,
  );
  const out: Panel[] = [];

  for (const p of panels) {
    const r0 = Math.max(0, p.row);
    const c0 = Math.max(0, p.col);
    const r1 = Math.min(toRows, p.row + p.rowSpan);
    const c1 = Math.min(toCols, p.col + p.colSpan);
    if (r0 >= r1 || c0 >= c1) {
      if (p.imageId !== undefined) released.push(p.imageId);
      continue;
    }
    const fullyInside =
      r0 === p.row && c0 === p.col && r1 === p.row + p.rowSpan && c1 === p.col + p.colSpan;
    if (fullyInside) {
      out.push(p);
      for (let r = r0; r < r1; r++)
        for (let c = c0; c < c1; c++) cover[r * toCols + c] = p;
      continue;
    }
    // Split: merged panel partially clipped — emit 1x1 panels.
    const tlInside = p.row >= 0 && p.row < toRows && p.col >= 0 && p.col < toCols;
    let imageAssigned = false;
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        const np: Panel = { id: freshId(), row: r, col: c, rowSpan: 1, colSpan: 1 };
        if (tlInside && r === p.row && c === p.col && p.imageId !== undefined) {
          np.imageId = p.imageId;
          imageAssigned = true;
        }
        out.push(np);
        cover[r * toCols + c] = np;
      }
    }
    if (!imageAssigned && p.imageId !== undefined) released.push(p.imageId);
  }

  // Fill any uncovered cell with a fresh empty 1x1.
  for (let r = 0; r < toRows; r++) {
    for (let c = 0; c < toCols; c++) {
      if (cover[r * toCols + c] === null) {
        const np: Panel = { id: freshId(), row: r, col: c, rowSpan: 1, colSpan: 1 };
        out.push(np);
      }
    }
  }

  // Stable order: row-major by top-left.
  out.sort((a, b) => a.row - b.row || a.col - b.col);

  return { panels: out, releasedImageIds: released };
}
