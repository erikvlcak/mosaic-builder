import { describe, it, expect } from "vitest";
import type { ImagePoolItem } from "../../src/renderer/model/pool";
import {
  computeCanvasDims,
  scaleAnnotations,
} from "../../src/renderer/model/canvas-dims";
import type {
  Annotation,
  TextAnnotation,
  SymbolAnnotation,
  BoxAnnotation,
  ScaleBarAnnotation,
} from "../../src/renderer/model/annotations";

const MIN_W = 800;
const MIN_H = 600;

function img(width: number, height: number): ImagePoolItem {
  return {
    id: `${width}x${height}`,
    filename: "x.png",
    filePath: "/x.png",
    mime: "image/png",
    width,
    height,
    bitDepth: 8,
  };
}

describe("computeCanvasDims", () => {
  it("returns the minimum 800x600 for an empty pool", () => {
    const d = computeCanvasDims([], 2, 2, 12);
    expect(d).toEqual({ widthPx: MIN_W, heightPx: MIN_H });
  });

  it("returns the minimum when all pool images fit inside a single cell at min canvas", () => {
    const d = computeCanvasDims([img(100, 100)], 2, 2, 12);
    // single cell at 800x600 / 2x2 with 12px gutters easily fits 100x100
    expect(d).toEqual({ widthPx: MIN_W, heightPx: MIN_H });
  });

  it("grows widthPx so the largest image fits a single cell on the X axis", () => {
    // 1x1 grid, 12px gutter → widthPx = 1*4000 + 2*12 = 4024 (≥ MIN_W).
    const d = computeCanvasDims([img(4000, 100)], 1, 1, 12);
    expect(d.widthPx).toBe(4024);
    // height stays at MIN_H since the largest image is short.
    expect(d.heightPx).toBe(MIN_H);
  });

  it("grows heightPx so the largest image fits a single cell on the Y axis", () => {
    const d = computeCanvasDims([img(100, 3000)], 1, 1, 12);
    expect(d.heightPx).toBe(3024);
    expect(d.widthPx).toBe(MIN_W);
  });

  it("scales width with cols (2 cols, 4000-wide image → 4000*2 + 3*12)", () => {
    const d = computeCanvasDims([img(4000, 100)], 1, 2, 12);
    expect(d.widthPx).toBe(4000 * 2 + 3 * 12);
  });

  it("scales height with rows (3 rows, 3000-tall image → 3000*3 + 4*12)", () => {
    const d = computeCanvasDims([img(100, 3000)], 3, 1, 12);
    expect(d.heightPx).toBe(3000 * 3 + 4 * 12);
  });

  it("uses the per-axis maximum across mixed-aspect images", () => {
    // image A is wide (4000x100); image B is tall (100x3000). Per-axis max:
    // width-axis → 4000, height-axis → 3000.
    const d = computeCanvasDims([img(4000, 100), img(100, 3000)], 1, 1, 12);
    expect(d.widthPx).toBe(4024);
    expect(d.heightPx).toBe(3024);
  });

  it("respects gutter changes", () => {
    const d0 = computeCanvasDims([img(4000, 3000)], 1, 1, 0);
    expect(d0).toEqual({ widthPx: 4000, heightPx: 3000 });
    const d40 = computeCanvasDims([img(4000, 3000)], 1, 1, 40);
    expect(d40).toEqual({ widthPx: 4000 + 2 * 40, heightPx: 3000 + 2 * 40 });
  });
});

const TEXT: TextAnnotation = {
  id: "t1",
  kind: "text",
  z: 1,
  x: 100,
  y: 200,
  text: "hi",
  font: "system-ui",
  sizePt: 12,
  bold: false,
  italic: false,
  color: "#000000",
};

const SYMBOL: SymbolAnnotation = {
  id: "a1",
  kind: "symbol",
  z: 1,
  symbolId: "arrow-filled-right",
  x: 20,
  y: 30,
  sizePx: 60,
  rotationDeg: 0,
  color: "#000000",
  strokeWidthPx: 2,
};

const BOX: BoxAnnotation = {
  id: "b1",
  kind: "box",
  z: 1,
  x: 50,
  y: 60,
  w: 100,
  h: 200,
  stroke: "#000000",
  strokeWidthPx: 1,
};

const SCALE: ScaleBarAnnotation = {
  id: "s1",
  kind: "scalebar",
  z: 1,
  panelId: "p1",
  lengthValue: 100,
  lengthUnit: "um",
};

describe("scaleAnnotations", () => {
  it("returns the same array reference when sx and sy are both 1", () => {
    const arr: Annotation[] = [TEXT, SYMBOL, BOX, SCALE];
    const out = scaleAnnotations(arr, 1, 1);
    expect(out).toBe(arr);
  });

  it("scales text x/y", () => {
    const out = scaleAnnotations([TEXT], 2, 3);
    const t = out[0] as TextAnnotation;
    expect(t.x).toBe(200);
    expect(t.y).toBe(600);
    expect(t.sizePt).toBe(12); // unchanged — points are not figure-px
  });

  it("scales symbol x/y but leaves sizePx/rotationDeg/strokeWidthPx alone", () => {
    const out = scaleAnnotations([SYMBOL], 2, 3);
    const a = out[0] as SymbolAnnotation;
    expect(a.x).toBe(40);
    expect(a.y).toBe(90);
    expect(a.sizePx).toBe(60); // unchanged — visual size, not figure coordinate
    expect(a.rotationDeg).toBe(0); // unchanged
    expect(a.strokeWidthPx).toBe(2); // unchanged
  });

  it("scales box position and size", () => {
    const out = scaleAnnotations([BOX], 2, 3);
    const b = out[0] as BoxAnnotation;
    expect(b.x).toBe(100);
    expect(b.y).toBe(180);
    expect(b.w).toBe(200);
    expect(b.h).toBe(600);
    expect(b.strokeWidthPx).toBe(1); // unchanged
  });

  it("leaves scalebar unchanged (corner-anchored, no figure-px coords)", () => {
    const out = scaleAnnotations([SCALE], 2, 3);
    expect(out[0]).toEqual(SCALE);
  });

  it("returns a new array (does not mutate input) when scale != 1", () => {
    const arr: Annotation[] = [TEXT];
    const out = scaleAnnotations(arr, 2, 2);
    expect(out).not.toBe(arr);
    expect(arr[0]).toEqual(TEXT); // input untouched
  });
});
