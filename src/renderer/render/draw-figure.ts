import type { Figure, HardCodedPanel } from "../model/types";
import type { PanelTransform } from "../model/panels";
import type { ImagePoolItem } from "../model/pool";
import { computePanelRects, rotatedImageDims, type PanelRect } from "./coords";
import { drawAnnotations } from "./draw-annotations";

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
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  /** Outline pass for text — used to paint a contrasting halo behind glyphs. */
  strokeText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  drawImage(
    img: CanvasImageSource,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  /** 9-arg form: source sub-rect → destination rect. Used for non-destructive crop. */
  drawImage(
    img: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(rad: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(path?: Path2D): void;
  fill(path?: Path2D): void;
  setLineDash(segments: number[]): void;
}

const PLACEHOLDER_FILL = "#EEEEEE";
const PLACEHOLDER_STROKE = "#CCCCCC";
const PLACEHOLDER_LABEL = "#666666";
const PLACEHOLDER_CAPTION = "#9AA0A8";
const DRAG_HINT_TEXT = "Drag an image here or click to browse";
const DRAG_HINT_TEXT_SHORT = "Drag or click to add";
const CAPTION_MIN_W = 96;
const CAPTION_MIN_H = 64;
const CAPTION_FULL_MIN_W = 240;

// Dark-theme editor chrome for empty panels. Chrome only — never exported.
// A lifted charcoal reads as an empty slot against the dark surround without
// the glare a bright #EEEEEE panel would throw on a dark canvas.
const PLACEHOLDER_FILL_DARK = "#2A2F37";
const PLACEHOLDER_STROKE_DARK = "#3A414D";
const PLACEHOLDER_LABEL_DARK = "#A6ADBA";
const PLACEHOLDER_CAPTION_DARK = "#7B8494";

/**
 * Editor-only rendering hints. These affordances (e.g. the "Drag an image
 * here" caption on empty panels) MUST NOT appear in exports — exports are
 * figure content only. The editor renderer passes these; export renderers
 * leave them off (the default), so the same `drawFigure` serves both.
 */
export interface DrawFigureOpts {
  /** Render editor-only affordances such as empty-panel drag captions. */
  editorHints?: boolean;
  /** Editor CHROME theme. Selects the empty-panel placeholder palette only —
   *  figure content (background, gutter, annotations) never reads this, so
   *  exports (which never pass it) stay byte-identical across themes. */
  theme?: "light" | "dark";
}

/**
 * @param pool Optional pool-item map for annotation calibration lookup
 *   (Task 6 scale bars). Default empty so Task 5 (letters/text/box) callers
 *   don't need to plumb it through.
 * @param opts Editor-only rendering hints; omitted (all off) on the export path.
 */
export function drawFigure(
  ctx: DrawCtx,
  figure: Figure,
  images: Map<string, ImageBitmap>,
  pool: Map<string, ImagePoolItem> = new Map(),
  opts: DrawFigureOpts = {},
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
        drawPlaceholder(ctx, rect, "(missing)", false, opts.theme);
      }
    } else {
      // Empty panel: invite a drag whenever we're in the editor. Shown even
      // with an empty pool so the very first run tells the user what to do
      // (exports never pass editorHints, so it stays out of output).
      const showCaption = opts.editorHints === true;
      drawPlaceholder(ctx, rect, panel.label, showCaption, opts.theme);
    }
  }

  // 4. Annotation pass. Build the panel-id → rect AND panel-id → panel
  //    indexes from the panels we just laid out so annotations can anchor
  //    to their panel without re-walking the grid math or re-scanning
  //    figure.panels per scale bar.
  const panelRectsById = new Map<string, PanelRect>();
  const panelsById = new Map<string, HardCodedPanel>();
  for (let i = 0; i < figure.panels.length; i++) {
    const p = figure.panels[i];
    const r = rects[i];
    if (p?.panelId !== undefined && r !== undefined) {
      panelRectsById.set(p.panelId, r);
      panelsById.set(p.panelId, p);
    }
  }
  drawAnnotations(ctx, figure, {
    panelRectsById,
    panelsById,
    imagesById: pool,
    bitmaps: images,
  });
}

function drawPanelImage(
  ctx: DrawCtx,
  bitmap: ImageBitmap,
  rect: PanelRect,
  t: PanelTransform,
): void {
  // Crop sub-rect in source-px (defaults to the full bitmap when absent).
  // The fit/pan/zoom/rotation/flip math operates on the cropped slice as
  // if it were the source — substitute (cw, ch) for (bitmap.w, bitmap.h)
  // throughout, then the final drawImage uses the 9-arg source-rect form
  // to draw only the cropped pixels at the equivalent destination box.
  const sx = t.crop !== undefined ? t.crop.x * bitmap.width : 0;
  const sy = t.crop !== undefined ? t.crop.y * bitmap.height : 0;
  const cw = t.crop !== undefined ? t.crop.w * bitmap.width : bitmap.width;
  const ch = t.crop !== undefined ? t.crop.h * bitmap.height : bitmap.height;

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
    const { w: rw, h: rh } = rotatedImageDims(cw, ch, t.rotation);
    ctx.scale(rect.w / rw, rect.h / rh);
  } else {
    const { w: rw, h: rh } = rotatedImageDims(cw, ch, t.rotation);
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
  ctx.translate(-cw / 2, -ch / 2);

  ctx.drawImage(bitmap, sx, sy, cw, ch, 0, 0, cw, ch);
  ctx.restore();
}

/**
 * Tiers are ordered, not independent: a panel too small in EITHER axis is
 * rejected first, so a wide-but-short panel can't match on width alone and
 * then overflow its own height. 13px text needs roughly 240px to fit the
 * full string.
 */
function captionFor(rect: PanelRect): string | null {
  if (rect.w < CAPTION_MIN_W || rect.h < CAPTION_MIN_H) return null;
  return rect.w >= CAPTION_FULL_MIN_W ? DRAG_HINT_TEXT : DRAG_HINT_TEXT_SHORT;
}

function drawPlaceholder(
  ctx: DrawCtx,
  rect: PanelRect,
  label: string,
  showCaption: boolean,
  theme: "light" | "dark" = "light",
): void {
  const dark = theme === "dark";
  ctx.fillStyle = dark ? PLACEHOLDER_FILL_DARK : PLACEHOLDER_FILL;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = dark ? PLACEHOLDER_STROKE_DARK : PLACEHOLDER_STROKE;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const caption = showCaption ? captionFor(rect) : null;
  // `deriveFigure` gives every placeholder an EMPTY label — the visible A/B/C
  // comes from the letter-annotation layer, anchored top-left, not from here.
  // So in practice the caption is the only text drawn, and splitting the pair
  // around the center would leave it hanging 14px low inside the browse zone.
  // Only offset the two when a label is genuinely present ("(missing)", or a
  // hand-built fixture).
  const pairs = caption !== null && label !== "";
  ctx.fillStyle = dark ? PLACEHOLDER_LABEL_DARK : PLACEHOLDER_LABEL;
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, pairs ? cy - 14 : cy);

  if (caption !== null) {
    ctx.fillStyle = dark ? PLACEHOLDER_CAPTION_DARK : PLACEHOLDER_CAPTION;
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(caption, cx, pairs ? cy + 14 : cy);
  }
}
