import { describe, it, expect, beforeEach } from "vitest";
import type { Figure } from "../../src/renderer/model/types";
import {
  initialFigureState,
  figureReducer,
  __resetPanelIdsForTests,
} from "../../src/renderer/model/figure-state";
import { addToPool, placeIntoPanel } from "../../src/renderer/model/figure-actions";
import { findPanelAt } from "../../src/renderer/model/panels";
import { deriveFigure } from "../../src/renderer/model/figure-derivations";

const CANVAS = { widthPx: 800, heightPx: 600, background: "#FFFFFF" } as const;

describe("deriveFigure", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  it("derives all-placeholder figure from empty state", () => {
    const s = initialFigureState();
    const f: Figure = deriveFigure(s, { canvas: CANVAS });
    expect(f.canvas).toEqual(CANVAS);
    expect(f.grid.rows).toBe(2);
    expect(f.grid.cols).toBe(2);
    expect(f.grid.gutterPx).toBe(s.gutterPx);
    expect(f.grid.gutterColor).toBe(s.gutterColor);
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
    // 1x1 panels: spans omitted is fine.
    expect(f.panels.every((p) => (p.rowSpan ?? 1) === 1)).toBe(true);
    expect(f.panels.every((p) => (p.colSpan ?? 1) === 1)).toBe(true);
  });

  it("derives image panels for occupied panels", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool({
      id: "img-1", filename: "x.png", filePath: "/x", mime: "image/png",
      width: 1, height: 1,
    }));
    const pid = findPanelAt(s.panels, 0, 1)?.id;
    if (pid === undefined) throw new Error("no panel at (0,1)");
    s = figureReducer(s, placeIntoPanel("img-1", pid));

    const f = deriveFigure(s, { canvas: CANVAS });
    const at01 = f.panels.find((p) => p.row === 0 && p.col === 1);
    expect(at01?.kind).toBe("image");
    if (at01?.kind === "image") {
      expect(at01.imageId).toBe("img-1");
    }
  });

  it("emits rowSpan/colSpan for a merged panel and labels it from its top-left index", () => {
    // Hand-craft a merged 1x2 hero on the top row of a 2x2 grid.
    const s = initialFigureState();
    s.panels = [
      { id: "hero", row: 0, col: 0, rowSpan: 1, colSpan: 2 },
      { id: "c", row: 1, col: 0, rowSpan: 1, colSpan: 1 },
      { id: "d", row: 1, col: 1, rowSpan: 1, colSpan: 1 },
    ];
    const f = deriveFigure(s, { canvas: CANVAS });
    const hero = f.panels.find((p) => p.row === 0 && p.col === 0);
    expect(hero?.rowSpan).toBe(1);
    expect(hero?.colSpan).toBe(2);
    expect(hero?.kind).toBe("placeholder");
    if (hero?.kind === "placeholder") expect(hero.label).toBe("A");
    // Bottom row labels are based on row-major *cell* index → "C","D".
    const c = f.panels.find((p) => p.row === 1 && p.col === 0);
    if (c?.kind === "placeholder") expect(c.label).toBe("C");
  });
});
