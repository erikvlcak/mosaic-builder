import { describe, it, expect } from "vitest";
import {
  rotatedImageDims,
  baseScale,
  clampCoverPan,
  clampZoom,
  snapTransform,
  panForCursorZoom,
  clamp,
} from "../../src/renderer/render/coords";
import { DEFAULT_TRANSFORM } from "../../src/renderer/model/panels";

describe("clamp", () => {
  it("clamps to range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe("rotatedImageDims", () => {
  it("0° leaves dims unchanged", () => {
    expect(rotatedImageDims(100, 50, 0)).toEqual({ w: 100, h: 50 });
  });
  it("90° swaps", () => {
    expect(rotatedImageDims(100, 50, 90)).toEqual({ w: 50, h: 100 });
  });
  it("180° leaves dims unchanged", () => {
    expect(rotatedImageDims(100, 50, 180)).toEqual({ w: 100, h: 50 });
  });
  it("270° swaps", () => {
    expect(rotatedImageDims(100, 50, 270)).toEqual({ w: 50, h: 100 });
  });
});

describe("baseScale", () => {
  it("Contain on a wide image in a square panel uses the height ratio", () => {
    // panel 100x100, image 200x100 → contain = min(100/200, 100/100) = 0.5
    expect(baseScale(100, 100, 200, 100, "contain")).toBe(0.5);
  });
  it("Cover on a wide image in a square panel uses the width ratio (=1)", () => {
    // panel 100x100, image 200x100 → cover = max(100/200, 100/100) = 1
    expect(baseScale(100, 100, 200, 100, "cover")).toBe(1);
  });
  it("Stretch returns {sx, sy}", () => {
    expect(baseScale(100, 50, 200, 100, "stretch")).toEqual({
      sx: 0.5,
      sy: 0.5,
    });
  });
});

describe("clampCoverPan", () => {
  it("allows non-zero pan when image is bigger than panel under Cover", () => {
    // panel 100x100, image 400x200 (wider than panel, taller-than-needed once Cover-scaled)
    // Cover S = max(100/400, 100/200) = 0.5; scaled image = 200x100.
    // Half-extents = (100, 50); panel half = (50, 50). xLimit=50, yLimit=0.
    const p = clampCoverPan(999, 999, 100, 100, 400, 200, 1);
    expect(p.panX).toBe(50);
    expect(p.panY).toBe(0);
  });
  it("clamps to zero on both axes when image equals panel size", () => {
    const p = clampCoverPan(10, -10, 100, 100, 100, 100, 1);
    expect(p.panX).toBe(0);
    // -0 and 0 are both "zero" for our purposes; compare numerically.
    expect(Object.is(p.panY, 0) || Object.is(p.panY, -0)).toBe(true);
  });
  it("collapses to zero range when scaled image is smaller than panel", () => {
    // pathological: forces hx < pw, so xLimit = max(0, hx-pw) = 0
    const p = clampCoverPan(20, 20, 100, 100, 50, 50, 0.5);
    expect(p).toEqual({ panX: 0, panY: 0 });
  });
});

describe("clampZoom", () => {
  it("contain: < 1 raised to 1", () => {
    expect(clampZoom(0.5, "contain")).toBe(1);
  });
  it("cover: zoom passed through above 1", () => {
    expect(clampZoom(2, "cover")).toBe(2);
  });
  it("contain: caps at 50", () => {
    expect(clampZoom(99, "contain")).toBe(50);
  });
  it("stretch: always 1", () => {
    expect(clampZoom(7, "stretch")).toBe(1);
  });
});

describe("snapTransform", () => {
  it("stretch zeroes pan and forces zoom to 1", () => {
    const t = {
      ...DEFAULT_TRANSFORM,
      fit: "stretch" as const,
      panX: 5,
      panY: 7,
      zoom: 3,
    };
    expect(snapTransform(t, 100, 100, 200, 100)).toEqual({
      ...t,
      zoom: 1,
      panX: 0,
      panY: 0,
    });
  });

  it("contain raises sub-1 zoom to 1 and leaves pan untouched", () => {
    const t = {
      ...DEFAULT_TRANSFORM,
      fit: "contain" as const,
      panX: 7,
      panY: -3,
      zoom: 0.5,
    };
    const out = snapTransform(t, 100, 100, 200, 100);
    expect(out.zoom).toBe(1);
    expect(out.panX).toBe(7);
    expect(out.panY).toBe(-3);
  });

  it("cover clamps pan to the legal envelope", () => {
    const t = {
      ...DEFAULT_TRANSFORM,
      fit: "cover" as const,
      panX: 999,
      panY: 999,
      zoom: 1,
    };
    const out = snapTransform(t, 100, 100, 400, 200);
    // Under Cover S=0.5, scaled image 200x100 → panX limit = (200-100)/2 = 50.
    expect(out.panX).toBe(50);
    expect(out.panY).toBe(0);
  });

  it("cover with rotation 90° uses rotated image dims for clamp", () => {
    const t = {
      ...DEFAULT_TRANSFORM,
      fit: "cover" as const,
      rotation: 90 as const,
      panX: 999,
      panY: 999,
      zoom: 1,
    };
    // After rotation: rotated dims are 200x400. Cover scale = max(100/200, 100/400) = 0.5.
    // Scaled rotated image = 100x200; half = (50, 100); pw=ph=50.
    // xLimit=0, yLimit=50.
    const out = snapTransform(t, 100, 100, 400, 200);
    expect(out.panX).toBe(0);
    expect(out.panY).toBe(50);
  });
});

describe("panForCursorZoom", () => {
  it("cursor at panel center (0,0) keeps pan unchanged across zoom", () => {
    const t = { ...DEFAULT_TRANSFORM, panX: 12, panY: -7, zoom: 1 };
    const out = panForCursorZoom(t, 0, 0, 2);
    // cursorLocal=0 → newPan = 0 - (0 - panOld) * ratio = panOld * ratio.
    // Mathematically: when the cursor is at the panel's screen-origin (the
    // panel center), the point that was under the cursor is the one at
    // screen-origin in the OLD frame, which is at panel-local coords =
    // -panOld / oldScale. Centering at cursor=0 gives newPan = panOld*ratio.
    expect(out.panX).toBe(24);
    expect(out.panY).toBe(-14);
  });

  it("cursor offset, zoom-in moves pan so the cursor point stays put", () => {
    // Old: pan = (0,0), zoom = 1, cursor at (10, 0). The point at panel-local
    // x=10 is under the cursor.
    // After zoom-in to 2x with cursor still at (10, 0):
    //   newPan = 10 - (10 - 0) * (2/1) = 10 - 20 = -10.
    // Verify: under newPan + screen-offset-from-newPan * (z/z0) = 10 stays at 10.
    const t = { ...DEFAULT_TRANSFORM, panX: 0, panY: 0, zoom: 1 };
    const out = panForCursorZoom(t, 10, 0, 2);
    expect(out.panX).toBe(-10);
    expect(out.panY).toBe(0);
  });
});
