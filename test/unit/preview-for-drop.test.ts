import { describe, it, expect, beforeEach } from "vitest";
import {
  initialFigureState,
  figureReducer,
  __resetPanelIdsForTests,
  type FigureState,
} from "../../src/renderer/model/figure-state";
import {
  addToPool,
  placeIntoPanel,
} from "../../src/renderer/model/figure-actions";
import { findPanelAt } from "../../src/renderer/model/panels";
import { previewForDrop } from "../../src/renderer/dnd/preview-for-drop";
import type { ImagePoolItem } from "../../src/renderer/model/pool";

const IMG_A: ImagePoolItem = {
  id: "a",
  filename: "a.png",
  filePath: "/x",
  mime: "image/png",
  width: 1,
  height: 1,
  bitDepth: 8,
};
const IMG_B: ImagePoolItem = {
  id: "b",
  filename: "b.png",
  filePath: "/x",
  mime: "image/png",
  width: 1,
  height: 1,
  bitDepth: 8,
};

function panelIdAt(s: FigureState, row: number, col: number): string {
  const p = findPanelAt(s.panels, row, col);
  if (p === null) throw new Error("no panel");
  return p.id;
}

describe("previewForDrop", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  it("null hover → invalid", () => {
    const s = initialFigureState();
    const r = previewForDrop(s, { kind: "tray", imageId: "a" }, null);
    expect(r).toEqual({ valid: false });
  });

  it("tray onto empty panel → valid, ghosts the dragged image", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    const pid = panelIdAt(s, 0, 0);
    const r = previewForDrop(s, { kind: "tray", imageId: "a" }, pid);
    expect(r).toEqual({ valid: true, targetImageId: "a" });
  });

  it("tray onto occupied panel → valid, replace preview", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    s = figureReducer(s, addToPool(IMG_B));
    const pid = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", pid));
    const r = previewForDrop(s, { kind: "tray", imageId: "b" }, pid);
    expect(r).toEqual({ valid: true, targetImageId: "b" });
  });

  it("tray drag of a placed image onto its OWN panel → invalid", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const r = previewForDrop(s, { kind: "tray", imageId: "a" }, p1);
    expect(r).toEqual({ valid: false });
  });

  it("tray drag of a placed image onto a different EMPTY panel → valid, no sourceGhost", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 0, 1);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const r = previewForDrop(s, { kind: "tray", imageId: "a" }, p2);
    expect(r).toEqual({ valid: true, targetImageId: "a" });
  });

  it("tray drag of a placed image onto a different OCCUPIED panel → valid with sourceGhost", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    s = figureReducer(s, addToPool(IMG_B));
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 0, 1);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, placeIntoPanel("b", p2));
    const r = previewForDrop(s, { kind: "tray", imageId: "a" }, p2);
    expect(r).toEqual({
      valid: true,
      targetImageId: "a",
      sourceGhost: { panelId: p1, imageId: "b" },
    });
  });
});
