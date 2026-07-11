import { describe, it, expect } from "vitest";
import {
  toMosaicFile,
  fromMosaicFile,
} from "../../src/renderer/model/serialize";
import { initialFigureState } from "../../src/renderer/model/figure-state";
import {
  figureReducer,
  relinkPoolImage,
} from "../../src/renderer/model/figure-actions";
import type { ImagePoolItem } from "../../src/renderer/model/pool";
import type {
  MosaicFileV1,
  V1ArrowAnnotation,
} from "../../src/renderer/model/schema";

const SAMPLE_IMG: ImagePoolItem = {
  id: "img1",
  filename: "sample.png",
  filePath: "/Users/erik/proj/images/sample.png",
  mime: "image/png",
  width: 100,
  height: 100,
  bitDepth: 8,
};

describe("toMosaicFile", () => {
  it("emits schemaVersion=5, app=mosaic-builder, copies state through", () => {
    const f = toMosaicFile({
      state: initialFigureState(),
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/Users/erik/proj/figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    expect(f.schemaVersion).toBe(5);
    expect(f.app).toBe("mosaic-builder");
    expect(f.appVersion).toBe("0.1.0");
    expect(f.createdAt).toBe("2026-05-02T10:00:00Z");
    expect(f.canvas.widthPx).toBe(800);
    expect(f.state.rows).toBe(2);
  });

  it("computes posix relPath relative to .mosaic dir", () => {
    const state = { ...initialFigureState(), pool: [SAMPLE_IMG] };
    const f = toMosaicFile({
      state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/Users/erik/proj/figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    expect(f.state.pool[0]!.relPath).toBe("./images/sample.png");
    expect(f.state.pool[0]!.filePath).toBe(
      "/Users/erik/proj/images/sample.png",
    );
  });

  it("falls back to no relPath if filePath is on a different volume / windows drive", () => {
    const winImg: ImagePoolItem = {
      ...SAMPLE_IMG,
      filePath: "D:\\\\elsewhere\\\\sample.png",
    };
    const state = { ...initialFigureState(), pool: [winImg] };
    const f = toMosaicFile({
      state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/Users/erik/proj/figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    // Different volume: relPath must be undefined; absolute fallback only.
    expect(f.state.pool[0]!.relPath).toBeUndefined();
  });

  // 2.1: relPath was silently never produced on Windows because the old
  // isPosixAbsolute check only matched "/"-rooted paths. These use a genuinely
  // Windows-native mosaicPath (drive letter + backslashes), which the previous
  // "different volume" test never did.
  it("computes forward-slash relPath for a same-drive Windows path", () => {
    const winImg: ImagePoolItem = {
      ...SAMPLE_IMG,
      filePath: "C:\\Users\\erik\\proj\\images\\sample.png",
    };
    const state = { ...initialFigureState(), pool: [winImg] };
    const f = toMosaicFile({
      state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "C:\\Users\\erik\\proj\\figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    // Stored relPath is always forward-slash so it round-trips on both OSes.
    expect(f.state.pool[0]!.relPath).toBe("./images/sample.png");
  });

  it("compares Windows drive letters case-insensitively", () => {
    const winImg: ImagePoolItem = {
      ...SAMPLE_IMG,
      filePath: "c:\\Users\\erik\\proj\\images\\sample.png",
    };
    const state = { ...initialFigureState(), pool: [winImg] };
    const f = toMosaicFile({
      state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "C:\\Users\\erik\\proj\\figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    expect(f.state.pool[0]!.relPath).toBe("./images/sample.png");
  });

  it("omits relPath when the image is on a different Windows drive", () => {
    const winImg: ImagePoolItem = {
      ...SAMPLE_IMG,
      filePath: "D:\\media\\sample.png",
    };
    const state = { ...initialFigureState(), pool: [winImg] };
    const f = toMosaicFile({
      state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "C:\\Users\\erik\\proj\\figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    expect(f.state.pool[0]!.relPath).toBeUndefined();
  });

  it("computes relPath for UNC paths on the same share", () => {
    const uncImg: ImagePoolItem = {
      ...SAMPLE_IMG,
      filePath: "\\\\nas\\lab\\proj\\images\\sample.png",
    };
    const state = { ...initialFigureState(), pool: [uncImg] };
    const f = toMosaicFile({
      state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "\\\\nas\\lab\\proj\\figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    expect(f.state.pool[0]!.relPath).toBe("./images/sample.png");
  });

  it("omits relPath across different UNC shares", () => {
    const uncImg: ImagePoolItem = {
      ...SAMPLE_IMG,
      filePath: "\\\\nas\\other\\sample.png",
    };
    const state = { ...initialFigureState(), pool: [uncImg] };
    const f = toMosaicFile({
      state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "\\\\nas\\lab\\proj\\figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    expect(f.state.pool[0]!.relPath).toBeUndefined();
  });

  it("attaches sha256 if provided in shaByImageId", () => {
    const state = { ...initialFigureState(), pool: [SAMPLE_IMG] };
    const f = toMosaicFile({
      state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/Users/erik/proj/figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
      shaByImageId: { img1: "deadbeef" },
    });
    expect(f.state.pool[0]!.sha256).toBe("deadbeef");
  });
});

describe("fromMosaicFile", () => {
  it("returns the contained FigureState and canvas, stripping relPath/sha256 from runtime pool", () => {
    const file = toMosaicFile({
      state: { ...initialFigureState(), pool: [SAMPLE_IMG] },
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/Users/erik/proj/figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
      shaByImageId: { img1: "deadbeef" },
    });
    const r = fromMosaicFile(file);
    expect(r.state.pool[0]!.id).toBe("img1");
    // runtime pool item has no relPath/sha256 — those are loader-side hints.
    expect(
      (r.state.pool[0] as Record<string, unknown>).relPath,
    ).toBeUndefined();
    expect((r.state.pool[0] as Record<string, unknown>).sha256).toBeUndefined();
    expect(r.canvas.widthPx).toBe(800);
    // relink hints surfaced separately for the loader.
    expect(r.relinkHints[0]).toEqual({
      imageId: "img1",
      filePath: "/Users/erik/proj/images/sample.png",
      relPath: "./images/sample.png",
      sha256: "deadbeef",
    });
  });
});

describe("relink round-trip (2.2)", () => {
  it("a relinked image's new path is what serialize writes on the next save", () => {
    // Simulate loading a project whose image sits at a now-broken path.
    const broken: ImagePoolItem = {
      ...SAMPLE_IMG,
      filePath: "/old/gone/sample.png",
    };
    let state = { ...initialFigureState(), pool: [broken] };

    // User relinks it to a new location (RelinkModal → relinkPoolImage).
    state = figureReducer(
      state,
      relinkPoolImage("img1", {
        filePath: "/Users/erik/proj/images/sample.png",
        filename: "sample.png",
        mime: "image/png",
        width: 100,
        height: 100,
        bitDepth: 8,
      }),
    );

    // The next save must record the relinked location — path AND a fresh
    // relPath relative to the .mosaic dir — not the stale broken path.
    const f = toMosaicFile({
      state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/Users/erik/proj/figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    expect(f.state.pool[0]!.filePath).toBe(
      "/Users/erik/proj/images/sample.png",
    );
    expect(f.state.pool[0]!.relPath).toBe("./images/sample.png");
  });
});

describe("v1 → v2 migration on fromMosaicFile", () => {
  it("converts a v1 file with arrow annotations to a v2 state with symbol annotations", () => {
    // Build a v1 file directly as a MosaicFileV1 literal — the schema
    // explicitly admits the legacy arrow shape via V1Annotation.
    const v1Annotations: V1ArrowAnnotation[] = [
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
    ];
    const v1: MosaicFileV1 = {
      schemaVersion: 1,
      app: "mosaic-builder",
      appVersion: "0.1.0",
      createdAt: "2025-12-01T00:00:00Z",
      modifiedAt: "2025-12-01T00:00:00Z",
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      state: {
        rows: 1,
        cols: 1,
        gutterPx: 4,
        gutterColor: "#FFFFFF",
        outerGutter: true,
        pool: [],
        panels: [
          {
            id: "p1",
            row: 0,
            col: 0,
            rowSpan: 1,
            colSpan: 1,
          },
        ],
        annotations: v1Annotations,
        globalStyle: {
          letters: {
            enabled: true,
            font: "Arial",
            sizePt: 14,
            color: "#000000",
            paddingPx: 4,
            bold: true,
            corner: "tl",
          },
          scalebar: {
            font: "Arial",
            sizePt: 12,
            color: "#000000",
            barColor: "#000000",
            thicknessPx: 4,
            paddingPx: 8,
            showLabel: true,
            corner: "br",
          },
        },
        letterOverrides: {},
      },
    };
    const { state } = fromMosaicFile(v1);
    expect(state.annotations).toHaveLength(1);
    expect(state.annotations[0]).toMatchObject({
      kind: "symbol",
      symbolId: "arrow-filled-right",
      x: 60,
      y: 20,
      sizePx: 100,
      rotationDeg: 0,
    });
  });

  it("toMosaicFile always writes schemaVersion=5", () => {
    const f = toMosaicFile({
      state: initialFigureState(),
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/tmp/x.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-09T00:00:00Z",
    });
    expect(f.schemaVersion).toBe(5);
  });

  it("v1 file with string-shaped letterOverrides loads as v3 LetterOverride map", () => {
    // Old (v1/v2) callers stored letterOverrides as Record<panelId, string>.
    // The loader must lift each string into `{ text }` so all downstream code
    // sees the v3 shape.
    const v1: MosaicFileV1 = {
      schemaVersion: 1,
      app: "mosaic-builder",
      appVersion: "0.1.0",
      createdAt: "2025-12-01T00:00:00Z",
      modifiedAt: "2025-12-01T00:00:00Z",
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      state: {
        rows: 1,
        cols: 1,
        gutterPx: 4,
        gutterColor: "#FFFFFF",
        outerGutter: true,
        pool: [],
        panels: [{ id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1 }],
        annotations: [],
        globalStyle: {
          letters: {
            enabled: true,
            font: "Arial",
            sizePt: 14,
            color: "#000000",
            paddingPx: 4,
            bold: true,
            corner: "tl",
            // intentionally no italic — tests pre-spec-08 default
          } as MosaicFileV1["state"]["globalStyle"]["letters"],
          scalebar: {
            font: "Arial",
            sizePt: 12,
            color: "#000000",
            barColor: "#000000",
            thicknessPx: 4,
            paddingPx: 8,
            showLabel: true,
            corner: "br",
          },
        },
        // v1 used a flat string here.
        letterOverrides: {
          p1: "A1",
        } as unknown as MosaicFileV1["state"]["letterOverrides"],
      },
    };
    const { state } = fromMosaicFile(v1);
    expect(state.letterOverrides).toEqual({ p1: { text: "A1" } });
    // Default pattern lands on uppercase since v1 files lack `letterPattern`.
    expect(state.letterPattern).toBe("uppercase");
    // italic defaults to false on legacy files.
    expect(state.globalStyle.letters.italic).toBe(false);
  });
});

describe("serialize — layout v5 (spec 11 carried into v5)", () => {
  it("toMosaicFile writes schemaVersion 5 with state.layout", () => {
    const state = initialFigureState();
    const file = toMosaicFile({
      state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/tmp/x.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-09T00:00:00.000Z",
    });
    expect(file.schemaVersion).toBe(5);
    expect(file.state.layout).toEqual({
      kind: "uniform",
      colWeights: [0.5, 0.5],
      rowWeights: [0.5, 0.5],
    });
  });

  it("round-trips a free-form layout through v5", () => {
    const state = initialFigureState();
    const free: typeof state = {
      ...state,
      layout: {
        kind: "free",
        rects: {
          "panel-1": { x: 0, y: 0, w: 100, h: 100 },
          "panel-2": { x: 100, y: 0, w: 100, h: 100 },
          "panel-3": { x: 0, y: 100, w: 100, h: 100 },
          "panel-4": { x: 100, y: 100, w: 100, h: 100 },
        },
      },
    };
    const file = toMosaicFile({
      state: free,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/tmp/x.mosaic",
      appVersion: "0.1.0",
    });
    const back = fromMosaicFile(file);
    expect(back.state.layout).toEqual(free.layout);
  });

  it("fromMosaicFile on a v3 file seeds uniform layout", () => {
    // Hand-build a minimal v3 file to verify migration.
    const v3 = {
      schemaVersion: 3 as const,
      app: "mosaic-builder" as const,
      appVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
      modifiedAt: "2026-05-02T00:00:00Z",
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      state: {
        rows: 3,
        cols: 2,
        gutterPx: 12,
        gutterColor: "#FFFFFF",
        outerGutter: true,
        pool: [],
        panels: [
          { id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1 },
          { id: "p2", row: 0, col: 1, rowSpan: 1, colSpan: 1 },
          { id: "p3", row: 1, col: 0, rowSpan: 1, colSpan: 1 },
          { id: "p4", row: 1, col: 1, rowSpan: 1, colSpan: 1 },
          { id: "p5", row: 2, col: 0, rowSpan: 1, colSpan: 1 },
          { id: "p6", row: 2, col: 1, rowSpan: 1, colSpan: 1 },
        ],
        annotations: [],
        globalStyle: {
          letters: {
            enabled: true,
            font: "Arial",
            sizePt: 12,
            color: "#000000",
            corner: "tl" as const,
            paddingPx: 6,
            bold: true,
            italic: false,
          },
          scalebar: {
            font: "Arial",
            sizePt: 10,
            color: "#FFFFFF",
            barColor: "#FFFFFF",
            thicknessPx: 4,
            corner: "br" as const,
            paddingPx: 8,
            showLabel: true,
          },
        },
        letterOverrides: {},
        letterPattern: "uppercase" as const,
      },
    };
    const r = fromMosaicFile(v3);
    expect(r.state.layout.kind).toBe("uniform");
    if (r.state.layout.kind !== "uniform") throw new Error("unreachable");
    expect(r.state.layout.colWeights.length).toBe(2);
    expect(r.state.layout.rowWeights.length).toBe(3);
  });
});
