import * as React from "react";
import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import type { FigureAction } from "../../model/figure-actions";
import { setPanelTransform } from "../../model/figure-actions";
import type { PanelTransform } from "../../model/panels";
import type { Corner } from "../../model/grid-layout";
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
  /** When false, this layer yields wheel + drag to the canvas-level handlers
   *  so default gestures operate on the whole canvas. Space redirects them
   *  back to this panel's image. */
  spacebarHeld: boolean;
  dispatch: Dispatch<FigureAction>;
  /**
   * Called once on `pointerup` and on a debounced wheel-end so a drag or
   * a sequence of wheel events records a single history entry.
   */
  onCommit: () => void;
  /**
   * Spec 11: when present, four corner handles are rendered. Dragging a
   * handle dispatches RESIZE_PANEL_FREEFORM via this callback. dx/dy are
   * cumulative figure-px deltas from the drag start (NOT incremental).
   */
  onResizeFreeform?: (corner: Corner, dx: number, dy: number) => void;
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
  spacebarHeld,
  dispatch,
  onCommit,
  onResizeFreeform,
}: Props): JSX.Element | null {
  const ref = useRef<HTMLDivElement | null>(null);
  // Keep the latest transform/rect/etc. in a ref so the wheel handler
  // (added once via addEventListener with { passive: false }) reads
  // current values without re-binding on every state change.
  const stateRef = useRef({
    panelId,
    panelRect,
    transform,
    bitmap,
    figurePxW,
    figurePxH,
    cssW,
    cssH,
    spacebarHeld,
    dispatch,
    onCommit,
  });
  stateRef.current = {
    panelId,
    panelRect,
    transform,
    bitmap,
    figurePxW,
    figurePxH,
    cssW,
    cssH,
    spacebarHeld,
    dispatch,
    onCommit,
  };

  // Drag state — only valid while a pointer is captured.
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  const wheelEndRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wheel binding — must be { passive: false } so preventDefault() works.
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;

    function onWheel(e: WheelEvent): void {
      const s = stateRef.current;
      if (!s.spacebarHeld) return; // yield canvas zoom to the container handler
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
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (wheelEndRef.current !== null) {
        clearTimeout(wheelEndRef.current);
        wheelEndRef.current = null;
      }
    };
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
    if (!spacebarHeld) return; // yield view-pan to the canvas container
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

  const dragging = dragRef.current !== null;
  const cssToFigX = figurePxW / cssW;
  const cssToFigY = figurePxH / cssH;

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
        // Unified selection chrome: both modes use the accent hue so a
        // colorblind user tells them apart by pattern, not color — DASHED
        // accent = editing (pan/zoom), vs the SOLID accent GridCells draws
        // around a merely-selected panel.
        outline: "3px dashed var(--c-accent)",
        outlineOffset: -3,
        // Don't draw anything — the canvas underneath shows the image.
        background: "transparent",
        // Prevent native touch scrolling from competing with our pointer drag.
        touchAction: "none",
        // Keep above GridCells so pointer events route here, but below any
        // toolbar overlays we add later.
        zIndex: 2,
      }}
    >
      {onResizeFreeform !== undefined && (
        <>
          <CornerHandle
            corner="tl"
            cssToFigX={cssToFigX}
            cssToFigY={cssToFigY}
            onResize={onResizeFreeform}
            onCommit={onCommit}
          />
          <CornerHandle
            corner="tr"
            cssToFigX={cssToFigX}
            cssToFigY={cssToFigY}
            onResize={onResizeFreeform}
            onCommit={onCommit}
          />
          <CornerHandle
            corner="bl"
            cssToFigX={cssToFigX}
            cssToFigY={cssToFigY}
            onResize={onResizeFreeform}
            onCommit={onCommit}
          />
          <CornerHandle
            corner="br"
            cssToFigX={cssToFigX}
            cssToFigY={cssToFigY}
            onResize={onResizeFreeform}
            onCommit={onCommit}
          />
        </>
      )}
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
  // Track last clientX/Y so each pointermove dispatches an INCREMENTAL delta
  // (frame-to-frame). The reducer applies each delta atop the current rects,
  // so cumulative semantics emerge naturally from incremental dispatches.
  const dragRef = useRef<{
    pointerId: number;
    lastClientX: number;
    lastClientY: number;
  } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    // Reject right/middle clicks. e.button can be undefined under jsdom
    // synthesized events; treat that as "primary" for testability.
    if (e.button !== undefined && e.button !== 0) return;
    if (ref.current === null) return;
    // Don't bubble to PanelInteractionLayer's pan-drag handler.
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
  // Position relative to parent (PanelInteractionLayer's outer div). The
  // negative offsets put the handle CENTERED on the panel's corner.
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
        border: "1px solid #fff",
        borderRadius: 2,
        zIndex: 5,
        pointerEvents: "auto",
        touchAction: "none",
      }}
    />
  );
}
