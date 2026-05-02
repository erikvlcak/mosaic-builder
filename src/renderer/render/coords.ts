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
 * in the same order. Outer gutter is included on all four edges; internal
 * gutters between merged-panel cells are absorbed into the merged panel.
 *
 * Width remainder distribution: cells get floor(avail/cols); the panel
 * whose right edge sits on the grid's last column absorbs `wRemainder`,
 * so the right edge always lands on `widthPx - gutter`. Same for rows.
 */
export function computePanelRects(figure: Figure): PanelRect[] {
  const { widthPx, heightPx } = figure.canvas;
  const { rows, cols, gutterPx } = figure.grid;

  const availW = widthPx - gutterPx * (cols + 1);
  const availH = heightPx - gutterPx * (rows + 1);
  const cellW = Math.floor(availW / cols);
  const cellH = Math.floor(availH / rows);
  const wRemainder = availW - cellW * cols;
  const hRemainder = availH - cellH * rows;

  return figure.panels.map((p: HardCodedPanel): PanelRect => {
    const rowSpan = p.rowSpan ?? 1;
    const colSpan = p.colSpan ?? 1;
    const lastColInPanel = p.col + colSpan - 1;
    const lastRowInPanel = p.row + rowSpan - 1;

    const baseW = colSpan * cellW + (colSpan - 1) * gutterPx;
    const baseH = rowSpan * cellH + (rowSpan - 1) * gutterPx;
    const w = baseW + (lastColInPanel === cols - 1 ? wRemainder : 0);
    const h = baseH + (lastRowInPanel === rows - 1 ? hRemainder : 0);
    const x = gutterPx + p.col * (cellW + gutterPx);
    const y = gutterPx + p.row * (cellH + gutterPx);
    return { x, y, w, h };
  });
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
  const { panX, panY } = clampCoverPan(t.panX, t.panY, panelW, panelH, rw, rh, zoom);
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
