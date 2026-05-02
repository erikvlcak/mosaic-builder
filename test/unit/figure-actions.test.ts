import { describe, it, expect } from "vitest";
import type { ImagePoolItem } from "../../src/renderer/model/pool";
import {
  initialFigureState,
  figureReducer,
  cellKey,
  type FigureState,
} from "../../src/renderer/model/figure-state";
import {
  addToPool,
  placeFromTray,
  swapCells,
  replaceFromTray,
  removeFromPool,
} from "../../src/renderer/model/figure-actions";

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

describe("figureReducer", () => {
  it("ADD_TO_POOL appends to pool, no placement", () => {
    const s = figureReducer(initialFigureState(), addToPool(IMG_A));
    expect(s.pool).toEqual([IMG_A]);
    expect(s.placements.size).toBe(0);
  });

  it("ADD_TO_POOL ignores duplicate ids", () => {
    let s = figureReducer(initialFigureState(), addToPool(IMG_A));
    s = figureReducer(s, addToPool(IMG_A));
    expect(s.pool).toHaveLength(1);
  });

  it("PLACE_FROM_TRAY into empty cell sets placement", () => {
    const s0 = withPool(IMG_A);
    const s1 = figureReducer(s0, placeFromTray("a", { row: 0, col: 1 }));
    expect(s1.placements.get(cellKey(0, 1))).toBe("a");
  });

  it("PLACE_FROM_TRAY no-op when image not in pool", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, placeFromTray("ghost", { row: 0, col: 0 }));
    expect(s1).toBe(s0);
  });

  it("SWAP_CELLS swaps two occupied cells", () => {
    let s = withPool(IMG_A, IMG_B);
    s = figureReducer(s, placeFromTray("a", { row: 0, col: 0 }));
    s = figureReducer(s, placeFromTray("b", { row: 1, col: 1 }));
    s = figureReducer(s, swapCells({ row: 0, col: 0 }, { row: 1, col: 1 }));
    expect(s.placements.get(cellKey(0, 0))).toBe("b");
    expect(s.placements.get(cellKey(1, 1))).toBe("a");
  });

  it("SWAP_CELLS moves image into empty cell when one side is empty", () => {
    let s = withPool(IMG_A);
    s = figureReducer(s, placeFromTray("a", { row: 0, col: 0 }));
    s = figureReducer(s, swapCells({ row: 0, col: 0 }, { row: 0, col: 1 }));
    expect(s.placements.has(cellKey(0, 0))).toBe(false);
    expect(s.placements.get(cellKey(0, 1))).toBe("a");
  });

  it("SWAP_CELLS is a no-op when source equals target", () => {
    let s = withPool(IMG_A);
    s = figureReducer(s, placeFromTray("a", { row: 0, col: 0 }));
    const s2 = figureReducer(
      s,
      swapCells({ row: 0, col: 0 }, { row: 0, col: 0 }),
    );
    expect(s2).toBe(s);
  });

  it("REPLACE_FROM_TRAY puts new image in cell, kicked image stays in pool unplaced", () => {
    let s = withPool(IMG_A, IMG_B);
    s = figureReducer(s, placeFromTray("a", { row: 0, col: 0 }));
    s = figureReducer(s, replaceFromTray("b", { row: 0, col: 0 }));
    expect(s.placements.get(cellKey(0, 0))).toBe("b");
    const placedIds = new Set(s.placements.values());
    expect(placedIds.has("a")).toBe(false);
    expect(s.pool.map((i) => i.id)).toContain("a");
  });

  it("REMOVE_FROM_POOL drops the item and clears any placement", () => {
    let s = withPool(IMG_A, IMG_B);
    s = figureReducer(s, placeFromTray("a", { row: 0, col: 0 }));
    s = figureReducer(s, removeFromPool("a"));
    expect(s.pool.map((i) => i.id)).toEqual(["b"]);
    expect(s.placements.has(cellKey(0, 0))).toBe(false);
  });
});
