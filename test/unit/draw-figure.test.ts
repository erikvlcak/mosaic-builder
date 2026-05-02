import { describe, it, expect } from "vitest";
import { drawFigure, type DrawCtx } from "../../src/renderer/render/draw-figure";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_TRANSFORM } from "../../src/renderer/model/panels";

interface Call {
  op: string;
  args: unknown[];
}
function makeRecorder(): DrawCtx & { calls: Call[] } {
  const calls: Call[] = [];
  const rec =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
    };
  return {
    calls,
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "left" as CanvasTextAlign,
    textBaseline: "top" as CanvasTextBaseline,
    fillRect: rec("fillRect") as DrawCtx["fillRect"],
    strokeRect: rec("strokeRect") as DrawCtx["strokeRect"],
    fillText: rec("fillText") as DrawCtx["fillText"],
    drawImage: rec("drawImage") as DrawCtx["drawImage"],
    save: rec("save") as DrawCtx["save"],
    restore: rec("restore") as DrawCtx["restore"],
    beginPath: rec("beginPath") as DrawCtx["beginPath"],
    rect: rec("rect") as DrawCtx["rect"],
    clip: rec("clip") as DrawCtx["clip"],
    translate: rec("translate") as DrawCtx["translate"],
    scale: rec("scale") as DrawCtx["scale"],
    rotate: rec("rotate") as DrawCtx["rotate"],
  };
}

const FIG: Figure = {
  canvas: { widthPx: 200, heightPx: 200, background: "#FAFAFA" },
  grid: { rows: 2, cols: 2, gutterPx: 10, gutterColor: "#FAFAFA" },
  panels: [
    { row: 0, col: 0, kind: "image", imageId: "sample", transform: DEFAULT_TRANSFORM },
    { row: 0, col: 1, kind: "placeholder", label: "B" },
    { row: 1, col: 0, kind: "placeholder", label: "C" },
    { row: 1, col: 1, kind: "placeholder", label: "D" },
  ],
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
      fillRect(x, y, w, h) {
        fills.push({ fillStyle: String(this.fillStyle), args: [x, y, w, h] });
      },
      strokeRect() {},
      fillText() {},
      drawImage() {},
      save() {},
      restore() {},
      beginPath() {},
      rect() {},
      clip() {},
      translate() {},
      scale() {},
      rotate() {},
    };
    const fig: Figure = {
      canvas: { widthPx: 100, heightPx: 100, background: "#FAFAFA" },
      grid: { rows: 1, cols: 1, gutterPx: 10, gutterColor: "#3A7BD5" },
      panels: [{ row: 0, col: 0, kind: "placeholder", label: "A" }],
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
      // drawImage at (0,0) with the bitmap's native dims.
      const drew = ctx.calls.find((c) => c.op === "drawImage");
      expect(drew?.args).toEqual([bitmap, 0, 0, 100, 100]);
    });

    it("Cover fit applies max() scale instead of min()", () => {
      const ctx = makeRecorder();
      const wideBitmap = { width: 200, height: 100 } as unknown as ImageBitmap;
      const fig: Figure = {
        canvas: { widthPx: 100, heightPx: 100, background: "#FFF" },
        grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
        panels: [
          {
            row: 0,
            col: 0,
            kind: "image",
            imageId: "w",
            transform: { ...DEFAULT_TRANSFORM, fit: "cover" },
          },
        ],
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
            row: 0,
            col: 0,
            kind: "image",
            imageId: "s",
            transform: { ...DEFAULT_TRANSFORM, fit: "stretch" },
          },
        ],
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
            row: 0,
            col: 0,
            kind: "image",
            imageId: "r",
            transform: { ...DEFAULT_TRANSFORM, rotation: 90 },
          },
        ],
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
            row: 0,
            col: 0,
            kind: "image",
            imageId: "f",
            transform: { ...DEFAULT_TRANSFORM, flipH: true },
          },
        ],
      };
      drawFigure(ctx, fig, new Map([["f", bitmap]]));
      const scales = ctx.calls.filter((c) => c.op === "scale");
      // First scale = baseScale (1,1); second = flip (-1, 1)
      expect(scales[1]?.args).toEqual([-1, 1]);
    });
  });
});
