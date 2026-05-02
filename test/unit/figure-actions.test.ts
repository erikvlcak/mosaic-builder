import { describe, it, expect, beforeEach } from "vitest";
import type { ImagePoolItem } from "../../src/renderer/model/pool";
import {
  initialFigureState,
  figureReducer,
  __resetPanelIdsForTests,
  type FigureState,
} from "../../src/renderer/model/figure-state";
import {
  addToPool,
  placeIntoPanel,
  swapPanels,
  replaceIntoPanel,
  removeFromPool,
  setPanelTransform,
  setPanelFit,
  rotatePanel90,
  flipPanelH,
  flipPanelV,
  resetPanelTransform,
} from "../../src/renderer/model/figure-actions";
import { findPanelAt, DEFAULT_TRANSFORM } from "../../src/renderer/model/panels";

const IMG_A: ImagePoolItem = {
  id: "a",
  filename: "a.png",
  filePath: "/x/a.png",
  mime: "image/png",
  width: 100,
  height: 100,
};
const IMG_B: ImagePoolItem = {
  id: "b",
  filename: "b.jpg",
  filePath: "/x/b.jpg",
  mime: "image/jpeg",
  width: 200,
  height: 100,
};

function withPool(...items: ImagePoolItem[]): FigureState {
  let s = initialFigureState();
  for (const it of items) s = figureReducer(s, addToPool(it));
  return s;
}

function panelIdAt(s: FigureState, row: number, col: number): string {
  const p = findPanelAt(s.panels, row, col);
  if (p === null) throw new Error(`no panel at ${row},${col}`);
  return p.id;
}

describe("figureReducer (panel-id actions)", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  it("starts with a 2x2 of four 1x1 panels and empty pool", () => {
    const s = initialFigureState();
    expect(s.pool).toEqual([]);
    expect(s.panels).toHaveLength(4);
    expect(s.rows).toBe(2);
    expect(s.cols).toBe(2);
    expect(s.gutterPx).toBe(12);
    expect(s.panels.every((p) => p.rowSpan === 1 && p.colSpan === 1)).toBe(
      true,
    );
  });

  it("ADD_TO_POOL appends to pool, no placement", () => {
    const s = figureReducer(initialFigureState(), addToPool(IMG_A));
    expect(s.pool).toEqual([IMG_A]);
    expect(s.panels.every((p) => p.imageId === undefined)).toBe(true);
  });

  it("ADD_TO_POOL ignores duplicate ids", () => {
    let s = figureReducer(initialFigureState(), addToPool(IMG_A));
    s = figureReducer(s, addToPool(IMG_A));
    expect(s.pool).toHaveLength(1);
  });

  it("PLACE_INTO_PANEL into empty panel sets imageId", () => {
    const s0 = withPool(IMG_A);
    const pid = panelIdAt(s0, 0, 1);
    const s1 = figureReducer(s0, placeIntoPanel("a", pid));
    const target = s1.panels.find((p) => p.id === pid);
    expect(target?.imageId).toBe("a");
  });

  it("PLACE_INTO_PANEL no-op when image not in pool", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(s0, placeIntoPanel("ghost", pid));
    expect(s1).toBe(s0);
  });

  it("PLACE_INTO_PANEL no-op when image already placed elsewhere", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 1, 1);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const before = s;
    s = figureReducer(s, placeIntoPanel("a", p2));
    expect(s).toBe(before);
  });

  it("PLACE_INTO_PANEL no-op when target panel already occupied", () => {
    let s = withPool(IMG_A, IMG_B);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const before = s;
    s = figureReducer(s, placeIntoPanel("b", p1));
    expect(s).toBe(before);
  });

  it("SWAP_PANELS swaps two occupied panels", () => {
    let s = withPool(IMG_A, IMG_B);
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 1, 1);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, placeIntoPanel("b", p2));
    s = figureReducer(s, swapPanels(p1, p2));
    expect(s.panels.find((p) => p.id === p1)?.imageId).toBe("b");
    expect(s.panels.find((p) => p.id === p2)?.imageId).toBe("a");
  });

  it("SWAP_PANELS moves image into empty panel when one side is empty", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 0, 1);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, swapPanels(p1, p2));
    expect(s.panels.find((p) => p.id === p1)?.imageId).toBeUndefined();
    expect(s.panels.find((p) => p.id === p2)?.imageId).toBe("a");
  });

  it("SWAP_PANELS is a no-op when source equals target", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const s2 = figureReducer(s, swapPanels(p1, p1));
    expect(s2).toBe(s);
  });

  it("REPLACE_INTO_PANEL puts new image in panel; kicked image stays in pool unplaced", () => {
    let s = withPool(IMG_A, IMG_B);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, replaceIntoPanel("b", p1));
    expect(s.panels.find((p) => p.id === p1)?.imageId).toBe("b");
    const placedIds = new Set(
      s.panels.map((p) => p.imageId).filter((x): x is string => x !== undefined),
    );
    expect(placedIds.has("a")).toBe(false);
    expect(s.pool.map((i) => i.id)).toContain("a");
  });

  it("REMOVE_FROM_POOL drops the item and clears any placement", () => {
    let s = withPool(IMG_A, IMG_B);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, removeFromPool("a"));
    expect(s.pool.map((i) => i.id)).toEqual(["b"]);
    expect(s.panels.find((p) => p.id === p1)?.imageId).toBeUndefined();
  });

  it("RESIZE_GRID grows the grid and adds 1x1 panels", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(
      s0,
      { type: "RESIZE_GRID", rows: 3, cols: 3 } as const,
    );
    expect(s1.rows).toBe(3);
    expect(s1.cols).toBe(3);
    expect(s1.panels).toHaveLength(9);
  });

  it("RESIZE_GRID clamps to 1..10", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(
      s0,
      { type: "RESIZE_GRID", rows: 99, cols: 0 } as const,
    );
    expect(s1.rows).toBe(10);
    expect(s1.cols).toBe(1);
  });

  it("RESIZE_GRID is no-op when the shape is unchanged", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(
      s0,
      { type: "RESIZE_GRID", rows: 2, cols: 2 } as const,
    );
    expect(s1).toBe(s0);
  });

  it("SET_GUTTER_PX clamps and updates", () => {
    let s = initialFigureState();
    s = figureReducer(s, { type: "SET_GUTTER_PX", gutterPx: 20 } as const);
    expect(s.gutterPx).toBe(20);
    s = figureReducer(s, { type: "SET_GUTTER_PX", gutterPx: -5 } as const);
    expect(s.gutterPx).toBe(0);
    s = figureReducer(s, { type: "SET_GUTTER_PX", gutterPx: 999 } as const);
    expect(s.gutterPx).toBe(40);
  });

  it("SET_GUTTER_COLOR accepts hex and rejects junk", () => {
    let s = initialFigureState();
    s = figureReducer(
      s,
      { type: "SET_GUTTER_COLOR", gutterColor: "#000000" } as const,
    );
    expect(s.gutterColor).toBe("#000000");
    const before = s;
    s = figureReducer(
      s,
      { type: "SET_GUTTER_COLOR", gutterColor: "purple" } as const,
    );
    expect(s).toBe(before);
  });

  it("MERGE_CELLS merges a contiguous rectangle of 1x1 panels", () => {
    let s = initialFigureState();
    s = figureReducer(s, {
      type: "MERGE_CELLS",
      cells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    } as const);
    expect(s.panels).toHaveLength(3);
    const merged = s.panels.find((p) => p.colSpan === 2);
    expect(merged?.row).toBe(0);
    expect(merged?.col).toBe(0);
    expect(merged?.rowSpan).toBe(1);
  });

  it("MERGE_CELLS is a no-op on an L-shape", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, {
      type: "MERGE_CELLS",
      cells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 0 },
      ],
    } as const);
    expect(s1).toBe(s0);
  });

  it("UNMERGE_PANEL splits a merged panel back to 1x1s", () => {
    let s = initialFigureState();
    s = figureReducer(s, {
      type: "MERGE_CELLS",
      cells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    } as const);
    const merged = s.panels.find((p) => p.colSpan === 2);
    if (merged === undefined) throw new Error("expected merged");
    s = figureReducer(s, {
      type: "UNMERGE_PANEL",
      panelId: merged.id,
    } as const);
    expect(s.panels).toHaveLength(4);
    expect(s.panels.every((p) => p.rowSpan === 1 && p.colSpan === 1)).toBe(true);
  });

  it("UNMERGE_PANEL is a no-op on an unknown panelId", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, {
      type: "UNMERGE_PANEL",
      panelId: "ghost",
    } as const);
    expect(s1).toBe(s0);
  });
});

describe("figureReducer (transform actions)", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  it("PLACE_INTO_PANEL stamps DEFAULT_TRANSFORM on the target", () => {
    const s0 = withPool(IMG_A);
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(s0, placeIntoPanel("a", pid));
    const target = s1.panels.find((p) => p.id === pid);
    expect(target?.transform).toEqual(DEFAULT_TRANSFORM);
  });

  it("SWAP_PANELS swaps imageId AND transform together", () => {
    let s = withPool(IMG_A, IMG_B);
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 1, 1);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, placeIntoPanel("b", p2));
    // Mutate p1's transform so we can detect it travels with the image.
    const customA = { ...DEFAULT_TRANSFORM, fit: "cover" as const, panX: 17 };
    s = figureReducer(s, setPanelTransform(p1, customA));
    s = figureReducer(s, swapPanels(p1, p2));
    expect(s.panels.find((p) => p.id === p1)?.imageId).toBe("b");
    expect(s.panels.find((p) => p.id === p1)?.transform).toEqual(
      DEFAULT_TRANSFORM,
    );
    expect(s.panels.find((p) => p.id === p2)?.imageId).toBe("a");
    expect(s.panels.find((p) => p.id === p2)?.transform).toEqual(customA);
  });

  it("SWAP_PANELS into an empty panel moves transform with image; vacated panel has no transform", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 0, 1);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, swapPanels(p1, p2));
    const dst = s.panels.find((p) => p.id === p2);
    const src = s.panels.find((p) => p.id === p1);
    expect(dst?.imageId).toBe("a");
    expect(dst?.transform).toEqual(DEFAULT_TRANSFORM);
    expect(src?.imageId).toBeUndefined();
    expect(src?.transform).toBeUndefined();
  });

  it("REPLACE_INTO_PANEL resets transform for the incoming image", () => {
    let s = withPool(IMG_A, IMG_B);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const custom = { ...DEFAULT_TRANSFORM, zoom: 3 };
    s = figureReducer(s, setPanelTransform(p1, custom));
    s = figureReducer(s, replaceIntoPanel("b", p1));
    const target = s.panels.find((p) => p.id === p1);
    expect(target?.imageId).toBe("b");
    expect(target?.transform).toEqual(DEFAULT_TRANSFORM);
  });

  it("REMOVE_FROM_POOL strips both imageId and transform", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, removeFromPool("a"));
    const target = s.panels.find((p) => p.id === p1);
    expect(target?.imageId).toBeUndefined();
    expect(target?.transform).toBeUndefined();
  });

  it("SET_PANEL_TRANSFORM stores the transform", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const custom = { ...DEFAULT_TRANSFORM, panX: 5, panY: -3, zoom: 2 };
    s = figureReducer(s, setPanelTransform(p1, custom));
    expect(s.panels.find((p) => p.id === p1)?.transform).toEqual(custom);
  });

  it("SET_PANEL_TRANSFORM no-ops on unknown panel id", () => {
    const s0 = withPool(IMG_A);
    const s1 = figureReducer(s0, setPanelTransform("ghost", DEFAULT_TRANSFORM));
    expect(s1).toBe(s0);
  });

  it("SET_PANEL_TRANSFORM no-ops when panel has no image", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(s0, setPanelTransform(pid, DEFAULT_TRANSFORM));
    expect(s1).toBe(s0);
  });

  it("SET_PANEL_FIT to same fit is a referential no-op", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const before = s;
    const after = figureReducer(s, setPanelFit(p1, "contain"));
    expect(after).toBe(before);
  });

  it("SET_PANEL_FIT changes fit and resets pan/zoom but preserves rotation/flips", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, setPanelTransform(p1, {
      ...DEFAULT_TRANSFORM,
      panX: 10,
      panY: 20,
      zoom: 3,
      rotation: 90,
      flipH: true,
    }));
    s = figureReducer(s, setPanelFit(p1, "cover"));
    const t = s.panels.find((p) => p.id === p1)?.transform;
    expect(t?.fit).toBe("cover");
    expect(t?.panX).toBe(0);
    expect(t?.panY).toBe(0);
    expect(t?.zoom).toBe(1);
    expect(t?.rotation).toBe(90);
    expect(t?.flipH).toBe(true);
  });

  it("SET_PANEL_FIT no-ops on panel without image", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(s0, setPanelFit(pid, "cover"));
    expect(s1).toBe(s0);
  });

  it("ROTATE_PANEL_90 cycles 0 → 90 → 180 → 270 → 0", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const rots: number[] = [];
    for (let i = 0; i < 4; i++) {
      s = figureReducer(s, rotatePanel90(p1));
      rots.push(s.panels.find((p) => p.id === p1)?.transform?.rotation ?? -1);
    }
    expect(rots).toEqual([90, 180, 270, 0]);
  });

  it("ROTATE_PANEL_90 resets pan but keeps zoom and flips", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, setPanelTransform(p1, {
      ...DEFAULT_TRANSFORM,
      panX: 50,
      panY: 50,
      zoom: 2,
      flipV: true,
    }));
    s = figureReducer(s, rotatePanel90(p1));
    const t = s.panels.find((p) => p.id === p1)?.transform;
    expect(t?.panX).toBe(0);
    expect(t?.panY).toBe(0);
    expect(t?.zoom).toBe(2);
    expect(t?.flipV).toBe(true);
    expect(t?.rotation).toBe(90);
  });

  it("ROTATE_PANEL_90 no-ops on panel without image", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(s0, rotatePanel90(pid));
    expect(s1).toBe(s0);
  });

  it("FLIP_PANEL_H toggles", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, flipPanelH(p1));
    expect(s.panels.find((p) => p.id === p1)?.transform?.flipH).toBe(true);
    s = figureReducer(s, flipPanelH(p1));
    expect(s.panels.find((p) => p.id === p1)?.transform?.flipH).toBe(false);
  });

  it("FLIP_PANEL_V toggles", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, flipPanelV(p1));
    expect(s.panels.find((p) => p.id === p1)?.transform?.flipV).toBe(true);
    s = figureReducer(s, flipPanelV(p1));
    expect(s.panels.find((p) => p.id === p1)?.transform?.flipV).toBe(false);
  });

  it("RESET_PANEL_TRANSFORM snaps back to DEFAULT_TRANSFORM", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, setPanelTransform(p1, {
      ...DEFAULT_TRANSFORM,
      fit: "cover",
      panX: 10,
      zoom: 2,
      rotation: 270,
      flipH: true,
    }));
    s = figureReducer(s, resetPanelTransform(p1));
    expect(s.panels.find((p) => p.id === p1)?.transform).toEqual(
      DEFAULT_TRANSFORM,
    );
  });

  it("RESET_PANEL_TRANSFORM no-ops on panel without image", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(s0, resetPanelTransform(pid));
    expect(s1).toBe(s0);
  });
});
