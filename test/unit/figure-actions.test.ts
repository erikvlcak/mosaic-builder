import { describe, it, expect, beforeEach } from "vitest";
import type { ImagePoolItem, Calibration } from "../../src/renderer/model/pool";
import type {
  Annotation,
  TextAnnotation,
  SymbolAnnotation,
  ScaleBarAnnotation,
} from "../../src/renderer/model/annotations";
import {
  DEFAULT_GLOBAL_STYLE,
  type GlobalAnnoStyle,
} from "../../src/renderer/model/global-style";
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
  unplacePanel,
  resetToState,
  resetFigureAction,
  setPanelTransform,
  setPanelFit,
  rotatePanel90,
  flipPanelH,
  flipPanelV,
  resetPanelTransform,
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
  bulkUpdateAnnos,
  bulkRemoveAnnos,
  setLetterOverride,
  setGlobalStyle,
  setLettersEnabled,
  setImageCalibration,
  setOuterGutter,
  setPanelHidden,
  deletePanel,
  restorePanelAt,
  setPanelCrop,
  resetPanelCrop,
  setTrackWeightAction,
  resizePanelFreeformAction,
  resetToUniformGridAction,
  resizeGrid,
  mergeCells,
  unmergePanelAction,
} from "../../src/renderer/model/figure-actions";
import {
  findPanelAt,
  DEFAULT_TRANSFORM,
} from "../../src/renderer/model/panels";

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
      s.panels
        .map((p) => p.imageId)
        .filter((x): x is string => x !== undefined),
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

  it("UNPLACE_PANEL clears imageId and transform, leaves the pool untouched", () => {
    let s = withPool(IMG_A);
    const pid = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", pid));
    expect(s.panels.find((p) => p.id === pid)?.imageId).toBe("a");

    s = figureReducer(s, unplacePanel(pid));
    const target = s.panels.find((p) => p.id === pid);
    expect(target?.imageId).toBeUndefined();
    expect(target?.transform).toBeUndefined();
    // Pool order/contents unchanged.
    expect(s.pool.map((i) => i.id)).toEqual(["a"]);
  });

  it("UNPLACE_PANEL on an empty panel is a no-op (===)", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(s0, unplacePanel(pid));
    expect(s1).toBe(s0);
  });

  it("UNPLACE_PANEL on an unknown panelId is a no-op (===)", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, unplacePanel("does-not-exist"));
    expect(s1).toBe(s0);
  });

  it("RESIZE_GRID grows the grid and adds 1x1 panels", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, {
      type: "RESIZE_GRID",
      rows: 3,
      cols: 3,
    } as const);
    expect(s1.rows).toBe(3);
    expect(s1.cols).toBe(3);
    expect(s1.panels).toHaveLength(9);
  });

  it("RESIZE_GRID clamps to 1..10", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, {
      type: "RESIZE_GRID",
      rows: 99,
      cols: 0,
    } as const);
    expect(s1.rows).toBe(10);
    expect(s1.cols).toBe(1);
  });

  it("RESIZE_GRID is no-op when the shape is unchanged", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, {
      type: "RESIZE_GRID",
      rows: 2,
      cols: 2,
    } as const);
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
    s = figureReducer(s, {
      type: "SET_GUTTER_COLOR",
      gutterColor: "#000000",
    } as const);
    expect(s.gutterColor).toBe("#000000");
    const before = s;
    s = figureReducer(s, {
      type: "SET_GUTTER_COLOR",
      gutterColor: "purple",
    } as const);
    expect(s).toBe(before);
  });

  it("SET_OUTER_GUTTER toggles the field; identical-value calls are ===-no-ops", () => {
    const s0 = initialFigureState();
    expect(s0.outerGutter).toBe(true);
    const s1 = figureReducer(s0, setOuterGutter(false));
    expect(s1.outerGutter).toBe(false);
    const s2 = figureReducer(s1, setOuterGutter(false));
    expect(s2).toBe(s1);
    const s3 = figureReducer(s2, setOuterGutter(true));
    expect(s3.outerGutter).toBe(true);
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
    expect(s.panels.every((p) => p.rowSpan === 1 && p.colSpan === 1)).toBe(
      true,
    );
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
    s = figureReducer(
      s,
      setPanelTransform(p1, {
        ...DEFAULT_TRANSFORM,
        panX: 10,
        panY: 20,
        zoom: 3,
        rotation: 90,
        flipH: true,
      }),
    );
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
    s = figureReducer(
      s,
      setPanelTransform(p1, {
        ...DEFAULT_TRANSFORM,
        panX: 50,
        panY: 50,
        zoom: 2,
        flipV: true,
      }),
    );
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
    s = figureReducer(
      s,
      setPanelTransform(p1, {
        ...DEFAULT_TRANSFORM,
        fit: "cover",
        panX: 10,
        zoom: 2,
        rotation: 270,
        flipH: true,
      }),
    );
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

  it("SET_PANEL_CROP stores a valid crop on the panel transform", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, setPanelCrop(p1, { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }));
    const t = s.panels.find((p) => p.id === p1)?.transform;
    expect(t?.crop).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 });
  });

  it("SET_PANEL_CROP rejects out-of-range crops as no-ops", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const before = s;
    s = figureReducer(s, setPanelCrop(p1, { x: 0.5, y: 0, w: 0.6, h: 1 }));
    expect(s).toBe(before);
    s = figureReducer(s, setPanelCrop(p1, { x: -0.1, y: 0, w: 0.5, h: 0.5 }));
    expect(s).toBe(before);
    s = figureReducer(s, setPanelCrop(p1, { x: 0, y: 0, w: 0, h: 0.5 }));
    expect(s).toBe(before);
    s = figureReducer(
      s,
      setPanelCrop(p1, { x: 0, y: 0, w: Number.NaN, h: 0.5 }),
    );
    expect(s).toBe(before);
  });

  it("SET_PANEL_CROP no-ops on panel without image", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(
      s0,
      setPanelCrop(pid, { x: 0, y: 0, w: 0.5, h: 0.5 }),
    );
    expect(s1).toBe(s0);
  });

  it("SET_PANEL_CROP with null clears an existing crop", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, setPanelCrop(p1, { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }));
    s = figureReducer(s, setPanelCrop(p1, null));
    const t = s.panels.find((p) => p.id === p1)?.transform;
    expect(t?.crop).toBeUndefined();
  });

  it("SET_PANEL_CROP with null no-ops when no crop exists", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const before = s;
    s = figureReducer(s, setPanelCrop(p1, null));
    expect(s).toBe(before);
  });

  it("SET_PANEL_CROP returns same state when crop is unchanged", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, setPanelCrop(p1, { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }));
    const before = s;
    s = figureReducer(s, setPanelCrop(p1, { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }));
    expect(s).toBe(before);
  });

  it("RESET_PANEL_CROP clears the crop", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, setPanelCrop(p1, { x: 0, y: 0, w: 0.5, h: 0.5 }));
    s = figureReducer(s, resetPanelCrop(p1));
    const t = s.panels.find((p) => p.id === p1)?.transform;
    expect(t?.crop).toBeUndefined();
  });

  it("RESET_PANEL_CROP no-ops when no crop is set", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const before = s;
    s = figureReducer(s, resetPanelCrop(p1));
    expect(s).toBe(before);
  });

  it("Two panels showing the same image carry independent crops", () => {
    let s = withPool(IMG_A, IMG_B);
    const p0 = panelIdAt(s, 0, 0);
    const p1 = panelIdAt(s, 0, 1);
    s = figureReducer(s, placeIntoPanel("a", p0));
    s = figureReducer(s, placeIntoPanel("b", p1));
    s = figureReducer(s, setPanelCrop(p0, { x: 0, y: 0, w: 0.5, h: 0.5 }));
    expect(s.panels.find((p) => p.id === p0)?.transform?.crop).toEqual({
      x: 0,
      y: 0,
      w: 0.5,
      h: 0.5,
    });
    expect(s.panels.find((p) => p.id === p1)?.transform?.crop).toBeUndefined();
  });
});

// ---- M6: annotations + global style + calibration + letter overrides ----

const CALIBRATION: Calibration = {
  unit: "um",
  pixelsPerUnit: 6.45,
  source: "tiff-meta",
};

const IMG_CAL: ImagePoolItem = {
  id: "cal",
  filename: "cal.tif",
  filePath: "/x/cal.tif",
  mime: "image/tiff",
  width: 512,
  height: 512,
  bitDepth: 8,
  calibration: CALIBRATION,
};

const IMG_NOCAL: ImagePoolItem = {
  id: "nocal",
  filename: "nocal.png",
  filePath: "/x/nocal.png",
  mime: "image/png",
  width: 100,
  height: 100,
  bitDepth: 8,
};

function textAnno(id: string, panelId?: string): TextAnnotation {
  return {
    id,
    kind: "text",
    z: 0,
    panelId,
    x: 10,
    y: 10,
    text: "hello",
    font: "Arial",
    sizePt: 12,
    bold: false,
    italic: false,
    color: "#000000",
  };
}
function symbolAnno(id: string, panelId?: string): SymbolAnnotation {
  return {
    id,
    kind: "symbol",
    z: 0,
    panelId,
    symbolId: "arrow-filled-right",
    x: 25,
    y: 25,
    sizePx: 60,
    rotationDeg: 0,
    color: "#FF0000",
    strokeWidthPx: 2,
    fillMode: "filled",
    strokeStyle: "solid",
  };
}
function scalebarAnno(id: string, panelId: string): ScaleBarAnnotation {
  return {
    id,
    kind: "scalebar",
    z: 0,
    panelId,
    lengthValue: 50,
    lengthUnit: "um",
  };
}

describe("figureReducer (M6 annotations)", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  it("ADD_ANNOTATION adds a text annotation anchored to a panel", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const ann = textAnno("t1", pid);
    const s1 = figureReducer(s0, addAnnotation(ann));
    expect(s1.annotations).toHaveLength(1);
    expect(s1.annotations[0]).toEqual(ann);
  });

  it("ADD_ANNOTATION adds a figure-global text annotation (no panelId)", () => {
    const s0 = initialFigureState();
    const ann = textAnno("t-global");
    const s1 = figureReducer(s0, addAnnotation(ann));
    expect(s1.annotations).toEqual([ann]);
  });

  it("ADD_ANNOTATION adds a symbol annotation", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const ann = symbolAnno("a1", pid);
    const s1 = figureReducer(s0, addAnnotation(ann));
    expect(s1.annotations).toEqual([ann]);
  });

  it("ADD_ANNOTATION carries fillMode and strokeStyle through verbatim", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const ann: SymbolAnnotation = {
      ...symbolAnno("a-fields", pid),
      fillMode: "outlined",
      strokeStyle: "dashed",
      strokeWidthPx: 4,
    };
    const s1 = figureReducer(s0, addAnnotation(ann));
    const stored = s1.annotations[0] as SymbolAnnotation;
    expect(stored.fillMode).toBe("outlined");
    expect(stored.strokeStyle).toBe("dashed");
    expect(stored.strokeWidthPx).toBe(4);
  });

  it("ADD_ANNOTATION adds a scale bar when panel has calibrated image", () => {
    let s = withPool(IMG_CAL);
    const pid = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("cal", pid));
    const ann = scalebarAnno("sb1", pid);
    s = figureReducer(s, addAnnotation(ann));
    expect(s.annotations).toEqual([ann]);
  });

  it("ADD_ANNOTATION no-op for scale bar when image has no calibration", () => {
    let s = withPool(IMG_NOCAL);
    const pid = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("nocal", pid));
    const before = s;
    s = figureReducer(s, addAnnotation(scalebarAnno("sb-bad", pid)));
    expect(s).toBe(before);
  });

  it("ADD_ANNOTATION no-op for scale bar when panel has no image", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(s0, addAnnotation(scalebarAnno("sb-bad2", pid)));
    expect(s1).toBe(s0);
  });

  it("ADD_ANNOTATION no-op when panelId references a non-existent panel", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, addAnnotation(textAnno("t-x", "ghost")));
    expect(s1).toBe(s0);
  });

  it("ADD_ANNOTATION no-op on duplicate id", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, addAnnotation(textAnno("dup")));
    const s2 = figureReducer(s1, addAnnotation(textAnno("dup")));
    expect(s2).toBe(s1);
  });

  it("UPDATE_ANNOTATION shallow-merges patch", () => {
    let s = initialFigureState();
    s = figureReducer(s, addAnnotation(textAnno("t1")));
    s = figureReducer(
      s,
      updateAnnotation("t1", {
        x: 99,
        color: "#112233",
      } as Partial<Annotation>),
    );
    const t = s.annotations[0] as TextAnnotation;
    expect(t.x).toBe(99);
    expect(t.color).toBe("#112233");
    // unchanged fields preserved
    expect(t.text).toBe("hello");
    expect(t.id).toBe("t1");
    expect(t.kind).toBe("text");
  });

  it("UPDATE_ANNOTATION rejects kind change", () => {
    let s = initialFigureState();
    s = figureReducer(s, addAnnotation(textAnno("t1")));
    s = figureReducer(
      s,
      updateAnnotation("t1", { kind: "symbol" } as Partial<Annotation>),
    );
    expect(s.annotations[0]?.kind).toBe("text");
  });

  it("UPDATE_ANNOTATION rejects id change in patch", () => {
    let s = initialFigureState();
    s = figureReducer(s, addAnnotation(textAnno("t1")));
    s = figureReducer(
      s,
      updateAnnotation("t1", { id: "other" } as Partial<Annotation>),
    );
    expect(s.annotations[0]?.id).toBe("t1");
  });

  it("UPDATE_ANNOTATION no-op on unknown id", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, addAnnotation(textAnno("t1")));
    const s2 = figureReducer(
      s1,
      updateAnnotation("ghost", { x: 1 } as Partial<Annotation>),
    );
    expect(s2).toBe(s1);
  });

  it("UPDATE_ANNOTATION rejects patch referencing a non-existent panel", () => {
    let s = initialFigureState();
    s = figureReducer(s, addAnnotation(textAnno("t1")));
    const before = s;
    s = figureReducer(
      s,
      updateAnnotation("t1", { panelId: "ghost" } as Partial<Annotation>),
    );
    expect(s).toBe(before);
  });

  it("UPDATE_ANNOTATION rejects scale-bar panelId change to uncalibrated panel", () => {
    // Setup: pool with one calibrated and one uncalibrated image, both placed.
    let s = withPool(IMG_CAL, IMG_NOCAL);
    const pid_cal = panelIdAt(s, 0, 0);
    const pid_nocal = panelIdAt(s, 0, 1);
    s = figureReducer(s, placeIntoPanel("cal", pid_cal));
    s = figureReducer(s, placeIntoPanel("nocal", pid_nocal));
    // Add a valid scale bar on the calibrated panel.
    s = figureReducer(s, addAnnotation(scalebarAnno("sb1", pid_cal)));
    const before = s;
    // Attempt to repoint it onto the uncalibrated panel — must be a no-op.
    s = figureReducer(
      s,
      updateAnnotation("sb1", { panelId: pid_nocal } as Partial<Annotation>),
    );
    expect(s).toBe(before);
    const sb = s.annotations.find((x) => x.id === "sb1");
    expect(sb?.panelId).toBe(pid_cal);
  });

  it("REMOVE_ANNOTATION filters out by id", () => {
    let s = initialFigureState();
    s = figureReducer(s, addAnnotation(textAnno("t1")));
    s = figureReducer(s, addAnnotation(textAnno("t2")));
    s = figureReducer(s, removeAnnotation("t1"));
    expect(s.annotations.map((a) => a.id)).toEqual(["t2"]);
  });

  it("REMOVE_ANNOTATION no-op on unknown id", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, addAnnotation(textAnno("t1")));
    const s2 = figureReducer(s1, removeAnnotation("ghost"));
    expect(s2).toBe(s1);
  });

  it("SET_LETTER_OVERRIDE writes a text override for a panel id", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(s0, setLetterOverride(pid, { text: "A1" }));
    expect(s1.letterOverrides[pid]).toEqual({ text: "A1" });
  });

  it("SET_LETTER_OVERRIDE deletes when override is null", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    let s = figureReducer(s0, setLetterOverride(pid, { text: "A1" }));
    expect(s.letterOverrides[pid]).toEqual({ text: "A1" });
    s = figureReducer(s, setLetterOverride(pid, null));
    expect(s.letterOverrides[pid]).toBeUndefined();
    expect(Object.keys(s.letterOverrides)).not.toContain(pid);
  });

  it("SET_LETTER_OVERRIDE returns a fresh object (not the same reference)", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(s0, setLetterOverride(pid, { text: "X" }));
    expect(s1.letterOverrides).not.toBe(s0.letterOverrides);
  });

  it("SET_LETTER_OVERRIDE writes a style-only override", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(
      s0,
      setLetterOverride(pid, { style: { color: "#FF0000" } }),
    );
    expect(s1.letterOverrides[pid]).toEqual({ style: { color: "#FF0000" } });
  });

  it("SET_LETTER_OVERRIDE collapses an empty override object to a delete", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    // Pre-seed an override to verify the empty payload deletes it.
    let s = figureReducer(s0, setLetterOverride(pid, { text: "A1" }));
    expect(s.letterOverrides[pid]).toEqual({ text: "A1" });
    s = figureReducer(s, setLetterOverride(pid, {}));
    expect(s.letterOverrides[pid]).toBeUndefined();
  });

  it("SET_LETTER_OVERRIDE no-ops when value is unchanged (preserves identity)", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(
      s0,
      setLetterOverride(pid, { text: "A1", style: { color: "#FF0000" } }),
    );
    const s2 = figureReducer(
      s1,
      setLetterOverride(pid, { text: "A1", style: { color: "#FF0000" } }),
    );
    expect(s2).toBe(s1);
  });

  it("SET_LETTER_PATTERN updates the figure-wide pattern", () => {
    const s0 = initialFigureState();
    expect(s0.letterPattern).toBe("uppercase");
    const s1 = figureReducer(s0, {
      type: "SET_LETTER_PATTERN",
      pattern: "numeric",
    });
    expect(s1.letterPattern).toBe("numeric");
    // No-op when set to the same value.
    const s2 = figureReducer(s1, {
      type: "SET_LETTER_PATTERN",
      pattern: "numeric",
    });
    expect(s2).toBe(s1);
  });

  it("CLEAR_ALL_LETTER_OVERRIDES wipes every entry", () => {
    const s0 = initialFigureState();
    const p0 = panelIdAt(s0, 0, 0);
    const p1 = panelIdAt(s0, 0, 1);
    let s = figureReducer(s0, setLetterOverride(p0, { text: "Z" }));
    s = figureReducer(s, setLetterOverride(p1, { style: { bold: false } }));
    expect(Object.keys(s.letterOverrides).length).toBe(2);
    s = figureReducer(s, { type: "CLEAR_ALL_LETTER_OVERRIDES" });
    expect(s.letterOverrides).toEqual({});
  });

  it("SET_GLOBAL_STYLE replaces the global style when colors validate", () => {
    const s0 = initialFigureState();
    const next: GlobalAnnoStyle = {
      letters: {
        ...DEFAULT_GLOBAL_STYLE.letters,
        color: "#112233",
        bgColor: "#445566",
      },
      scalebar: {
        ...DEFAULT_GLOBAL_STYLE.scalebar,
        color: "#778899",
        barColor: "#AABBCC",
      },
    };
    const s1 = figureReducer(s0, setGlobalStyle(next));
    expect(s1.globalStyle.letters.color).toBe("#112233");
    expect(s1.globalStyle.letters.bgColor).toBe("#445566");
    expect(s1.globalStyle.scalebar.color).toBe("#778899");
    expect(s1.globalStyle.scalebar.barColor).toBe("#AABBCC");
  });

  it("SET_GLOBAL_STYLE rejects invalid color", () => {
    const s0 = initialFigureState();
    const bad: GlobalAnnoStyle = {
      ...DEFAULT_GLOBAL_STYLE,
      letters: { ...DEFAULT_GLOBAL_STYLE.letters, color: "purple" },
    };
    const s1 = figureReducer(s0, setGlobalStyle(bad));
    expect(s1).toBe(s0);
  });

  it("SET_LETTERS_ENABLED toggles only the letters.enabled boolean", () => {
    const s0 = initialFigureState();
    expect(s0.globalStyle.letters.enabled).toBe(true);
    const s1 = figureReducer(s0, setLettersEnabled(false));
    expect(s1.globalStyle.letters.enabled).toBe(false);
    // Other fields preserved
    expect(s1.globalStyle.letters.font).toBe(s0.globalStyle.letters.font);
    expect(s1.globalStyle.scalebar).toEqual(s0.globalStyle.scalebar);
  });

  it("SET_LETTERS_ENABLED no-op when value already matches", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, setLettersEnabled(true));
    expect(s1).toBe(s0);
  });

  it("SET_IMAGE_CALIBRATION writes calibration onto a pool item", () => {
    let s = withPool(IMG_NOCAL);
    s = figureReducer(s, setImageCalibration("nocal", CALIBRATION));
    const item = s.pool.find((p) => p.id === "nocal");
    expect(item?.calibration).toEqual(CALIBRATION);
  });

  it("SET_IMAGE_CALIBRATION clears calibration when given null", () => {
    let s = withPool(IMG_CAL);
    s = figureReducer(s, setImageCalibration("cal", null));
    const item = s.pool.find((p) => p.id === "cal");
    expect(item?.calibration).toBeUndefined();
  });

  it("SET_IMAGE_CALIBRATION rejects pixelsPerUnit = 0", () => {
    const s0 = withPool(IMG_NOCAL);
    const s1 = figureReducer(
      s0,
      setImageCalibration("nocal", {
        unit: "um",
        pixelsPerUnit: 0,
        source: "manual",
      }),
    );
    expect(s1).toBe(s0);
  });

  it("SET_IMAGE_CALIBRATION rejects negative or non-finite pixelsPerUnit", () => {
    const s0 = withPool(IMG_NOCAL);
    const s1 = figureReducer(
      s0,
      setImageCalibration("nocal", {
        unit: "um",
        pixelsPerUnit: -1,
        source: "manual",
      }),
    );
    expect(s1).toBe(s0);
    const s2 = figureReducer(
      s0,
      setImageCalibration("nocal", {
        unit: "um",
        pixelsPerUnit: Number.POSITIVE_INFINITY,
        source: "manual",
      }),
    );
    expect(s2).toBe(s0);
  });

  it("SET_IMAGE_CALIBRATION no-op when imageId not in pool", () => {
    const s0 = withPool(IMG_NOCAL);
    const s1 = figureReducer(s0, setImageCalibration("ghost", CALIBRATION));
    expect(s1).toBe(s0);
  });

  it("RESIZE_GRID drops letterOverrides for removed panels", () => {
    const s0 = initialFigureState();
    const pid_outside = panelIdAt(s0, 1, 1);
    const pid_kept = panelIdAt(s0, 0, 0);
    let s = figureReducer(s0, setLetterOverride(pid_outside, { text: "Z" }));
    s = figureReducer(s, setLetterOverride(pid_kept, { text: "A" }));
    s = figureReducer(s, { type: "RESIZE_GRID", rows: 1, cols: 1 } as const);
    expect(s.letterOverrides[pid_outside]).toBeUndefined();
    expect(s.letterOverrides[pid_kept]).toEqual({ text: "A" });
  });

  it("MERGE_CELLS keeps the top-left override on the new merged panel and drops the others", () => {
    const s0 = initialFigureState();
    const pid_tl = panelIdAt(s0, 0, 0);
    const pid_tr = panelIdAt(s0, 0, 1);
    let s = figureReducer(s0, setLetterOverride(pid_tl, { text: "TL" }));
    s = figureReducer(s, setLetterOverride(pid_tr, { text: "TR" }));
    s = figureReducer(s, {
      type: "MERGE_CELLS",
      cells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    } as const);
    const merged = s.panels.find((p) => p.colSpan === 2);
    if (merged === undefined) throw new Error("expected merged");
    expect(s.letterOverrides[merged.id]).toEqual({ text: "TL" });
    // Old per-cell ids should not appear as override keys anymore.
    expect(s.letterOverrides[pid_tl]).toBeUndefined();
    expect(s.letterOverrides[pid_tr]).toBeUndefined();
  });

  it("UNMERGE_PANEL clears the merged panel's override", () => {
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
    s = figureReducer(s, setLetterOverride(merged.id, { text: "MM" }));
    expect(s.letterOverrides[merged.id]).toEqual({ text: "MM" });
    s = figureReducer(s, {
      type: "UNMERGE_PANEL",
      panelId: merged.id,
    } as const);
    expect(s.letterOverrides[merged.id]).toBeUndefined();
  });

  it("REMOVE_FROM_POOL drops scale-bar annotations on affected panel; keeps text/symbol/box", () => {
    let s = withPool(IMG_CAL);
    const pid = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("cal", pid));
    s = figureReducer(s, addAnnotation(scalebarAnno("sb1", pid)));
    s = figureReducer(s, addAnnotation(textAnno("t1", pid)));
    s = figureReducer(s, addAnnotation(symbolAnno("a1", pid)));
    s = figureReducer(s, removeFromPool("cal"));
    const ids = s.annotations.map((a) => a.id).sort();
    expect(ids).toEqual(["a1", "t1"]);
  });

  it("UNPLACE_PANEL drops scale-bar annotations on the freed panel; keeps text/symbol", () => {
    let s = withPool(IMG_CAL);
    const pid = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("cal", pid));
    s = figureReducer(s, addAnnotation(scalebarAnno("sb1", pid)));
    s = figureReducer(s, addAnnotation(textAnno("t1", pid)));
    s = figureReducer(s, addAnnotation(symbolAnno("a1", pid)));
    s = figureReducer(s, unplacePanel(pid));
    const ids = s.annotations.map((a) => a.id).sort();
    expect(ids).toEqual(["a1", "t1"]);
    // Image stays in pool.
    expect(s.pool.map((i) => i.id)).toEqual(["cal"]);
  });
});

describe("RESET_TO_STATE", () => {
  it("replaces the entire FigureState with the provided one", () => {
    __resetPanelIdsForTests();
    const a = initialFigureState();
    const b: FigureState = {
      ...initialFigureState(),
      gutterPx: 99,
      gutterColor: "#123456",
    };
    const next = figureReducer(a, resetToState(b));
    expect(next).toBe(b); // identity preserved — it's a wholesale replace
  });
});

describe("RESET_FIGURE", () => {
  it("returns a fresh initial state regardless of prior state", () => {
    // Reset the panel-id counter before the FIRST initialFigureState() call
    // so its panel ids match the SECOND call's ids inside the reducer.
    __resetPanelIdsForTests();
    const fresh = initialFigureState();

    // Dirty several fields across the FigureState surface so a future
    // partial-reset bug (e.g. forgetting to clear gutterPx, globalStyle, or
    // letterOverrides) gets caught by the toEqual snapshot below.
    let dirty = figureReducer(initialFigureState(), addToPool(IMG_A));
    dirty = figureReducer(dirty, { type: "RESIZE_GRID", rows: 5, cols: 5 });
    dirty = figureReducer(dirty, { type: "SET_GUTTER_PX", gutterPx: 42 });
    dirty = figureReducer(dirty, {
      type: "SET_GUTTER_COLOR",
      gutterColor: "#ABCDEF",
    });
    const dirtyPid = dirty.panels[0]!.id;
    dirty = figureReducer(dirty, addAnnotation(textAnno("t-dirty", dirtyPid)));
    dirty = figureReducer(dirty, setLetterOverride(dirtyPid, { text: "Z9" }));
    dirty = figureReducer(dirty, {
      type: "SET_GLOBAL_STYLE",
      style: {
        ...DEFAULT_GLOBAL_STYLE,
        letters: { ...DEFAULT_GLOBAL_STYLE.letters, enabled: false },
      },
    });

    // Reset the counter again so RESET_FIGURE's own initialFigureState() call
    // produces the same panel ids as `fresh` above.
    __resetPanelIdsForTests();
    const reset = figureReducer(dirty, resetFigureAction());
    expect(reset).toEqual(fresh);
  });
});

describe("figureReducer (hide / delete / restore — spec 02)", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  it("SET_PANEL_HIDDEN sets the flag on an empty panel", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(s0, setPanelHidden(pid, true));
    expect(s1).not.toBe(s0);
    const p = s1.panels.find((x) => x.id === pid);
    expect(p?.hidden).toBe(true);
  });

  it("SET_PANEL_HIDDEN strips the flag rather than storing false", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(s0, setPanelHidden(pid, true));
    const s2 = figureReducer(s1, setPanelHidden(pid, false));
    const p = s2.panels.find((x) => x.id === pid)!;
    expect("hidden" in p).toBe(false);
  });

  it("SET_PANEL_HIDDEN is a no-op when value matches current", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    expect(figureReducer(s0, setPanelHidden(pid, false))).toBe(s0);
  });

  it("SET_PANEL_HIDDEN refuses to hide an image-bearing panel", () => {
    let s = withPool(IMG_A);
    const pid = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", pid));
    const before = s;
    s = figureReducer(s, setPanelHidden(pid, true));
    expect(s).toBe(before);
  });

  it("SET_PANEL_HIDDEN no-ops on unknown panel id", () => {
    const s0 = initialFigureState();
    expect(figureReducer(s0, setPanelHidden("nope", true))).toBe(s0);
  });

  it("DELETE_PANEL removes an empty panel and creates a hole", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 1, 1);
    const s1 = figureReducer(s0, deletePanel(pid));
    expect(s1.panels).toHaveLength(3);
    expect(findPanelAt(s1.panels, 1, 1)).toBeNull();
  });

  it("DELETE_PANEL refuses to delete an image-bearing panel", () => {
    let s = withPool(IMG_A);
    const pid = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", pid));
    const before = s;
    s = figureReducer(s, deletePanel(pid));
    expect(s).toBe(before);
  });

  it("DELETE_PANEL drops the per-panel letter override", () => {
    let s = initialFigureState();
    const pid = panelIdAt(s, 0, 0);
    s = figureReducer(s, setLetterOverride(pid, { text: "Z1" }));
    expect(s.letterOverrides[pid]).toEqual({ text: "Z1" });
    s = figureReducer(s, deletePanel(pid));
    expect(s.letterOverrides[pid]).toBeUndefined();
  });

  it("DELETE_PANEL drops annotations anchored to the deleted panel", () => {
    let s = initialFigureState();
    const pid = panelIdAt(s, 0, 0);
    const otherPid = panelIdAt(s, 1, 1);
    const annoOnDeleted: TextAnnotation = {
      id: "t-on-deleted",
      kind: "text",
      panelId: pid,
      z: 1,
      x: 10,
      y: 10,
      text: "hi",
      font: "system-ui",
      sizePt: 12,
      bold: false,
      italic: false,
      color: "#000000",
    };
    const annoOnOther: TextAnnotation = {
      ...annoOnDeleted,
      id: "t-on-other",
      panelId: otherPid,
    };
    s = figureReducer(s, addAnnotation(annoOnDeleted));
    s = figureReducer(s, addAnnotation(annoOnOther));
    s = figureReducer(s, deletePanel(pid));
    expect(s.annotations.map((a) => a.id)).toEqual(["t-on-other"]);
  });

  it("DELETE_PANEL no-ops on unknown panel id", () => {
    const s0 = initialFigureState();
    expect(figureReducer(s0, deletePanel("nope"))).toBe(s0);
  });

  it("RESTORE_PANEL_AT mints a fresh 1x1 panel at a hole", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 1, 1);
    const s1 = figureReducer(s0, deletePanel(pid));
    const s2 = figureReducer(s1, restorePanelAt(1, 1));
    expect(s2.panels).toHaveLength(4);
    const restored = findPanelAt(s2.panels, 1, 1);
    expect(restored).not.toBeNull();
    expect(restored!.rowSpan).toBe(1);
    expect(restored!.colSpan).toBe(1);
    expect(restored!.id).not.toBe(pid);
  });

  it("RESTORE_PANEL_AT keeps panels sorted in row-major order", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 1);
    const s1 = figureReducer(s0, deletePanel(pid));
    const s2 = figureReducer(s1, restorePanelAt(0, 1));
    const coords = s2.panels.map((p) => [p.row, p.col]);
    expect(coords).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
  });

  it("RESTORE_PANEL_AT no-ops on a covered cell", () => {
    const s0 = initialFigureState();
    expect(figureReducer(s0, restorePanelAt(0, 0))).toBe(s0);
  });

  it("RESTORE_PANEL_AT no-ops on out-of-bounds coords", () => {
    const s0 = initialFigureState();
    expect(figureReducer(s0, restorePanelAt(-1, 0))).toBe(s0);
    expect(figureReducer(s0, restorePanelAt(0, 99))).toBe(s0);
    expect(figureReducer(s0, restorePanelAt(2.5, 0))).toBe(s0);
  });
});

describe("figureReducer (bulk annotation actions)", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  function withAnnos(...annos: Annotation[]): FigureState {
    let s = initialFigureState();
    for (const a of annos) s = figureReducer(s, addAnnotation(a));
    return s;
  }

  it("BULK_UPDATE_ANNOS applies common keys across mixed kinds", () => {
    const s0 = withAnnos(textAnno("t1"), symbolAnno("s1"));
    const s1 = figureReducer(
      s0,
      bulkUpdateAnnos(["t1", "s1"], {
        color: "#123456",
      } as Partial<Annotation>),
    );
    const t = s1.annotations.find((a) => a.id === "t1") as TextAnnotation;
    const sym = s1.annotations.find((a) => a.id === "s1") as SymbolAnnotation;
    expect(t.color).toBe("#123456");
    expect(sym.color).toBe("#123456");
  });

  it("BULK_UPDATE_ANNOS drops keys invalid for some kinds (heterogeneous patch)", () => {
    const s0 = withAnnos(textAnno("t1"), symbolAnno("s1"));
    const s1 = figureReducer(
      s0,
      // 'sizePt' valid for text only; 'strokeWidthPx' valid for symbol only.
      bulkUpdateAnnos(["t1", "s1"], {
        sizePt: 24,
        strokeWidthPx: 5,
      } as Partial<Annotation>),
    );
    const t = s1.annotations.find((a) => a.id === "t1") as TextAnnotation;
    const sym = s1.annotations.find((a) => a.id === "s1") as SymbolAnnotation;
    expect(t.sizePt).toBe(24); // applied to text
    expect(sym.strokeWidthPx).toBe(5); // applied to symbol
    expect((t as unknown as { strokeWidthPx?: number }).strokeWidthPx).toBeUndefined();
  });

  it("BULK_UPDATE_ANNOS no-ops when no patch keys are valid for any selected anno", () => {
    const s0 = withAnnos(textAnno("t1"));
    const s1 = figureReducer(
      s0,
      bulkUpdateAnnos(["t1"], { strokeWidthPx: 9 } as Partial<Annotation>),
    );
    expect(s1).toBe(s0);
  });

  it("BULK_UPDATE_ANNOS no-ops on empty ids", () => {
    const s0 = withAnnos(textAnno("t1"));
    expect(
      figureReducer(
        s0,
        bulkUpdateAnnos([], { color: "#abcdef" } as Partial<Annotation>),
      ),
    ).toBe(s0);
  });

  it("BULK_UPDATE_ANNOS strips id and kind from the patch", () => {
    const s0 = withAnnos(textAnno("t1"));
    const s1 = figureReducer(
      s0,
      bulkUpdateAnnos(["t1"], {
        id: "hijack",
        kind: "symbol",
        color: "#abcdef",
      } as unknown as Partial<Annotation>),
    );
    const t = s1.annotations.find((a) => a.id === "t1") as TextAnnotation;
    expect(t.id).toBe("t1");
    expect(t.kind).toBe("text");
    expect(t.color).toBe("#abcdef");
  });

  it("BULK_UPDATE_ANNOS skips ids not in state", () => {
    const s0 = withAnnos(textAnno("t1"));
    const s1 = figureReducer(
      s0,
      bulkUpdateAnnos(["t1", "ghost"], {
        color: "#222222",
      } as Partial<Annotation>),
    );
    const t = s1.annotations.find((a) => a.id === "t1") as TextAnnotation;
    expect(t.color).toBe("#222222");
    expect(s1.annotations).toHaveLength(1);
  });

  it("BULK_REMOVE_ANNOS removes only the listed ids", () => {
    const s0 = withAnnos(textAnno("t1"), symbolAnno("s1"), textAnno("t2"));
    const s1 = figureReducer(s0, bulkRemoveAnnos(["t1", "s1"]));
    expect(s1.annotations.map((a) => a.id)).toEqual(["t2"]);
  });

  it("BULK_REMOVE_ANNOS no-ops on empty ids", () => {
    const s0 = withAnnos(textAnno("t1"));
    expect(figureReducer(s0, bulkRemoveAnnos([]))).toBe(s0);
  });

  it("BULK_REMOVE_ANNOS no-ops when no ids match", () => {
    const s0 = withAnnos(textAnno("t1"));
    expect(figureReducer(s0, bulkRemoveAnnos(["ghost1", "ghost2"]))).toBe(s0);
  });
});

describe("SET_TRACK_WEIGHT", () => {
  it("adjusts col weights pairwise and preserves their sum", () => {
    __resetPanelIdsForTests();
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, setTrackWeightAction("col", 0, 0.7));
    if (s1.layout.kind !== "uniform") throw new Error("unreachable");
    expect(s1.layout.colWeights).toEqual([0.7, 0.3]);
    expect(s1.layout.rowWeights).toEqual([0.5, 0.5]);
  });

  it("returns ===-same state when value is unchanged", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, setTrackWeightAction("col", 0, 0.5));
    expect(s1).toBe(s0);
  });

  it("is a no-op when layout is free-form", () => {
    const s0 = initialFigureState();
    const free: FigureState = {
      ...s0,
      layout: {
        kind: "free",
        rects: { x: { x: 0, y: 0, w: 100, h: 100 } },
      },
    };
    const s1 = figureReducer(free, setTrackWeightAction("col", 0, 0.7));
    expect(s1).toBe(free);
  });

  it("rejects out-of-range index as a no-op", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, setTrackWeightAction("col", 5, 0.7));
    expect(s1).toBe(s0);
  });
});

describe("RESIZE_PANEL_FREEFORM", () => {
  // Use outerGutter=false with no gutter so the math is clean: panels are
  // exactly 400×300 in an 800×600 canvas. Avoids gutter-vs-edge ambiguity.
  function freshFreeformState(): FigureState {
    __resetPanelIdsForTests();
    const s = initialFigureState();
    return {
      ...s,
      gutterPx: 0,
      outerGutter: false,
    };
  }

  it("uniform corner-drag adjusts col/row weights — layout stays uniform", () => {
    const s0 = freshFreeformState();
    const s1 = figureReducer(
      s0,
      resizePanelFreeformAction("panel-1", "br", 50, 50, {
        widthPx: 800,
        heightPx: 600,
      }),
    );
    expect(s1.layout.kind).toBe("uniform");
    if (s1.layout.kind !== "uniform") throw new Error("unreachable");
    // gutter=0, outerGutter=false → availW=800, availH=600.
    // dx=50 → ∆weight=50/800=0.0625 transferred from col 1 to col 0.
    expect(s1.layout.colWeights[0]).toBeCloseTo(0.5 + 50 / 800, 10);
    expect(s1.layout.colWeights[1]).toBeCloseTo(0.5 - 50 / 800, 10);
    // dy=50 → ∆weight=50/600 transferred from row 1 to row 0.
    expect(s1.layout.rowWeights[0]).toBeCloseTo(0.5 + 50 / 600, 10);
    expect(s1.layout.rowWeights[1]).toBeCloseTo(0.5 - 50 / 600, 10);
  });

  it("subsequent corner-drag accumulates into the same uniform weights", () => {
    const s0 = freshFreeformState();
    const s1 = figureReducer(
      s0,
      resizePanelFreeformAction("panel-1", "br", 10, 0, {
        widthPx: 800,
        heightPx: 600,
      }),
    );
    if (s1.layout.kind !== "uniform") throw new Error("unreachable");
    const w1 = s1.layout.colWeights[0]!;
    const s2 = figureReducer(
      s1,
      resizePanelFreeformAction("panel-1", "br", 5, 0, {
        widthPx: 800,
        heightPx: 600,
      }),
    );
    if (s2.layout.kind !== "uniform") throw new Error("unreachable");
    // Each drag adds dx/availW to col 0's weight.
    expect(s2.layout.colWeights[0]).toBeCloseTo(w1 + 5 / 800, 10);
  });

  it("is a no-op when target panel is missing", () => {
    const s0 = freshFreeformState();
    const s1 = figureReducer(
      s0,
      resizePanelFreeformAction("nope", "br", 50, 50, {
        widthPx: 800,
        heightPx: 600,
      }),
    );
    expect(s1).toBe(s0);
  });
});

describe("RESET_TO_UNIFORM_GRID", () => {
  it("rebuilds equal weights from current rows/cols and discards rects", () => {
    __resetPanelIdsForTests();
    const s0 = {
      ...initialFigureState(),
      gutterPx: 0,
      outerGutter: false,
    };
    const s1 = figureReducer(
      s0,
      resizePanelFreeformAction("panel-1", "br", 50, 50, {
        widthPx: 800,
        heightPx: 600,
      }),
    );
    const s2 = figureReducer(s1, resetToUniformGridAction());
    expect(s2.layout.kind).toBe("uniform");
    if (s2.layout.kind !== "uniform") throw new Error("unreachable");
    expect(s2.layout.colWeights).toEqual([0.5, 0.5]);
    expect(s2.layout.rowWeights).toEqual([0.5, 0.5]);
  });

  it("is a ===-no-op when already uniform with equal weights", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, resetToUniformGridAction());
    expect(s1).toBe(s0);
  });
});

describe("layout housekeeping across grid mutations", () => {
  it("RESIZE_GRID rebuilds uniform weights to the new dims", () => {
    __resetPanelIdsForTests();
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, resizeGrid(3, 4));
    expect(s1.layout.kind).toBe("uniform");
    if (s1.layout.kind !== "uniform") throw new Error("unreachable");
    expect(s1.layout.colWeights.length).toBe(4);
    expect(s1.layout.rowWeights.length).toBe(3);
    expect(s1.layout.colWeights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("RESIZE_GRID drops free-form layout and reverts to uniform", () => {
    __resetPanelIdsForTests();
    // Build a free-form state directly. Corner-drag no longer produces free
    // mode — only legacy saved projects can — so we construct one here.
    const sFree: FigureState = {
      ...initialFigureState(),
      gutterPx: 0,
      outerGutter: false,
      layout: {
        kind: "free",
        rects: {
          "panel-1": { x: 0, y: 0, w: 450, h: 350 },
          "panel-2": { x: 450, y: 0, w: 350, h: 300 },
          "panel-3": { x: 0, y: 350, w: 400, h: 250 },
          "panel-4": { x: 450, y: 350, w: 350, h: 250 },
        },
      },
    };
    const sResized = figureReducer(sFree, resizeGrid(3, 3));
    expect(sResized.layout.kind).toBe("uniform");
  });

  it("DELETE_PANEL drops the panel's rect from a free layout", () => {
    __resetPanelIdsForTests();
    const sFree: FigureState = {
      ...initialFigureState(),
      gutterPx: 0,
      outerGutter: false,
      layout: {
        kind: "free",
        rects: {
          "panel-1": { x: 0, y: 0, w: 410, h: 310 },
          "panel-2": { x: 410, y: 0, w: 390, h: 300 },
          "panel-3": { x: 0, y: 310, w: 400, h: 290 },
          "panel-4": { x: 410, y: 310, w: 390, h: 290 },
        },
      },
    };
    expect(sFree.layout.kind).toBe("free");
    if (sFree.layout.kind !== "free") throw new Error("unreachable");
    expect(sFree.layout.rects["panel-2"]).toBeDefined();
    const sDeleted = figureReducer(sFree, deletePanel("panel-2"));
    if (sDeleted.layout.kind !== "free") throw new Error("unreachable");
    expect(sDeleted.layout.rects["panel-2"]).toBeUndefined();
  });

  it("MERGE_CELLS resets layout to uniform (merged panels invalidate rects)", () => {
    __resetPanelIdsForTests();
    const s0 = {
      ...initialFigureState(),
      gutterPx: 0,
      outerGutter: false,
    };
    const sFree = figureReducer(
      s0,
      resizePanelFreeformAction("panel-1", "br", 10, 10, {
        widthPx: 800,
        heightPx: 600,
      }),
    );
    const sMerged = figureReducer(
      sFree,
      mergeCells([
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ]),
    );
    expect(sMerged.layout.kind).toBe("uniform");
  });

  it("UNMERGE_PANEL reverts layout to uniform", () => {
    __resetPanelIdsForTests();
    const s0 = initialFigureState();
    const sMerged = figureReducer(
      s0,
      mergeCells([
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ]),
    );
    // After merge, the merged panel has a fresh id. Find it.
    const merged = sMerged.panels.find((p) => p.colSpan === 2);
    expect(merged).toBeDefined();
    if (merged === undefined) return;
    const sUnmerged = figureReducer(sMerged, unmergePanelAction(merged.id));
    expect(sUnmerged.layout.kind).toBe("uniform");
  });
});
