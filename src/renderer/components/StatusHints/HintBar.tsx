/**
 * The discoverability layer: a one-line, muted, non-interactive strip
 * under the canvas pane (Blender-style status hints). Pure function of
 * the current interaction state — a hint must never mention a gesture
 * that doesn't work in that state.
 */

export interface HintContext {
  spaceHeld: boolean;
  frameMode: boolean;
  toolArmed: boolean;
  selection: "none" | "placed-panel" | "empty-panel";
}

export function hintFor(ctx: HintContext): string {
  if (ctx.spaceHeld) return "Panning — release Space to return";
  if (ctx.toolArmed) {
    return "Click to place · ⇧Click to place several · Esc cancel";
  }
  if (ctx.frameMode) {
    return "Drag to position · ⌘Scroll to zoom · Arrows nudge · 0 reset · Esc done";
  }
  if (ctx.selection === "placed-panel") {
    return "Drag image to another panel to move or swap · Double-click to frame · ⌫ remove · ⇧Click cells to merge";
  }
  if (ctx.selection === "empty-panel") {
    return "Drag an image here from the tray · Click the centre to browse · ⇧Click cells to merge";
  }
  return "Click a panel to select · Double-click to frame · Scroll to pan · ⌘Scroll to zoom";
}

export function HintBar({ context }: { context: HintContext }): JSX.Element {
  return (
    <div className="hint-bar" data-testid="hint-bar" aria-live="polite">
      {hintFor(context)}
    </div>
  );
}
