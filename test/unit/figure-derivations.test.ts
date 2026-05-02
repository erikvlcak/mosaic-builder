import { describe, it, expect } from "vitest";
import type { Figure } from "../../src/renderer/model/types";
import {
  cellKey,
  initialFigureState,
} from "../../src/renderer/model/figure-state";
import { deriveFigure } from "../../src/renderer/model/figure-derivations";

const CANVAS = { widthPx: 800, heightPx: 600, background: "#FFFFFF" } as const;
const GRID = { gutterPx: 12, gutterColor: "#FFFFFF" } as const;

describe("deriveFigure", () => {
  it("derives all-placeholder figure from empty state", () => {
    const s = initialFigureState();
    const f: Figure = deriveFigure(s, { canvas: CANVAS, grid: GRID });
    expect(f.canvas).toEqual(CANVAS);
    expect(f.grid.rows).toBe(2);
    expect(f.grid.cols).toBe(2);
    expect(f.panels).toHaveLength(4);
    expect(f.panels.map((p) => p.kind)).toEqual([
      "placeholder",
      "placeholder",
      "placeholder",
      "placeholder",
    ]);
    expect(
      f.panels.map((p) => (p.kind === "placeholder" ? p.label : "")),
    ).toEqual(["A", "B", "C", "D"]);
  });

  it("derives image panels for occupied cells", () => {
    const s = initialFigureState();
    s.placements.set(cellKey(0, 1), "img-1");
    s.placements.set(cellKey(1, 0), "img-2");
    const f = deriveFigure(s, { canvas: CANVAS, grid: GRID });
    expect(f.panels[0]).toEqual({
      row: 0,
      col: 0,
      kind: "placeholder",
      label: "A",
    });
    expect(f.panels[1]).toEqual({
      row: 0,
      col: 1,
      kind: "image",
      imageId: "img-1",
    });
    expect(f.panels[2]).toEqual({
      row: 1,
      col: 0,
      kind: "image",
      imageId: "img-2",
    });
    expect(f.panels[3]).toEqual({
      row: 1,
      col: 1,
      kind: "placeholder",
      label: "D",
    });
  });
});
