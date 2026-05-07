/**
 * Geometry regression tests for `drawArrow`. These lock in the fixes for
 * the "thick arrow looks distorted" bug:
 *
 *   1. `lineCap` is set to "butt" before stroking the shaft (a "round"
 *      cap on a thick line bulges past the tip).
 *   2. When the arrow has a head, the shaft segment ends *behind* the
 *      tip — so it doesn't double up under the head triangle.
 *   3. With head="none", the shaft still runs all the way to (x2, y2).
 */

import { describe, it, expect } from "vitest";
import { drawAnnotations } from "../../src/renderer/render/draw-annotations";
import type { DrawCtx } from "../../src/renderer/render/draw-figure";
import type { Figure } from "../../src/renderer/model/types";
import type { ArrowAnnotation } from "../../src/renderer/model/annotations";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";

interface Call {
  op: string;
  args: unknown[];
  lineCap: CanvasLineCap;
  lineWidth: number;
}

function recorder(): DrawCtx & { calls: Call[] } {
  const calls: Call[] = [];
  const ctx: DrawCtx & { calls: Call[] } = {
    calls,
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "left",
    textBaseline: "top",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    fillRect() {},
    strokeRect() {},
    fillText() {},
    measureText() {
      return { width: 0 };
    },
    drawImage() {},
    save() {},
    restore() {},
    beginPath() {
      calls.push(snap("beginPath", []));
    },
    closePath() {
      calls.push(snap("closePath", []));
    },
    rect() {},
    clip() {},
    translate() {},
    scale() {},
    rotate() {},
    moveTo(...args) {
      calls.push(snap("moveTo", args));
    },
    lineTo(...args) {
      calls.push(snap("lineTo", args));
    },
    stroke() {
      calls.push(snap("stroke", []));
    },
    fill() {
      calls.push(snap("fill", []));
    },
  };
  function snap(op: string, args: unknown[]): Call {
    return { op, args, lineCap: ctx.lineCap, lineWidth: ctx.lineWidth };
  }
  return ctx;
}

const LETTERS_OFF = {
  ...DEFAULT_GLOBAL_STYLE,
  letters: { ...DEFAULT_GLOBAL_STYLE.letters, enabled: false },
};

function figWithArrow(arrow: ArrowAnnotation): Figure {
  return {
    canvas: { widthPx: 200, heightPx: 200, background: "#FFF" },
    grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
    panels: [],
    annotations: [arrow],
    globalStyle: LETTERS_OFF,
  };
}

const EMPTY_DEPS = {
  panelRectsById: new Map(),
  panelsById: new Map(),
  imagesById: new Map(),
  bitmaps: new Map(),
};

describe("drawArrow geometry", () => {
  it("sets lineCap='butt' before stroking the shaft", () => {
    const ctx = recorder();
    const fig = figWithArrow({
      id: "a",
      kind: "arrow",
      z: 1,
      x1: 10,
      y1: 10,
      x2: 100,
      y2: 10,
      color: "#000",
      thicknessPx: 16,
      head: "filled",
    });
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    // The first stroke() corresponds to the shaft. Inspect the lineCap that
    // was active at that call.
    const firstStroke = ctx.calls.find((c) => c.op === "stroke");
    expect(firstStroke).toBeDefined();
    expect(firstStroke?.lineCap).toBe("butt");
  });

  it("ends the shaft BEFORE the tip when the arrow has a filled head (thick arrow)", () => {
    const ctx = recorder();
    const fig = figWithArrow({
      id: "a",
      kind: "arrow",
      z: 1,
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      color: "#000",
      thicknessPx: 16,
      head: "filled",
    });
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    // The shaft is the FIRST stroke() call; its lineTo should land short of
    // (100, 0). With thickness=16, headLen = max(8, 16*4) = 64, and shaftBack
    // = 64 * 0.85 ≈ 54.4. Shaft endpoint along the +x shaft direction is
    // (100 - 54.4, 0) ≈ (45.6, 0). Anything well below x=100 is acceptable
    // — the contract is "ends before the tip".
    const firstStrokeIdx = ctx.calls.findIndex((c) => c.op === "stroke");
    expect(firstStrokeIdx).toBeGreaterThanOrEqual(0);
    // Inspect the lineTo immediately preceding the stroke.
    let lineToIdx = -1;
    for (let i = firstStrokeIdx - 1; i >= 0; i--) {
      if (ctx.calls[i]?.op === "lineTo") {
        lineToIdx = i;
        break;
      }
    }
    expect(lineToIdx).toBeGreaterThanOrEqual(0);
    const [endX] = ctx.calls[lineToIdx]!.args as [number, number];
    expect(endX).toBeLessThan(100);
    // Sanity: shaft starts at x1=0 (last moveTo before the stroke is (0,0))
    let moveToIdx = -1;
    for (let i = firstStrokeIdx - 1; i >= 0; i--) {
      if (ctx.calls[i]?.op === "moveTo") {
        moveToIdx = i;
        break;
      }
    }
    expect(moveToIdx).toBeGreaterThanOrEqual(0);
    const [startX] = ctx.calls[moveToIdx]!.args as [number, number];
    expect(startX).toBe(0);
  });

  it("ends the shaft BEFORE the tip when the arrow has an open head", () => {
    const ctx = recorder();
    const fig = figWithArrow({
      id: "a",
      kind: "arrow",
      z: 1,
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      color: "#000",
      thicknessPx: 8,
      head: "open",
    });
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    // First stroke = shaft.
    const firstStrokeIdx = ctx.calls.findIndex((c) => c.op === "stroke");
    let lineToIdx = -1;
    for (let i = firstStrokeIdx - 1; i >= 0; i--) {
      if (ctx.calls[i]?.op === "lineTo") {
        lineToIdx = i;
        break;
      }
    }
    const [endX] = ctx.calls[lineToIdx]!.args as [number, number];
    // headLen = max(8, 8*4) = 32; shaftBack for "open" = headLen = 32;
    // shaft ends at (100 - 32, 0) = (68, 0).
    expect(endX).toBeCloseTo(68, 5);
  });

  it("draws shaft all the way to the tip when head='none'", () => {
    const ctx = recorder();
    const fig = figWithArrow({
      id: "a",
      kind: "arrow",
      z: 1,
      x1: 0,
      y1: 0,
      x2: 50,
      y2: 50,
      color: "#000",
      thicknessPx: 4,
      head: "none",
    });
    drawAnnotations(ctx, fig, EMPTY_DEPS);
    // Single stroke; shaft endpoint is exactly the tip.
    const strokes = ctx.calls.filter((c) => c.op === "stroke");
    expect(strokes).toHaveLength(1);
    // Last lineTo before that stroke is the tip.
    const strokeIdx = ctx.calls.findIndex((c) => c.op === "stroke");
    let lineToIdx = -1;
    for (let i = strokeIdx - 1; i >= 0; i--) {
      if (ctx.calls[i]?.op === "lineTo") {
        lineToIdx = i;
        break;
      }
    }
    const args = ctx.calls[lineToIdx]!.args as [number, number];
    expect(args).toEqual([50, 50]);
  });
});
