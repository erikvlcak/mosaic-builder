/**
 * The discoverability layer: a one-line, muted, non-interactive strip
 * under the canvas pane (Blender-style status hints). Pure function of
 * the current interaction state — a hint must never mention a gesture
 * that doesn't work in that state.
 */

import { GLYPHS, type ShortcutGlyphs } from "../../platform/shortcuts";

export interface HintContext {
  spaceHeld: boolean;
  frameMode: boolean;
  toolArmed: boolean;
  selection: "none" | "placed-panel" | "empty-panel";
}

/**
 * Hints are running prose, so keys are spelled out as words — "Shift-click",
 * "Delete" — on every platform. Symbols belong in menus and tooltips, where a
 * lone `⌘Z` is conventional; inside a sentence they read as noise, and `⇧`/`⌫`
 * mean nothing to a Windows user. The one genuine platform difference is the
 * zoom modifier, which is why `glyphs` is still threaded through.
 *
 * `glyphs` is injected rather than read from the module constant so this stays
 * a pure projection of the interaction state — the table-driven tests assert
 * both platforms through the same entry point.
 */
export function hintFor(
  ctx: HintContext,
  glyphs: ShortcutGlyphs = GLYPHS,
): string {
  // `chord` keeps the modifier joined the native way: "⌘Scroll" vs "Ctrl+Scroll".
  const zoomChord = glyphs.chord(glyphs.mod, "Scroll");
  if (ctx.spaceHeld) return "Panning — release Space to return";
  if (ctx.toolArmed) {
    return "Click to place · Shift-click to place several · Esc cancel";
  }
  if (ctx.frameMode) {
    return `Drag to position · ${zoomChord} to zoom · Arrows nudge · 0 reset · Esc done`;
  }
  if (ctx.selection === "placed-panel") {
    return "Drag image to another panel to move or swap · Double-click to frame · Delete removes · Shift-click cells to merge";
  }
  if (ctx.selection === "empty-panel") {
    return "Drag an image here from the tray · Click the centre to browse · Shift-click cells to merge";
  }
  return `Click a panel to select · Double-click to frame · Scroll to pan · ${zoomChord} to zoom`;
}

export function HintBar({ context }: { context: HintContext }): JSX.Element {
  return (
    <div className="hint-bar" data-testid="hint-bar" aria-live="polite">
      {hintFor(context)}
    </div>
  );
}
