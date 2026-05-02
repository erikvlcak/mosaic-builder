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
    expect(f.schemaVersion).toBe(1);
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
    expect(f.state.pool[0]!.filePath).toBe("/Users/erik/proj/images/sample.png");
  });

  it("falls back to no relPath if filePath is on a different volume / windows drive", () => {
    const winImg: ImagePoolItem = { ...SAMPLE_IMG, filePath: "D:\\\\elsewhere\\\\sample.png" };
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
    expect((r.state.pool[0] as Record<string, unknown>).relPath).toBeUndefined();
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
