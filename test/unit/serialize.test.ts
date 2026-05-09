import { describe, it, expect } from "vitest";
import {
  toMosaicFile,
  fromMosaicFile,
} from "../../src/renderer/model/serialize";
import { initialFigureState } from "../../src/renderer/model/figure-state";
import type { ImagePoolItem } from "../../src/renderer/model/pool";

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
  it("emits schemaVersion=1, app=mosaic-builder, copies state through", () => {
    const f = toMosaicFile({
      state: initialFigureState(),
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/Users/erik/proj/figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    expect(f.schemaVersion).toBe(2);
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

describe("v1 → v2 migration on fromMosaicFile", () => {
  it("converts a v1 file with arrow annotations to a v2 state with symbol annotations", () => {
    // The validator-rejected v1 file is hand-built: the runtime types only
    // know v2, so we cast through `unknown` to feed the migrator a legacy
    // shape (the loader does the same in main).
    const v1Annotations = [
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
    const v1 = {
      schemaVersion: 1 as const,
      app: "mosaic-builder" as const,
      appVersion: "0.1.0",
      createdAt: "2025-12-01T00:00:00Z",
      modifiedAt: "2025-12-01T00:00:00Z",
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      state: {
        rows: 1,
        cols: 1,
        gutterPx: 4,
        gutterColor: "#FFFFFF",
        pool: [],
        panels: [{ id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1 }],
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
    } as unknown as Parameters<typeof fromMosaicFile>[0];
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

  it("toMosaicFile always writes schemaVersion=2", () => {
    const f = toMosaicFile({
      state: initialFigureState(),
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/tmp/x.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-09T00:00:00Z",
    });
    expect(f.schemaVersion).toBe(2);
  });
});
