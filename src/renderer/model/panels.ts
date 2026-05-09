/**
 * A rectangular panel covering one or more cells of the figure grid.
 *
 * Invariants (enforced by reducer + asserted in tests):
 *   - Panels never overlap (a cell is covered by at most one panel).
 *   - Spans are positive and stay within the grid.
 *
 * Coverage is **not** required: a hole (cell covered by no panel) is a
 * valid state that arises from `DELETE_PANEL`. Hole cells render
 * transparently (PNG/TIFF) or as gutter fill (JPEG/PDF) and can be
 * restored via `RESTORE_PANEL_AT`. Use `assertPanelsValid` for the
 * relaxed check; the legacy `assertPanelsCoverGrid` still asserts a
 * full partition where appropriate (grid-resize / merge outputs).
 */
export type FitMode = "contain" | "cover" | "stretch";
export type Rotation = 0 | 90 | 180 | 270;

/**
 * Sub-rectangle of the source image to display, in normalized 0..1 coords.
 * Absent ⇔ no crop (uses the full source rect). Stored normalized rather
 * than in source-px so the value survives image swaps and is meaningful in
 * hand-built test fixtures that lack real bitmap dims.
 */
export interface PanelCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PanelTransform {
  fit: FitMode;
  /** figure-px, panel-local; (0,0) = panel center. */
  panX: number;
  panY: number;
  /** 1.0 = baseline (Contain or Cover baseline depending on `fit`). */
  zoom: number;
  rotation: Rotation;
  flipH: boolean;
  flipV: boolean;
  /** Non-destructive sub-rect of the source. Absent = full source. */
  crop?: PanelCrop;
}

export const DEFAULT_TRANSFORM: PanelTransform = {
  fit: "contain",
  panX: 0,
  panY: 0,
  zoom: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
};

/**
 * A `PanelCrop` is valid when its rect is strictly positive and stays
 * within the unit square. The reducer rejects out-of-range crops as no-ops.
 */
export function isValidCrop(c: PanelCrop): boolean {
  if (
    !Number.isFinite(c.x) ||
    !Number.isFinite(c.y) ||
    !Number.isFinite(c.w) ||
    !Number.isFinite(c.h)
  ) {
    return false;
  }
  if (c.x < 0 || c.y < 0) return false;
  if (c.w <= 0 || c.h <= 0) return false;
  if (c.x + c.w > 1) return false;
  if (c.y + c.h > 1) return false;
  return true;
}

export interface Panel {
  id: string;
  row: number;
  col: number;
  rowSpan: number; // >= 1
  colSpan: number; // >= 1
  imageId?: string;
  /** Present iff `imageId` is set. Reducer enforces. */
  transform?: PanelTransform;
  /**
   * When true, the panel still occupies its cells (no hole) but renders
   * empty in the editor and the export. Reducer rejects setting this on
   * an image-bearing panel — the user must unplace first. Absent ⇔ false.
   */
  hidden?: boolean;
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

/**
 * Relaxed invariant for the post-spec-02 world: panels still don't
 * overlap and stay in bounds, but holes (uncovered cells) are allowed.
 * Used by callers that legitimately tolerate holes — the reducer's
 * delete path, schema validation, etc. Throws on overlap or out-of-bounds.
 */
export function assertPanelsValid(
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
}

/**
 * Return every (row, col) in the grid that no panel covers. Used by the
 * renderer to paint hole cells (gutter fill / transparent) and by
 * GridCells to render the click-to-restore affordance.
 *
 * Output is row-major; deterministic and stable.
 */
export function cellsWithoutPanel(
  panels: readonly Panel[],
  rows: number,
  cols: number,
): { row: number; col: number }[] {
  const covered = new Array<boolean>(rows * cols).fill(false);
  for (const p of panels) {
    for (let r = p.row; r < p.row + p.rowSpan; r++) {
      for (let c = p.col; c < p.col + p.colSpan; c++) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          covered[r * cols + c] = true;
        }
      }
    }
  }
  const out: { row: number; col: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!covered[r * cols + c]) out.push({ row: r, col: c });
    }
  }
  return out;
}
