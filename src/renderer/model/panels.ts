/**
 * A rectangular panel covering one or more cells of the figure grid.
 * Invariant (enforced by reducer + asserted in tests): the panels in a
 * FigureState cover every cell in [0,rows) × [0,cols) exactly once.
 */
export interface Panel {
  id: string;
  row: number;
  col: number;
  rowSpan: number; // >= 1
  colSpan: number; // >= 1
  imageId?: string;
}

export function panelCovers(p: Panel, row: number, col: number): boolean {
  return (
    row >= p.row &&
    row < p.row + p.rowSpan &&
    col >= p.col &&
    col < p.col + p.colSpan
  );
}

export function findPanelAt(
  panels: readonly Panel[],
  row: number,
  col: number,
): Panel | null {
  for (const p of panels) if (panelCovers(p, row, col)) return p;
  return null;
}

/**
 * Throws if `panels` does not partition [0,rows) × [0,cols) — i.e. any
 * cell is uncovered or covered by more than one panel.
 */
export function assertPanelsCoverGrid(
  panels: readonly Panel[],
  rows: number,
  cols: number,
): void {
  const seen: (string | null)[] = Array.from(
    { length: rows * cols },
    () => null,
  );
  for (const p of panels) {
    if (p.rowSpan < 1 || p.colSpan < 1) {
      throw new Error(`panel ${p.id} has non-positive span`);
    }
    if (
      p.row < 0 ||
      p.col < 0 ||
      p.row + p.rowSpan > rows ||
      p.col + p.colSpan > cols
    ) {
      throw new Error(`panel ${p.id} out of bounds`);
    }
    for (let r = p.row; r < p.row + p.rowSpan; r++) {
      for (let c = p.col; c < p.col + p.colSpan; c++) {
        const i = r * cols + c;
        if (seen[i] !== null) {
          throw new Error(
            `panels overlap at (${r},${c}): ${seen[i]} and ${p.id}`,
          );
        }
        seen[i] = p.id;
      }
    }
  }
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] === null) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      throw new Error(`gap at (${r},${c}) — uncovered`);
    }
  }
}
