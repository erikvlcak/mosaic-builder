import { describe, it, expect } from "vitest";
import { paintFlattenedFigure } from "../../src/renderer/render/export-renderer";
import type { DrawCtx } from "../../src/renderer/render/draw-figure";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";

interface Call {
  op: string;
  args: unknown[];
  fillStyle: string;
}

/**
 * Canvas-free DrawCtx recorder. The export encode path (real OffscreenCanvas)
 * can't run in Node, but the flatten+scale ORCHESTRATION is pure DrawCtx calls
 * and is fully assertable here — this is the 5.2 recorder-based coverage that
 * replaces the always-skipped OffscreenCanvas encode tests for this logic.
 */
function makeRecorder(): DrawCtx & { calls: Call[] } {
  const calls: Call[] = [];
  const ctx = {
    calls,
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "left" as CanvasTextAlign,
    textBaseline: "top" as CanvasTextBaseline,
    lineWidth: 1,
    lineCap: "butt" as CanvasLineCap,
    lineJoin: "miter" as CanvasLineJoin,
    rec(op: string, args: unknown[]) {
      calls.push({ op, args, fillStyle: String(this.fillStyle) });
    },
    fillRect(...args: number[]) {
      this.rec("fillRect", args);
    },
    strokeRect(...args: number[]) {
      this.rec("strokeRect", args);
    },
    fillText(...args: unknown[]) {
      this.rec("fillText", args);
    },
    strokeText(...args: unknown[]) {
      this.rec("strokeText", args);
    },
    measureText() {
      return { width: 10 };
    },
    drawImage: ((...args: unknown[]) => {
      calls.push({ op: "drawImage", args, fillStyle: "" });
    }) as DrawCtx["drawImage"],
    save() {
      this.rec("save", []);
    },
    restore() {
      this.rec("restore", []);
    },
    beginPath() {
      this.rec("beginPath", []);
    },
    closePath() {
      this.rec("closePath", []);
    },
    rect(...args: number[]) {
      this.rec("rect", args);
    },
    moveTo(...args: number[]) {
      this.rec("moveTo", args);
    },
    lineTo(...args: number[]) {
      this.rec("lineTo", args);
    },
    arc(...args: number[]) {
      this.rec("arc", args);
    },
    fill() {
      this.rec("fill", []);
    },
    stroke() {
      this.rec("stroke", []);
    },
    clip() {
      this.rec("clip", []);
    },
    translate(...args: number[]) {
      this.rec("translate", args);
    },
    scale(...args: number[]) {
      this.rec("scale", args);
    },
    rotate(...args: number[]) {
      this.rec("rotate", args);
    },
    setLineDash() {
      this.rec("setLineDash", []);
    },
  };
  return ctx as unknown as DrawCtx & { calls: Call[] };
}

const FIG: Figure = {
  canvas: { widthPx: 16, heightPx: 12, background: "#3366FF80" },
  grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#00000000" },
  panels: [{ row: 0, col: 0, kind: "placeholder", label: "" }],
  annotations: [],
  globalStyle: DEFAULT_GLOBAL_STYLE,
};

describe("paintFlattenedFigure (5.2 export flatten/scale via recorder)", () => {
  it("paints an opaque white base covering the full device rect first", () => {
    const rec = makeRecorder();
    paintFlattenedFigure(rec, FIG, new Map(), 16, 12, 1);
    // The first fillRect is the white base spanning the whole device canvas.
    const firstFill = rec.calls.find((c) => c.op === "fillRect");
    expect(firstFill).toBeDefined();
    expect(firstFill!.args).toEqual([0, 0, 16, 12]);
    expect(firstFill!.fillStyle).toBe("#FFFFFF");
  });

  it("applies the export scale before drawing the figure", () => {
    const rec = makeRecorder();
    paintFlattenedFigure(rec, FIG, new Map(), 32, 24, 2);
    const baseFillIdx = rec.calls.findIndex((c) => c.op === "fillRect");
    const scaleIdx = rec.calls.findIndex((c) => c.op === "scale");
    expect(scaleIdx).toBeGreaterThan(baseFillIdx);
    expect(rec.calls[scaleIdx]!.args).toEqual([2, 2]);
    // The base fill still spans the full device rect (device px, pre-scale).
    expect(rec.calls[baseFillIdx]!.args).toEqual([0, 0, 32, 24]);
  });

  it("emits no scale op at exportScale 1", () => {
    const rec = makeRecorder();
    paintFlattenedFigure(rec, FIG, new Map(), 16, 12, 1);
    expect(rec.calls.some((c) => c.op === "scale")).toBe(false);
  });
});
