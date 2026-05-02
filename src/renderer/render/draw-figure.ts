import type { Figure } from "../model/types";
import { computePanelRects, type PanelRect } from "./coords";

/**
 * Subset of CanvasRenderingContext2D / OffscreenCanvasRenderingContext2D
 * we depend on. Lets us unit-test with a recorder fake instead of a real
 * canvas, and lets one draw routine target both contexts at runtime.
 */
export interface DrawCtx {
  fillStyle: string;
  strokeStyle: string;
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
}

const PLACEHOLDER_FILL = "#EEEEEE";
const PLACEHOLDER_STROKE = "#CCCCCC";
const PLACEHOLDER_LABEL = "#666666";

export function drawFigure(
  ctx: DrawCtx,
  figure: Figure,
  images: Map<string, ImageBitmap>,
): void {
  // 1. Background.
  ctx.fillStyle = figure.canvas.background;
  ctx.fillRect(0, 0, figure.canvas.widthPx, figure.canvas.heightPx);

  // 2. Each panel.
  const rects = computePanelRects(figure);
  for (let i = 0; i < figure.panels.length; i++) {
    const panel = figure.panels[i];
    const rect = rects[i];
    if (panel === undefined || rect === undefined) continue;

    if (panel.kind === "image") {
      const bitmap = images.get(panel.imageId);
      if (bitmap !== undefined) {
        drawImageContain(ctx, bitmap, rect);
      } else {
        drawPlaceholder(ctx, rect, "(missing)");
      }
    } else {
      drawPlaceholder(ctx, rect, panel.label);
    }
  }
}

function drawImageContain(
  ctx: DrawCtx,
  bitmap: ImageBitmap,
  rect: PanelRect,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  const scale = Math.min(rect.w / bitmap.width, rect.h / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  const x = rect.x + (rect.w - w) / 2;
  const y = rect.y + (rect.h - h) / 2;
  ctx.drawImage(bitmap, x, y, w, h);

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
