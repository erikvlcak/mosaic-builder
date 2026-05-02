import { describe, it, expect } from "vitest";
import { drawFigure, type DrawCtx } from "../../src/renderer/render/draw-figure";
import type { Figure } from "../../src/renderer/model/types";

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
  };
}

const FIG: Figure = {
  canvas: { widthPx: 200, heightPx: 200, background: "#FAFAFA" },
  grid: { rows: 2, cols: 2, gutterPx: 10, gutterColor: "#FAFAFA" },
  panels: [
    { row: 0, col: 0, kind: "image", imageId: "sample" },
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
});
