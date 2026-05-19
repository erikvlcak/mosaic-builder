import type { Corner } from "./global-style";

/**
 * Picker state for the Scalebar tool: defaults that pre-fill the click-to-
 * place popover, and the corner override applied to the new annotation.
 * Lives in App-level React state — not in `FigureState` — because it's
 * session-only UI state (not undoable, not serialized).
 *
 * Mirrors [[default-symbol-style]] and [[default-text-style]]. Note that
 * scalebar *visual* style (bar color, height, label font/size) lives in
 * `state.globalStyle.scalebar` — there is no per-annotation override for
 * those — so it intentionally does not appear here. Editing those goes
 * through `CanvasAndGlobalStyleForm`.
 */
export interface DefaultScalebarStyle {
  lengthValue: number;
  lengthUnit: "um" | "mm" | "px";
  /** Corner the new scalebar is pinned to (overrides global default). */
  cornerOverride: Corner;
}

export function initialDefaultScalebarStyle(): DefaultScalebarStyle {
  return {
    lengthValue: 100,
    lengthUnit: "um",
    cornerOverride: "br",
  };
}
