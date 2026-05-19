import { describe, it, expect } from "vitest";
import type { Panel } from "../../src/renderer/model/panels";
import {
  canMergeSelection,
  mergePanels,
  unmergePanel,
  type Rect,
} from "../../src/renderer/model/merge";
import { assertPanelsCoverGrid } from "../../src/renderer/model/panels";

const def = (
  id: string,
  row: number,
  col: number,
  rowSpan = 1,
  colSpan = 1,
  imageId?: string,
): Panel => {
  const p: Panel = { id, row, col, rowSpan, colSpan };
  if (imageId !== undefined) p.imageId = imageId;
  return p;
};

const grid2x2: Panel[] = [
  def("a", 0, 0),
  def("b", 0, 1),
  def("c", 1, 0),
  def("d", 1, 1),
];

describe("canMergeSelection", () => {
  it("accepts a contiguous 1x2 rectangle of 1x1 panels", () => {
    const r = canMergeSelection(grid2x2, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.rect).toEqual({ row: 0, col: 0, rowSpan: 1, colSpan: 2 });
  });

  it("accepts a 2x2 rectangle", () => {
    const r = canMergeSelection(grid2x2, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rect.rowSpan * r.rect.colSpan).toBe(4);
  });

  it("rejects fewer than 2 cells", () => {
    const r = canMergeSelection(grid2x2, [{ row: 0, col: 0 }]);
    expect(r.ok).toBe(false);
  });

  it("rejects an L-shape", () => {
    const r = canMergeSelection(grid2x2, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects when any cell already belongs to a merged panel", () => {
    const ps: Panel[] = [
      def("hero", 0, 0, 1, 2),
      def("c", 1, 0),
      def("d", 1, 1),
    ];
    const r = canMergeSelection(ps, [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
    ]);
    expect(r.ok).toBe(false);
  });
});

describe("mergePanels", () => {
  it("replaces 1x1 cells in a rect with one merged panel; keeps top-left's image", () => {
    const ps: Panel[] = [
      def("a", 0, 0, 1, 1, "imgA"),
      def("b", 0, 1, 1, 1, "imgB"),
      def("c", 1, 0),
      def("d", 1, 1),
    ];
    const rect: Rect = { row: 0, col: 0, rowSpan: 1, colSpan: 2 };
    const out = mergePanels(ps, rect);
    assertPanelsCoverGrid(out, 2, 2);
    expect(out).toHaveLength(3);
    const merged = out.find((p) => p.rowSpan * p.colSpan > 1);
    expect(merged?.imageId).toBe("imgA");
  });

  it("releases imageIds of non-top-left cells (caller handles tray re-entry)", () => {
    // mergePanels is pure — it does not return released ids; the caller
    // (reducer) computes them by diffing. This test simply asserts the
    // new merged panel only carries the top-left image.
    const ps: Panel[] = [
      def("a", 0, 0, 1, 1, "imgA"),
      def("b", 0, 1, 1, 1, "imgB"),
      def("c", 1, 0),
      def("d", 1, 1),
    ];
    const out = mergePanels(ps, { row: 0, col: 0, rowSpan: 1, colSpan: 2 });
    const merged = out.find((p) => p.colSpan === 2);
    expect(merged?.imageId).toBe("imgA");
    // imgB no longer appears anywhere in the panels array.
    expect(out.some((p) => p.imageId === "imgB")).toBe(false);
  });
});

describe("unmergePanel", () => {
  it("splits a merged panel into 1x1s; top-left keeps the image", () => {
    const ps: Panel[] = [
      def("hero", 0, 0, 1, 2, "imgHero"),
      def("c", 1, 0),
      def("d", 1, 1),
    ];
    const out = unmergePanel(ps, "hero");
    assertPanelsCoverGrid(out, 2, 2);
    const at00 = out.find((p) => p.row === 0 && p.col === 0);
    const at01 = out.find((p) => p.row === 0 && p.col === 1);
    expect(at00?.rowSpan).toBe(1);
    expect(at00?.imageId).toBe("imgHero");
    expect(at01?.imageId).toBeUndefined();
  });

  it("is a no-op on an already-1x1 panel", () => {
    const ps: Panel[] = [
      def("a", 0, 0),
      def("b", 0, 1),
      def("c", 1, 0),
      def("d", 1, 1),
    ];
    const out = unmergePanel(ps, "a");
    expect(out).toEqual(ps);
  });

  it("returns input unchanged if panelId not found", () => {
    const out = unmergePanel(grid2x2, "ghost");
    expect(out).toBe(grid2x2);
  });
});
