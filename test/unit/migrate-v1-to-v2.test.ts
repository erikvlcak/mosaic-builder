import { describe, it, expect } from "vitest";
import { migrateAnnotationsV1ToV2 } from "../../src/renderer/model/migrate-v1-to-v2";

describe("migrateAnnotationsV1ToV2", () => {
  it("maps head=filled to arrow-filled-right", () => {
    const out = migrateAnnotationsV1ToV2([
      {
        id: "a1",
        kind: "arrow",
        z: 0,
        x1: 10,
        y1: 20,
        x2: 110,
        y2: 20,
        color: "#F00",
        thicknessPx: 3,
        head: "filled",
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "a1",
      kind: "symbol",
      z: 0,
      symbolId: "arrow-filled-right",
      x: 60,
      y: 20,
      sizePx: 100,
      rotationDeg: 0,
      color: "#F00",
      strokeWidthPx: 3,
    });
  });

  it("maps head=open to arrow-open-right", () => {
    const out = migrateAnnotationsV1ToV2([
      {
        id: "a2",
        kind: "arrow",
        z: 0,
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 100,
        color: "#000",
        thicknessPx: 2,
        head: "open",
      },
    ]);
    expect(out[0]).toMatchObject({
      kind: "symbol",
      symbolId: "arrow-open-right",
      x: 0,
      y: 50,
      sizePx: 100,
      rotationDeg: 90,
    });
  });

  it("maps head=none to arrow-line-right", () => {
    const out = migrateAnnotationsV1ToV2([
      {
        id: "a3",
        kind: "arrow",
        z: 0,
        x1: 100,
        y1: 100,
        x2: 0,
        y2: 100,
        color: "#000",
        thicknessPx: 1,
        head: "none",
      },
    ]);
    expect(out[0]).toMatchObject({
      kind: "symbol",
      symbolId: "arrow-line-right",
      x: 50,
      y: 100,
      sizePx: 100,
      rotationDeg: 180,
    });
  });

  it("clamps zero-length arrows to sizePx=8", () => {
    const out = migrateAnnotationsV1ToV2([
      {
        id: "a4",
        kind: "arrow",
        z: 0,
        x1: 50,
        y1: 50,
        x2: 50,
        y2: 50,
        color: "#000",
        thicknessPx: 1,
        head: "filled",
      },
    ]);
    expect(out[0]).toMatchObject({
      kind: "symbol",
      x: 50,
      y: 50,
      sizePx: 8,
      rotationDeg: 0,
    });
  });

  it("merges anchor1+anchor2 into a midpoint anchor when arrow is image-bound", () => {
    const out = migrateAnnotationsV1ToV2([
      {
        id: "a5",
        kind: "arrow",
        z: 0,
        x1: 10,
        y1: 10,
        x2: 90,
        y2: 90,
        color: "#000",
        thicknessPx: 2,
        head: "filled",
        imageId: "img1",
        panelId: "p1",
        anchor1: { imgU: 0.1, imgV: 0.2 },
        anchor2: { imgU: 0.5, imgV: 0.4 },
      },
    ]);
    expect(out[0]).toMatchObject({
      kind: "symbol",
      imageId: "img1",
      panelId: "p1",
      anchor: { imgU: 0.3, imgV: 0.30000000000000004 },
    });
  });

  it("leaves non-arrow annotations unchanged", () => {
    const text = {
      id: "t1",
      kind: "text" as const,
      z: 0,
      x: 0,
      y: 0,
      text: "hi",
      font: "sans",
      sizePt: 12,
      bold: false,
      italic: false,
      color: "#000",
    };
    const out = migrateAnnotationsV1ToV2([text]);
    expect(out[0]).toEqual(text);
  });

  it("returns the same array reference when no arrow annotations are present", () => {
    const arr = [
      {
        id: "t1",
        kind: "text" as const,
        z: 0,
        x: 0,
        y: 0,
        text: "hi",
        font: "sans",
        sizePt: 12,
        bold: false,
        italic: false,
        color: "#000",
      },
    ];
    expect(migrateAnnotationsV1ToV2(arr)).toBe(arr);
  });

  it("migrated symbol annotations carry default fillMode + strokeStyle", () => {
    const v1Arrow = {
      id: "a1",
      kind: "arrow" as const,
      z: 0,
      x1: 10, y1: 10, x2: 100, y2: 10,
      color: "#FF0000",
      thicknessPx: 2,
      head: "filled" as const,
    };
    const out = migrateAnnotationsV1ToV2([v1Arrow]);
    const sym = out[0];
    expect(sym?.kind).toBe("symbol");
    if (sym?.kind === "symbol") {
      expect(sym.fillMode).toBe("filled");
      expect(sym.strokeStyle).toBe("solid");
    }
  });

  it("v1 arrow with head='open' migrates to outlined fillMode", () => {
    const v1Arrow = {
      id: "a2", kind: "arrow" as const, z: 0,
      x1: 0, y1: 0, x2: 50, y2: 0,
      color: "#0000FF", thicknessPx: 1, head: "open" as const,
    };
    const out = migrateAnnotationsV1ToV2([v1Arrow]);
    const sym = out[0];
    if (sym?.kind === "symbol") {
      expect(sym.fillMode).toBe("outlined");
      expect(sym.strokeStyle).toBe("solid");
    }
  });
});
