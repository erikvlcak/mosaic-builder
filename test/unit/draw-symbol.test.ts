// Path2D is a renderer-process global (CanvasRenderingContext2D's path arg).
// Vitest's node env doesn't ship it, and jsdom doesn't either; we stub it
// with a minimal capturing class so the recorder can verify drawSymbol
// passes the library's pathD string through verbatim. Production code keeps
// calling `new Path2D(pathD)` and gets the real DOM class in Electron.
class FakePath2D {
  constructor(public d: string) {}
}
if (typeof (globalThis as { Path2D?: unknown }).Path2D === "undefined") {
  (globalThis as unknown as { Path2D: typeof FakePath2D }).Path2D = FakePath2D;
}

import { describe, it, expect } from "vitest";
import {
  drawAnnotations,
  type AnnotationDrawDeps,
} from "../../src/renderer/render/draw-annotations";
import { type DrawCtx } from "../../src/renderer/render/draw-figure";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import { SYMBOL_LIBRARY_BY_ID } from "../../src/renderer/symbols/library";

interface Call {
  op: string;
  args: unknown[];
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
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
      return { width: text.length * 8 };
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
    setLineDash(segments: number[]) {
      calls.push(snapshot("setLineDash", [segments.slice()]));
    },
  };
  function snapshot(op: string, args: unknown[]): Call {
    return {
      op,
      args,
      fillStyle: String(ctx.fillStyle),
      strokeStyle: String(ctx.strokeStyle),
      lineWidth: ctx.lineWidth,
    };
  }
  return ctx;
}

const EMPTY_DEPS: AnnotationDrawDeps = {
  panelRectsById: new Map(),
  panelsById: new Map(),
  imagesById: new Map(),
  bitmaps: new Map(),
};

function figWithSymbol(annotations: Figure["annotations"]): Figure {
  return {
    canvas: { widthPx: 200, heightPx: 200, background: "#FFF" },
    grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
    panels: [
      {
        panelId: "p1",
        row: 0,
        col: 0,
        kind: "placeholder",
        label: "",
      },
    ],
    annotations,
    globalStyle: DEFAULT_GLOBAL_STYLE,
  };
}

describe("drawSymbol", () => {
  it("filled symbol fills the path and never strokes", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "shape-circle",
        x: 100,
        y: 100,
        sizePx: 50,
        rotationDeg: 0,
        color: "#112233",
        strokeWidthPx: 4,
        fillMode: "filled",
        strokeStyle: "dashed",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    expect(ctx.calls.some((c) => c.op === "fill")).toBe(true);
    expect(ctx.calls.some((c) => c.op === "stroke")).toBe(false);
  });

  it("outlined symbol strokes the path and never fills", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "shape-circle",
        x: 100,
        y: 100,
        sizePx: 50,
        rotationDeg: 0,
        color: "#112233",
        strokeWidthPx: 4,
        fillMode: "outlined",
        strokeStyle: "solid",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    expect(ctx.calls.some((c) => c.op === "stroke")).toBe(true);
    expect(ctx.calls.some((c) => c.op === "fill")).toBe(false);
  });

  it("stroke-only geometry forces outlined rendering even when fillMode=filled", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "arrow-line-right",
        x: 100,
        y: 100,
        sizePx: 50,
        rotationDeg: 0,
        color: "#112233",
        strokeWidthPx: 4,
        fillMode: "filled",
        strokeStyle: "solid",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    expect(ctx.calls.some((c) => c.op === "stroke")).toBe(true);
    expect(ctx.calls.some((c) => c.op === "fill")).toBe(false);
  });

  it("solid stroke calls setLineDash([]) and resets after stroking", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "shape-circle",
        x: 100,
        y: 100,
        sizePx: 50,
        rotationDeg: 0,
        color: "#112233",
        strokeWidthPx: 4,
        fillMode: "outlined",
        strokeStyle: "solid",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const dashCalls = ctx.calls.filter((c) => c.op === "setLineDash");
    expect(dashCalls.length).toBeGreaterThanOrEqual(2);
    expect(dashCalls[dashCalls.length - 1]?.args[0]).toEqual([]);
  });

  it("dashed stroke uses a 2-element dash pattern proportional to strokeWidthPx", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "shape-circle",
        x: 100,
        y: 100,
        sizePx: 100,
        rotationDeg: 0,
        color: "#112233",
        strokeWidthPx: 2,
        fillMode: "outlined",
        strokeStyle: "dashed",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const dashCalls = ctx.calls.filter((c) => c.op === "setLineDash");
    const setCall = dashCalls[0];
    const pattern = setCall?.args[0] as number[];
    expect(pattern).toHaveLength(2);
    expect(pattern[0]).toBeGreaterThan(0);
    expect(pattern[1]).toBeGreaterThan(0);
    expect(pattern[0]).toBeCloseTo(16);
    expect(pattern[1]).toBeCloseTo(8);
    expect(dashCalls[dashCalls.length - 1]?.args[0]).toEqual([]);
  });

  it("dotted stroke uses a tighter 2-element dash pattern", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "shape-circle",
        x: 100,
        y: 100,
        sizePx: 100,
        rotationDeg: 0,
        color: "#112233",
        strokeWidthPx: 2,
        fillMode: "outlined",
        strokeStyle: "dotted",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const dashCalls = ctx.calls.filter((c) => c.op === "setLineDash");
    const pattern = dashCalls[0]?.args[0] as number[];
    expect(pattern[0]).toBeCloseTo(3);
    expect(pattern[1]).toBeCloseTo(6);
  });

  it("dash pattern divides by scale so on-screen spacing is constant", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "shape-circle",
        x: 100,
        y: 100,
        sizePx: 200,
        rotationDeg: 0,
        color: "#112233",
        strokeWidthPx: 2,
        fillMode: "outlined",
        strokeStyle: "dashed",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const dashCalls = ctx.calls.filter((c) => c.op === "setLineDash");
    const pattern = dashCalls[0]?.args[0] as number[];
    expect(pattern[0]).toBeCloseTo(8);
    expect(pattern[1]).toBeCloseTo(4);
  });

  it("filled symbol pulls the right path through fill()", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "arrow-filled-right",
        x: 100,
        y: 80,
        sizePx: 60,
        rotationDeg: 0,
        color: "#FF0000",
        strokeWidthPx: 2,
        fillMode: "filled",
        strokeStyle: "solid",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const fillCall = ctx.calls.find((c) => c.op === "fill");
    expect(fillCall?.fillStyle).toBe("#FF0000");
    const path = fillCall?.args[0] as { d: string };
    const def = SYMBOL_LIBRARY_BY_ID.get("arrow-filled-right");
    expect(path.d).toBe(def?.pathD);
  });

  it("rotationDeg is converted to radians (90° → π/2)", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "arrow-filled-right",
        x: 0,
        y: 0,
        sizePx: 100,
        rotationDeg: 90,
        color: "#000",
        strokeWidthPx: 1,
        fillMode: "filled",
        strokeStyle: "solid",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const rot = ctx.calls.find((c) => c.op === "rotate");
    expect(rot).toBeDefined();
    expect(rot?.args[0] as number).toBeCloseTo(Math.PI / 2, 10);
  });

  it("unknown symbolId emits no save/restore/fill/stroke", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "ghost",
        x: 100,
        y: 100,
        sizePx: 50,
        rotationDeg: 0,
        color: "#112233",
        strokeWidthPx: 2,
        fillMode: "filled",
        strokeStyle: "solid",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    expect(ctx.calls).toHaveLength(0);
  });

  it("sizePx = 0 is a no-op", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "shape-circle",
        x: 100,
        y: 100,
        sizePx: 0,
        rotationDeg: 0,
        color: "#112233",
        strokeWidthPx: 2,
        fillMode: "filled",
        strokeStyle: "solid",
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    expect(ctx.calls).toHaveLength(0);
  });
});
