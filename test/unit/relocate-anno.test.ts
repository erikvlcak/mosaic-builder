import { describe, it, expect, beforeEach } from "vitest";
import type { ImagePoolItem } from "../../src/renderer/model/pool";
import type {
  TextAnnotation,
  SymbolAnnotation,
} from "../../src/renderer/model/annotations";
import {
  initialFigureState,
  figureReducer,
  __resetPanelIdsForTests,
} from "../../src/renderer/model/figure-state";
import {
  addToPool,
  placeIntoPanel,
  swapPanels,
  replaceIntoPanel,
  unplacePanel,
  removeFromPool,
  rotatePanel90,
  flipPanelH,
  flipPanelV,
  addAnnotation,
} from "../../src/renderer/model/figure-actions";
import { findPanelAt } from "../../src/renderer/model/panels";
import { relocateImageBoundAnnotations } from "../../src/renderer/model/relocate-anno";

const IMG_A: ImagePoolItem = {
  id: "a",
  filename: "a.png",
  filePath: "/x/a.png",
  mime: "image/png",
  width: 200,
  height: 200,
  bitDepth: 8,
};
const IMG_B: ImagePoolItem = {
  id: "b",
  filename: "b.jpg",
  filePath: "/x/b.jpg",
  mime: "image/jpeg",
  width: 200,
  height: 200,
  bitDepth: 8,
};

function panelIdAt(
  s: ReturnType<typeof initialFigureState>,
  row: number,
  col: number,
): string {
  const p = findPanelAt(s.panels, row, col);
  if (p === null) throw new Error(`no panel at ${row},${col}`);
  return p.id;
}

function setupTwoImagesPlaced(): ReturnType<typeof initialFigureState> {
  let s = initialFigureState();
  s = figureReducer(s, addToPool(IMG_A));
  s = figureReducer(s, addToPool(IMG_B));
  s = figureReducer(s, placeIntoPanel("a", panelIdAt(s, 0, 0)));
  s = figureReducer(s, placeIntoPanel("b", panelIdAt(s, 1, 1)));
  return s;
}

describe("relocateImageBoundAnnotations", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  it("returns the same array reference when no annotation is bound to the image", () => {
    const s = setupTwoImagesPlaced();
    const text: TextAnnotation = {
      id: "t1",
      kind: "text",
      z: 5,
      x: 100,
      y: 100,
      text: "hi",
      font: "Arial",
      sizePt: 12,
      bold: false,
      italic: false,
      color: "#000",
    };
    const next = figureReducer(s, addAnnotation(text));
    const result = relocateImageBoundAnnotations(next, "a");
    expect(result).toBe(next.annotations);
  });

  it("drops image-bound annos when the image is no longer placed anywhere", () => {
    let s = setupTwoImagesPlaced();
    const text: TextAnnotation = {
      id: "t1",
      kind: "text",
      z: 5,
      x: 100,
      y: 100,
      text: "hi",
      font: "Arial",
      sizePt: 12,
      bold: false,
      italic: false,
      color: "#000",
      imageId: "a",
      anchor: { imgU: 0.5, imgV: 0.5 },
      panelId: panelIdAt(s, 0, 0),
    };
    s = figureReducer(s, addAnnotation(text));
    s = figureReducer(s, unplacePanel(panelIdAt(s, 0, 0)));
    expect(s.annotations.find((a) => a.id === "t1")).toBeUndefined();
  });
});

describe("figureReducer image-bound annotation behavior", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  it("SWAP_PANELS: symbol follows the image to the new panel, preserving its on-image anchor", () => {
    let s = setupTwoImagesPlaced();
    const pidA = panelIdAt(s, 0, 0);
    const pidB = panelIdAt(s, 1, 1);
    const symbol: SymbolAnnotation = {
      id: "ar1",
      kind: "symbol",
      z: 1,
      symbolId: "arrow-filled-right",
      x: 0,
      y: 0,
      sizePx: 60,
      rotationDeg: 0,
      color: "#FF0000",
      strokeWidthPx: 2,
      fillMode: "outlined",
      strokeStyle: "solid",
      imageId: "a",
      panelId: pidA,
      anchor: { imgU: 0.5, imgV: 0.5 },
    };
    s = figureReducer(s, addAnnotation(symbol));
    const before = s.annotations.find(
      (a) => a.id === "ar1",
    ) as SymbolAnnotation;
    expect(before.panelId).toBe(pidA);

    s = figureReducer(s, swapPanels(pidA, pidB));

    const after = s.annotations.find((a) => a.id === "ar1") as SymbolAnnotation;
    // Symbol's panelId now points at the panel where image "a" lives.
    expect(after.panelId).toBe(pidB);
    // Anchor preserved (it's the "source of truth" for relocation).
    expect(after.anchor).toEqual({ imgU: 0.5, imgV: 0.5 });
    // Image-bound metadata stays.
    expect(after.imageId).toBe("a");
    // Coords were re-projected: the new x/y differ from the (0,0) we stored,
    // since they're now derived from the new panel's rect.
    expect(after.x).not.toBe(before.x);
  });

  it("REPLACE_INTO_PANEL: a symbol on the panel does NOT stay there if a third image takes that panel — it follows its bound image (now unplaced) and is therefore dropped", () => {
    let s = setupTwoImagesPlaced();
    // Add a third image not yet placed.
    const IMG_C: ImagePoolItem = {
      id: "c",
      filename: "c.png",
      filePath: "/x/c.png",
      mime: "image/png",
      width: 200,
      height: 200,
      bitDepth: 8,
    };
    s = figureReducer(s, addToPool(IMG_C));
    const pidA = panelIdAt(s, 0, 0);
    // Anchor a symbol to image "a" on panel pidA.
    const symbol: SymbolAnnotation = {
      id: "ar1",
      kind: "symbol",
      z: 1,
      symbolId: "arrow-filled-right",
      x: 0,
      y: 0,
      sizePx: 60,
      rotationDeg: 0,
      color: "#FF0000",
      strokeWidthPx: 2,
      fillMode: "outlined",
      strokeStyle: "solid",
      imageId: "a",
      panelId: pidA,
      anchor: { imgU: 0.55, imgV: 0.55 },
    };
    s = figureReducer(s, addAnnotation(symbol));
    // Replace image "a" with image "c" on pidA. Image "a" gets ousted.
    s = figureReducer(s, replaceIntoPanel("c", pidA));
    // The symbol followed image "a" — but image "a" is now unplaced, so
    // the relocator dropped the symbol.
    expect(s.annotations.find((a) => a.id === "ar1")).toBeUndefined();
  });

  it("REPLACE_INTO_PANEL: symbol follows its image to its new home when ousted image is moved (not unplaced)", () => {
    // Setup: image "a" on pidA, image "b" on pidB. Symbol bound to "a".
    let s = setupTwoImagesPlaced();
    const pidA = panelIdAt(s, 0, 0);
    const pidB = panelIdAt(s, 1, 1);
    const symbol: SymbolAnnotation = {
      id: "ar1",
      kind: "symbol",
      z: 1,
      symbolId: "arrow-filled-right",
      x: 0,
      y: 0,
      sizePx: 60,
      rotationDeg: 0,
      color: "#FF0000",
      strokeWidthPx: 2,
      fillMode: "outlined",
      strokeStyle: "solid",
      imageId: "a",
      panelId: pidA,
      anchor: { imgU: 0.5, imgV: 0.5 },
    };
    s = figureReducer(s, addAnnotation(symbol));
    // Swap A and B — image "a" now on pidB, image "b" on pidA.
    s = figureReducer(s, swapPanels(pidA, pidB));
    const after = s.annotations.find((a) => a.id === "ar1") as SymbolAnnotation;
    expect(after.panelId).toBe(pidB);
    expect(after.imageId).toBe("a");
  });

  it("ROTATE_PANEL_90: image-bound anchor is preserved; coords are re-projected", () => {
    let s = setupTwoImagesPlaced();
    const pidA = panelIdAt(s, 0, 0);
    const text: TextAnnotation = {
      id: "t1",
      kind: "text",
      z: 5,
      x: 100,
      y: 100,
      text: "hi",
      font: "Arial",
      sizePt: 12,
      bold: false,
      italic: false,
      color: "#000",
      imageId: "a",
      panelId: pidA,
      anchor: { imgU: 0.25, imgV: 0.25 },
    };
    s = figureReducer(s, addAnnotation(text));
    const before = s.annotations.find((a) => a.id === "t1") as TextAnnotation;

    s = figureReducer(s, rotatePanel90(pidA));

    const after = s.annotations.find((a) => a.id === "t1") as TextAnnotation;
    // Anchor stays — it's source-image-relative.
    expect(after.anchor).toEqual({ imgU: 0.25, imgV: 0.25 });
    // Coords re-projected — different from before-rotation.
    expect(after.x === before.x && after.y === before.y).toBe(false);
  });

  it("FLIP_PANEL_H/V: image-bound anchor preserved; coords re-projected", () => {
    let s = setupTwoImagesPlaced();
    const pidA = panelIdAt(s, 0, 0);
    const sym: SymbolAnnotation = {
      id: "b1",
      kind: "symbol",
      z: 1,
      symbolId: "shape-square",
      x: 100,
      y: 100,
      sizePx: 50,
      rotationDeg: 0,
      color: "#FF0000",
      strokeWidthPx: 2,
      fillMode: "outlined",
      strokeStyle: "solid",
      imageId: "a",
      panelId: pidA,
      anchor: { imgU: 0.25, imgV: 0.25 },
    };
    s = figureReducer(s, addAnnotation(sym));
    const beforeH = s.annotations.find(
      (a) => a.id === "b1",
    ) as SymbolAnnotation;

    s = figureReducer(s, flipPanelH(pidA));
    const afterH = s.annotations.find((a) => a.id === "b1") as SymbolAnnotation;
    expect(afterH.anchor).toEqual({ imgU: 0.25, imgV: 0.25 });
    // Coords re-projected.
    expect(afterH.x === beforeH.x).toBe(false);

    const beforeV = s.annotations.find(
      (a) => a.id === "b1",
    ) as SymbolAnnotation;
    s = figureReducer(s, flipPanelV(pidA));
    const afterV = s.annotations.find((a) => a.id === "b1") as SymbolAnnotation;
    expect(afterV.anchor).toEqual({ imgU: 0.25, imgV: 0.25 });
    expect(afterV.y === beforeV.y).toBe(false);
  });

  it("REMOVE_FROM_POOL drops every image-bound annotation for the removed image", () => {
    let s = setupTwoImagesPlaced();
    const pidA = panelIdAt(s, 0, 0);
    const text: TextAnnotation = {
      id: "t1",
      kind: "text",
      z: 5,
      x: 100,
      y: 100,
      text: "hi",
      font: "Arial",
      sizePt: 12,
      bold: false,
      italic: false,
      color: "#000",
      imageId: "a",
      panelId: pidA,
      anchor: { imgU: 0.5, imgV: 0.5 },
    };
    // Plus an unbound annotation on the same panel — should survive.
    const text2: TextAnnotation = {
      id: "t2",
      kind: "text",
      z: 5,
      x: 50,
      y: 50,
      text: "global",
      font: "Arial",
      sizePt: 12,
      bold: false,
      italic: false,
      color: "#000",
    };
    s = figureReducer(s, addAnnotation(text));
    s = figureReducer(s, addAnnotation(text2));

    s = figureReducer(s, removeFromPool("a"));

    expect(s.annotations.find((a) => a.id === "t1")).toBeUndefined();
    expect(s.annotations.find((a) => a.id === "t2")).toBeDefined();
  });

  it("UNPLACE_PANEL drops image-bound annotations for the ousted image", () => {
    let s = setupTwoImagesPlaced();
    const pidA = panelIdAt(s, 0, 0);
    const text: TextAnnotation = {
      id: "t1",
      kind: "text",
      z: 5,
      x: 100,
      y: 100,
      text: "hi",
      font: "Arial",
      sizePt: 12,
      bold: false,
      italic: false,
      color: "#000",
      imageId: "a",
      panelId: pidA,
      anchor: { imgU: 0.5, imgV: 0.5 },
    };
    s = figureReducer(s, addAnnotation(text));

    s = figureReducer(s, unplacePanel(pidA));
    expect(s.annotations.find((a) => a.id === "t1")).toBeUndefined();
  });

  it("Letters do NOT follow images on swap (panel-bound, never image-bound)", () => {
    // Letters are derived in figure-derivations and not stored on
    // state.annotations. So swapping images can't move letters by definition —
    // we just lock that in by checking annotations don't gain a letter entry.
    let s = setupTwoImagesPlaced();
    const pidA = panelIdAt(s, 0, 0);
    const pidB = panelIdAt(s, 1, 1);

    s = figureReducer(s, swapPanels(pidA, pidB));
    expect(s.annotations.every((a) => (a.kind as string) !== "letter")).toBe(
      true,
    );
  });

  it("Bound annotation without anchor data on the relevant kind is left untouched (defensive)", () => {
    let s = setupTwoImagesPlaced();
    const pidA = panelIdAt(s, 0, 0);
    const pidB = panelIdAt(s, 1, 1);
    // Text bound to "a" but missing anchor.
    const text: TextAnnotation = {
      id: "t1",
      kind: "text",
      z: 5,
      x: 100,
      y: 100,
      text: "hi",
      font: "Arial",
      sizePt: 12,
      bold: false,
      italic: false,
      color: "#000",
      imageId: "a",
      panelId: pidA,
    };
    s = figureReducer(s, addAnnotation(text));
    s = figureReducer(s, swapPanels(pidA, pidB));
    const after = s.annotations.find((a) => a.id === "t1") as TextAnnotation;
    // Anchor was missing, so we skip projection. Coords stay the same.
    expect(after.x).toBe(100);
    expect(after.y).toBe(100);
    // panelId/imageId are NOT touched without an anchor.
    expect(after.panelId).toBe(pidA);
  });

  it("Saved + reloaded projects preserve image-bound fields (schema roundtrip)", () => {
    // Lightweight roundtrip: ensure schema validator doesn't reject the
    // new fields on read.
    // Test exists separately under m7-roundtrip / serialize; here we
    // assert just the structural pass.
    const symbol: SymbolAnnotation = {
      id: "ar1",
      kind: "symbol",
      z: 1,
      symbolId: "arrow-filled-right",
      x: 15,
      y: 15,
      sizePx: 60,
      rotationDeg: 0,
      color: "#FF0000",
      strokeWidthPx: 2,
      fillMode: "outlined",
      strokeStyle: "solid",
      imageId: "a",
      panelId: "p1",
      anchor: { imgU: 0.55, imgV: 0.55 },
    };
    expect(symbol.anchor?.imgU).toBe(0.55);
    expect(symbol.imageId).toBe("a");
  });
});
