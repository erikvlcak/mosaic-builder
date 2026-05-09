/**
 * M6 annotation render pass. Called by `drawFigure` after the panel pass.
 * Implements `letter`, `text`, and `box` in Task 5; `symbol` and `scalebar`
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

import type {
  Figure,
  HardCodedPanel,
  ResolvedAnnotation,
} from "../model/types";
import type {
  LetterAnnotation,
  TextAnnotation,
  BoxAnnotation,
  SymbolAnnotation,
  ScaleBarAnnotation,
} from "../model/annotations";
import type { LetterStyle } from "../model/global-style";
import type { ImagePoolItem } from "../model/pool";
import type { PanelRect } from "./coords";
import type { DrawCtx } from "./draw-figure";
import { scaleBarFigurePx, scaleBarRect } from "./scalebar";
import { SYMBOL_LIBRARY_BY_ID } from "../symbols/library";

export interface AnnotationDrawDeps {
  /** Index of panel rect by panel id (matches figure.panels order). */
  panelRectsById: Map<string, PanelRect>;
  /** Index of panel by panel id, for O(1) lookup of transform + image dims. */
  panelsById: Map<string, HardCodedPanel>;
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
      case "symbol":
        drawSymbol(ctx, a);
        break;
      case "scalebar":
        drawScaleBar(ctx, a, figure, deps);
        break;
      default: {
        // Exhaustiveness check: adding a new annotation kind to
        // `ResolvedAnnotation` (or removing the symbol/scalebar cases
        // above) will trigger a compile error here.
        const _exhaustive: never = a;
        void _exhaustive;
        break;
      }
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
  const corner = style.corner;
  switch (corner) {
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
      // Exhaustiveness check: extending `Corner` (e.g. with "center") will
      // surface here as a compile error until the renderer is updated.
      const _exhaustive: never = corner;
      void _exhaustive;
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
    ctx.fillRect(
      t.x - padX,
      t.y - padY,
      textWidth + padX * 2,
      sizePx + padY * 2,
    );
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

function drawSymbol(ctx: DrawCtx, a: SymbolAnnotation): void {
  const def = SYMBOL_LIBRARY_BY_ID.get(a.symbolId);
  if (def === undefined) return;
  // Degenerate; would produce Infinity lineWidth for stroked symbols.
  if (a.sizePx <= 0) return;
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate((a.rotationDeg * Math.PI) / 180);
  // Library viewport is 100×100 with center at (50,50). Scale to sizePx,
  // then translate by -50,-50 so the symbol's center sits where the user
  // placed it. Order matters: scale BEFORE the -50,-50 translate so the
  // offset is in the SAME local space as the path coordinates.
  const scale = a.sizePx / 100;
  ctx.scale(scale, scale);
  ctx.translate(-50, -50);
  const path = new Path2D(def.pathD);
  if (def.fill) {
    ctx.fillStyle = a.color;
    ctx.fill(path);
  } else {
    ctx.strokeStyle = a.color;
    // Keep on-screen stroke width constant in figure-px regardless of sizePx.
    ctx.lineWidth = a.strokeWidthPx / scale;
    ctx.stroke(path);
  }
  ctx.restore();
}

function drawScaleBar(
  ctx: DrawCtx,
  s: ScaleBarAnnotation & { resolvedPanelId: string },
  figure: Figure,
  deps: AnnotationDrawDeps,
): void {
  const panelRect = deps.panelRectsById.get(s.resolvedPanelId);
  if (panelRect === undefined) return;

  // Locate the underlying panel for transform + image dims (O(1) via index).
  const panel = deps.panelsById.get(s.resolvedPanelId);
  if (panel === undefined || panel.kind !== "image") return;

  const bitmap = deps.bitmaps.get(panel.imageId);
  if (bitmap === undefined) return;

  // image MAY be undefined if pool wasn't passed; in that case
  // calibration will be undefined and a physical-length bar resolves to 0.
  const image = deps.imagesById.get(panel.imageId);
  const calibration = image?.calibration;

  const barLength = scaleBarFigurePx(
    s.lengthValue,
    s.lengthUnit,
    calibration,
    panel.transform,
    panelRect.w,
    panelRect.h,
    bitmap.width,
    bitmap.height,
  );
  if (barLength <= 0) return;

  const style = figure.globalStyle.scalebar;
  const corner = s.cornerOverride ?? style.corner;
  const rect = scaleBarRect(
    corner,
    style.paddingPx,
    panelRect,
    barLength,
    style.thicknessPx,
  );

  // Bar fill.
  ctx.fillStyle = style.barColor;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  if (!style.showLabel) return;

  // Label sits above the bar. M6: 1pt = 1px.
  const sizePx = style.sizePt;
  ctx.font = `${sizePx}px ${style.font}`;
  ctx.fillStyle = style.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // µm rendered as the literal U+00B5 micro sign.
  const unitGlyph = s.lengthUnit === "um" ? "µm" : s.lengthUnit;
  const labelText = `${s.lengthValue} ${unitGlyph}`;
  const labelX = rect.x + rect.w / 2;
  // Place the label on the side of the bar facing INTO the panel: above the
  // bar for bottom-anchored corners, below it for top-anchored ones. This
  // keeps the label inside the panel rather than spilling into the gutter.
  const isTopCorner = corner === "tl" || corner === "tr";
  const labelY = isTopCorner ? rect.y + rect.h + 2 + sizePx : rect.y - 2;

  ctx.fillText(labelText, labelX, labelY);
}

// Re-export ResolvedAnnotation in case future callers want the union here.
export type { ResolvedAnnotation };
