// View-transform math for the editor canvas. This is a VIEW concern only:
// it never touches FigureState or the model figure-px space. `zoom` is the
// model→CSS multiple; `sourceScale` is editorBackingDims/model, i.e. the
// export scale, so display-100% (1 source-px = 1 screen-px) is zoom ===
// sourceScale. Bounds are expressed in display-% terms, hence they scale by
// sourceScale.

export const ZOOM_MIN = 0.1; // 10% of source-100%
export const ZOOM_MAX = 8; // 800% of source-100%

export function clampViewZoom(zoom: number, sourceScale: number): number {
  const lo = ZOOM_MIN * sourceScale;
  const hi = ZOOM_MAX * sourceScale;
  return Math.max(lo, Math.min(hi, zoom));
}

export function fitZoom(
  containerW: number,
  containerH: number,
  modelW: number,
  modelH: number,
): number {
  // Guard against a zero/negative container (pre-layout, hidden tab): fall
  // back to 1 so the canvas is never sized to 0.
  if (containerW <= 0 || containerH <= 0) return 1;
  return Math.min(containerW / modelW, containerH / modelH);
}

export function zoomToCssSize(
  zoom: number,
  modelW: number,
  modelH: number,
): { cssW: number; cssH: number } {
  return { cssW: modelW * zoom, cssH: modelH * zoom };
}

export function scrollForCursorZoom(args: {
  cursorX: number;
  cursorY: number;
  oldScrollLeft: number;
  oldScrollTop: number;
  oldCssW: number;
  oldCssH: number;
  newCssW: number;
  newCssH: number;
}): { scrollLeft: number; scrollTop: number } {
  // The model point under the cursor is at document-x = scrollLeft + cursorX,
  // a fraction (scrollLeft + cursorX)/oldCssW of the box. After resizing the
  // box, that same fraction times newCssW must again sit at cursorX, so:
  //   newScrollLeft = frac*newCssW - cursorX.
  const fracX = (args.oldScrollLeft + args.cursorX) / args.oldCssW;
  const fracY = (args.oldScrollTop + args.cursorY) / args.oldCssH;
  const scrollLeft = fracX * args.newCssW - args.cursorX;
  const scrollTop = fracY * args.newCssH - args.cursorY;
  return {
    scrollLeft: Math.max(0, scrollLeft),
    scrollTop: Math.max(0, scrollTop),
  };
}
