import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import type { FigureAction } from "../../model/figure-actions";
import { setPanelTransform } from "../../model/figure-actions";
import type { PanelTransform } from "../../model/panels";
import {
  panForCursorZoom,
  snapTransform,
  type PanelRect,
} from "../../render/coords";

interface Props {
  panelId: string;
  /** Panel rect in figure-pixel coordinates. */
  panelRect: PanelRect;
  transform: PanelTransform;
  bitmap: ImageBitmap;
  figurePxW: number;
  figurePxH: number;
  cssW: number;
  cssH: number;
  dispatch: Dispatch<FigureAction>;
  /**
   * Called once on `pointerup` and on a debounced wheel-end so a drag or
   * a sequence of wheel events records a single history entry.
   */
  onCommit: () => void;
}

/**
 * A pointer-events layer mounted on top of the focused image panel. Routes
 * pan/zoom gestures into SET_PANEL_TRANSFORM dispatches with clamping done
 * up-front by `snapTransform`. HTML5 drag-and-drop on the same panel is
 * unaffected because dnd uses dragstart/dragover/drop, a separate event
 * channel from pointer events.
 *
 * Stretch fit disables pointer events entirely (no user pan/zoom there).
 */
export function PanelInteractionLayer({
  panelId,
  panelRect,
  transform,
  bitmap,
  figurePxW,
  figurePxH,
  cssW,
  cssH,
  dispatch,
  onCommit,
}: Props): JSX.Element | null {
  const ref = useRef<HTMLDivElement | null>(null);
  // Keep the latest transform/rect/etc. in a ref so the wheel handler
  // (added once via addEventListener with { passive: false }) reads
  // current values without re-binding on every state change.
  const stateRef = useRef({ panelId, panelRect, transform, bitmap, figurePxW, figurePxH, cssW, cssH, dispatch, onCommit });
  stateRef.current = { panelId, panelRect, transform, bitmap, figurePxW, figurePxH, cssW, cssH, dispatch, onCommit };

  // Drag state — only valid while a pointer is captured.
  const dragRef = useRef<
    | {
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startPanX: number;
        startPanY: number;
      }
    | null
  >(null);

  const wheelEndRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wheel binding — must be { passive: false } so preventDefault() works.
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;

    function onWheel(e: WheelEvent): void {
      const s = stateRef.current;
      if (s.transform.fit === "stretch") return;
      e.preventDefault();
      // Cursor in panel-local figure-px (origin at panel center).
      const rectDom = el!.getBoundingClientRect();
      const cssToFigX = s.figurePxW / s.cssW;
      const cssToFigY = s.figurePxH / s.cssH;
      const cursorPanelLocalX =
        (e.clientX - rectDom.left) * cssToFigX - s.panelRect.w / 2;
      const cursorPanelLocalY =
        (e.clientY - rectDom.top) * cssToFigY - s.panelRect.h / 2;

      const zoomFactor = Math.exp(-e.deltaY * 0.0015);
      const targetZoom = s.transform.zoom * zoomFactor;
      const { panX, panY } = panForCursorZoom(
        s.transform,
        cursorPanelLocalX,
        cursorPanelLocalY,
        targetZoom,
      );
      const next = snapTransform(
        { ...s.transform, zoom: targetZoom, panX, panY },
        s.panelRect.w,
        s.panelRect.h,
        s.bitmap.width,
        s.bitmap.height,
      );
      s.dispatch(setPanelTransform(s.panelId, next));
      if (wheelEndRef.current !== null) clearTimeout(wheelEndRef.current);
      wheelEndRef.current = setTimeout(() => {
        wheelEndRef.current = null;
        s.onCommit();
      }, 250);
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // No pointer events in Stretch — nothing to do.
  if (transform.fit === "stretch") {
    return (
      <div
        ref={ref}
        data-testid="panel-interaction-layer"
        style={{
          position: "absolute",
          left: panelRect.x * (cssW / figurePxW),
          top: panelRect.y * (cssH / figurePxH),
          width: panelRect.w * (cssW / figurePxW),
          height: panelRect.h * (cssH / figurePxH),
          pointerEvents: "none",
          cursor: "default",
        }}
      />
    );
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (ref.current === null) return;
    if (e.button !== 0) return;
    ref.current.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: transform.panX,
      startPanY: transform.panY,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== e.pointerId) return;
    const cssToFigX = figurePxW / cssW;
    const cssToFigY = figurePxH / cssH;
    const dx = (e.clientX - drag.startClientX) * cssToFigX;
    const dy = (e.clientY - drag.startClientY) * cssToFigY;
    const next = snapTransform(
      { ...transform, panX: drag.startPanX + dx, panY: drag.startPanY + dy },
      panelRect.w,
      panelRect.h,
      bitmap.width,
      bitmap.height,
    );
    dispatch(setPanelTransform(panelId, next));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== e.pointerId) return;
    if (ref.current?.hasPointerCapture(e.pointerId)) {
      ref.current.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    onCommit();
  }

  const dragging = dragRef.current !== null;

  return (
    <div
      ref={ref}
      data-testid="panel-interaction-layer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "absolute",
        left: panelRect.x * (cssW / figurePxW),
        top: panelRect.y * (cssH / figurePxH),
        width: panelRect.w * (cssW / figurePxW),
        height: panelRect.h * (cssH / figurePxH),
        pointerEvents: "auto",
        cursor: dragging ? "grabbing" : "grab",
        // Box-only chrome to indicate the active pan/zoom region.
        boxSizing: "border-box",
        outline: "3px solid #0066FF",
        outlineOffset: -3,
        // Don't draw anything — the canvas underneath shows the image.
        background: "transparent",
        // Prevent native touch scrolling from competing with our pointer drag.
        touchAction: "none",
        // Keep above GridCells so pointer events route here, but below any
        // toolbar overlays we add later.
        zIndex: 2,
      }}
    />
  );
}
