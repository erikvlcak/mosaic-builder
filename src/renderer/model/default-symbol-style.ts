import type { FillMode, StrokeStyle } from "./annotations";
import {
  DEFAULT_SYMBOL_ID,
  DEFAULT_FILL_MODE,
  DEFAULT_STROKE_STYLE,
  DEFAULT_SYMBOL_COLOR,
  DEFAULT_SYMBOL_STROKE,
} from "../symbols/library";

/**
 * Picker state: the style/shape pair that `AnnotationInteractionLayer` reads
 * when the user clicks the canvas in `symbol` tool mode. Lives in App-level
 * React state — not in `FigureState` — because it's session-only UI state
 * (not undoable, not serialized).
 */
export interface DefaultSymbolStyle {
  symbolId: string;
  fillMode: FillMode;
  strokeStyle: StrokeStyle;
  strokeWidthPx: number;
  color: string;
}

export function initialDefaultSymbolStyle(): DefaultSymbolStyle {
  return {
    symbolId: DEFAULT_SYMBOL_ID,
    fillMode: DEFAULT_FILL_MODE,
    strokeStyle: DEFAULT_STROKE_STYLE,
    strokeWidthPx: DEFAULT_SYMBOL_STROKE,
    color: DEFAULT_SYMBOL_COLOR,
  };
}
