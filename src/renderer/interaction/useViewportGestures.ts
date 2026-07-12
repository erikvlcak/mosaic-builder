import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { hitFromTarget } from "./hit-test";
import { normalizeWheelPan, resolvePointerDown, resolveWheel } from "./resolve";

export interface ViewportGestureArgs {
  scrollRef: RefObject<HTMLElement>;
  spaceHeld: boolean;
  /** Frame mode retargets wheel gestures onto the framed image. */
  frameMode: boolean;
  /** Cursor-anchored viewport zoom (⌘/Ctrl+wheel, pinch). */
  onZoomWheel: (e: {
    deltaY: number;
    clientX: number;
    clientY: number;
  }) => void;
  /** Frame-mode wheel pan of the framed image (absent until Phase 3 wires it). */
  onFrameWheelPan?: (dx: number, dy: number) => void;
  /** Frame-mode wheel zoom of the framed image. */
  onFrameWheelZoom?: (e: {
    deltaY: number;
    clientX: number;
    clientY: number;
  }) => void;
}

/**
 * THE single owner of the canvas pane's global gestures: the one wheel
 * listener and the one background-pan pointer sequence. All precedence
 * comes from `resolve.ts`; object-local handlers (annotations, handles,
 * dnd) never compete because pans only start on `data-interactive`-free
 * targets — or anywhere when Space/middle is held, which those handlers
 * yield to via `useSpaceHeld`.
 *
 * Modifiers are sampled at gesture start: pressing/releasing Space
 * mid-drag never changes an in-flight pan; the next pointerdown
 * re-resolves.
 */
export function useViewportGestures(args: ViewportGestureArgs): {
  /** A background/Space/middle pan drag is in flight (drives the
   *  grabbing cursor). */
  panning: boolean;
} {
  const s = useRef(args);
  s.current = args;
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    const el = args.scrollRef.current;
    if (el === null) return;

    function onWheel(e: WheelEvent): void {
      const cur = s.current;
      const intent = resolveWheel({
        frameMode: cur.frameMode,
        zoomModifier: e.ctrlKey || e.metaKey,
        overCanvasPane: true,
      });
      if (intent === "native") return;
      e.preventDefault();
      switch (intent) {
        case "zoom-view":
          cur.onZoomWheel({
            deltaY: e.deltaY,
            clientX: e.clientX,
            clientY: e.clientY,
          });
          return;
        case "pan-view": {
          const { dx, dy } = normalizeWheelPan(e);
          el!.scrollLeft += dx;
          el!.scrollTop += dy;
          return;
        }
        case "zoom-image":
          cur.onFrameWheelZoom?.({
            deltaY: e.deltaY,
            clientX: e.clientX,
            clientY: e.clientY,
          });
          return;
        case "pan-image": {
          const { dx, dy } = normalizeWheelPan(e);
          cur.onFrameWheelPan?.(dx, dy);
          return;
        }
      }
    }

    let drag: { x: number; y: number; sl: number; st: number } | null = null;
    function onDown(e: PointerEvent): void {
      const cur = s.current;
      const intent = resolvePointerDown({
        frameMode: cur.frameMode,
        spaceHeld: cur.spaceHeld,
        button: e.button,
        hit: hitFromTarget(e.target),
      });
      if (intent !== "pan-view") return;
      // Middle-button: suppress the browser/OS autoscroll widget. Canceling
      // pointerdown also suppresses the compatibility mousedown default.
      if (e.button === 1) e.preventDefault();
      drag = {
        x: e.clientX,
        y: e.clientY,
        sl: el!.scrollLeft,
        st: el!.scrollTop,
      };
      setPanning(true);
    }
    function onMove(e: PointerEvent): void {
      if (drag === null) return;
      el!.scrollLeft = drag.sl - (e.clientX - drag.x);
      el!.scrollTop = drag.st - (e.clientY - drag.y);
    }
    function onUp(): void {
      if (drag !== null) setPanning(false);
      drag = null;
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    // Canceled streams never fire pointerup, so reset there and on blur too.
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onUp);
    };
  }, [args.scrollRef]);

  return { panning };
}
