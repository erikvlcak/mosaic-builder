import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  clampViewZoom,
  fitZoom,
  zoomToCssSize,
  scrollForCursorZoom,
} from "../render/view-transform";

export const ZOOM_STEP = 1.25;

export interface ViewTransform {
  zoom: number;
  mode: "fit" | "free";
}

// --- Pure state transitions (unit-tested; no DOM) ---------------------------

export function nextViewForZoomIn(
  v: ViewTransform,
  sourceScale: number,
  fitZoomFloor = Infinity,
): ViewTransform {
  return {
    zoom: clampViewZoom(v.zoom * ZOOM_STEP, sourceScale, fitZoomFloor),
    mode: "free",
  };
}

export function nextViewForZoomOut(
  v: ViewTransform,
  sourceScale: number,
  fitZoomFloor = Infinity,
): ViewTransform {
  return {
    zoom: clampViewZoom(v.zoom / ZOOM_STEP, sourceScale, fitZoomFloor),
    mode: "free",
  };
}

export function nextViewForActualSize(sourceScale: number): ViewTransform {
  return { zoom: sourceScale, mode: "free" };
}

export function nextViewForPercent(
  pct: number,
  sourceScale: number,
  fitZoomFloor = Infinity,
): ViewTransform {
  return {
    zoom: clampViewZoom((pct / 100) * sourceScale, sourceScale, fitZoomFloor),
    mode: "free",
  };
}

export function deriveCss(
  v: ViewTransform,
  sourceScale: number,
  modelW: number,
  modelH: number,
): { cssW: number; cssH: number; displayPct: number } {
  const { cssW, cssH } = zoomToCssSize(v.zoom, modelW, modelH);
  const displayPct = Math.round((100 * v.zoom) / sourceScale);
  return { cssW, cssH, displayPct };
}

// --- The hook ---------------------------------------------------------------

export interface CanvasZoom {
  view: ViewTransform;
  cssW: number;
  cssH: number;
  sourceScale: number;
  displayPct: number;
  isFit: boolean;
  setView: (v: ViewTransform) => void;
  setPercent: (pct: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  actualSize: () => void;
  /**
   * Cursor-anchored zoom step from a wheel/pinch delta. The DOM wheel
   * listener itself lives in useViewportGestures — this hook keeps the
   * zoom math and fit machinery only.
   */
  wheelZoom: (e: { deltaY: number; clientX: number; clientY: number }) => void;
}

export function useCanvasZoom(args: {
  scrollRef: RefObject<HTMLElement>;
  sourceScale: number;
  modelW: number;
  modelH: number;
}): CanvasZoom {
  const { scrollRef, sourceScale, modelW, modelH } = args;
  const [view, setView] = useState<ViewTransform>({ zoom: 1, mode: "fit" });

  // Latest values for callbacks invoked from imperative listeners.
  const s = useRef({ view, sourceScale, modelW, modelH });
  s.current = { view, sourceScale, modelW, modelH };

  // The raw (uncapped) zoom at which the whole figure fits the pane. Used as
  // the zoom-out FLOOR: for a high-res image the display-% floor sits above
  // this, so without it zoom-out stops before the figure is fully visible.
  // Kept fresh by the fit effect's ResizeObserver below and read by the
  // zoom callbacks.
  const fitFloorRef = useRef<number>(Infinity);
  const recomputeFitFloor = useCallback((): number => {
    const el = scrollRef.current;
    if (el === null) return Infinity;
    const f = fitZoom(
      el.clientWidth,
      el.clientHeight,
      s.current.modelW,
      s.current.modelH,
    );
    fitFloorRef.current = f;
    return f;
  }, [scrollRef]);

  // Fit mode: re-derive zoom to fit the container. Runs on mount, on resize,
  // and whenever the model dims or sourceScale change while in fit mode
  // (sourceScale is the fit ceiling, so a new large image must re-fit).
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    function applyFit(): void {
      // Keep the zoom-out floor current on every resize, even when we're not
      // in fit mode (the user may be zoomed in and about to zoom back out).
      recomputeFitFloor();
      if (s.current.view.mode !== "fit") return;
      const z = fitZoom(
        el!.clientWidth,
        el!.clientHeight,
        s.current.modelW,
        s.current.modelH,
        s.current.sourceScale,
      );
      setView((prev) =>
        prev.mode === "fit" ? { zoom: z, mode: "fit" } : prev,
      );
    }
    applyFit();
    const ro = new ResizeObserver(applyFit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef, modelW, modelH, sourceScale, view.mode, recomputeFitFloor]);

  // Cursor-anchored wheel zoom. Called by useViewportGestures (the single
  // wheel owner) when the resolver says "zoom-view" — this hook registers
  // no DOM listeners of its own.
  const wheelZoom = useCallback(
    (e: { deltaY: number; clientX: number; clientY: number }): void => {
      const el = scrollRef.current;
      if (el === null) return;
      const cur = s.current;
      const oldCss = zoomToCssSize(cur.view.zoom, cur.modelW, cur.modelH);
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nextZoom = clampViewZoom(
        cur.view.zoom * factor,
        cur.sourceScale,
        fitFloorRef.current,
      );
      const newCss = zoomToCssSize(nextZoom, cur.modelW, cur.modelH);
      const rect = el.getBoundingClientRect();
      const next = scrollForCursorZoom({
        cursorX: e.clientX - rect.left,
        cursorY: e.clientY - rect.top,
        oldScrollLeft: el.scrollLeft,
        oldScrollTop: el.scrollTop,
        oldCssW: oldCss.cssW,
        oldCssH: oldCss.cssH,
        newCssW: newCss.cssW,
        newCssH: newCss.cssH,
      });
      setView({ zoom: nextZoom, mode: "free" });
      el.scrollLeft = next.scrollLeft;
      el.scrollTop = next.scrollTop;
    },
    [scrollRef],
  );

  const { cssW, cssH, displayPct } = deriveCss(
    view,
    sourceScale,
    modelW,
    modelH,
  );

  const zoomIn = useCallback(
    () =>
      setView((v) =>
        nextViewForZoomIn(v, s.current.sourceScale, recomputeFitFloor()),
      ),
    [recomputeFitFloor],
  );
  const zoomOut = useCallback(
    () =>
      setView((v) =>
        nextViewForZoomOut(v, s.current.sourceScale, recomputeFitFloor()),
      ),
    [recomputeFitFloor],
  );
  const actualSize = useCallback(
    () => setView(nextViewForActualSize(s.current.sourceScale)),
    [],
  );
  const fit = useCallback(
    () => setView((v) => ({ zoom: v.zoom, mode: "fit" })),
    [],
  );
  const setPercent = useCallback(
    (pct: number) =>
      setView(
        nextViewForPercent(pct, s.current.sourceScale, recomputeFitFloor()),
      ),
    [recomputeFitFloor],
  );

  return {
    view,
    cssW,
    cssH,
    sourceScale,
    displayPct,
    isFit: view.mode === "fit",
    setView,
    setPercent,
    zoomIn,
    zoomOut,
    fit,
    actualSize,
    wheelZoom,
  };
}
