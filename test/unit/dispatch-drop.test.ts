import { describe, it, expect, beforeEach } from "vitest";
import {
  initialFigureState,
  figureReducer,
  __resetPanelIdsForTests,
  type FigureState,
} from "../../src/renderer/model/figure-state";
import { addToPool, placeIntoPanel } from "../../src/renderer/model/figure-actions";
import { findPanelAt } from "../../src/renderer/model/panels";
import { dispatchDrop } from "../../src/renderer/dnd/dispatch-drop";
import type { ImagePoolItem } from "../../src/renderer/model/pool";

const IMG_A: ImagePoolItem = {
  id: "a", filename: "a.png", filePath: "/x", mime: "image/png", width: 1, height: 1,
};
const IMG_B: ImagePoolItem = {
  id: "b", filename: "b.png", filePath: "/x", mime: "image/png", width: 1, height: 1,
};

function panelIdAt(s: FigureState, row: number, col: number): string {
  const p = findPanelAt(s.panels, row, col);
  if (p === null) throw new Error("no panel");
  return p.id;
}

describe("dispatchDrop", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  it("tray → empty panel emits PLACE_INTO_PANEL", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    const pid = panelIdAt(s, 0, 0);
    const action = dispatchDrop(s, {
      from: { kind: "tray", imageId: "a" },
      targetPanelId: pid,
    });
    expect(action).toEqual({ type: "PLACE_INTO_PANEL", imageId: "a", panelId: pid });
  });

  it("tray → occupied panel emits REPLACE_INTO_PANEL", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    s = figureReducer(s, addToPool(IMG_B));
    const pid = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", pid));
    const action = dispatchDrop(s, {
      from: { kind: "tray", imageId: "b" },
      targetPanelId: pid,
    });
    expect(action).toEqual({
      type: "REPLACE_INTO_PANEL",
      imageId: "b",
      panelId: pid,
    });
  });

  it("tray drop with already-placed image is no-op", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 0, 1);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const action = dispatchDrop(s, {
      from: { kind: "tray", imageId: "a" },
      targetPanelId: p2,
    });
    expect(action).toBe(null);
  });

  it("panel → other panel emits SWAP_PANELS", () => {
    const s = initialFigureState();
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 1, 1);
    const action = dispatchDrop(s, {
      from: { kind: "panel", panelId: p1 },
      targetPanelId: p2,
    });
    expect(action).toEqual({ type: "SWAP_PANELS", aPanelId: p1, bPanelId: p2 });
  });

  it("panel → same panel is no-op", () => {
    const s = initialFigureState();
    const p1 = panelIdAt(s, 0, 0);
    const action = dispatchDrop(s, {
      from: { kind: "panel", panelId: p1 },
      targetPanelId: p1,
    });
    expect(action).toBe(null);
  });
});
