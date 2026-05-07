import { describe, it, expect, beforeEach } from "vitest";
import type { ImagePoolItem, Calibration } from "../../src/renderer/model/pool";
import type {
  Annotation,
  TextAnnotation,
  ArrowAnnotation,
  BoxAnnotation,
  ScaleBarAnnotation,
} from "../../src/renderer/model/annotations";
import { DEFAULT_GLOBAL_STYLE, type GlobalAnnoStyle } from "../../src/renderer/model/global-style";
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
  setLetterOverride,
  setGlobalStyle,
  setLettersEnabled,
  setImageCalibration,
  setGutterPx,
  resizeGrid,
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
function arrowAnno(id: string, panelId?: string): ArrowAnnotation {
  return {
    id,
    kind: "arrow",
    z: 0,
    panelId,
    x1: 0,
    y1: 0,
    x2: 50,
    y2: 50,
    color: "#FF0000",
    thicknessPx: 2,
    head: "filled",
  };
}
function boxAnno(id: string, panelId?: string): BoxAnnotation {
  return {
    id,
    kind: "box",
    z: 0,
    panelId,
    x: 0,
    y: 0,
    w: 30,
    h: 30,
    stroke: "#00FF00",
    strokeWidthPx: 1,
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

  it("ADD_ANNOTATION adds an arrow annotation", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const ann = arrowAnno("a1", pid);
    const s1 = figureReducer(s0, addAnnotation(ann));
    expect(s1.annotations).toEqual([ann]);
  });

  it("ADD_ANNOTATION adds a box annotation", () => {
    const s0 = initialFigureState();
    const ann = boxAnno("b1");
    const s1 = figureReducer(s0, addAnnotation(ann));
    expect(s1.annotations).toEqual([ann]);
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
      updateAnnotation("t1", { x: 99, color: "#112233" } as Partial<Annotation>),
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
      updateAnnotation("t1", { kind: "arrow" } as Partial<Annotation>),
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

  it("SET_LETTER_OVERRIDE writes a value for a panel id", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(s0, setLetterOverride(pid, "A1"));
    expect(s1.letterOverrides[pid]).toBe("A1");
  });

  it("SET_LETTER_OVERRIDE deletes when override is null", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    let s = figureReducer(s0, setLetterOverride(pid, "A1"));
    expect(s.letterOverrides[pid]).toBe("A1");
    s = figureReducer(s, setLetterOverride(pid, null));
    expect(s.letterOverrides[pid]).toBeUndefined();
    expect(Object.keys(s.letterOverrides)).not.toContain(pid);
  });

  it("SET_LETTER_OVERRIDE returns a fresh object (not the same reference)", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(s0, setLetterOverride(pid, "X"));
    expect(s1.letterOverrides).not.toBe(s0.letterOverrides);
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
    let s = figureReducer(s0, setLetterOverride(pid_outside, "Z"));
    s = figureReducer(s, setLetterOverride(pid_kept, "A"));
    s = figureReducer(s, { type: "RESIZE_GRID", rows: 1, cols: 1 } as const);
    expect(s.letterOverrides[pid_outside]).toBeUndefined();
    expect(s.letterOverrides[pid_kept]).toBe("A");
  });

  it("MERGE_CELLS keeps the top-left override on the new merged panel and drops the others", () => {
    const s0 = initialFigureState();
    const pid_tl = panelIdAt(s0, 0, 0);
    const pid_tr = panelIdAt(s0, 0, 1);
    let s = figureReducer(s0, setLetterOverride(pid_tl, "TL"));
    s = figureReducer(s, setLetterOverride(pid_tr, "TR"));
    s = figureReducer(s, {
      type: "MERGE_CELLS",
      cells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    } as const);
    const merged = s.panels.find((p) => p.colSpan === 2);
    if (merged === undefined) throw new Error("expected merged");
    expect(s.letterOverrides[merged.id]).toBe("TL");
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
    s = figureReducer(s, setLetterOverride(merged.id, "MM"));
    expect(s.letterOverrides[merged.id]).toBe("MM");
    s = figureReducer(s, { type: "UNMERGE_PANEL", panelId: merged.id } as const);
    expect(s.letterOverrides[merged.id]).toBeUndefined();
  });

  it("REMOVE_FROM_POOL drops scale-bar annotations on affected panel; keeps text/arrow/box", () => {
    let s = withPool(IMG_CAL);
    const pid = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("cal", pid));
    s = figureReducer(s, addAnnotation(scalebarAnno("sb1", pid)));
    s = figureReducer(s, addAnnotation(textAnno("t1", pid)));
    s = figureReducer(s, addAnnotation(arrowAnno("a1", pid)));
    s = figureReducer(s, addAnnotation(boxAnno("b1", pid)));
    s = figureReducer(s, removeFromPool("cal"));
    const ids = s.annotations.map((a) => a.id).sort();
    expect(ids).toEqual(["a1", "b1", "t1"]);
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
    dirty = figureReducer(dirty, setLetterOverride(dirtyPid, "Z9"));
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

describe("figureReducer — canvas auto-resize (Task 4)", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  const BIG: ImagePoolItem = {
    id: "big",
    filename: "big.png",
    filePath: "/big.png",
    mime: "image/png",
    width: 4000,
    height: 3000,
    bitDepth: 8,
  };

  it("ADD_TO_POOL grows canvas to fit the largest image (per cell)", () => {
    const s0 = initialFigureState(); // 2x2, gutter 12, canvas 800x600
    const s1 = figureReducer(s0, addToPool(BIG));
    // 2 cols * 4000 + 3 * 12 = 8036
    expect(s1.canvas.widthPx).toBe(2 * 4000 + 3 * 12);
    // 2 rows * 3000 + 3 * 12 = 6036
    expect(s1.canvas.heightPx).toBe(2 * 3000 + 3 * 12);
  });

  it("ADD_TO_POOL scales existing annotations proportionally", () => {
    const text: Annotation = {
      id: "t1",
      kind: "text",
      z: 1,
      x: 100,
      y: 100,
      text: "hi",
      font: "system-ui",
      sizePt: 12,
      bold: false,
      italic: false,
      color: "#000000",
    };
    let s = figureReducer(initialFigureState(), addAnnotation(text));
    expect(s.annotations[0]).toMatchObject({ x: 100, y: 100 });
    // canvas was 800x600; after adding BIG it becomes 8036x6036 → sx≈10.045, sy≈10.06
    s = figureReducer(s, addToPool(BIG));
    const sx = s.canvas.widthPx / 800;
    const sy = s.canvas.heightPx / 600;
    expect((s.annotations[0] as TextAnnotation).x).toBeCloseTo(100 * sx, 6);
    expect((s.annotations[0] as TextAnnotation).y).toBeCloseTo(100 * sy, 6);
  });

  it("REMOVE_FROM_POOL shrinks the canvas back when the largest image is removed", () => {
    let s = figureReducer(initialFigureState(), addToPool(BIG));
    expect(s.canvas.widthPx).toBeGreaterThan(800);
    s = figureReducer(s, removeFromPool(BIG.id));
    expect(s.canvas).toEqual({ widthPx: 800, heightPx: 600 });
  });

  it("RESIZE_GRID recomputes canvas when cols change", () => {
    const s0 = figureReducer(initialFigureState(), addToPool(BIG));
    // resize to 3 cols → widthPx = 3*4000 + 4*12 = 12048
    const s1 = figureReducer(s0, resizeGrid(2, 3));
    expect(s1.canvas.widthPx).toBe(3 * 4000 + 4 * 12);
  });

  it("SET_GUTTER_PX recomputes canvas", () => {
    const s0 = figureReducer(initialFigureState(), addToPool(BIG));
    // gutter 0 → widthPx = 2*4000 = 8000
    const s1 = figureReducer(s0, setGutterPx(0));
    expect(s1.canvas.widthPx).toBe(2 * 4000);
  });

  it("does not modify state.canvas when ADD_TO_POOL is a duplicate (no-op)", () => {
    let s = figureReducer(initialFigureState(), addToPool(BIG));
    const before = s.canvas;
    s = figureReducer(s, addToPool(BIG)); // dedupe path
    expect(s.canvas).toBe(before);
  });
});
