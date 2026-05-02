import { describe, it, expect } from "vitest";
import type { Figure } from "../../src/renderer/model/types";

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
