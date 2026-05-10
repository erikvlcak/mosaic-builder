import { describe, it, expect } from "vitest";
import {
  uniformLayoutFor,
  setTrackWeight,
  rectsFromUniform,
  resizePanelFreeform,
  resizePanelUniform,
  MIN_TRACK_WEIGHT,
  type FreeRect,
} from "../../src/renderer/model/grid-layout";
import type { Panel } from "../../src/renderer/model/panels";

const P = (id: string, row: number, col: number, rs = 1, cs = 1): Panel => ({
  id,
  row,
  col,
  rowSpan: rs,
  colSpan: cs,
});

describe("uniformLayoutFor", () => {
  it("returns equal weights summing to 1", () => {
    const l = uniformLayoutFor(2, 3);
    expect(l.kind).toBe("uniform");
    if (l.kind !== "uniform") throw new Error("unreachable");
    expect(l.colWeights).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(l.rowWeights).toEqual([1 / 2, 1 / 2]);
  });

  it("handles 1x1", () => {
    const l = uniformLayoutFor(1, 1);
    if (l.kind !== "uniform") throw new Error("unreachable");
    expect(l.colWeights).toEqual([1]);
    expect(l.rowWeights).toEqual([1]);
  });
});

describe("setTrackWeight", () => {
  it("transfers mass between adjacent tracks, preserving the pair's sum", () => {
    const next = setTrackWeight([0.5, 0.5], 0, 0.7);
    expect(next).toEqual([0.7, 0.3]);
  });

  it("does not touch tracks outside the dragged pair", () => {
    const next = setTrackWeight([0.25, 0.25, 0.5], 0, 0.4);
    expect(next).toEqual([0.4, 0.1, 0.5]);
  });

  it("clamps to MIN_TRACK_WEIGHT on the lower side", () => {
    const next = setTrackWeight([0.5, 0.5], 0, -1);
    expect(next[0]).toBeCloseTo(MIN_TRACK_WEIGHT, 10);
    expect(next[1]).toBeCloseTo(1 - MIN_TRACK_WEIGHT, 10);
  });

  it("clamps to total - MIN_TRACK_WEIGHT on the upper side", () => {
    const next = setTrackWeight([0.5, 0.5], 0, 99);
    expect(next[0]).toBeCloseTo(1 - MIN_TRACK_WEIGHT, 10);
    expect(next[1]).toBeCloseTo(MIN_TRACK_WEIGHT, 10);
  });

  it("returns a copy (not the input) when index is out of range", () => {
    const input = [0.5, 0.5];
    const next = setTrackWeight(input, 5, 0.3);
    expect(next).toEqual(input);
    expect(next).not.toBe(input);
  });
});

describe("rectsFromUniform", () => {
  it("matches existing computeGridLayout for equal weights with outerGutter on", () => {
    const panels: Panel[] = [
      P("a", 0, 0),
      P("b", 0, 1),
      P("c", 1, 0),
      P("d", 1, 1),
    ];
    const rects = rectsFromUniform({
      widthPx: 800,
      heightPx: 600,
      rows: 2,
      cols: 2,
      gutterPx: 12,
      outerGutter: true,
      colWeights: [0.5, 0.5],
      rowWeights: [0.5, 0.5],
      panels,
    });
    expect(rects.a).toEqual({ x: 12, y: 12, w: 382, h: 282 });
    expect(rects.b).toEqual({ x: 12 + 382 + 12, y: 12, w: 382, h: 282 });
    expect(rects.d!.x + rects.d!.w).toBe(800 - 12);
    expect(rects.d!.y + rects.d!.h).toBe(600 - 12);
  });

  it("respects unequal weights — wider first column shrinks the second", () => {
    const panels: Panel[] = [P("a", 0, 0), P("b", 0, 1)];
    const rects = rectsFromUniform({
      widthPx: 800,
      heightPx: 100,
      rows: 1,
      cols: 2,
      gutterPx: 0,
      outerGutter: false,
      colWeights: [0.75, 0.25],
      rowWeights: [1.0],
      panels,
    });
    expect(rects.a!.x).toBe(0);
    expect(rects.a!.w).toBe(600);
    expect(rects.b!.x).toBe(600);
    expect(rects.b!.x + rects.b!.w).toBe(800);
  });

  it("handles merged panels by summing the weights they span", () => {
    const panels: Panel[] = [
      P("merged", 0, 0, 2, 2),
      P("c", 2, 0),
      P("d", 2, 1),
    ];
    const rects = rectsFromUniform({
      widthPx: 800,
      heightPx: 600,
      rows: 3,
      cols: 2,
      gutterPx: 0,
      outerGutter: false,
      colWeights: [0.5, 0.5],
      rowWeights: [1 / 3, 1 / 3, 1 / 3],
      panels,
    });
    expect(rects.merged!.x).toBe(0);
    expect(rects.merged!.y).toBe(0);
    expect(rects.merged!.w).toBe(800);
    expect(rects.merged!.h).toBe(400);
    expect(rects.c!.y).toBe(400);
  });
});

describe("resizePanelFreeform", () => {
  const baseRects: Record<string, FreeRect> = {
    tl: { x: 0, y: 0, w: 500, h: 500 },
    tr: { x: 500, y: 0, w: 500, h: 500 },
    bl: { x: 0, y: 500, w: 500, h: 500 },
    br: { x: 500, y: 500, w: 500, h: 500 },
  };

  it("dragging tl's bottom-right corner +50,+50 grows tl and shrinks tr/bl/br (strict opposite-side)", () => {
    const r = resizePanelFreeform(baseRects, "tl", "br", 50, 50);
    expect(r.applied).toEqual({ dx: 50, dy: 50 });
    expect(r.rects.tl).toEqual({ x: 0, y: 0, w: 550, h: 550 });
    // tr: left edge moved (right edge at xEdge=500 → no; left edge at xEdge → yes).
    // tr's bottom is at y=500 but bottom != yEdge for movesBottom rule (which
    // checks `top == yEdge`). So tr.h is unchanged.
    expect(r.rects.tr).toEqual({ x: 550, y: 0, w: 450, h: 500 });
    // bl: top moved; bl's right at x=500 != xEdge for movesRight (which checks
    // `left == xEdge`). So bl.w unchanged.
    expect(r.rects.bl).toEqual({ x: 0, y: 550, w: 500, h: 450 });
    // br: both edges affected (left=500 and top=500 both match the moved
    // edges' opposite sides).
    expect(r.rects.br).toEqual({ x: 550, y: 550, w: 450, h: 450 });
  });

  it("clamps drag so no panel falls below MIN_PANEL_W", () => {
    const r = resizePanelFreeform(baseRects, "tl", "br", 9999, 0);
    expect(r.applied.dx).toBe(470);
    expect(r.rects.tr!.w).toBe(30);
    expect(r.rects.br!.w).toBe(30);
  });

  it("dragging the top-left corner of br by -50,-50 grows br toward origin", () => {
    const r = resizePanelFreeform(baseRects, "br", "tl", -50, -50);
    expect(r.applied).toEqual({ dx: -50, dy: -50 });
    expect(r.rects.br).toEqual({ x: 450, y: 450, w: 550, h: 550 });
    expect(r.rects.tr).toEqual({ x: 500, y: 0, w: 500, h: 450 });
    expect(r.rects.bl).toEqual({ x: 0, y: 500, w: 450, h: 500 });
    expect(r.rects.tl).toEqual({ x: 0, y: 0, w: 450, h: 450 });
  });

  it("a no-op drag returns rects unchanged with zero applied", () => {
    const r = resizePanelFreeform(baseRects, "tl", "br", 0, 0);
    expect(r.applied).toEqual({ dx: 0, dy: 0 });
    expect(r.rects).toEqual(baseRects);
  });

  it("a panel not in the rects map is rejected (returns input + zero)", () => {
    const r = resizePanelFreeform(baseRects, "ghost", "br", 50, 50);
    expect(r.applied).toEqual({ dx: 0, dy: 0 });
    expect(r.rects).toEqual(baseRects);
  });

  it("panels not sharing the moved edge stay put", () => {
    const rects: Record<string, FreeRect> = {
      a: { x: 0, y: 0, w: 200, h: 100 },
      b: { x: 200, y: 0, w: 200, h: 100 },
      c: { x: 400, y: 0, w: 200, h: 100 },
    };
    const r = resizePanelFreeform(rects, "a", "br", 30, 0);
    expect(r.rects.a).toEqual({ x: 0, y: 0, w: 230, h: 100 });
    expect(r.rects.b).toEqual({ x: 230, y: 0, w: 170, h: 100 });
    expect(r.rects.c).toEqual({ x: 400, y: 0, w: 200, h: 100 });
  });
});

describe("resizePanelUniform", () => {
  // 2x2 grid, 800x600 with no gutter for clean math: each panel is 400x300.
  // availW = 800, availH = 600. weight delta per pixel = 1/800 (x), 1/600 (y).
  const tl: Panel = { id: "tl", row: 0, col: 0, rowSpan: 1, colSpan: 1 };
  const br: Panel = { id: "br", row: 1, col: 1, rowSpan: 1, colSpan: 1 };

  const equal2x2 = {
    colWeights: [0.5, 0.5],
    rowWeights: [0.5, 0.5],
  };

  it("dragging tl's br corner +40,+30 transfers weight to col 0 and row 0", () => {
    const r = resizePanelUniform(
      equal2x2.colWeights,
      equal2x2.rowWeights,
      tl,
      "br",
      40,
      30,
      800,
      600,
    );
    // 40/800 = 0.05 added to col 0 (taken from col 1).
    expect(r.colWeights).toEqual([0.55, 0.45]);
    // 30/600 = 0.05 added to row 0.
    expect(r.rowWeights).toEqual([0.55, 0.45]);
    // Applied delta is the requested delta when no clamp triggers (FP-tolerant
    // because setTrackWeight rounds to 12 decimals).
    expect(r.applied.dx).toBeCloseTo(40, 6);
    expect(r.applied.dy).toBeCloseTo(30, 6);
  });

  it("dragging br's tl corner -40,-30 transfers weight to col 1 and row 1", () => {
    const r = resizePanelUniform(
      equal2x2.colWeights,
      equal2x2.rowWeights,
      br,
      "tl",
      -40,
      -30,
      800,
      600,
    );
    // br.tl moves -40 → col gutter at index 0 moves left by 40 → col 1 gains.
    // weights[0] -= 40/800 = 0.05; weights[1] += 0.05.
    expect(r.colWeights).toEqual([0.45, 0.55]);
    expect(r.rowWeights).toEqual([0.45, 0.55]);
    expect(r.applied.dx).toBeCloseTo(-40, 6);
    expect(r.applied.dy).toBeCloseTo(-30, 6);
  });

  it("tl corner of a panel in col 0 has no left track to drag — x-axis is a no-op", () => {
    const r = resizePanelUniform(
      equal2x2.colWeights,
      equal2x2.rowWeights,
      tl,
      "tl",
      -40,
      -30,
      800,
      600,
    );
    // No col-track to the left of col 0 → colWeights unchanged.
    expect(r.colWeights).toEqual([0.5, 0.5]);
    // Row track to the top of row 0 also doesn't exist → rowWeights unchanged.
    expect(r.rowWeights).toEqual([0.5, 0.5]);
    expect(r.applied).toEqual({ dx: 0, dy: 0 });
  });

  it("br corner of bottom-right panel has no track to drag — both axes no-op", () => {
    const r = resizePanelUniform(
      equal2x2.colWeights,
      equal2x2.rowWeights,
      br,
      "br",
      40,
      30,
      800,
      600,
    );
    expect(r.colWeights).toEqual([0.5, 0.5]);
    expect(r.rowWeights).toEqual([0.5, 0.5]);
    expect(r.applied).toEqual({ dx: 0, dy: 0 });
  });

  it("clamps to MIN_TRACK_WEIGHT — large drag stops at min", () => {
    const r = resizePanelUniform(
      equal2x2.colWeights,
      equal2x2.rowWeights,
      tl,
      "br",
      9999,
      0,
      800,
      600,
    );
    // col 1 cannot go below MIN_TRACK_WEIGHT, so col 0 = 1 - MIN_TRACK_WEIGHT.
    expect(r.colWeights[0]).toBeCloseTo(1 - MIN_TRACK_WEIGHT, 10);
    expect(r.colWeights[1]).toBeCloseTo(MIN_TRACK_WEIGHT, 10);
    // applied.dx reflects the clamped pixel delta.
    expect(r.applied.dx).toBeCloseTo((1 - MIN_TRACK_WEIGHT - 0.5) * 800, 6);
    expect(r.applied.dy).toBe(0);
  });

  it("merged panel: br corner drags the gutter at the panel's last spanned col/row", () => {
    // 3x3 grid, panel m spans rows 0-1 cols 0-1 (top-left 2x2 block).
    const m: Panel = { id: "m", row: 0, col: 0, rowSpan: 2, colSpan: 2 };
    const colWeights = [1 / 3, 1 / 3, 1 / 3];
    const rowWeights = [1 / 3, 1 / 3, 1 / 3];
    const r = resizePanelUniform(
      colWeights,
      rowWeights,
      m,
      "br",
      90,
      60,
      900,
      600,
    );
    // br corner drags col-track 1 (between col 1 and col 2) and row-track 1.
    // 90/900 = 0.1 added to col 1, taken from col 2. col 0 unchanged.
    expect(r.colWeights[0]).toBeCloseTo(1 / 3, 10);
    expect(r.colWeights[1]).toBeCloseTo(1 / 3 + 0.1, 10);
    expect(r.colWeights[2]).toBeCloseTo(1 / 3 - 0.1, 10);
    // 60/600 = 0.1 added to row 1.
    expect(r.rowWeights[0]).toBeCloseTo(1 / 3, 10);
    expect(r.rowWeights[1]).toBeCloseTo(1 / 3 + 0.1, 10);
    expect(r.rowWeights[2]).toBeCloseTo(1 / 3 - 0.1, 10);
  });

  it("returns the same arrays (reference-equal) when both axes are no-ops", () => {
    const colWeights = [0.5, 0.5];
    const rowWeights = [0.5, 0.5];
    const r = resizePanelUniform(
      colWeights,
      rowWeights,
      br,
      "br",
      40,
      30,
      800,
      600,
    );
    expect(r.colWeights).toBe(colWeights);
    expect(r.rowWeights).toBe(rowWeights);
  });
});
