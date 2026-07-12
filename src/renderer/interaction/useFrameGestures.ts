import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, RefObject } from "react";
import type { FigureAction } from "../model/figure-actions";
import { setPanelTransform } from "../model/figure-actions";
import type { PanelTransform } from "../model/panels";
import {
  panForCursorZoom,
  snapTransform,
  type PanelRect,
} from "../render/coords";
import { resolvePointerDown } from "./resolve";

/** Zoom multiplier for the +/− key steps in Frame mode. */
const FRAME_ZOOM_STEP = 1.25;
/** A press that moves less than this many CSS px is a click, not a drag. */
const CLICK_DRAG_THRESHOLD_PX = 4;
/** Wheel/key bursts seal into ONE undo step after this settle delay. */
const COMMIT_SETTLE_MS = 250;

export interface FrameTarget {
  panelId: string;
  /** Panel rect in figure-px. */
  panelRect: PanelRect;
  transform: PanelTransform;
  imageW: number;
  imageH: number;
}

export interface FrameGestures {
  /** Wire into useViewportGestures' onFrameWheelPan. Deltas are CSS px. */
  wheelPan: (dx: number, dy: number) => void;
  /** Wire into useViewportGestures' onFrameWheelZoom. */
  wheelZoom: (e: { deltaY: number; clientX: number; clientY: number }) => void;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Frame-mode gesture owner: while a panel is being framed, drag / wheel /
 * keys retarget from the viewport onto the framed image — POSITION-
 * INDEPENDENTLY within the canvas pane. Scroll over the framed panel, the
 * gutter, or a neighboring panel all pan the image the same way.
 *
 * Pointerdown is intercepted in the CAPTURE phase so object-local
 * handlers (annotation drags, track handles) can't compete while framing;
 * Space/middle still fall through to the viewport pan owner per the
 * resolver. Click events are NOT suppressed, so a click outside the panel
 * exits frame mode AND still selects whatever was clicked, and
 * double-click switches the frame target through the existing handlers.
 */
export function useFrameGestures(args: {
  scrollRef: RefObject<HTMLElement>;
  /** The canvas wrapper (the cssW × cssH box) — panel rects are relative to it. */
  wrapperRef: RefObject<HTMLElement>;
  /** null when not framing. */
  target: FrameTarget | null;
  spaceHeld: boolean;
  /** An armed placement tool outranks Frame mode in the Esc unwind order —
   *  when true, Esc is left for the global handler to disarm the tool. */
  toolArmed: boolean;
  figurePxW: number;
  figurePxH: number;
  cssW: number;
  cssH: number;
  dispatch: Dispatch<FigureAction>;
  onCommit: () => void;
  /** Exit frame mode (the panel stays selected). */
  onExit: () => void;
}): FrameGestures {
  const s = useRef(args);
  s.current = args;
  const active = args.target !== null;

  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleCommit = useCallback((): void => {
    if (commitTimerRef.current !== null) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      s.current.onCommit();
    }, COMMIT_SETTLE_MS);
  }, []);
  // Seal any pending wheel/key burst when framing ends or on unmount, so
  // the last transient dispatches aren't lost from history.
  useEffect(() => {
    return () => {
      if (commitTimerRef.current !== null) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
        s.current.onCommit();
      }
    };
  }, [active]);

  const applyTransform = useCallback((next: PanelTransform): void => {
    const cur = s.current;
    if (cur.target === null) return;
    cur.dispatch(setPanelTransform(cur.target.panelId, next));
  }, []);

  const snappedPan = useCallback(
    (panX: number, panY: number): PanelTransform | null => {
      const t = s.current.target;
      if (t === null) return null;
      return snapTransform(
        { ...t.transform, panX, panY },
        t.panelRect.w,
        t.panelRect.h,
        t.imageW,
        t.imageH,
      );
    },
    [],
  );

  /** Cursor position in panel-local figure-px (origin at panel center), or
   *  the center itself when the cursor is outside the panel/wrapper. */
  const cursorPanelLocal = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const cur = s.current;
      const t = cur.target;
      const wrapper = cur.wrapperRef.current;
      if (t === null || wrapper === null) return { x: 0, y: 0 };
      const rect = wrapper.getBoundingClientRect();
      const fx = (clientX - rect.left) * (cur.figurePxW / cur.cssW);
      const fy = (clientY - rect.top) * (cur.figurePxH / cur.cssH);
      const inside =
        fx >= t.panelRect.x &&
        fx <= t.panelRect.x + t.panelRect.w &&
        fy >= t.panelRect.y &&
        fy <= t.panelRect.y + t.panelRect.h;
      if (!inside) return { x: 0, y: 0 }; // panel-center anchor
      return {
        x: fx - t.panelRect.x - t.panelRect.w / 2,
        y: fy - t.panelRect.y - t.panelRect.h / 2,
      };
    },
    [],
  );

  const zoomBy = useCallback(
    (factor: number, anchor: { x: number; y: number }): void => {
      const t = s.current.target;
      if (t === null) return;
      const targetZoom = t.transform.zoom * factor;
      const { panX, panY } = panForCursorZoom(
        t.transform,
        anchor.x,
        anchor.y,
        targetZoom,
      );
      const next = snapTransform(
        { ...t.transform, zoom: targetZoom, panX, panY },
        t.panelRect.w,
        t.panelRect.h,
        t.imageW,
        t.imageH,
      );
      applyTransform(next);
      scheduleCommit();
    },
    [applyTransform, scheduleCommit],
  );

  // --- Wheel verbs (invoked by useViewportGestures via the resolver) ------

  const wheelPan = useCallback(
    (dx: number, dy: number): void => {
      const cur = s.current;
      const t = cur.target;
      if (t === null) return;
      // Scroll like content: wheel down moves the image up (mirrors how the
      // same gesture scrolls the viewport in Base mode).
      const next = snappedPan(
        t.transform.panX - dx * (cur.figurePxW / cur.cssW),
        t.transform.panY - dy * (cur.figurePxH / cur.cssH),
      );
      if (next === null) return;
      applyTransform(next);
      scheduleCommit();
    },
    [snappedPan, applyTransform, scheduleCommit],
  );

  const wheelZoom = useCallback(
    (e: { deltaY: number; clientX: number; clientY: number }): void => {
      zoomBy(
        Math.exp(-e.deltaY * 0.0015),
        cursorPanelLocal(e.clientX, e.clientY),
      );
    },
    [zoomBy, cursorPanelLocal],
  );

  // --- Drag: pan the image from anywhere in the pane ----------------------

  useEffect(() => {
    const el = args.scrollRef.current;
    if (el === null || !active) return;

    let drag: {
      x: number;
      y: number;
      startPanX: number;
      startPanY: number;
      moved: boolean;
    } | null = null;

    function onDown(e: PointerEvent): void {
      const cur = s.current;
      const t = cur.target;
      if (t === null) return;
      const intent = resolvePointerDown({
        frameMode: true,
        spaceHeld: cur.spaceHeld,
        button: e.button,
        hit: "background", // hit-testing is irrelevant while framing
      });
      if (intent !== "frame-drag") return; // Space/middle → viewport pan owner
      // Frame mode owns this drag: stop object-local handlers (annotation
      // moves, track handles) from also engaging. Click/dblclick events
      // still fire, so click-outside-exits and dblclick-switch forward
      // through the existing handlers.
      e.stopPropagation();
      drag = {
        x: e.clientX,
        y: e.clientY,
        startPanX: t.transform.panX,
        startPanY: t.transform.panY,
        moved: false,
      };
    }
    function onMove(e: PointerEvent): void {
      if (drag === null) return;
      const cur = s.current;
      const dxCss = e.clientX - drag.x;
      const dyCss = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dxCss, dyCss) < CLICK_DRAG_THRESHOLD_PX) {
        return;
      }
      drag.moved = true;
      const next = snappedPan(
        drag.startPanX + dxCss * (cur.figurePxW / cur.cssW),
        drag.startPanY + dyCss * (cur.figurePxH / cur.cssH),
      );
      if (next !== null) applyTransform(next);
    }
    function onUp(e: PointerEvent): void {
      if (drag === null) return;
      const wasDrag = drag.moved;
      const { clientX, clientY } = e;
      drag = null;
      if (wasDrag) {
        s.current.onCommit();
        return;
      }
      // A click: inside the framed panel it's a no-op (stay framing);
      // outside it exits — the click event that follows selects whatever
      // was clicked.
      const cur = s.current;
      const t = cur.target;
      const wrapper = cur.wrapperRef.current;
      if (t === null || wrapper === null) return;
      const rect = wrapper.getBoundingClientRect();
      const fx = (clientX - rect.left) * (cur.figurePxW / cur.cssW);
      const fy = (clientY - rect.top) * (cur.figurePxH / cur.cssH);
      const inside =
        fx >= t.panelRect.x &&
        fx <= t.panelRect.x + t.panelRect.w &&
        fy >= t.panelRect.y &&
        fy <= t.panelRect.y + t.panelRect.h;
      if (!inside) cur.onExit();
    }
    function onCancel(): void {
      if (drag?.moved === true) s.current.onCommit();
      drag = null;
    }

    el.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
    return () => {
      el.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
    };
  }, [args.scrollRef, active, snappedPan, applyTransform]);

  // --- Keys: zoom steps, nudge, exit --------------------------------------

  useEffect(() => {
    if (!active) return;

    function onKeyDown(e: KeyboardEvent): void {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // ⌘-chords stay global
      const cur = s.current;
      const t = cur.target;
      if (t === null) return;
      switch (e.key) {
        case "Escape":
          // Esc unwinds ONE level: an armed tool outranks frame mode, so
          // yield to the global handler (which disarms) in that case.
          if (cur.toolArmed) return;
          e.preventDefault();
          e.stopPropagation();
          cur.onExit();
          return;
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          cur.onExit();
          return;
        case "+":
        case "=":
          e.preventDefault();
          e.stopPropagation();
          zoomBy(FRAME_ZOOM_STEP, { x: 0, y: 0 });
          return;
        case "-":
          e.preventDefault();
          e.stopPropagation();
          zoomBy(1 / FRAME_ZOOM_STEP, { x: 0, y: 0 });
          return;
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          e.preventDefault();
          e.stopPropagation();
          const step = e.shiftKey ? 10 : 1;
          const dx =
            e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy =
            e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          const next = snappedPan(t.transform.panX + dx, t.transform.panY + dy);
          if (next !== null) {
            applyTransform(next);
            scheduleCommit();
          }
          return;
        }
      }
    }

    // Capture phase so consumed keys never reach useKeyboardShortcuts'
    // bubble-phase listener (Esc would otherwise ALSO clear selections).
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, zoomBy, snappedPan, applyTransform, scheduleCommit]);

  return { wheelPan, wheelZoom };
}
