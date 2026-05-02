/**
 * M6 annotation render pass. Called by `drawFigure` after the panel pass.
 * Implements `letter`, `text`, and `box` in Task 5; `arrow` and `scalebar`
 * land in Task 6.
 *
 * Conventions:
 *  - All coordinates are in figure-canvas px (top-left origin).
 *  - Letters use the canvas default `textBaseline = "alphabetic"` so the
 *    on-screen y-coord aligns with the visual *baseline* — the corner-anchor
 *    math drops `+ sizePx` for top corners so the visible top sits at
 *    `panel.y + paddingPx`.
 *  - Text annotations use `textBaseline = "top"` because the spec
 *    explicitly anchors at the top-left of the text box.
 *  - 1pt = 1px in M6 (no DPI scaling). Task 9 introduces the export-DPI
 *    multiplier.
 *
 * `drawAnnotations` MUST NOT mutate the figure or its annotations.
 */

import type { Figure, ResolvedAnnotation } from "../model/types";
import type { LetterAnnotation, TextAnnotation, BoxAnnotation } from "../model/annotations";
import type { LetterStyle } from "../model/global-style";
import type { ImagePoolItem } from "../model/pool";
import type { PanelRect } from "./coords";
import type { DrawCtx } from "./draw-figure";

export interface AnnotationDrawDeps {
  /** Index of panel rect by panel id (matches figure.panels order). */
  panelRectsById: Map<string, PanelRect>;
  /** Pool items keyed by image id, for scale-bar calibration lookup (Task 6). */
  imagesById: Map<string, ImagePoolItem>;
  /** Pre-loaded ImageBitmaps; used for image dims, not pixel data (Task 6). */
  bitmaps: Map<string, ImageBitmap>;
}

export function drawAnnotations(
  ctx: DrawCtx,
  figure: Figure,
  deps: AnnotationDrawDeps,
): void {
  // Stable sort by z; ties broken by array order. Spread to avoid mutating
  // figure.annotations (Array.prototype.sort is in-place).
  const sorted = [...figure.annotations].sort((a, b) => a.z - b.z);
  for (const a of sorted) {
    switch (a.kind) {
      case "letter":
        drawLetter(ctx, a, figure, deps);
        break;
      case "text":
        drawText(ctx, a, deps);
        break;
      case "box":
        drawBox(ctx, a, deps);
        break;
      // Task 6:
      case "arrow":
      case "scalebar":
      default:
        break;
    }
  }
}

function fontString(opts: {
  bold?: boolean;
  italic?: boolean;
  sizePx: number;
  family: string;
}): string {
  const parts: string[] = [];
  if (opts.italic) parts.push("italic");
  if (opts.bold) parts.push("bold");
  parts.push(`${opts.sizePx}px`);
  parts.push(opts.family);
  return parts.join(" ");
}

function drawLetter(
  ctx: DrawCtx,
  letter: LetterAnnotation,
  figure: Figure,
  deps: AnnotationDrawDeps,
): void {
  const style: LetterStyle = figure.globalStyle.letters;
  // Render-time check so toggling `enabled` doesn't require a re-derive.
  if (!style.enabled) return;

  const rect = deps.panelRectsById.get(letter.panelId);
  // Orphaned letter (panel was removed but annotation lingers): skip.
  if (rect === undefined) return;

  // M6: 1pt = 1px in the editor. Task 9 introduces the export-DPI multiplier.
  const sizePx = style.sizePt;
  ctx.font = fontString({
    bold: style.bold,
    sizePx,
    family: style.font,
  });
  // Use canvas-default alphabetic baseline; the corner-anchor math below
  // adds `sizePx` for top corners so the visible top sits at
  // `rect.y + paddingPx`. This matches the plan's spec test.
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // Measure once for right-anchored corners.
  const textWidth = ctx.measureText(letter.text).width;

  let x: number;
  let y: number;
  switch (style.corner) {
    case "tl":
      x = rect.x + style.paddingPx;
      y = rect.y + style.paddingPx + sizePx;
      break;
    case "tr":
      x = rect.x + rect.w - style.paddingPx - textWidth;
      y = rect.y + style.paddingPx + sizePx;
      break;
    case "bl":
      x = rect.x + style.paddingPx;
      y = rect.y + rect.h - style.paddingPx;
      break;
    case "br":
      x = rect.x + rect.w - style.paddingPx - textWidth;
      y = rect.y + rect.h - style.paddingPx;
      break;
    default: {
      // Unknown corner — skip rather than guess.
      return;
    }
  }

  if (style.bgColor !== undefined) {
    // Pad the background a touch so glyphs don't touch the edge. Top of the
    // text sits at `y - sizePx` (alphabetic baseline → visible top).
    const padX = 2;
    const padY = 1;
    ctx.fillStyle = style.bgColor;
    ctx.fillRect(
      x - padX,
      y - sizePx - padY,
      textWidth + padX * 2,
      sizePx + padY * 2,
    );
  }

  ctx.fillStyle = style.color;
  ctx.fillText(letter.text, x, y);
}

function drawText(
  ctx: DrawCtx,
  t: TextAnnotation,
  deps: AnnotationDrawDeps,
): void {
  // If the text is anchored to a panel, that panel must still resolve.
  // Figure-global text (panelId undefined) draws unconditionally.
  if (t.panelId !== undefined && !deps.panelRectsById.has(t.panelId)) return;

  // 1pt = 1px in M6.
  const sizePx = t.sizePt;
  ctx.font = fontString({
    bold: t.bold,
    italic: t.italic,
    sizePx,
    family: t.font,
  });
  // Spec: "Anchored at the text's top-left." So (x, y) is the visible top-left.
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  const textWidth = ctx.measureText(t.text).width;

  if (t.bgColor !== undefined) {
    const padX = 2;
    const padY = 1;
    ctx.fillStyle = t.bgColor;
    ctx.fillRect(t.x - padX, t.y - padY, textWidth + padX * 2, sizePx + padY * 2);
  }

  ctx.fillStyle = t.color;
  ctx.fillText(t.text, t.x, t.y);
}

function drawBox(
  ctx: DrawCtx,
  b: BoxAnnotation,
  deps: AnnotationDrawDeps,
): void {
  if (b.panelId !== undefined && !deps.panelRectsById.has(b.panelId)) return;

  if (b.fill !== undefined) {
    ctx.fillStyle = b.fill;
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  ctx.strokeStyle = b.stroke;
  ctx.lineWidth = b.strokeWidthPx;
  ctx.strokeRect(b.x, b.y, b.w, b.h);
}

// Re-export ResolvedAnnotation in case future callers want the union here.
export type { ResolvedAnnotation };
