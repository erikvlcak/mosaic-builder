import * as React from "react";
import { useRef } from "react";
import type { Corner } from "../../model/grid-layout";
import type { PanelRect } from "../../render/coords";
import { useSpaceHeld } from "../../interaction/InteractionContext";

interface Props {
  /** Selected panel rect in figure-px. */
  panelRect: PanelRect;
  figurePxW: number;
  figurePxH: number;
  cssW: number;
  cssH: number;
  /**
   * Dragging a handle dispatches RESIZE_PANEL_FREEFORM via this callback.
   * dx/dy are INCREMENTAL figure-px deltas (frame-to-frame); the reducer
   * applies each atop the current rects.
   */
  onResizeFreeform: (corner: Corner, dx: number, dy: number) => void;
  /** Called once on pointer-up so a whole drag is one history entry. */
  onCommit: () => void;
}

/**
 * Corner resize handles for the SELECTED panel. Layout operations (panel
 * geometry) belong to selection; content operations (image framing) belong
 * to Frame mode — these were conflated in one mode before the interaction
 * redesign.
 */
export function SelectedPanelHandles({
  panelRect,
  figurePxW,
  figurePxH,
  cssW,
  cssH,
  onResizeFreeform,
  onCommit,
}: Props): JSX.Element {
  const cssToFigX = figurePxW / cssW;
  const cssToFigY = figurePxH / cssH;
  return (
    <div
      data-testid="selected-panel-handles"
      style={{
        position: "absolute",
        left: panelRect.x * (cssW / figurePxW),
        top: panelRect.y * (cssH / figurePxH),
        width: panelRect.w * (cssW / figurePxW),
        height: panelRect.h * (cssH / figurePxH),
        pointerEvents: "none",
        boxSizing: "border-box",
        // Above the annotation layer (zIndex 3) so the handles win hits on
        // the panel corners; the container itself is hit-transparent.
        zIndex: 4,
      }}
    >
      {(["tl", "tr", "bl", "br"] as const).map((corner) => (
        <CornerHandle
          key={corner}
          corner={corner}
          cssToFigX={cssToFigX}
          cssToFigY={cssToFigY}
          onResize={onResizeFreeform}
          onCommit={onCommit}
        />
      ))}
    </div>
  );
}

interface CornerHandleProps {
  corner: Corner;
  cssToFigX: number;
  cssToFigY: number;
  onResize: (corner: Corner, dx: number, dy: number) => void;
  onCommit: () => void;
}

function CornerHandle({
  corner,
  cssToFigX,
  cssToFigY,
  onResize,
  onCommit,
}: CornerHandleProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const spaceHeld = useSpaceHeld();
  // Track last clientX/Y so each pointermove dispatches an INCREMENTAL delta
  // (frame-to-frame). The reducer applies each delta atop the current rects,
  // so cumulative semantics emerge naturally from incremental dispatches.
  const dragRef = useRef<{
    pointerId: number;
    lastClientX: number;
    lastClientY: number;
  } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    // Space = hand tool: yield to the viewport pan owner (don't capture,
    // don't stopPropagation — let the press bubble to the pan sequence).
    if (spaceHeld) return;
    // Reject right/middle clicks. e.button can be undefined under jsdom
    // synthesized events; treat that as "primary" for testability.
    if (e.button !== undefined && e.button !== 0) return;
    if (ref.current === null) return;
    // Don't bubble to the viewport pan owner.
    e.stopPropagation();
    if (typeof ref.current.setPointerCapture === "function") {
      ref.current.setPointerCapture(e.pointerId);
    }
    dragRef.current = {
      pointerId: e.pointerId,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== e.pointerId) return;
    const dx = (e.clientX - drag.lastClientX) * cssToFigX;
    const dy = (e.clientY - drag.lastClientY) * cssToFigY;
    drag.lastClientX = e.clientX;
    drag.lastClientY = e.clientY;
    if (dx !== 0 || dy !== 0) {
      onResize(corner, dx, dy);
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== e.pointerId) return;
    if (
      ref.current !== null &&
      typeof ref.current.hasPointerCapture === "function" &&
      ref.current.hasPointerCapture(e.pointerId)
    ) {
      ref.current.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    onCommit();
  }

  const SIZE = 12;
  // Position relative to the container. The negative offsets put the handle
  // CENTERED on the panel's corner.
  const positions: Record<Corner, React.CSSProperties> = {
    tl: { left: -SIZE / 2, top: -SIZE / 2, cursor: "nwse-resize" },
    tr: { right: -SIZE / 2, top: -SIZE / 2, cursor: "nesw-resize" },
    bl: { left: -SIZE / 2, bottom: -SIZE / 2, cursor: "nesw-resize" },
    br: { right: -SIZE / 2, bottom: -SIZE / 2, cursor: "nwse-resize" },
  };
  return (
    <div
      ref={ref}
      data-testid={`corner-handle-${corner}`}
      data-interactive="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="corner-handle"
      style={{
        position: "absolute",
        width: SIZE,
        height: SIZE,
        ...positions[corner],
        background: "var(--c-accent)",
        border: "1px solid var(--c-surface)",
        borderRadius: 2,
        zIndex: 5,
        pointerEvents: "auto",
        touchAction: "none",
      }}
    />
  );
}
