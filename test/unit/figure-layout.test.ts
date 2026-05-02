import { describe, it, expect } from "vitest";
import type { Figure } from "../../src/renderer/model/types";
import { computePanelRects } from "../../src/renderer/render/coords";

describe("Figure type", () => {
  it("accepts a 2x2 hard-coded figure literal", () => {
    const f: Figure = {
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      grid: { rows: 2, cols: 2, gutterPx: 12, gutterColor: "#FFFFFF" },
      panels: [
        { row: 0, col: 0, kind: "image", imageId: "sample" },
        { row: 0, col: 1, kind: "placeholder", label: "B" },
        { row: 1, col: 0, kind: "placeholder", label: "C" },
        { row: 1, col: 1, kind: "placeholder", label: "D" },
      ],
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
    });
    // 101 - 3 = 98; 98/2 = 49 each, no remainder
    expect(rects[0]?.w).toBe(49);
    expect(rects[1]?.w).toBe(49);
    // y span: 50 - 2 = 48
    expect(rects[0]?.h).toBe(48);
  });
});
