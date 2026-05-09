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
        label: "(empty)",
      },
    ],
    annotations,
    globalStyle: DEFAULT_GLOBAL_STYLE,
  };
}

describe("drawSymbol", () => {
  it("filled symbol records save → translate → rotate → scale → translate(-50,-50) → fill(path) → restore", () => {
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
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);

    // Locate the symbol's draw envelope: save … restore.
    const ops = ctx.calls.map((c) => c.op);
    const saveIdx = ops.indexOf("save");
    const restoreIdx = ops.indexOf("restore");
    expect(saveIdx).toBeGreaterThanOrEqual(0);
    expect(restoreIdx).toBeGreaterThan(saveIdx);

    const seq = ctx.calls.slice(saveIdx, restoreIdx + 1);
    expect(seq.map((c) => c.op)).toEqual([
      "save",
      "translate",
      "rotate",
      "scale",
      "translate",
      "fill",
      "restore",
    ]);

    // Argument shape: scale = sizePx/100 = 0.6.
    expect(seq[1]?.args).toEqual([100, 80]);
    expect(seq[2]?.args).toEqual([0]);
    expect(seq[3]?.args).toEqual([0.6, 0.6]);
    expect(seq[4]?.args).toEqual([-50, -50]);

    // fill() received the Path2D built from the library entry's pathD,
    // and fillStyle was set to the annotation color before the call.
    const fillCall = seq[5];
    expect(fillCall?.fillStyle).toBe("#FF0000");
    const path = fillCall?.args[0] as { d: string };
    const def = SYMBOL_LIBRARY_BY_ID.get("arrow-filled-right");
    expect(def).toBeDefined();
    expect(path.d).toBe(def?.pathD);
  });

  it("stroke-only symbol sets lineWidth = strokeWidthPx / scale and calls stroke(path)", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "arrow-open-right",
        x: 50,
        y: 50,
        sizePx: 50,
        rotationDeg: 0,
        color: "#00AA00",
        strokeWidthPx: 4,
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);

    const strokeCall = ctx.calls.find((c) => c.op === "stroke");
    expect(strokeCall).toBeDefined();
    // scale = 50/100 = 0.5; expected lineWidth = 4 / 0.5 = 8.
    expect(strokeCall?.lineWidth).toBe(8);
    expect(strokeCall?.strokeStyle).toBe("#00AA00");

    const path = strokeCall?.args[0] as { d: string };
    const def = SYMBOL_LIBRARY_BY_ID.get("arrow-open-right");
    expect(def).toBeDefined();
    expect(path.d).toBe(def?.pathD);

    // No fill() should be emitted for a stroke-only symbol.
    expect(ctx.calls.some((c) => c.op === "fill")).toBe(false);
  });

  it("unknown symbolId emits no fill or stroke and no save/restore", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "no-such-symbol",
        x: 100,
        y: 100,
        sizePx: 40,
        rotationDeg: 0,
        color: "#000",
        strokeWidthPx: 1,
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);

    expect(ctx.calls.some((c) => c.op === "fill")).toBe(false);
    expect(ctx.calls.some((c) => c.op === "stroke")).toBe(false);
    expect(ctx.calls.some((c) => c.op === "save")).toBe(false);
    expect(ctx.calls.some((c) => c.op === "restore")).toBe(false);
  });

  it("sizePx = 0 emits no save/restore/fill/stroke (avoids Infinity lineWidth)", () => {
    const ctx = makeRecorder();
    const fig = figWithSymbol([
      {
        id: "s1",
        kind: "symbol",
        z: 0,
        symbolId: "arrow-open-right",
        x: 100,
        y: 100,
        sizePx: 0,
        rotationDeg: 0,
        color: "#000",
        strokeWidthPx: 2,
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);

    expect(ctx.calls.some((c) => c.op === "fill")).toBe(false);
    expect(ctx.calls.some((c) => c.op === "stroke")).toBe(false);
    expect(ctx.calls.some((c) => c.op === "save")).toBe(false);
    expect(ctx.calls.some((c) => c.op === "restore")).toBe(false);
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
      },
    ]);
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    const rot = ctx.calls.find((c) => c.op === "rotate");
    expect(rot).toBeDefined();
    expect(rot?.args[0] as number).toBeCloseTo(Math.PI / 2, 10);
  });
});
