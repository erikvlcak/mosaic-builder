import type { Figure, HardCodedPanel } from "../model/types";
import type { PanelTransform, FitMode, Rotation } from "../model/panels";

export interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Computes the integer pixel rectangle for each panel in figure.panels,
 * in the same order. When `figure.grid.outerGutter` is true, the gutter
 * is included on all four canvas edges; when false, panels reach the
 * canvas edge and only inter-panel gutters consume space.
 *
 * Internal gutters between merged-panel cells are absorbed into the
 * merged panel.
 *
 * Width remainder distribution: cells get floor(avail/cols); the panel
 * whose right edge sits on the grid's last column absorbs `wRemainder`,
 * so the right edge always lands on `widthPx - outerOffset`. Same for rows.
 */
export interface GridLayout {
  rows: number;
  cols: number;
  gutterPx: number;
  outerOffset: number;
  cellW: number;
  cellH: number;
  wRemainder: number;
  hRemainder: number;
}

/**
 * Pre-compute the per-cell metrics for a figure layout. Reused by
 * `computePanelRects` and by the editor overlay (GridCells) when it
 * needs to position holes/empty cells without re-deriving the math.
 */
export function computeGridLayout(
  widthPx: number,
  heightPx: number,
  rows: number,
  cols: number,
  gutterPx: number,
  outerGutter: boolean,
): GridLayout {
  const outerOffset = outerGutter ? gutterPx : 0;
  const totalGuttersW = (outerGutter ? 2 : 0) + (cols - 1);
  const totalGuttersH = (outerGutter ? 2 : 0) + (rows - 1);
  const availW = widthPx - gutterPx * totalGuttersW;
  const availH = heightPx - gutterPx * totalGuttersH;
  const cellW = Math.floor(availW / cols);
  const cellH = Math.floor(availH / rows);
  const wRemainder = availW - cellW * cols;
  const hRemainder = availH - cellH * rows;
  return {
    rows,
    cols,
    gutterPx,
    outerOffset,
    cellW,
    cellH,
    wRemainder,
    hRemainder,
  };
}

/**
 * Compute the rect for a region spanning `(row, col)` through
 * `(row+rowSpan-1, col+colSpan-1)` against a cached `GridLayout`.
 * Width remainders are absorbed when the right/bottom edge of the rect
 * sits on the last column/row of the grid — same rule as `computePanelRects`.
 */
export function computeCellRect(
  layout: GridLayout,
  row: number,
  col: number,
  rowSpan = 1,
  colSpan = 1,
): PanelRect {
  const {
    rows,
    cols,
    gutterPx,
    outerOffset,
    cellW,
    cellH,
    wRemainder,
    hRemainder,
  } = layout;
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

export function computePanelRects(figure: Figure): PanelRect[] {
  const { widthPx, heightPx } = figure.canvas;
  const { rows, cols, gutterPx } = figure.grid;
  const outerGutter = figure.grid.outerGutter ?? true;
  const layout = computeGridLayout(
    widthPx,
    heightPx,
    rows,
    cols,
    gutterPx,
    outerGutter,
  );
  return figure.panels.map(
    (p: HardCodedPanel): PanelRect =>
      computeCellRect(layout, p.row, p.col, p.rowSpan ?? 1, p.colSpan ?? 1),
  );
}

// ---------------------------------------------------------------------------
// Per-panel transform math (M5). All pure; no DOM, no canvas, no React.
// All dimensions are in figure-canvas pixels unless noted otherwise.
// ---------------------------------------------------------------------------

export function clamp(v: number, lo: number, hi: number): number {
  if (lo > hi) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/** Image dimensions after a 90° rotation step (flips preserve aspect). */
export function rotatedImageDims(
  imgW: number,
  imgH: number,
  rotation: Rotation,
): { w: number; h: number } {
  return rotation === 90 || rotation === 270
    ? { w: imgH, h: imgW }
    : { w: imgW, h: imgH };
}

/**
 * Multiplier from source-image px to panel-local px before user zoom.
 * Returns a scalar for Contain/Cover (isotropic) and {sx, sy} for Stretch
 * (anisotropic). The shape difference forces consumers to handle Stretch
 * explicitly — exactly what Cover-clamp math wants.
 */
export function baseScale(
  panelW: number,
  panelH: number,
  rotImgW: number,
  rotImgH: number,
  fit: FitMode,
): number | { sx: number; sy: number } {
  if (fit === "contain") return Math.min(panelW / rotImgW, panelH / rotImgH);
  if (fit === "cover") return Math.max(panelW / rotImgW, panelH / rotImgH);
  // stretch — anisotropic; zoom is locked to 1 in the input layer.
  return { sx: panelW / rotImgW, sy: panelH / rotImgH };
}

/**
 * Cover-mode clamp envelope (panel-local px). With S = baseScaleCover * zoom:
 *   panX ∈ [-(hx - pw), (hx - pw)], same for panY.
 * If the scaled image is smaller than the panel on an axis (impossible at
 * zoom ≥ 1 in Cover, but defensive), the legal range collapses to {0}.
 */
export function clampCoverPan(
  panX: number,
  panY: number,
  panelW: number,
  panelH: number,
  rotImgW: number,
  rotImgH: number,
  zoom: number,
): { panX: number; panY: number } {
  const S = Math.max(panelW / rotImgW, panelH / rotImgH) * zoom;
  const hx = (rotImgW * S) / 2;
  const hy = (rotImgH * S) / 2;
  const pw = panelW / 2;
  const ph = panelH / 2;
  const xLimit = Math.max(0, hx - pw);
  const yLimit = Math.max(0, hy - ph);
  return {
    panX: clamp(panX, -xLimit, xLimit),
    panY: clamp(panY, -yLimit, yLimit),
  };
}

/**
 * Apply zoom limits per fit mode.
 *  - Stretch: zoom is locked to 1 (anisotropic fit; user zoom would muddle it).
 *  - Cover/Contain: zoom ≥ 1 (zooming further out would expose the gutter).
 *  - Cap at 50 to avoid runaway pinch math; revisit in M6.
 */
export function clampZoom(zoom: number, fit: FitMode): number {
  if (fit === "stretch") return 1;
  return clamp(zoom, 1, 50);
}

/**
 * Snap a transform back into the legal envelope for its fit mode. Called
 * by the input layer before dispatching, and any time fit/rotation
 * changes such that a previously-legal transform might violate clamps.
 */
export function snapTransform(
  t: PanelTransform,
  panelW: number,
  panelH: number,
  imgW: number,
  imgH: number,
): PanelTransform {
  const { w: rw, h: rh } = rotatedImageDims(imgW, imgH, t.rotation);
  if (t.fit === "stretch") {
    return { ...t, zoom: 1, panX: 0, panY: 0 };
  }
  const zoom = clampZoom(t.zoom, t.fit);
  if (t.fit === "contain") {
    return { ...t, zoom };
  }
  const { panX, panY } = clampCoverPan(
    t.panX,
    t.panY,
    panelW,
    panelH,
    rw,
    rh,
    zoom,
  );
  return { ...t, zoom, panX, panY };
}

/**
 * Effective panel scale = zoom × base-scale (isotropic). For Contain and
 * Cover, this is the same scalar baseScale uses internally. For Stretch
 * (which has anisotropic sx/sy), we collapse to min(sx, sy) × zoom — the
 * scale bar on a stretched image is intentionally best-effort.
 */
export function effectivePanelScale(
  t: PanelTransform,
  panelW: number,
  panelH: number,
  rotImgW: number,
  rotImgH: number,
): number {
  if (t.fit === "stretch") {
    return Math.min(panelW / rotImgW, panelH / rotImgH) * t.zoom;
  }
  const bs = baseScale(panelW, panelH, rotImgW, rotImgH, t.fit);
  // Contain/Cover return scalar; the type union is widened for Stretch.
  const scalar = typeof bs === "number" ? bs : Math.min(bs.sx, bs.sy);
  return scalar * t.zoom;
}

/**
 * Compute the pan that keeps `cursorLocal` (in panel-local px, origin at
 * panel center) under the cursor after zooming from `t.zoom` to `newZoom`.
 *
 * Derivation: the on-screen position of a point P (panel-local) is
 *     screen(P) = pan + P * (zoom / zoom₀_for_baseline)
 * but for cursor-pivot zoom we treat the panel-local screen point itself:
 *     screen = pan + (screen - pan_old) * (newZoom / oldZoom)
 * Solving for pan with screen == cursorLocal:
 *     pan = cursorLocal - (cursorLocal - pan_old) * (newZoom / oldZoom)
 */
export function panForCursorZoom(
  t: PanelTransform,
  cursorLocalX: number,
  cursorLocalY: number,
  newZoom: number,
): { panX: number; panY: number } {
  if (t.zoom === 0) return { panX: t.panX, panY: t.panY };
  const ratio = newZoom / t.zoom;
  return {
    panX: cursorLocalX - (cursorLocalX - t.panX) * ratio,
    panY: cursorLocalY - (cursorLocalY - t.panY) * ratio,
  };
}

/**
 * Inverse of the panel transform: given a click in figure-canvas px,
 * return where on the SOURCE image (in source-px) that click landed.
 *
 * Returns null when the click resolves to coordinates outside the source
 * image (e.g. a Contain-mode letterbox click, or anywhere outside the
 * image's source bounds).
 *
 * Used by CalibrationModal (to convert two clicks on the panel view into
 * a source-px distance) and by AnnotationInteractionLayer for hit-tests
 * that need source-aware geometry.
 *
 * Derivation: the forward chain in `drawPanelImage` is
 *     ctx.translate(rect.cx, rect.cy);
 *     ctx.translate(t.panX, t.panY);
 *     ctx.scale(S, S);                    // S = effectivePanelScale
 *     ctx.rotate(θ);                      // θ = rotation in radians
 *     ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
 *     ctx.translate(-imgW/2, -imgH/2);
 *     ctx.drawImage(bitmap, 0, 0, imgW, imgH);
 * So source (sx, sy) → figure (fx, fy) is built bottom-up. To invert,
 * undo steps top-to-bottom.
 */
export function figureToSource(
  panelRect: PanelRect,
  t: PanelTransform,
  imgW: number,
  imgH: number,
  fx: number,
  fy: number,
): { sx: number; sy: number } | null {
  // The transform pipeline operates on the cropped slice (size cw × ch,
  // origin at offX, offY in the source) as if it were the source. Inverting
  // here yields a slice-local point; we then add the crop offset to land
  // back in full-image source-px. When no crop, the math collapses to
  // (cw, ch) = (imgW, imgH) and zero offset — identical to pre-spec-09.
  const cw = t.crop !== undefined ? t.crop.w * imgW : imgW;
  const ch = t.crop !== undefined ? t.crop.h * imgH : imgH;
  const offX = t.crop !== undefined ? t.crop.x * imgW : 0;
  const offY = t.crop !== undefined ? t.crop.y * imgH : 0;

  // Step 1: translate origin to panel center, then undo user pan.
  let lx = fx - (panelRect.x + panelRect.w / 2) - t.panX;
  let ly = fy - (panelRect.y + panelRect.h / 2) - t.panY;

  // Step 2: divide by effective panel scale.
  const rotImg = rotatedImageDims(cw, ch, t.rotation);
  const S = effectivePanelScale(
    t,
    panelRect.w,
    panelRect.h,
    rotImg.w,
    rotImg.h,
  );
  if (S === 0) return null;
  lx /= S;
  ly /= S;

  // Step 3: undo rotation by -θ. Note: in the forward chain rotation is
  // applied AFTER scale and BEFORE flip (reading top-to-bottom: scale,
  // rotate, flip). So when inverting top-to-bottom we undo flip first,
  // then rotation. But because each operation is its own inverse and we
  // applied them as composed operators, we must reverse in the OPPOSITE
  // ORDER: undo rotation, then undo flip. Wait — composed operators on a
  // point P go right-to-left: forward is T_pan * T_center * S * R * F * T_-half * P.
  // The inverse is T_+half * F⁻¹ * R⁻¹ * S⁻¹ * T_-center * T_-pan applied
  // to a figure-px point. Since T_-center and T_-pan and S⁻¹ are already
  // done above, the remaining steps in order are: rotate by -θ, then undo
  // flip, then translate by (+cw/2, +ch/2).
  const theta = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(-theta);
  const sin = Math.sin(-theta);
  const rx = lx * cos - ly * sin;
  const ry = lx * sin + ly * cos;
  lx = rx;
  ly = ry;

  // Step 4: undo flip.
  if (t.flipH) lx = -lx;
  if (t.flipV) ly = -ly;

  // Step 5: translate to slice-top-left origin, then add crop offset to
  // land in full-image source-px.
  const sx = lx + cw / 2 + offX;
  const sy = ly + ch / 2 + offY;

  // Bounds-check: outside the source image (e.g. letterbox in Contain, or
  // outside the cropped slice when a crop is in effect — clicks past the
  // slice's edge still resolve to source-px outside the crop, which we
  // reject because they don't correspond to visible pixels).
  if (sx < 0 || sx > imgW || sy < 0 || sy > imgH) return null;
  if (t.crop !== undefined) {
    if (sx < offX || sx > offX + cw || sy < offY || sy > offY + ch) {
      return null;
    }
  }
  return { sx, sy };
}

/**
 * Forward of `figureToSource`: given a point in source-image px, return
 * its position in figure-canvas px under the panel's current transform.
 * The point may legally land outside `panelRect` — Cover-mode pan or zoom
 * pushes parts of the image past the panel edge, and image-bound
 * annotations clipped by the panel still want their re-projected position
 * (the renderer clips at draw time).
 *
 * Mirrors the forward chain in `drawPanelImage`:
 *     translate(rect.cx, rect.cy);
 *     translate(t.panX, t.panY);
 *     scale(S, S);                          // S = effectivePanelScale
 *     rotate(θ);
 *     scale(flipH ? -1 : 1, flipV ? -1 : 1);
 *     translate(-imgW/2, -imgH/2);
 *     drawImage(bitmap, 0, 0, imgW, imgH);
 * Composed right-to-left on a source point P, so we walk the chain
 * from the rightmost operator (translate to image-center) outward.
 */
export function sourceToFigure(
  panelRect: PanelRect,
  t: PanelTransform,
  imgW: number,
  imgH: number,
  sx: number,
  sy: number,
): { fx: number; fy: number } {
  // The forward chain operates on the cropped slice. With no crop, cw/ch
  // equal imgW/imgH and offX/offY are zero — identical to pre-spec-09
  // behavior. With a crop, the source point is shifted into slice-local
  // coords and the slice dims feed the rotation + scale math.
  const cw = t.crop !== undefined ? t.crop.w * imgW : imgW;
  const ch = t.crop !== undefined ? t.crop.h * imgH : imgH;
  const offX = t.crop !== undefined ? t.crop.x * imgW : 0;
  const offY = t.crop !== undefined ? t.crop.y * imgH : 0;

  // Step 1: translate to slice-center origin (subtract crop offset first
  // to land in slice-local px, then center).
  let lx = sx - offX - cw / 2;
  let ly = sy - offY - ch / 2;

  // Step 2: apply flip.
  if (t.flipH) lx = -lx;
  if (t.flipV) ly = -ly;

  // Step 3: apply rotation by +θ.
  const theta = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const rx = lx * cos - ly * sin;
  const ry = lx * sin + ly * cos;
  lx = rx;
  ly = ry;

  // Step 4: scale by S.
  const rotImg = rotatedImageDims(cw, ch, t.rotation);
  const S = effectivePanelScale(
    t,
    panelRect.w,
    panelRect.h,
    rotImg.w,
    rotImg.h,
  );
  lx *= S;
  ly *= S;

  // Step 5: translate by pan + panel center.
  const fx = lx + t.panX + panelRect.x + panelRect.w / 2;
  const fy = ly + t.panY + panelRect.y + panelRect.h / 2;
  return { fx, fy };
}
