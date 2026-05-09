/**
 * M2 figure model — a deliberate subset of the full Project schema.
 * Expanded in M4 (configurable grid + merged panels via rowSpan/colSpan),
 * M5 (per-panel transforms), and M6 (annotations).
 */

import type { PanelTransform } from "./panels";
import type {
  TextAnnotation,
  SymbolAnnotation,
  BoxAnnotation,
  ScaleBarAnnotation,
  LetterAnnotation,
} from "./annotations";
import type { GlobalAnnoStyle } from "./global-style";
import type { LetterOverride } from "./figure-state";

export type Hex = string; // "#RRGGBB" or "#RRGGBBAA"

export interface FigureCanvas {
  widthPx: number;
  heightPx: number;
  background: Hex;
}

export interface FigureGrid {
  rows: number;
  cols: number;
  gutterPx: number;
  gutterColor: Hex;
  /**
   * When true (default), the gutter color fills the canvas's outer band
   * around the panel grid. When false, panels reach the canvas edge.
   * Optional on the type to keep historic test fixtures buildable;
   * `computePanelRects` defaults missing values to `true` (the prior
   * behavior). Production figures always populate this via `deriveFigure`.
   */
  outerGutter?: boolean;
}

export type HardCodedPanel =
  | {
      /**
       * Identity of the source `Panel` this was derived from. Optional
       * because some hand-built test fixtures omit it; `figure-derivations`
       * always populates it. Annotation matching (letters, scale bars,
       * panel-anchored text/box) keys off this id.
       */
      panelId?: string;
      row: number;
      col: number;
      kind: "image";
      imageId: string;
      rowSpan?: number;
      colSpan?: number;
      transform: PanelTransform;
    }
  | {
      panelId?: string;
      row: number;
      col: number;
      kind: "placeholder";
      label: string;
      rowSpan?: number;
      colSpan?: number;
    };

/**
 * Resolved annotation shape consumed by `render/`. Scale bars carry an
 * already-resolved `resolvedPanelId` to avoid re-querying the panel list
 * during draw.
 */
export type ResolvedAnnotation =
  | (TextAnnotation & { kind: "text" })
  | (SymbolAnnotation & { kind: "symbol" })
  | (BoxAnnotation & { kind: "box" })
  | (ScaleBarAnnotation & { kind: "scalebar"; resolvedPanelId: string })
  | (LetterAnnotation & { kind: "letter" });

export interface Figure {
  canvas: FigureCanvas;
  grid: FigureGrid;
  panels: HardCodedPanel[];
  /** Resolved + ordered for draw. */
  annotations: ResolvedAnnotation[];
  /** Needed by drawAnnotations for corner + style resolution. */
  globalStyle: GlobalAnnoStyle;
  /**
   * Per-letter overrides keyed by panel id. Optional so hand-built test
   * fixtures (which build `Figure` directly) can omit it; the renderer
   * defaults to "no per-letter style". Production figures always carry the
   * full map via `deriveFigure`.
   */
  letterOverrides?: Record<string, LetterOverride>;
}

export type { PanelTransform, FitMode, Rotation } from "./panels";
export type { LetterAnnotation } from "./annotations";
