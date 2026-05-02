import type { Figure } from "../model/types";
import type { PanelTransform } from "../model/panels";
import { computePanelRects, rotatedImageDims, type PanelRect } from "./coords";

/**
 * Subset of CanvasRenderingContext2D / OffscreenCanvasRenderingContext2D
 * we depend on. Lets us unit-test with a recorder fake instead of a real
 * canvas, and lets one draw routine target both contexts at runtime.
 */
export interface DrawCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(
    img: CanvasImageSource,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  save(): void;
  restore(): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(rad: number): void;
}

const PLACEHOLDER_FILL = "#EEEEEE";
const PLACEHOLDER_STROKE = "#CCCCCC";
const PLACEHOLDER_LABEL = "#666666";

export function drawFigure(
  ctx: DrawCtx,
  figure: Figure,
  images: Map<string, ImageBitmap>,
): void {
  // 1. Canvas background. Anything not covered by gutter or panels shows
  //    this through (currently nothing — the gutter fills the entire canvas
  //    around the panels — but we paint it first as a defensive base layer
  //    so future features that introduce padding outside the gutter don't
  //    leave undefined-color regions).
  ctx.fillStyle = figure.canvas.background;
  ctx.fillRect(0, 0, figure.canvas.widthPx, figure.canvas.heightPx);

  // 2. Gutter. The gutter is "everything visible that isn't a panel" — the
  //    user-configurable gutterColor paints over the whole canvas, then
  //    panels are drawn on top, so what remains visible between panels is
  //    the gutter strips.
  ctx.fillStyle = figure.grid.gutterColor;
  ctx.fillRect(0, 0, figure.canvas.widthPx, figure.canvas.heightPx);

  // 3. Each panel.
  const rects = computePanelRects(figure);
  for (let i = 0; i < figure.panels.length; i++) {
    const panel = figure.panels[i];
    const rect = rects[i];
    if (panel === undefined || rect === undefined) continue;

    if (panel.kind === "image") {
      const bitmap = images.get(panel.imageId);
      if (bitmap !== undefined) {
        drawPanelImage(ctx, bitmap, rect, panel.transform);
      } else {
        drawPlaceholder(ctx, rect, "(missing)");
      }
    } else {
      drawPlaceholder(ctx, rect, panel.label);
    }
  }
}

function drawPanelImage(
  ctx: DrawCtx,
  bitmap: ImageBitmap,
  rect: PanelRect,
  t: PanelTransform,
): void {
  ctx.save();
  // Clip to the panel rect so pan/zoom never bleed into the gutter.
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  // Move origin to panel center, then apply user pan (panel-local px,
  // post-rotation, pre-image-center translate).
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.translate(t.panX, t.panY);

  if (t.fit === "stretch") {
    // Anisotropic — ignore zoom. Rotation in Stretch produces a useful
    // 90°/270° anisotropic effect, so we still apply it below.
    const { w: rw, h: rh } = rotatedImageDims(bitmap.width, bitmap.height, t.rotation);
    ctx.scale(rect.w / rw, rect.h / rh);
  } else {
    const { w: rw, h: rh } = rotatedImageDims(bitmap.width, bitmap.height, t.rotation);
    const S =
      t.fit === "cover"
        ? Math.max(rect.w / rw, rect.h / rh)
        : Math.min(rect.w / rw, rect.h / rh);
    ctx.scale(S * t.zoom, S * t.zoom);
  }

  if (t.rotation !== 0) {
    ctx.rotate((t.rotation * Math.PI) / 180);
  }
  if (t.flipH || t.flipV) {
    ctx.scale(t.flipH ? -1 : 1, t.flipV ? -1 : 1);
  }
  ctx.translate(-bitmap.width / 2, -bitmap.height / 2);

  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
  ctx.restore();
}

function drawPlaceholder(ctx: DrawCtx, rect: PanelRect, label: string): void {
  ctx.fillStyle = PLACEHOLDER_FILL;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = PLACEHOLDER_STROKE;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

  ctx.fillStyle = PLACEHOLDER_LABEL;
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
}
