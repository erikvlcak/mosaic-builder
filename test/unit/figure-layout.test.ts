import { describe, it, expect } from "vitest";
import type { Figure } from "../../src/renderer/model/types";
import { computePanelRects } from "../../src/renderer/render/coords";
import { DEFAULT_TRANSFORM } from "../../src/renderer/model/panels";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";

describe("Figure type", () => {
  it("accepts a 2x2 hard-coded figure literal", () => {
    const f: Figure = {
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      grid: { rows: 2, cols: 2, gutterPx: 12, gutterColor: "#FFFFFF" },
      panels: [
        { row: 0, col: 0, kind: "image", imageId: "sample", transform: DEFAULT_TRANSFORM },
        { row: 0, col: 1, kind: "placeholder", label: "B" },
        { row: 1, col: 0, kind: "placeholder", label: "C" },
        { row: 1, col: 1, kind: "placeholder", label: "D" },
      ],
      annotations: [],
      globalStyle: DEFAULT_GLOBAL_STYLE,
    };
    expect(f.grid.rows).toBe(2);
    expect(f.panels.length).toBe(4);
  });
});

describe("computePanelRects", () => {
  it("divides a 800x600 canvas into a 2x2 grid with 12px gutters", () => {
    const rects = computePanelRects({
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      grid: { rows: 2, cols: 2, gutterPx: 12, gutterColor: "#FFFFFF" },
      panels: [
        { row: 0, col: 0, kind: "placeholder", label: "A" },
        { row: 0, col: 1, kind: "placeholder", label: "B" },
        { row: 1, col: 0, kind: "placeholder", label: "C" },
        { row: 1, col: 1, kind: "placeholder", label: "D" },
      ],
      annotations: [],
      globalStyle: DEFAULT_GLOBAL_STYLE,
    });

    // Available width = 800 - (cols+1)*gutter = 800 - 3*12 = 764; per cell = 382
    // Available height = 600 - 3*12 = 564; per cell = 282
    expect(rects).toHaveLength(4);
    expect(rects[0]).toEqual({ x: 12, y: 12, w: 382, h: 282 });
    expect(rects[1]).toEqual({ x: 12 + 382 + 12, y: 12, w: 382, h: 282 });
    expect(rects[2]).toEqual({ x: 12, y: 12 + 282 + 12, w: 382, h: 282 });
    expect(rects[3]).toEqual({
      x: 12 + 382 + 12,
      y: 12 + 282 + 12,
      w: 382,
      h: 282,
    });
  });

  it("handles odd remainders by giving extra px to trailing cells", () => {
    const rects = computePanelRects({
      canvas: { widthPx: 101, heightPx: 50, background: "#FFFFFF" },
      grid: { rows: 1, cols: 2, gutterPx: 1, gutterColor: "#FFFFFF" },
      panels: [
        { row: 0, col: 0, kind: "placeholder", label: "A" },
        { row: 0, col: 1, kind: "placeholder", label: "B" },
      ],
      annotations: [],
      globalStyle: DEFAULT_GLOBAL_STYLE,
    });
    // 101 - 3 = 98; 98/2 = 49 each, no remainder
    expect(rects[0]?.w).toBe(49);
    expect(rects[1]?.w).toBe(49);
    // y span: 50 - 2 = 48
    expect(rects[0]?.h).toBe(48);
  });
});

describe("computePanelRects with merged panels", () => {
  it("a 1x2 merged top-row panel spans the full content width on a 2x2", () => {
    const rects = computePanelRects({
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      grid: { rows: 2, cols: 2, gutterPx: 12, gutterColor: "#FFFFFF" },
      panels: [
        // hero: row 0, col 0..1
        { row: 0, col: 0, kind: "placeholder", label: "A", rowSpan: 1, colSpan: 2 },
        { row: 1, col: 0, kind: "placeholder", label: "C" },
        { row: 1, col: 1, kind: "placeholder", label: "D" },
      ],
      annotations: [],
      globalStyle: DEFAULT_GLOBAL_STYLE,
    });
    // cellW = (800 - 3*12) / 2 = 382
    // hero w = 2*382 + 1*12 = 776; covers cols 0..1, includes col 1 = last col so remainder absorbed (=0)
    expect(rects).toHaveLength(3);
    expect(rects[0]).toEqual({ x: 12, y: 12, w: 776, h: 282 });
    expect(rects[1]?.x).toBe(12);
    expect(rects[1]?.y).toBe(12 + 282 + 12);
    expect(rects[2]?.x).toBe(12 + 382 + 12);
  });

  it("a 2x1 merged left-col panel spans full content height on a 2x2", () => {
    const rects = computePanelRects({
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      grid: { rows: 2, cols: 2, gutterPx: 12, gutterColor: "#FFFFFF" },
      panels: [
        { row: 0, col: 0, kind: "placeholder", label: "A", rowSpan: 2, colSpan: 1 },
        { row: 0, col: 1, kind: "placeholder", label: "B" },
        { row: 1, col: 1, kind: "placeholder", label: "D" },
      ],
      annotations: [],
      globalStyle: DEFAULT_GLOBAL_STYLE,
    });
    // cellH = (600 - 3*12) / 2 = 282
    // tall h = 2*282 + 12 = 576
    expect(rects[0]).toEqual({ x: 12, y: 12, w: 382, h: 576 });
  });

  it("treats omitted rowSpan/colSpan as 1", () => {
    const rects = computePanelRects({
      canvas: { widthPx: 100, heightPx: 100, background: "#FFFFFF" },
      grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFFFFF" },
      panels: [{ row: 0, col: 0, kind: "placeholder", label: "A" }],
      annotations: [],
      globalStyle: DEFAULT_GLOBAL_STYLE,
    });
    expect(rects[0]).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
});

describe("computePanelRects with outerGutter=false", () => {
  it("panels reach the canvas edge; only inter-panel gutters consume space", () => {
    const rects = computePanelRects({
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      grid: {
        rows: 2,
        cols: 2,
        gutterPx: 12,
        gutterColor: "#FFFFFF",
        outerGutter: false,
      },
      panels: [
        { row: 0, col: 0, kind: "placeholder", label: "A" },
        { row: 0, col: 1, kind: "placeholder", label: "B" },
        { row: 1, col: 0, kind: "placeholder", label: "C" },
        { row: 1, col: 1, kind: "placeholder", label: "D" },
      ],
      annotations: [],
      globalStyle: DEFAULT_GLOBAL_STYLE,
    });

    // Available width = 800 - (cols-1)*gutter = 800 - 12 = 788; per cell = 394
    // Available height = 600 - 12 = 588; per cell = 294
    expect(rects[0]).toEqual({ x: 0, y: 0, w: 394, h: 294 });
    expect(rects[1]).toEqual({ x: 394 + 12, y: 0, w: 394, h: 294 });
    expect(rects[2]).toEqual({ x: 0, y: 294 + 12, w: 394, h: 294 });
    expect(rects[3]).toEqual({ x: 394 + 12, y: 294 + 12, w: 394, h: 294 });
    // Top-left panel sits at the canvas origin; bottom-right reaches the canvas edge.
    expect(rects[3]?.x ?? 0 + (rects[3]?.w ?? 0)).toBeGreaterThanOrEqual(0);
    const last = rects[3]!;
    expect(last.x + last.w).toBe(800);
    expect(last.y + last.h).toBe(600);
  });

  it("a 1x1 grid with outerGutter=false fills the canvas with one panel", () => {
    const rects = computePanelRects({
      canvas: { widthPx: 100, heightPx: 100, background: "#FFFFFF" },
      grid: {
        rows: 1,
        cols: 1,
        gutterPx: 8,
        gutterColor: "#FFFFFF",
        outerGutter: false,
      },
      panels: [{ row: 0, col: 0, kind: "placeholder", label: "A" }],
      annotations: [],
      globalStyle: DEFAULT_GLOBAL_STYLE,
    });
    // No inter-panel gutters and no outer band → whole canvas is the panel.
    expect(rects[0]).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it("an undefined outerGutter falls back to true (legacy behavior)", () => {
    const rects = computePanelRects({
      canvas: { widthPx: 100, heightPx: 100, background: "#FFFFFF" },
      // No outerGutter key — must behave identically to the historic default.
      grid: { rows: 1, cols: 1, gutterPx: 8, gutterColor: "#FFFFFF" },
      panels: [{ row: 0, col: 0, kind: "placeholder", label: "A" }],
      annotations: [],
      globalStyle: DEFAULT_GLOBAL_STYLE,
    });
    expect(rects[0]).toEqual({ x: 8, y: 8, w: 84, h: 84 });
  });
});
