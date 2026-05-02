import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetPanelIdsForTests,
} from "../../src/renderer/model/figure-state";
import { resizePanels } from "../../src/renderer/model/grid-resize";
import type { Panel } from "../../src/renderer/model/panels";
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

describe("resizePanels", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  it("no-op when shape is unchanged", () => {
    const ps = [def("a", 0, 0), def("b", 0, 1), def("c", 1, 0), def("d", 1, 1)];
    const r = resizePanels(ps, 2, 2, 2, 2);
    expect(r.panels).toEqual(ps);
    expect(r.releasedImageIds).toEqual([]);
  });

  it("growing rows appends fresh 1x1 panels in row-major order", () => {
    const ps = [def("a", 0, 0), def("b", 0, 1)];
    const r = resizePanels(ps, 1, 2, 2, 2);
    assertPanelsCoverGrid(r.panels, 2, 2);
    expect(r.panels.filter((p) => p.row === 1)).toHaveLength(2);
    expect(r.releasedImageIds).toEqual([]);
  });

  it("growing cols appends fresh 1x1 panels", () => {
    const ps = [def("a", 0, 0), def("b", 1, 0)];
    const r = resizePanels(ps, 2, 1, 2, 2);
    assertPanelsCoverGrid(r.panels, 2, 2);
  });

  it("shrinking releases image ids of panels that fall out of bounds", () => {
    const ps = [
      def("a", 0, 0, 1, 1, "imgA"),
      def("b", 0, 1, 1, 1, "imgB"),
      def("c", 1, 0, 1, 1, "imgC"),
      def("d", 1, 1, 1, 1, "imgD"),
    ];
    const r = resizePanels(ps, 2, 2, 1, 1);
    assertPanelsCoverGrid(r.panels, 1, 1);
    expect(r.panels).toHaveLength(1);
    expect(r.panels[0]?.imageId).toBe("imgA");
    expect(r.releasedImageIds.sort()).toEqual(["imgB", "imgC", "imgD"]);
  });

  it("shrinking splits a merged panel that straddles the new edge", () => {
    // 2x3 grid with a 1x3 hero panel covering the top row and 3 1x1s below.
    const ps = [
      def("hero", 0, 0, 1, 3, "imgHero"),
      def("c", 1, 0),
      def("d", 1, 1),
      def("e", 1, 2),
    ];
    // Shrink to 2x2 — hero loses col 2.
    const r = resizePanels(ps, 2, 3, 2, 2);
    assertPanelsCoverGrid(r.panels, 2, 2);
    // The hero panel is split into 1x1s in the surviving area; its image
    // sticks with the (0,0) cell — pragmatic choice, matches what the user
    // sees.
    const at00 = r.panels.find((p) => p.row === 0 && p.col === 0);
    const at01 = r.panels.find((p) => p.row === 0 && p.col === 1);
    expect(at00?.rowSpan).toBe(1);
    expect(at00?.colSpan).toBe(1);
    expect(at00?.imageId).toBe("imgHero");
    expect(at01?.imageId).toBeUndefined();
    expect(r.releasedImageIds).toEqual([]);
  });

  it("shrinking releases an image when its merged panel is fully outside", () => {
    const ps = [
      def("hero", 1, 0, 1, 2, "imgHero"),
      def("a", 0, 0),
      def("b", 0, 1),
    ];
    const r = resizePanels(ps, 2, 2, 1, 2);
    assertPanelsCoverGrid(r.panels, 1, 2);
    expect(r.releasedImageIds).toEqual(["imgHero"]);
  });
});
