import { describe, it, expect } from "vitest";
import { scaleBarFigurePx, scaleBarRect } from "../../src/renderer/render/scalebar";
import { effectivePanelScale } from "../../src/renderer/render/coords";
import { DEFAULT_TRANSFORM } from "../../src/renderer/model/panels";
import type { Calibration } from "../../src/renderer/model/pool";
import type { PanelTransform } from "../../src/renderer/model/panels";

// 100x100 panel, 100x100 image → Contain baseScale = 1.0; with zoom=1, S=1.
const T: PanelTransform = { ...DEFAULT_TRANSFORM };
const PANEL_W = 100;
const PANEL_H = 100;
const IMG_W = 100;
const IMG_H = 100;

const CAL_UM: Calibration = { unit: "um", pixelsPerUnit: 6.45, source: "manual" };
const CAL_MM: Calibration = { unit: "mm", pixelsPerUnit: 6450, source: "manual" }; // 6450 src px / mm == 6.45 src px / µm
const CAL_PX: Calibration = { unit: "px", pixelsPerUnit: 1, source: "manual" };

describe("effectivePanelScale", () => {
  it("Contain 1:1 panel/image at zoom=1 → S=1", () => {
    expect(effectivePanelScale(T, 100, 100, 100, 100)).toBeCloseTo(1, 10);
  });
  it("Contain at zoom=2 → S=2", () => {
    const t: PanelTransform = { ...T, zoom: 2 };
    expect(effectivePanelScale(t, 100, 100, 100, 100)).toBeCloseTo(2, 10);
  });
  it("Stretch falls back to min-axis * zoom", () => {
    const t: PanelTransform = { ...T, fit: "stretch", zoom: 1 };
    // panel 100x100, img 200x100 → min(100/200, 100/100) = 0.5
    expect(effectivePanelScale(t, 100, 100, 200, 100)).toBeCloseTo(0.5, 10);
  });
  it("Cover wide image in square panel → max ratio * zoom", () => {
    const t: PanelTransform = { ...T, fit: "cover", zoom: 1 };
    // panel 100x100, img 200x100 → cover = max(100/200, 100/100) = 1
    expect(effectivePanelScale(t, 100, 100, 200, 100)).toBeCloseTo(1, 10);
  });
});

describe("scaleBarFigurePx", () => {
  it("µm calibration 6.45 px/µm, 50 µm at S=1 → 322.5", () => {
    const px = scaleBarFigurePx(50, "um", CAL_UM, T, PANEL_W, PANEL_H, IMG_W, IMG_H);
    expect(px).toBeCloseTo(322.5, 6);
  });

  it("Same with zoom=2 → 645", () => {
    const t: PanelTransform = { ...T, zoom: 2 };
    const px = scaleBarFigurePx(50, "um", CAL_UM, t, PANEL_W, PANEL_H, IMG_W, IMG_H);
    expect(px).toBeCloseTo(645, 6);
  });

  it("mm length unit with µm calibration: 1 mm = 1000× the 1 µm result", () => {
    const oneUm = scaleBarFigurePx(1, "um", CAL_UM, T, PANEL_W, PANEL_H, IMG_W, IMG_H);
    const oneMm = scaleBarFigurePx(1, "mm", CAL_UM, T, PANEL_W, PANEL_H, IMG_W, IMG_H);
    expect(oneMm).toBeCloseTo(oneUm * 1000, 6);
  });

  it("mm calibration with mm length: 1 mm at 6450 src-px/mm and S=1 → 6450", () => {
    const px = scaleBarFigurePx(1, "mm", CAL_MM, T, PANEL_W, PANEL_H, IMG_W, IMG_H);
    expect(px).toBeCloseTo(6450, 6);
  });

  it("px length ignores calibration; lengthValue=100 at S=0.5 → 50", () => {
    // Force S=0.5 via stretch fit on a wider image.
    const t: PanelTransform = { ...T, fit: "stretch", zoom: 1 };
    const S = effectivePanelScale(t, 100, 100, 200, 100);
    expect(S).toBeCloseTo(0.5, 10);
    const px = scaleBarFigurePx(100, "px", undefined, t, 100, 100, 200, 100);
    expect(px).toBeCloseTo(50, 6);
  });

  it("missing calibration with µm length → 0", () => {
    expect(
      scaleBarFigurePx(50, "um", undefined, T, PANEL_W, PANEL_H, IMG_W, IMG_H),
    ).toBe(0);
  });

  it("calibration unit='px' with µm length → 0 (undefined absolute conversion)", () => {
    expect(
      scaleBarFigurePx(50, "um", CAL_PX, T, PANEL_W, PANEL_H, IMG_W, IMG_H),
    ).toBe(0);
  });

  it("Stretch fit produces a positive bar via min-axis fallback", () => {
    const t: PanelTransform = { ...T, fit: "stretch", zoom: 1 };
    const px = scaleBarFigurePx(50, "um", CAL_UM, t, 100, 100, 200, 100);
    // S = min(100/200, 100/100) = 0.5; px = 50 * 6.45 * 0.5 = 161.25
    expect(px).toBeGreaterThan(0);
    expect(px).toBeCloseTo(161.25, 6);
  });

  it("Rotated 90° image swaps base-scale dims; S recomputes accordingly", () => {
    // Image 200x100 rotated 90° → rotDims 100x200 in a 100x100 panel.
    // Contain baseScale = min(100/100, 100/200) = 0.5. zoom=1 → S=0.5.
    const t: PanelTransform = { ...T, rotation: 90 };
    const px = scaleBarFigurePx(50, "um", CAL_UM, t, 100, 100, 200, 100);
    expect(px).toBeCloseTo(50 * 6.45 * 0.5, 6); // 161.25
  });

  it("Negative or non-finite inputs return 0", () => {
    expect(
      scaleBarFigurePx(NaN, "um", CAL_UM, T, PANEL_W, PANEL_H, IMG_W, IMG_H),
    ).toBe(0);
    expect(
      scaleBarFigurePx(-50, "um", CAL_UM, T, PANEL_W, PANEL_H, IMG_W, IMG_H),
    ).toBe(0);
    expect(
      scaleBarFigurePx(50, "um", CAL_UM, T, PANEL_W, PANEL_H, 0, IMG_H),
    ).toBe(0);
  });
});

describe("scaleBarRect", () => {
  it("br corner — plan example: rect = {210, 186, 80, 4}", () => {
    const rect = scaleBarRect("br", 10, { x: 0, y: 0, w: 300, h: 200 }, 80, 4);
    expect(rect).toEqual({ x: 210, y: 186, w: 80, h: 4 });
    // Bar's bottom-edge endpoints (per plan note):
    expect(rect.x).toBe(210);
    expect(rect.x + rect.w).toBe(290);
    expect(rect.y + rect.h).toBe(190);
  });

  it("tl corner — bar starts at top-left padding", () => {
    const rect = scaleBarRect("tl", 10, { x: 0, y: 0, w: 300, h: 200 }, 80, 4);
    expect(rect).toEqual({ x: 10, y: 10, w: 80, h: 4 });
  });

  it("tr corner — bar ends at top-right padding", () => {
    const rect = scaleBarRect("tr", 10, { x: 0, y: 0, w: 300, h: 200 }, 80, 4);
    expect(rect).toEqual({ x: 210, y: 10, w: 80, h: 4 });
  });

  it("bl corner — bar starts at bottom-left padding", () => {
    const rect = scaleBarRect("bl", 10, { x: 0, y: 0, w: 300, h: 200 }, 80, 4);
    expect(rect).toEqual({ x: 10, y: 186, w: 80, h: 4 });
  });

  it("respects panelRect offset (non-zero x/y)", () => {
    const rect = scaleBarRect(
      "br",
      10,
      { x: 100, y: 50, w: 300, h: 200 },
      80,
      4,
    );
    // endX = 100 + 300 - 10 = 390; startX = 310. endY = 50 + 200 - 10 = 240; y = 236.
    expect(rect).toEqual({ x: 310, y: 236, w: 80, h: 4 });
  });
});
