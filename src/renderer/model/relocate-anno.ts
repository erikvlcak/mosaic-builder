/**
 * Image-bound-annotation relocator. Pure helper called from the reducer
 * after panel-mutating actions (SWAP_PANELS, REPLACE_INTO_PANEL,
 * UNPLACE_PANEL, ROTATE_PANEL_90, FLIP_PANEL_*) and on REMOVE_FROM_POOL.
 *
 * Lives in `model/` and intentionally does NOT import from `render/` so
 * that the reducer (figure-actions) keeps its current main/preload
 * tsconfig membership. The coord-math we need here (panel rect from
 * row/col/spans, source→figure projection) is duplicated rather than
 * cross-imported. Keep this in sync with `render/coords.ts` if either
 * formula changes.
 */

import type { FigureState } from "./figure-state";
import { MIN_CANVAS_W, MIN_CANVAS_H } from "./figure-state";
import type { Annotation, ImageAnchor } from "./annotations";
import type { PanelTransform, FitMode, Rotation } from "./panels";

interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Re-project image-bound annotations bound to `imageId` onto the panel
 * that currently holds the image (or drop them if the image is no longer
 * placed). Pure: returns the same array reference if nothing changed, so
 * reducer no-op short-circuits propagate.
 *
 * The reducer applies its panel mutation FIRST, then calls this against
 * the post-mutation state.
 *
 * Editor canvas dims are baked at MIN_CANVAS_W × MIN_CANVAS_H — annotation
 * x/y are stored in editor figure-px (the editor's fixed 800×600 contract).
 */
export function relocateImageBoundAnnotations(
  state: FigureState,
  imageId: string,
): Annotation[] {
  // Touch-cheap guard: if no annotation is bound to this image, the
  // input array is already correct.
  if (!state.annotations.some((a) => a.imageId === imageId)) {
    return state.annotations;
  }

  const hostPanel = state.panels.find((p) => p.imageId === imageId);
  // If the image no longer lives on any panel, drop every annotation
  // bound to it. Same drop-discipline as scale bars on REMOVE_FROM_POOL.
  if (hostPanel === undefined || hostPanel.transform === undefined) {
    return state.annotations.filter((a) => a.imageId !== imageId);
  }

  const img = state.pool.find((p) => p.id === imageId);
  if (img === undefined) {
    return state.annotations.filter((a) => a.imageId !== imageId);
  }

  const panelRect = computePanelRect(
    state.rows,
    state.cols,
    state.gutterPx,
    state.outerGutter,
    hostPanel.row,
    hostPanel.col,
    hostPanel.rowSpan,
    hostPanel.colSpan,
  );

  let changed = false;
  const transform = hostPanel.transform;
  const next = state.annotations.map((a): Annotation => {
    if (a.imageId !== imageId) return a;
    const updated = reprojectAnno(
      a,
      hostPanel.id,
      panelRect,
      transform,
      img.width,
      img.height,
    );
    if (updated !== a) changed = true;
    return updated;
  });
  return changed ? next : state.annotations;
}

function reprojectAnno(
  a: Annotation,
  panelId: string,
  panelRect: PanelRect,
  transform: PanelTransform,
  imgW: number,
  imgH: number,
): Annotation {
  switch (a.kind) {
    case "text": {
      if (a.anchor === undefined) return a;
      const p = projectAnchor(a.anchor, panelRect, transform, imgW, imgH);
      if (a.x === p.fx && a.y === p.fy && a.panelId === panelId) return a;
      return { ...a, x: p.fx, y: p.fy, panelId };
    }
    case "symbol": {
      // Symbols re-anchor by center; we deliberately do NOT re-project the
      // visual rotation/sizePx on flip/rotate (accepted simplification —
      // rotation in figure space is decoupled from panel transform).
      if (a.anchor === undefined) return a;
      const p = projectAnchor(a.anchor, panelRect, transform, imgW, imgH);
      if (a.x === p.fx && a.y === p.fy && a.panelId === panelId) return a;
      return { ...a, x: p.fx, y: p.fy, panelId };
    }
    case "box": {
      if (a.anchor1 === undefined || a.anchor2 === undefined) return a;
      const p1 = projectAnchor(a.anchor1, panelRect, transform, imgW, imgH);
      const p2 = projectAnchor(a.anchor2, panelRect, transform, imgW, imgH);
      const nx = Math.min(p1.fx, p2.fx);
      const ny = Math.min(p1.fy, p2.fy);
      const nw = Math.abs(p2.fx - p1.fx);
      const nh = Math.abs(p2.fy - p1.fy);
      if (
        a.x === nx &&
        a.y === ny &&
        a.w === nw &&
        a.h === nh &&
        a.panelId === panelId
      ) {
        return a;
      }
      return { ...a, x: nx, y: ny, w: nw, h: nh, panelId };
    }
    case "scalebar": {
      // Scale bars don't carry per-point anchors (they're positioned by
      // panel + corner), but their `panelId` should follow the bound image.
      if (a.panelId === panelId) return a;
      return { ...a, panelId };
    }
  }
}

function projectAnchor(
  anchor: ImageAnchor,
  panelRect: PanelRect,
  transform: PanelTransform,
  imgW: number,
  imgH: number,
): { fx: number; fy: number } {
  // ImageAnchor is in full-image normalized coords. With a crop in place,
  // the panel transform operates on the cropped slice as if it were the
  // source — substitute (cw, ch) for (imgW, imgH), then translate the
  // anchor into slice-local px by subtracting the crop offset. Anchors
  // outside the crop project to a point outside the panel rect; the
  // renderer clips at draw time.
  const c = transform.crop;
  if (c === undefined) {
    const sx = anchor.imgU * imgW;
    const sy = anchor.imgV * imgH;
    return sourceToFigure(panelRect, transform, imgW, imgH, sx, sy);
  }
  const cw = c.w * imgW;
  const ch = c.h * imgH;
  const offX = c.x * imgW;
  const offY = c.y * imgH;
  const sx = anchor.imgU * imgW - offX;
  const sy = anchor.imgV * imgH - offY;
  return sourceToFigure(panelRect, transform, cw, ch, sx, sy);
}

/**
 * Mirrors `computeGridLayout` + `computeCellRect` from render/coords.ts,
 * specialized to MIN_CANVAS_W × MIN_CANVAS_H (the editor's fixed-size
 * canvas). Inlined here so this module stays in `model/` and avoids a
 * cross-tsconfig dependency on render/.
 */
function computePanelRect(
  rows: number,
  cols: number,
  gutterPx: number,
  outerGutter: boolean,
  row: number,
  col: number,
  rowSpan: number,
  colSpan: number,
): PanelRect {
  const widthPx = MIN_CANVAS_W;
  const heightPx = MIN_CANVAS_H;
  const outerOffset = outerGutter ? gutterPx : 0;
  const totalGuttersW = (outerGutter ? 2 : 0) + (cols - 1);
  const totalGuttersH = (outerGutter ? 2 : 0) + (rows - 1);
  const availW = widthPx - gutterPx * totalGuttersW;
  const availH = heightPx - gutterPx * totalGuttersH;
  const cellW = Math.floor(availW / cols);
  const cellH = Math.floor(availH / rows);
  const wRemainder = availW - cellW * cols;
  const hRemainder = availH - cellH * rows;
  const lastCol = col + colSpan - 1;
  const lastRow = row + rowSpan - 1;
  const baseW = colSpan * cellW + (colSpan - 1) * gutterPx;
  const baseH = rowSpan * cellH + (rowSpan - 1) * gutterPx;
  const w = baseW + (lastCol === cols - 1 ? wRemainder : 0);
  const h = baseH + (lastRow === rows - 1 ? hRemainder : 0);
  const x = outerOffset + col * (cellW + gutterPx);
  const y = outerOffset + row * (cellH + gutterPx);
  return { x, y, w, h };
}

/**
 * Mirrors `rotatedImageDims` from render/coords.ts.
 */
function rotatedImageDims(
  imgW: number,
  imgH: number,
  rotation: Rotation,
): { w: number; h: number } {
  return rotation === 90 || rotation === 270
    ? { w: imgH, h: imgW }
    : { w: imgW, h: imgH };
}

/**
 * Mirrors `effectivePanelScale` from render/coords.ts. We collapse Stretch
 * to min(sx, sy) × zoom — same as the canonical version, since image-bound
 * annotations on a stretched image are best-effort anyway.
 */
function effectivePanelScale(
  t: PanelTransform,
  panelW: number,
  panelH: number,
  rotImgW: number,
  rotImgH: number,
): number {
  const fit: FitMode = t.fit;
  if (fit === "stretch") {
    return Math.min(panelW / rotImgW, panelH / rotImgH) * t.zoom;
  }
  const bs =
    fit === "contain"
      ? Math.min(panelW / rotImgW, panelH / rotImgH)
      : Math.max(panelW / rotImgW, panelH / rotImgH); // cover
  return bs * t.zoom;
}

/**
 * Mirrors `sourceToFigure` from render/coords.ts. Forward chain in
 * `drawPanelImage`:
 *     translate(rect.cx, rect.cy);
 *     translate(t.panX, t.panY);
 *     scale(S, S);
 *     rotate(θ);
 *     scale(flipH ? -1 : 1, flipV ? -1 : 1);
 *     translate(-imgW/2, -imgH/2);
 *     drawImage(bitmap, 0, 0, imgW, imgH);
 */
function sourceToFigure(
  panelRect: PanelRect,
  t: PanelTransform,
  imgW: number,
  imgH: number,
  sx: number,
  sy: number,
): { fx: number; fy: number } {
  let lx = sx - imgW / 2;
  let ly = sy - imgH / 2;

  if (t.flipH) lx = -lx;
  if (t.flipV) ly = -ly;

  const theta = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const rx = lx * cos - ly * sin;
  const ry = lx * sin + ly * cos;
  lx = rx;
  ly = ry;

  const rotImg = rotatedImageDims(imgW, imgH, t.rotation);
  const S = effectivePanelScale(
    t,
    panelRect.w,
    panelRect.h,
    rotImg.w,
    rotImg.h,
  );
  lx *= S;
  ly *= S;

  const fx = lx + t.panX + panelRect.x + panelRect.w / 2;
  const fy = ly + t.panY + panelRect.y + panelRect.h / 2;
  return { fx, fy };
}
