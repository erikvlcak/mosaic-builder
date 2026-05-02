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
});
