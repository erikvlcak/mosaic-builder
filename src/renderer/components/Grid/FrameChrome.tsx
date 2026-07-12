import type { PanelRect } from "../../render/coords";

interface Props {
  /** Framed panel rect in figure-px. */
  panelRect: PanelRect;
  figurePxW: number;
  figurePxH: number;
  cssW: number;
  cssH: number;
  /** Image zoom as a percentage (100 = unzoomed). */
  zoomPct: number;
}

/**
 * Pure chrome for Frame mode — owns NO handlers (gestures live in
 * useFrameGestures / useViewportGestures). The scrim is what makes "what
 * will my scroll affect?" answerable at a glance: everything except the
 * framed panel dims. DOM-only overlay — the export pipeline never sees it.
 */
export function FrameChrome({
  panelRect,
  figurePxW,
  figurePxH,
  cssW,
  cssH,
  zoomPct,
}: Props): JSX.Element {
  const sx = cssW / figurePxW;
  const sy = cssH / figurePxH;
  return (
    <div
      data-testid="frame-chrome"
      style={{
        position: "absolute",
        left: panelRect.x * sx,
        top: panelRect.y * sy,
        width: panelRect.w * sx,
        height: panelRect.h * sy,
        pointerEvents: "none",
        boxSizing: "border-box",
        // Dashed accent = framing (vs the SOLID accent GridCells draws on a
        // merely-selected panel) — pattern, not just color, for colorblind
        // users.
        outline: "3px dashed var(--c-accent)",
        outlineOffset: -3,
        // The scrim: one giant spread shadow dims everything around the
        // framed panel without extra strip elements.
        boxShadow: "0 0 0 9999px var(--c-frame-scrim)",
        zIndex: 6,
      }}
    >
      <span className="frame-chip" data-testid="frame-chip">
        Framing — Esc when done
      </span>
      <span className="frame-zoom-readout" data-testid="frame-zoom-readout">
        {Math.round(zoomPct)}%
      </span>
    </div>
  );
}
