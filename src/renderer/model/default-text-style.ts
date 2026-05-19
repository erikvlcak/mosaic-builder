/**
 * Picker state for the Text tool: style values that
 * `AnnotationInteractionLayer` reads when the user clicks the canvas in
 * `text` tool mode. Lives in App-level React state — not in `FigureState` —
 * because it's session-only UI state (not undoable, not serialized).
 *
 * Mirrors [[default-symbol-style]]. The literal defaults below are kept in
 * sync with the post-placement `TextAnnoForm` defaults; if they drift, the
 * picker would silently lie about what gets placed.
 */
export interface DefaultTextStyle {
  font: string;
  sizePt: number;
  bold: boolean;
  italic: boolean;
  color: string;
  /** Undefined means transparent — same convention as `TextAnnotation.bgColor`. */
  bgColor?: string;
}

export function initialDefaultTextStyle(): DefaultTextStyle {
  return {
    font: "Arial, Helvetica, sans-serif",
    sizePt: 12,
    bold: false,
    italic: false,
    color: "#000000",
  };
}
