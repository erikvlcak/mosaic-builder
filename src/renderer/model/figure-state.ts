import type { ImagePoolItem } from "./pool";
import type { Panel } from "./panels";
import type { Annotation } from "./annotations";
import { type GlobalAnnoStyle, DEFAULT_GLOBAL_STYLE } from "./global-style";
import { type GridLayout, uniformLayoutFor } from "./grid-layout";

/**
 * Per-letter override shape (spec 08). `text` overrides the derived label
 * from the active pattern; `style` is a sparse patch over `globalStyle.letters`
 * — only the fields the user changed are stored. Both are optional so callers
 * can carry only what they need (text-only overrides are common; style-only
 * overrides exist when the user changes color but keeps the auto label).
 */
export interface LetterOverride {
  text?: string;
  style?: Partial<{
    color: string;
    bgColor: string;
    font: string;
    sizePt: number;
    bold: boolean;
    italic: boolean;
  }>;
}

/**
 * Active pattern for auto-derived letter labels. `uppercase` is the default
 * (matches pre-spec-08 behavior). Pattern only applies to letters that lack
 * a `text` override — manual overrides are preserved across pattern changes.
 */
export type LetterPattern =
  | "uppercase"
  | "lowercase"
  | "numeric"
  | "uppercase-paren"
  | "uppercase-bracket"
  | "rowcol-mixed";

export const MIN_CANVAS_W = 800;
export const MIN_CANVAS_H = 600;

export interface CellCoord {
  row: number;
  col: number;
}

export type CellKey = string;

export function cellKey(row: number, col: number): CellKey {
  return `${row},${col}`;
}

/**
 * Panel-centric figure state. A panel covers one or more cells; merged
 * panels have rowSpan/colSpan > 1. Invariant: panels partition
 * [0,rows) × [0,cols) exactly. The reducer enforces this.
 */
export interface FigureState {
  /**
   * Insertion-ordered. New uploads append; placement state lives on
   * `panels[*].imageId` so reordering placements never reshuffles the tray.
   */
  pool: ImagePoolItem[];

  /**
   * Non-overlapping rectangular panels covering the rows×cols grid.
   * Order is irrelevant for correctness but stable insertion order helps
   * deterministic rendering.
   */
  panels: Panel[];

  /** 1..10 in M4. */
  rows: number;
  cols: number;

  /** Gutter is figure-canvas pixels. */
  gutterPx: number;
  /** Hex color, "#RRGGBB" or "#RRGGBBAA". */
  gutterColor: string;
  /**
   * When true (default), the gutter color fills the canvas's outer band
   * around the panel grid. When false, panels reach the canvas edge and
   * only inter-panel gutters are visible.
   */
  outerGutter: boolean;

  // ---- M6 ----
  /** Append-only insertion order; rendered in z-then-array order. */
  annotations: Annotation[];
  /** Figure-wide letter + scale-bar style. */
  globalStyle: GlobalAnnoStyle;
  /**
   * panelId → per-letter override. `text` overrides the derived label;
   * `style` is a sparse patch atop `globalStyle.letters`. Empty when no
   * override has been set; missing keys mean "use derived label + global
   * style".
   */
  letterOverrides: Record<string, LetterOverride>;
  /** Active label pattern. Default `"uppercase"` (A, B, C…). */
  letterPattern: LetterPattern;

  /**
   * Layout regime. Default: uniform with equal weights for the current
   * grid dims (matches pre-spec-11 behavior). User actions transition this
   * to `free` (single-panel corner resize) or back via RESET_TO_UNIFORM_GRID.
   */
  layout: GridLayout;
}

let __panelIdCounter = 0;
function nextPanelId(): string {
  __panelIdCounter += 1;
  return `panel-${__panelIdCounter}`;
}

/**
 * Test-only seam: lets the reducer tests reset the id counter so panel
 * ids in assertions stay stable. Production never calls this.
 */
export function __resetPanelIdsForTests(): void {
  __panelIdCounter = 0;
}

function defaultPanels(rows: number, cols: number): Panel[] {
  const out: Panel[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ id: nextPanelId(), row: r, col: c, rowSpan: 1, colSpan: 1 });
    }
  }
  return out;
}

export function initialFigureState(): FigureState {
  return {
    pool: [],
    panels: defaultPanels(2, 2),
    rows: 2,
    cols: 2,
    gutterPx: 12,
    gutterColor: "#FFFFFF",
    outerGutter: true,
    annotations: [],
    globalStyle: DEFAULT_GLOBAL_STYLE,
    letterOverrides: {},
    letterPattern: "uppercase",
    layout: uniformLayoutFor(2, 2),
  };
}

export type { GridLayout } from "./grid-layout";

export { newPanelId };

function newPanelId(): string {
  return nextPanelId();
}

export { figureReducer } from "./figure-actions";
