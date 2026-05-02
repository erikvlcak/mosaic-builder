import { describe, it, expect } from "vitest";
import {
  panelCovers,
  findPanelAt,
  assertPanelsCoverGrid,
  type Panel,
} from "../../src/renderer/model/panels";

const def = (
  id: string,
  row: number,
  col: number,
  rowSpan = 1,
  colSpan = 1,
): Panel => ({ id, row, col, rowSpan, colSpan });

describe("panelCovers", () => {
  it("covers its own top-left cell", () => {
    expect(panelCovers(def("p", 1, 2), 1, 2)).toBe(true);
  });
  it("covers all cells inside a merged rect", () => {
    const m = def("m", 0, 0, 2, 3);
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 3; c++) expect(panelCovers(m, r, c)).toBe(true);
    expect(panelCovers(m, 2, 0)).toBe(false);
    expect(panelCovers(m, 0, 3)).toBe(false);
  });
});

describe("findPanelAt", () => {
  it("returns the merged panel for any cell inside it", () => {
    const ps: Panel[] = [
      def("a", 0, 0, 2, 2),
      def("b", 0, 2),
      def("c", 1, 2),
    ];
    expect(findPanelAt(ps, 0, 0)?.id).toBe("a");
    expect(findPanelAt(ps, 1, 1)?.id).toBe("a");
    expect(findPanelAt(ps, 0, 2)?.id).toBe("b");
    expect(findPanelAt(ps, 1, 2)?.id).toBe("c");
    expect(findPanelAt(ps, 5, 5)).toBe(null);
  });
});

describe("assertPanelsCoverGrid", () => {
  it("passes on default 2x2 with four 1x1 panels", () => {
    const ps: Panel[] = [
      def("a", 0, 0),
      def("b", 0, 1),
      def("c", 1, 0),
      def("d", 1, 1),
    ];
    expect(() => assertPanelsCoverGrid(ps, 2, 2)).not.toThrow();
  });

  it("passes when a merged 1x2 panel covers an entire row", () => {
    const ps: Panel[] = [
      def("hero", 0, 0, 1, 2),
      def("c", 1, 0),
      def("d", 1, 1),
    ];
    expect(() => assertPanelsCoverGrid(ps, 2, 2)).not.toThrow();
  });

  it("throws on overlap", () => {
    const ps: Panel[] = [def("a", 0, 0, 1, 2), def("b", 0, 1)];
    expect(() => assertPanelsCoverGrid(ps, 1, 2)).toThrow(/overlap/i);
  });

  it("throws on gap", () => {
    const ps: Panel[] = [def("a", 0, 0)];
    expect(() => assertPanelsCoverGrid(ps, 1, 2)).toThrow(/gap|uncovered/i);
  });
});
