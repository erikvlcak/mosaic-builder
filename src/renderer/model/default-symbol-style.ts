import type { FillMode, StrokeStyle } from "./annotations";

/**
 * Picker state: the style/shape pair that `AnnotationInteractionLayer` reads
 * when the user clicks the canvas in `symbol` tool mode. Lives in App-level
 * React state — not in `FigureState` — because it's session-only UI state
 * (not undoable, not serialized).
 *
 * The default values here are duplicated from `src/renderer/symbols/library.ts`
 * (DEFAULT_SYMBOL_ID etc.) because this module sits in `model/` so it can be
 * imported from main/preload tsconfigs that don't include `renderer/symbols/`.
 * If the library defaults change, update both sites.
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
    symbolId: "arrow-filled-right",
    fillMode: "filled",
    strokeStyle: "solid",
    strokeWidthPx: 2,
    color: "#FF0000",
  };
}
