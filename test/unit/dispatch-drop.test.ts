import { describe, it, expect } from "vitest";
import type { ImagePoolItem } from "../../src/renderer/model/pool";
import {
  cellKey,
  initialFigureState,
  type FigureState,
} from "../../src/renderer/model/figure-state";
import { dispatchDrop } from "../../src/renderer/dnd/dispatch-drop";

const A: ImagePoolItem = {
  id: "a",
  filename: "a.png",
  filePath: "/a.png",
  mime: "image/png",
  width: 1,
  height: 1,
};
const B: ImagePoolItem = {
  ...A,
  id: "b",
  filename: "b.png",
  filePath: "/b.png",
};

function withPool(...items: ImagePoolItem[]): FigureState {
  const s = initialFigureState();
  return { ...s, pool: items };
}

describe("dispatchDrop", () => {
  it("tray → empty cell ⇒ PLACE_FROM_TRAY", () => {
    const s = withPool(A);
    const r = dispatchDrop(s, {
      from: { kind: "tray", imageId: "a" },
      target: { row: 0, col: 0 },
    });
    expect(r).toEqual({
      type: "PLACE_FROM_TRAY",
      imageId: "a",
      target: { row: 0, col: 0 },
    });
  });

  it("tray → occupied cell ⇒ REPLACE_FROM_TRAY", () => {
    const s = withPool(A, B);
    s.placements.set(cellKey(0, 0), "a");
    const r = dispatchDrop(s, {
      from: { kind: "tray", imageId: "b" },
      target: { row: 0, col: 0 },
    });
    expect(r).toEqual({
      type: "REPLACE_FROM_TRAY",
      imageId: "b",
      target: { row: 0, col: 0 },
    });
  });

  it("cell → cell ⇒ SWAP_CELLS", () => {
    const s = withPool(A);
    s.placements.set(cellKey(0, 0), "a");
    const r = dispatchDrop(s, {
      from: { kind: "cell", row: 0, col: 0 },
      target: { row: 1, col: 1 },
    });
    expect(r).toEqual({
      type: "SWAP_CELLS",
      a: { row: 0, col: 0 },
      b: { row: 1, col: 1 },
    });
  });

  it("cell → same cell ⇒ null", () => {
    const r = dispatchDrop(initialFigureState(), {
      from: { kind: "cell", row: 0, col: 0 },
      target: { row: 0, col: 0 },
    });
    expect(r).toBe(null);
  });

  it("tray → cell where image already placed elsewhere ⇒ null", () => {
    const s = withPool(A);
    s.placements.set(cellKey(0, 1), "a");
    const r = dispatchDrop(s, {
      from: { kind: "tray", imageId: "a" },
      target: { row: 1, col: 0 },
    });
    expect(r).toBe(null);
  });
});
