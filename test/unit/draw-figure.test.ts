import { describe, it, expect } from "vitest";
import {
  drawFigure,
  type DrawCtx,
} from "../../src/renderer/render/draw-figure";
import { drawAnnotations } from "../../src/renderer/render/draw-annotations";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_TRANSFORM } from "../../src/renderer/model/panels";
import type { PanelTransform } from "../../src/renderer/model/panels";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";

interface Call {
  op: string;
  args: unknown[];
  // Snapshot of style-affecting state at the time of the call. Useful for
  // asserting which fill/stroke color was active when an op was emitted.
  fillStyle: string;
  strokeStyle: string;
  font: string;
  lineWidth: number;
}

/**
 * `measureText` stub: deterministic, derived from `font` so different sizes
 * produce different widths. Width = textLen * sizePx * 0.6, where sizePx
 * is parsed out of the standard CSS font shorthand the renderer emits
 * (`"[bold ][italic ]<sizePx>px <family>"`). Defaults to 8 if no size found.
 */
function fontSizePx(font: string): number {
  const m = /(\d+)px/.exec(font);
  return m && m[1] !== undefined ? Number(m[1]) : 8;
}

function makeRecorder(): DrawCtx & { calls: Call[] } {
  const calls: Call[] = [];
  const ctx: DrawCtx & { calls: Call[] } = {
    calls,
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "left" as CanvasTextAlign,
    textBaseline: "top" as CanvasTextBaseline,
    lineWidth: 1,
    lineCap: "butt" as CanvasLineCap,
    lineJoin: "miter" as CanvasLineJoin,
    fillRect(...args) {
      calls.push(snapshot("fillRect", args));
    },
    strokeRect(...args) {
      calls.push(snapshot("strokeRect", args));
    },
    fillText(...args) {
      calls.push(snapshot("fillText", args));
    },
    measureText(text: string) {
      const sizePx = fontSizePx(this.font);
      return { width: text.length * sizePx * 0.6 };
    },
    drawImage(...args) {
      calls.push(snapshot("drawImage", args));
    },
    save() {
      calls.push(snapshot("save", []));
    },
    restore() {
      calls.push(snapshot("restore", []));
    },
    beginPath() {
      calls.push(snapshot("beginPath", []));
    },
    closePath() {
      calls.push(snapshot("closePath", []));
    },
    rect(...args) {
      calls.push(snapshot("rect", args));
    },
    clip() {
      calls.push(snapshot("clip", []));
    },
    translate(...args) {
      calls.push(snapshot("translate", args));
    },
    scale(...args) {
      calls.push(snapshot("scale", args));
    },
    rotate(...args) {
      calls.push(snapshot("rotate", args));
    },
    moveTo(...args) {
      calls.push(snapshot("moveTo", args));
    },
    lineTo(...args) {
      calls.push(snapshot("lineTo", args));
    },
    stroke(path?: Path2D) {
      calls.push(snapshot("stroke", path === undefined ? [] : [path]));
    },
    fill(path?: Path2D) {
      calls.push(snapshot("fill", path === undefined ? [] : [path]));
    },
  };
  function snapshot(op: string, args: unknown[]): Call {
    return {
      op,
      args,
      fillStyle: String(ctx.fillStyle),
      strokeStyle: String(ctx.strokeStyle),
      font: ctx.font,
      lineWidth: ctx.lineWidth,
    };
  }
  return ctx;
}

// FIG fixture: 2x2 figure with one image panel + three placeholders. M6 adds
// `panelId` on each HardCodedPanel so annotation matching can find them, plus
// the figure-level `annotations` + `globalStyle`. Letters disabled here so
// the panel-pass tests stay focused on `drawPlaceholder`/`drawPanelImage`.
const LETTERS_OFF = {
  ...DEFAULT_GLOBAL_STYLE,
  letters: { ...DEFAULT_GLOBAL_STYLE.letters, enabled: false },
};
const FIG: Figure = {
  canvas: { widthPx: 200, heightPx: 200, background: "#FAFAFA" },
  grid: { rows: 2, cols: 2, gutterPx: 10, gutterColor: "#FAFAFA" },
  panels: [
    {
      panelId: "p1",
      row: 0,
      col: 0,
      kind: "image",
      imageId: "sample",
      transform: DEFAULT_TRANSFORM,
    },
    { panelId: "p2", row: 0, col: 1, kind: "placeholder", label: "B" },
    { panelId: "p3", row: 1, col: 0, kind: "placeholder", label: "C" },
    { panelId: "p4", row: 1, col: 1, kind: "placeholder", label: "D" },
  ],
  annotations: [],
  globalStyle: LETTERS_OFF,
};

describe("drawFigure", () => {
  it("paints the canvas background first", () => {
    const ctx = makeRecorder();
    drawFigure(ctx, FIG, new Map());
    const first = ctx.calls[0];
    expect(first?.op).toBe("fillRect");
    expect(first?.args).toEqual([0, 0, 200, 200]);
  });

  it("draws the bundled image into panel (0,0) when provided", () => {
    const ctx = makeRecorder();
    const fakeBitmap = { width: 256, height: 256 } as unknown as ImageBitmap;
    drawFigure(ctx, FIG, new Map([["sample", fakeBitmap]]));
    const drew = ctx.calls.find((c) => c.op === "drawImage");
    expect(drew).toBeDefined();
    expect(drew?.args[0]).toBe(fakeBitmap);
  });

  it("falls back to a placeholder rect when an image is missing", () => {
    const ctx = makeRecorder();
    drawFigure(ctx, FIG, new Map()); // no images supplied
    // No drawImage calls; placeholder rects + labels instead
    expect(ctx.calls.some((c) => c.op === "drawImage")).toBe(false);
    // 4 placeholder strokeRects (one per cell) + 4 labels
    const strokes = ctx.calls.filter((c) => c.op === "strokeRect");
    expect(strokes.length).toBe(4);
    const labels = ctx.calls.filter((c) => c.op === "fillText");
    expect(labels.length).toBe(4);
  });

  it("paints the gutter color over the full canvas before drawing panels", () => {
    // Snapshot fillStyle at each fillRect call so we can verify the color
    // used per call — the simple recorder above only tracks op + args.
    const fills: { fillStyle: string; args: unknown[] }[] = [];
    const ctx: DrawCtx = {
      fillStyle: "",
      strokeStyle: "",
      font: "",
      textAlign: "left",
      textBaseline: "top",
      lineWidth: 1,
      lineCap: "butt",
      lineJoin: "miter",
      fillRect(x, y, w, h) {
        fills.push({ fillStyle: String(this.fillStyle), args: [x, y, w, h] });
      },
      strokeRect() {},
      fillText() {},
      measureText(text: string) {
        return { width: text.length * 8 };
      },
      drawImage() {},
      save() {},
      restore() {},
      beginPath() {},
      closePath() {},
      rect() {},
      clip() {},
      translate() {},
      scale() {},
      rotate() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      fill() {},
    };
    const fig: Figure = {
      canvas: { widthPx: 100, heightPx: 100, background: "#FAFAFA" },
      grid: { rows: 1, cols: 1, gutterPx: 10, gutterColor: "#3A7BD5" },
      panels: [
        { panelId: "p1", row: 0, col: 0, kind: "placeholder", label: "A" },
      ],
      annotations: [],
      globalStyle: LETTERS_OFF,
    };
    drawFigure(ctx, fig, new Map());
    // First fill = canvas background; second fill = gutter color over the
    // entire canvas. Both span (0,0)-(W,H).
    expect(fills[0]).toEqual({ fillStyle: "#FAFAFA", args: [0, 0, 100, 100] });
    expect(fills[1]).toEqual({ fillStyle: "#3A7BD5", args: [0, 0, 100, 100] });
  });

  describe("drawPanelImage transforms", () => {
    it("Contain + identity transform draws image clipped to panel rect", () => {
      const ctx = makeRecorder();
      const bitmap = { width: 100, height: 100 } as unknown as ImageBitmap;
      drawFigure(ctx, FIG, new Map([["sample", bitmap]]));
      // First panel (0,0) on a 200x200 canvas / 10gutter / 2x2 grid:
      //   availW = 200 - 30 = 170; cellW = 85; rect = (10,10,85,85)
      const clipRect = ctx.calls.find(
        (c) => c.op === "rect" && (c.args as number[])[0] === 10,
      );
      expect(clipRect?.args).toEqual([10, 10, 85, 85]);
      // Translate to panel center (10+42.5, 10+42.5) = (52.5, 52.5)
      const translates = ctx.calls.filter((c) => c.op === "translate");
      expect(translates[0]?.args).toEqual([52.5, 52.5]);
      // Then a (0,0) pan translate.
      expect(translates[1]?.args).toEqual([0, 0]);
      // Then scale = Contain on 100x100 image into 85x85 rect = 0.85.
      const scales = ctx.calls.filter((c) => c.op === "scale");
      expect(scales[0]?.args).toEqual([0.85, 0.85]);
      // No rotate call when rotation === 0.
      expect(ctx.calls.some((c) => c.op === "rotate")).toBe(false);
      // drawImage uses the 9-arg source-rect form (s/d both = full bitmap).
      // The crop feature substitutes the source rect; absent crop still
      // routes through the same 9-arg call to keep the draw path uniform.
      const drew = ctx.calls.find((c) => c.op === "drawImage");
      expect(drew?.args).toEqual([bitmap, 0, 0, 100, 100, 0, 0, 100, 100]);
    });

    it("Cover fit applies max() scale instead of min()", () => {
      const ctx = makeRecorder();
      const wideBitmap = { width: 200, height: 100 } as unknown as ImageBitmap;
      const fig: Figure = {
        canvas: { widthPx: 100, heightPx: 100, background: "#FFF" },
        grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
        panels: [
          {
            panelId: "p1",
            row: 0,
            col: 0,
            kind: "image",
            imageId: "w",
            transform: { ...DEFAULT_TRANSFORM, fit: "cover" },
          },
        ],
        annotations: [],
        globalStyle: LETTERS_OFF,
      };
      drawFigure(ctx, fig, new Map([["w", wideBitmap]]));
      // panel 100x100, image 200x100 → Cover S = max(100/200, 100/100) = 1
      const scales = ctx.calls.filter((c) => c.op === "scale");
      expect(scales[0]?.args).toEqual([1, 1]);
    });

    it("Stretch produces anisotropic scale", () => {
      const ctx = makeRecorder();
      const bitmap = { width: 200, height: 100 } as unknown as ImageBitmap;
      const fig: Figure = {
        canvas: { widthPx: 100, heightPx: 100, background: "#FFF" },
        grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
        panels: [
          {
            panelId: "p1",
            row: 0,
            col: 0,
            kind: "image",
            imageId: "s",
            transform: { ...DEFAULT_TRANSFORM, fit: "stretch" },
          },
        ],
        annotations: [],
        globalStyle: LETTERS_OFF,
      };
      drawFigure(ctx, fig, new Map([["s", bitmap]]));
      // panel 100x100, image 200x100 → sx=0.5, sy=1
      const scales = ctx.calls.filter((c) => c.op === "scale");
      expect(scales[0]?.args).toEqual([0.5, 1]);
    });

    it("rotation = 90 emits a rotate(π/2) call", () => {
      const ctx = makeRecorder();
      const bitmap = { width: 100, height: 100 } as unknown as ImageBitmap;
      const fig: Figure = {
        canvas: { widthPx: 100, heightPx: 100, background: "#FFF" },
        grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
        panels: [
          {
            panelId: "p1",
            row: 0,
            col: 0,
            kind: "image",
            imageId: "r",
            transform: { ...DEFAULT_TRANSFORM, rotation: 90 },
          },
        ],
        annotations: [],
        globalStyle: LETTERS_OFF,
      };
      drawFigure(ctx, fig, new Map([["r", bitmap]]));
      const rot = ctx.calls.find((c) => c.op === "rotate");
      expect(rot).toBeDefined();
      expect(rot?.args[0]).toBeCloseTo(Math.PI / 2);
    });

    it("flipH emits scale(-1, 1)", () => {
      const ctx = makeRecorder();
      const bitmap = { width: 100, height: 100 } as unknown as ImageBitmap;
      const fig: Figure = {
        canvas: { widthPx: 100, heightPx: 100, background: "#FFF" },
        grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
        panels: [
          {
            panelId: "p1",
            row: 0,
            col: 0,
            kind: "image",
            imageId: "f",
            transform: { ...DEFAULT_TRANSFORM, flipH: true },
          },
        ],
        annotations: [],
        globalStyle: LETTERS_OFF,
      };
      drawFigure(ctx, fig, new Map([["f", bitmap]]));
      const scales = ctx.calls.filter((c) => c.op === "scale");
      // First scale = baseScale (1,1); second = flip (-1, 1)
      expect(scales[1]?.args).toEqual([-1, 1]);
    });

    it("crop substitutes a source sub-rect and rescales fit math to the crop dims", () => {
      const ctx = makeRecorder();
      // 100×100 bitmap, panel rect (0,0,100,100), Contain fit, crop is the
      // top-left quarter — the cropped slice is 50×50, so Contain into a
      // 100×100 panel scales by 2.0 (vs 1.0 for no crop).
      const bitmap = { width: 100, height: 100 } as unknown as ImageBitmap;
      const fig: Figure = {
        canvas: { widthPx: 100, heightPx: 100, background: "#FFF" },
        grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
        panels: [
          {
            panelId: "p1",
            row: 0,
            col: 0,
            kind: "image",
            imageId: "f",
            transform: {
              ...DEFAULT_TRANSFORM,
              crop: { x: 0, y: 0, w: 0.5, h: 0.5 },
            },
          },
        ],
        annotations: [],
        globalStyle: LETTERS_OFF,
      };
      drawFigure(ctx, fig, new Map([["f", bitmap]]));
      // Contain on a 50×50 cropped slice into a 100×100 panel = scale 2.
      const scales = ctx.calls.filter((c) => c.op === "scale");
      expect(scales[0]?.args).toEqual([2, 2]);
      // Source rect on drawImage is the top-left 50×50 of the bitmap.
      const drew = ctx.calls.find((c) => c.op === "drawImage");
      expect(drew?.args).toEqual([bitmap, 0, 0, 50, 50, 0, 0, 50, 50]);
    });

    it("crop offsets the source rect when not at the origin", () => {
      const ctx = makeRecorder();
      const bitmap = { width: 200, height: 100 } as unknown as ImageBitmap;
      const fig: Figure = {
        canvas: { widthPx: 100, heightPx: 100, background: "#FFF" },
        grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
        panels: [
          {
            panelId: "p1",
            row: 0,
            col: 0,
            kind: "image",
            imageId: "f",
            transform: {
              ...DEFAULT_TRANSFORM,
              crop: { x: 0.5, y: 0.25, w: 0.25, h: 0.5 },
            },
          },
        ],
        annotations: [],
        globalStyle: LETTERS_OFF,
      };
      drawFigure(ctx, fig, new Map([["f", bitmap]]));
      // Source rect: x = 0.5*200 = 100, y = 0.25*100 = 25, w = 50, h = 50.
      const drew = ctx.calls.find((c) => c.op === "drawImage");
      expect(drew?.args).toEqual([bitmap, 100, 25, 50, 50, 0, 0, 50, 50]);
    });
  });
});

// ---------------------------------------------------------------------------
// drawAnnotations: letter, text, box, symbol, scalebar.
// ---------------------------------------------------------------------------

describe("drawAnnotations", () => {
  // Single panel at (10, 10, 100, 100) so position math is easy to assert.
  const PANEL_RECT = { x: 10, y: 10, w: 100, h: 100 };
  const PANEL_RECTS_BY_ID = new Map([["p1", PANEL_RECT]]);
  const EMPTY_DEPS = {
    panelRectsById: PANEL_RECTS_BY_ID,
    panelsById: new Map(),
    imagesById: new Map(),
    bitmaps: new Map<string, ImageBitmap>(),
  };

  function figWith(
    annotations: Figure["annotations"],
    style = DEFAULT_GLOBAL_STYLE,
  ): Figure {
    return {
      canvas: { widthPx: 200, heightPx: 200, background: "#FFF" },
      grid: { rows: 1, cols: 1, gutterPx: 10, gutterColor: "#FFF" },
      panels: [
        {
          panelId: "p1",
          row: 0,
          col: 0,
          kind: "placeholder",
          label: "(empty)",
        },
      ],
      annotations,
      globalStyle: style,
    };
  }

  it("performs no fillText calls when globalStyle.letters.enabled is false", () => {
    const ctx = makeRecorder();
    const fig = figWith(
      [{ id: "letter:p1", kind: "letter", panelId: "p1", z: 0, text: "A" }],
      {
        ...DEFAULT_GLOBAL_STYLE,
        letters: { ...DEFAULT_GLOBAL_STYLE.letters, enabled: false },
      },
    );
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    expect(ctx.calls.some((c) => c.op === "fillText")).toBe(false);
  });

  it("renders the override text in place of the auto cellLabel", () => {
    // The figure-derivations layer is what resolves overrides; here we just
    // assert that whatever letter text comes through is the text drawn.
    const ctx = makeRecorder();
    const fig = figWith([
      { id: "letter:p1", kind: "letter", panelId: "p1", z: 0, text: "A1" },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const ft = ctx.calls.find((c) => c.op === "fillText");
    expect(ft?.args[0]).toBe("A1");
  });

  it("paints a tl-corner letter at (panel.x + padding, panel.y + padding + sizePx)", () => {
    const ctx = makeRecorder();
    const style = {
      ...DEFAULT_GLOBAL_STYLE,
      letters: {
        ...DEFAULT_GLOBAL_STYLE.letters,
        corner: "tl" as const,
        paddingPx: 6,
        sizePt: 12,
      },
    };
    const fig = figWith(
      [{ id: "letter:p1", kind: "letter", panelId: "p1", z: 0, text: "A" }],
      style,
    );
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const ft = ctx.calls.find((c) => c.op === "fillText");
    // alphabetic baseline → y is the baseline; visible top sits at y - sizePx.
    // Expected baseline y = panel.y + padding + sizePx = 10 + 6 + 12 = 28.
    expect(ft?.args).toEqual(["A", 16, 28]);
  });

  it("draws a box with both stroke and fill (one strokeRect + one fillRect)", () => {
    const ctx = makeRecorder();
    const fig = figWith([
      {
        id: "b1",
        kind: "box",
        z: 1,
        x: 20,
        y: 30,
        w: 40,
        h: 50,
        stroke: "#FF0000",
        strokeWidthPx: 2,
        fill: "#0000FF",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const fills = ctx.calls.filter((c) => c.op === "fillRect");
    const strokes = ctx.calls.filter((c) => c.op === "strokeRect");
    expect(fills).toHaveLength(1);
    expect(strokes).toHaveLength(1);
    expect(fills[0]?.args).toEqual([20, 30, 40, 50]);
    expect(strokes[0]?.args).toEqual([20, 30, 40, 50]);
    // Fill color was set before fillRect, stroke color before strokeRect.
    expect(fills[0]?.fillStyle).toBe("#0000FF");
    expect(strokes[0]?.strokeStyle).toBe("#FF0000");
    expect(strokes[0]?.lineWidth).toBe(2);
    // Order: fill must be painted before stroke so the stroke sits on top.
    const fillIdx = ctx.calls.findIndex((c) => c.op === "fillRect");
    const strokeIdx = ctx.calls.findIndex((c) => c.op === "strokeRect");
    expect(fillIdx).toBeLessThan(strokeIdx);
  });

  it("box with stroke only (no fill) emits exactly one strokeRect and zero fillRect", () => {
    const ctx = makeRecorder();
    const fig = figWith([
      {
        id: "b2",
        kind: "box",
        z: 1,
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        stroke: "#000",
        strokeWidthPx: 1,
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    expect(ctx.calls.filter((c) => c.op === "fillRect")).toHaveLength(0);
    expect(ctx.calls.filter((c) => c.op === "strokeRect")).toHaveLength(1);
  });

  it("text without bgColor emits no fillRect (background) and one fillText", () => {
    const ctx = makeRecorder();
    const fig = figWith([
      {
        id: "t1",
        kind: "text",
        z: 2,
        x: 50,
        y: 60,
        text: "Hello",
        font: "Arial",
        sizePt: 14,
        bold: false,
        italic: false,
        color: "#222",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    expect(ctx.calls.filter((c) => c.op === "fillRect")).toHaveLength(0);
    const ft = ctx.calls.filter((c) => c.op === "fillText");
    expect(ft).toHaveLength(1);
    expect(ft[0]?.args).toEqual(["Hello", 50, 60]);
    expect(ft[0]?.fillStyle).toBe("#222");
  });

  it("text with bgColor emits one fillRect (background) at least covering the text bounds before the fillText", () => {
    const ctx = makeRecorder();
    const text = "Hi";
    const sizePt = 14;
    const fig = figWith([
      {
        id: "t2",
        kind: "text",
        z: 2,
        x: 50,
        y: 60,
        text,
        font: "Arial",
        sizePt,
        bold: false,
        italic: false,
        color: "#222",
        bgColor: "#FFEEAA",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const fills = ctx.calls.filter((c) => c.op === "fillRect");
    const fillTexts = ctx.calls.filter((c) => c.op === "fillText");
    expect(fills).toHaveLength(1);
    expect(fillTexts).toHaveLength(1);
    // Background color was active when the rect was painted.
    expect(fills[0]?.fillStyle).toBe("#FFEEAA");
    // Background must be at least as wide/tall as the text bounds.
    const expectedTextWidth = text.length * sizePt * 0.6; // see recorder stub
    const [bx, by, bw, bh] = fills[0]?.args as [number, number, number, number];
    expect(bw).toBeGreaterThanOrEqual(expectedTextWidth);
    expect(bh).toBeGreaterThanOrEqual(sizePt);
    // And it must enclose the text origin (50, 60).
    expect(bx).toBeLessThanOrEqual(50);
    expect(by).toBeLessThanOrEqual(60);
    expect(bx + bw).toBeGreaterThanOrEqual(50 + expectedTextWidth);
    expect(by + bh).toBeGreaterThanOrEqual(60 + sizePt);
    // Order: background fillRect then fillText.
    const fillRectIdx = ctx.calls.findIndex((c) => c.op === "fillRect");
    const fillTextIdx = ctx.calls.findIndex((c) => c.op === "fillText");
    expect(fillRectIdx).toBeLessThan(fillTextIdx);
  });

  it("skips an orphaned letter whose panelId no longer resolves", () => {
    const ctx = makeRecorder();
    const fig = figWith([
      // panelId references a panel that doesn't exist in PANEL_RECTS_BY_ID.
      { id: "letter:gone", kind: "letter", panelId: "gone", z: 0, text: "Z" },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    expect(ctx.calls.some((c) => c.op === "fillText")).toBe(false);
  });

  it("drawAnnotations skips text annotations whose panelId does not resolve", () => {
    const ctx = makeRecorder();
    const fig = figWith([
      {
        id: "t-orphan",
        kind: "text",
        panelId: "nonexistent",
        z: 0,
        x: 50,
        y: 60,
        text: "ghost",
        font: "Arial",
        sizePt: 14,
        bold: false,
        italic: false,
        color: "#222",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    expect(ctx.calls.some((c) => c.op === "fillText")).toBe(false);
  });

  it("drawAnnotations skips box annotations whose panelId does not resolve", () => {
    const ctx = makeRecorder();
    const fig = figWith([
      {
        id: "b-orphan",
        kind: "box",
        panelId: "nonexistent",
        z: 0,
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        stroke: "#000",
        strokeWidthPx: 1,
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    expect(ctx.calls.some((c) => c.op === "strokeRect")).toBe(false);
    expect(ctx.calls.some((c) => c.op === "fillRect")).toBe(false);
  });

  it("renders letters before user annotations of equal z (array order locks 'letters first')", () => {
    // figure-derivations always puts letters BEFORE user annotations in the
    // resolved array. With both at z=0, the stable sort preserves array
    // order, so the letter's fillText must precede the box's strokeRect.
    const ctx = makeRecorder();
    const fig = figWith([
      { id: "letter:p1", kind: "letter", panelId: "p1", z: 0, text: "A" },
      {
        id: "user-box",
        kind: "box",
        z: 0,
        x: 20,
        y: 30,
        w: 40,
        h: 50,
        stroke: "#FF0000",
        strokeWidthPx: 2,
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const letterIdx = ctx.calls.findIndex((c) => c.op === "fillText");
    const boxIdx = ctx.calls.findIndex((c) => c.op === "strokeRect");
    expect(letterIdx).toBeGreaterThanOrEqual(0);
    expect(boxIdx).toBeGreaterThanOrEqual(0);
    expect(letterIdx).toBeLessThan(boxIdx);
  });

  it("renders a tr-corner letter offset by measureText width", () => {
    const ctx = makeRecorder();
    const style = {
      ...DEFAULT_GLOBAL_STYLE,
      letters: {
        ...DEFAULT_GLOBAL_STYLE.letters,
        corner: "tr" as const,
        paddingPx: 6,
        sizePt: 12,
      },
    };
    const fig = figWith(
      [{ id: "letter:p1", kind: "letter", panelId: "p1", z: 0, text: "A" }],
      style,
    );
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const ft = ctx.calls.find((c) => c.op === "fillText");
    // panel right = 10 + 100 = 110. textWidth = 1 char * 12 * 0.6 = 7.2.
    // x = 110 - 6 - 7.2 = 96.8. y baseline = 10 + 6 + 12 = 28.
    expect(ft?.args).toEqual(["A", 96.8, 28]);
  });

  // -------------------------------------------------------------------------
  // M6 Task 6: scale bar. Symbol render assertions live in draw-symbol.test.ts.
  // -------------------------------------------------------------------------

  describe("scale bar", () => {
    // 100×100 image with 6.45 src-px/µm calibration. Panel rect 100×100 at
    // origin so the math is easy: at zoom=1 + Contain, S=1 → 50 µm = 322.5 px.

    function scaleBarFig(opts: {
      transform?: PanelTransform;
      style?: typeof DEFAULT_GLOBAL_STYLE;
      cornerOverride?: "tl" | "tr" | "bl" | "br";
      lengthValue?: number;
    }): Figure {
      const transform = opts.transform ?? DEFAULT_TRANSFORM;
      const style = opts.style ?? DEFAULT_GLOBAL_STYLE;
      return {
        canvas: { widthPx: 100, heightPx: 100, background: "#000" },
        grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#000" },
        panels: [
          {
            panelId: "p1",
            row: 0,
            col: 0,
            kind: "image",
            imageId: "img-cal",
            transform,
          },
        ],
        annotations: [
          {
            id: "sb1",
            kind: "scalebar",
            panelId: "p1",
            z: 1,
            lengthValue: opts.lengthValue ?? 50,
            lengthUnit: "um",
            ...(opts.cornerOverride !== undefined
              ? { cornerOverride: opts.cornerOverride }
              : {}),
            // figure-derivations would normally add this; we mimic it here.
            resolvedPanelId: "p1",
          } as Figure["annotations"][number],
        ],
        globalStyle: style,
      };
    }

    function calibratedPool(): Map<
      string,
      import("../../src/renderer/model/pool").ImagePoolItem
    > {
      const item: import("../../src/renderer/model/pool").ImagePoolItem = {
        id: "img-cal",
        filename: "x.tif",
        filePath: "/tmp/x.tif",
        mime: "image/tiff",
        width: 100,
        height: 100,
        bitDepth: 8,
        calibration: { unit: "um", pixelsPerUnit: 6.45, source: "manual" },
      };
      return new Map([[item.id, item]]);
    }

    function uncalibratedPool(): Map<
      string,
      import("../../src/renderer/model/pool").ImagePoolItem
    > {
      const item: import("../../src/renderer/model/pool").ImagePoolItem = {
        id: "img-cal",
        filename: "x.tif",
        filePath: "/tmp/x.tif",
        mime: "image/tiff",
        width: 100,
        height: 100,
        bitDepth: 8,
      };
      return new Map([[item.id, item]]);
    }

    it("br corner with padding=10 ends at (panelW - 10, panelH - 10)", () => {
      const ctx = makeRecorder();
      const bitmap = { width: 100, height: 100 } as unknown as ImageBitmap;
      const style = {
        ...DEFAULT_GLOBAL_STYLE,
        scalebar: {
          ...DEFAULT_GLOBAL_STYLE.scalebar,
          corner: "br" as const,
          paddingPx: 10,
        },
      };
      const fig = scaleBarFig({ style });
      drawFigure(ctx, fig, new Map([["img-cal", bitmap]]), calibratedPool());
      // The bar's fillRect: x + w should equal panelW - padding = 90;
      // y + h should equal panelH - padding = 90.
      const barFills = ctx.calls.filter(
        (c) => c.op === "fillRect" && c.fillStyle === style.scalebar.barColor,
      );
      expect(barFills.length).toBeGreaterThanOrEqual(1);
      const last = barFills[barFills.length - 1];
      const [x, y, w, h] = last?.args as [number, number, number, number];
      expect(x + w).toBeCloseTo(90, 6);
      expect(y + h).toBeCloseTo(90, 6);
    });

    it("doubling panel zoom doubles the bar's pixel length", () => {
      const bitmap = { width: 100, height: 100 } as unknown as ImageBitmap;
      const style = {
        ...DEFAULT_GLOBAL_STYLE,
        scalebar: {
          ...DEFAULT_GLOBAL_STYLE.scalebar,
          corner: "tl" as const,
          paddingPx: 0,
          showLabel: false,
        },
      };

      const ctx1 = makeRecorder();
      drawFigure(
        ctx1,
        scaleBarFig({ style, transform: { ...DEFAULT_TRANSFORM, zoom: 1 } }),
        new Map([["img-cal", bitmap]]),
        calibratedPool(),
      );
      const ctx2 = makeRecorder();
      drawFigure(
        ctx2,
        scaleBarFig({ style, transform: { ...DEFAULT_TRANSFORM, zoom: 2 } }),
        new Map([["img-cal", bitmap]]),
        calibratedPool(),
      );

      const barFill1 = ctx1.calls
        .filter(
          (c) => c.op === "fillRect" && c.fillStyle === style.scalebar.barColor,
        )
        .pop();
      const barFill2 = ctx2.calls
        .filter(
          (c) => c.op === "fillRect" && c.fillStyle === style.scalebar.barColor,
        )
        .pop();
      const w1 = (barFill1?.args as number[])[2] ?? 0;
      const w2 = (barFill2?.args as number[])[2] ?? 0;
      expect(w1).toBeGreaterThan(0);
      expect(w2).toBeCloseTo(w1 * 2, 6);
    });

    it("scale bar on a panel with no calibration draws nothing (no bar fillRect)", () => {
      const ctx = makeRecorder();
      const bitmap = { width: 100, height: 100 } as unknown as ImageBitmap;
      const style = {
        ...DEFAULT_GLOBAL_STYLE,
        scalebar: {
          ...DEFAULT_GLOBAL_STYLE.scalebar,
          // Use a unique color so we can pick out the bar's fillRect from
          // the canvas/gutter background fills.
          barColor: "#ABCDEF",
          showLabel: false,
        },
      };
      const fig = scaleBarFig({ style });
      drawFigure(ctx, fig, new Map([["img-cal", bitmap]]), uncalibratedPool());
      const barFills = ctx.calls.filter(
        (c) => c.op === "fillRect" && c.fillStyle === "#ABCDEF",
      );
      expect(barFills).toHaveLength(0);
      // And no label fillText for the scale bar should appear either.
      const labels = ctx.calls.filter((c) => c.op === "fillText");
      expect(labels).toHaveLength(0);
    });

    it("showLabel = false skips the fillText call for the unit label", () => {
      const ctx = makeRecorder();
      const bitmap = { width: 100, height: 100 } as unknown as ImageBitmap;
      const style = {
        ...DEFAULT_GLOBAL_STYLE,
        letters: { ...DEFAULT_GLOBAL_STYLE.letters, enabled: false },
        scalebar: { ...DEFAULT_GLOBAL_STYLE.scalebar, showLabel: false },
      };
      const fig = scaleBarFig({ style });
      drawFigure(ctx, fig, new Map([["img-cal", bitmap]]), calibratedPool());
      // Bar fillRect must exist; label fillText must not.
      const barFills = ctx.calls.filter(
        (c) => c.op === "fillRect" && c.fillStyle === style.scalebar.barColor,
      );
      expect(barFills.length).toBeGreaterThanOrEqual(1);
      const labels = ctx.calls.filter((c) => c.op === "fillText");
      expect(labels).toHaveLength(0);
    });

    it("showLabel = true renders the unit label with the µm glyph (br corner: label above the bar)", () => {
      const ctx = makeRecorder();
      const bitmap = { width: 100, height: 100 } as unknown as ImageBitmap;
      const style = {
        ...DEFAULT_GLOBAL_STYLE,
        letters: { ...DEFAULT_GLOBAL_STYLE.letters, enabled: false },
        scalebar: { ...DEFAULT_GLOBAL_STYLE.scalebar, showLabel: true },
      };
      const fig = scaleBarFig({ style, lengthValue: 50 });
      drawFigure(ctx, fig, new Map([["img-cal", bitmap]]), calibratedPool());
      const labels = ctx.calls.filter((c) => c.op === "fillText");
      expect(labels).toHaveLength(1);
      expect(labels[0]?.args[0]).toBe("50 µm");
      // Default scalebar corner is "br" with paddingPx=8, thicknessPx=4.
      // Panel rect = canvas (0,0,100,100); bar rect.y = 100 - 8 - 4 = 88.
      // For bottom corners the label sits ABOVE the bar at rect.y - 2 = 86.
      expect(labels[0]?.args[2]).toBeCloseTo(86, 6);
    });

    it("showLabel = true with corner='tl' draws the label BELOW the bar (inside the panel)", () => {
      // For top-anchored bars the label flips to the opposite side of the bar
      // so it stays inside the panel rather than spilling into the gutter.
      const ctx = makeRecorder();
      const bitmap = { width: 100, height: 100 } as unknown as ImageBitmap;
      const style = {
        ...DEFAULT_GLOBAL_STYLE,
        letters: { ...DEFAULT_GLOBAL_STYLE.letters, enabled: false },
        scalebar: {
          ...DEFAULT_GLOBAL_STYLE.scalebar,
          corner: "tl" as const,
          showLabel: true,
        },
      };
      const fig = scaleBarFig({ style, lengthValue: 50 });
      drawFigure(ctx, fig, new Map([["img-cal", bitmap]]), calibratedPool());
      const labels = ctx.calls.filter((c) => c.op === "fillText");
      expect(labels).toHaveLength(1);
      expect(labels[0]?.args[0]).toBe("50 µm");
      // tl corner with paddingPx=8, thicknessPx=4 → bar rect.y = 8, rect.h = 4.
      // sizePx = sizePt = 10 (M6: 1pt = 1px). Alphabetic baseline →
      // labelY = rect.y + rect.h + 2 + sizePx = 8 + 4 + 2 + 10 = 24.
      const expectedY =
        8 + style.scalebar.thicknessPx + 2 + style.scalebar.sizePt;
      expect(labels[0]?.args[2]).toBeCloseTo(expectedY, 6);
    });
  });

  it("draws annotations sorted by z (lower z drawn first) without mutating the figure list", () => {
    const ctx = makeRecorder();
    const original: Figure["annotations"] = [
      {
        id: "high",
        kind: "box",
        z: 5,
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        stroke: "#A",
        strokeWidthPx: 1,
      },
      {
        id: "low",
        kind: "box",
        z: 1,
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        stroke: "#B",
        strokeWidthPx: 1,
      },
    ];
    const orderBefore = original.map((a) => a.id);
    const fig = figWith(original);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const strokeColors = ctx.calls
      .filter((c) => c.op === "strokeRect")
      .map((c) => c.strokeStyle);
    // low (z=1, stroke "#B") should paint before high (z=5, stroke "#A").
    expect(strokeColors).toEqual(["#B", "#A"]);
    // Original array order untouched.
    expect(original.map((a) => a.id)).toEqual(orderBefore);
  });
});
