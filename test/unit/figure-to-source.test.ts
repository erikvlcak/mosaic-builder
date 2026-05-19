import { describe, it, expect } from "vitest";
import { figureToSource } from "../../src/renderer/render/coords";
import { DEFAULT_TRANSFORM } from "../../src/renderer/model/panels";
import type { PanelTransform } from "../../src/renderer/model/panels";

const RECT = { x: 100, y: 50, w: 200, h: 200 };

describe("figureToSource", () => {
  it("identity-ish: click at panel center maps to image center (Contain, square panel/image)", () => {
    // Image 100x100 in a 200x200 panel → Contain S = 2.0.
    // Click at panel center (200, 150) → (sx, sy) = (50, 50).
    const t: PanelTransform = { ...DEFAULT_TRANSFORM, fit: "contain" };
    const result = figureToSource(RECT, t, 100, 100, 200, 150);
    expect(result).not.toBeNull();
    expect(result!.sx).toBeCloseTo(50, 6);
    expect(result!.sy).toBeCloseTo(50, 6);
  });

  it("Contain top-left corner of the image: source (0, 0)", () => {
    // Image 100x100 in a 200x200 panel → Contain S = 2.0; image fills the panel.
    // Top-left of image is at panel-rect top-left: (100, 50). source (0, 0).
    const t: PanelTransform = { ...DEFAULT_TRANSFORM, fit: "contain" };
    const result = figureToSource(RECT, t, 100, 100, 100, 50);
    expect(result).not.toBeNull();
    expect(result!.sx).toBeCloseTo(0, 6);
    expect(result!.sy).toBeCloseTo(0, 6);
  });

  it("90° rotation: panel-center click still maps to image center", () => {
    // Rotation does not move the image center; center of panel still
    // resolves to image center regardless of rotation.
    const t: PanelTransform = {
      ...DEFAULT_TRANSFORM,
      fit: "contain",
      rotation: 90,
    };
    const result = figureToSource(RECT, t, 100, 100, 200, 150);
    expect(result).not.toBeNull();
    expect(result!.sx).toBeCloseTo(50, 6);
    expect(result!.sy).toBeCloseTo(50, 6);
  });

  it("90° rotation: a point to the right of center in figure-px maps to a point ABOVE center in source-px", () => {
    // Image 100x100 in 200x200 panel, Contain S=2.0, rotated 90° CW.
    // Forward: source point (50, 0) → after recenter (0, -50), no flip,
    // rotate 90° CW → (50, 0), scale ×2 → (100, 0), translate to panel
    // center (200, 150) → figure (300, 150).
    // So inverse of (300, 150) should give source (50, 0).
    const t: PanelTransform = {
      ...DEFAULT_TRANSFORM,
      fit: "contain",
      rotation: 90,
    };
    const result = figureToSource(RECT, t, 100, 100, 300, 150);
    expect(result).not.toBeNull();
    expect(result!.sx).toBeCloseTo(50, 6);
    expect(result!.sy).toBeCloseTo(0, 6);
  });

  it("with pan: panel-center click maps to a non-center source point", () => {
    // Image 100x100 in 200x200 panel, Contain S=2.0, pan = (+20, 0).
    // Forward: source (50, 50) → recenter (0, 0) → no rot/flip → scale ×2 → (0,0) → +pan(20,0)=(20,0) → +panel-center(200,150)=(220,150).
    // So a click at the panel CENTER (200, 150) corresponds to a source
    // point (40, 50) — i.e. left of source-center because the image was
    // panned right.
    const t: PanelTransform = {
      ...DEFAULT_TRANSFORM,
      fit: "contain",
      panX: 20,
    };
    const result = figureToSource(RECT, t, 100, 100, 200, 150);
    expect(result).not.toBeNull();
    expect(result!.sx).toBeCloseTo(40, 6);
    expect(result!.sy).toBeCloseTo(50, 6);
  });

  it("flipH: panel-center click still maps to image center", () => {
    const t: PanelTransform = {
      ...DEFAULT_TRANSFORM,
      fit: "contain",
      flipH: true,
    };
    const result = figureToSource(RECT, t, 100, 100, 200, 150);
    expect(result).not.toBeNull();
    expect(result!.sx).toBeCloseTo(50, 6);
    expect(result!.sy).toBeCloseTo(50, 6);
  });

  it("Contain letterbox: click outside the source bounds returns null", () => {
    // Image 100x50 (wide aspect 2:1) in 200x200 panel.
    // Contain S = min(200/100, 200/50) = 2.0. Image fills width (200) but
    // is only 100 tall, leaving 50px letterboxes top + bottom.
    // A click at the very top of the panel rect (100, 50) is in the
    // letterbox; in source coords it lands above the image (sy < 0).
    const t: PanelTransform = { ...DEFAULT_TRANSFORM, fit: "contain" };
    const result = figureToSource(RECT, t, 100, 50, 100, 50);
    expect(result).toBeNull();
  });
});
