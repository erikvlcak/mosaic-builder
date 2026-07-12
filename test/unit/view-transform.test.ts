import { describe, it, expect } from "vitest";
import {
  ZOOM_MIN,
  ZOOM_MAX,
  clampViewZoom,
  fitZoom,
  zoomToCssSize,
  scrollForCursorZoom,
} from "../../src/renderer/render/view-transform";

describe("clampViewZoom", () => {
  it("clamps to [ZOOM_MIN*sourceScale, ZOOM_MAX*sourceScale]", () => {
    // sourceScale 1 → bounds [0.1, 8]
    expect(clampViewZoom(0.01, 1)).toBe(ZOOM_MIN);
    expect(clampViewZoom(100, 1)).toBe(ZOOM_MAX);
    expect(clampViewZoom(2, 1)).toBe(2);
  });

  it("scales the bounds by sourceScale (5x source figure)", () => {
    // sourceScale 5 → display-100% is zoom=5; bounds [0.5, 40]
    expect(clampViewZoom(0.1, 5)).toBe(0.5);
    expect(clampViewZoom(1000, 5)).toBe(40);
    expect(clampViewZoom(5, 5)).toBe(5);
  });

  it("lowers the floor to the fit zoom when fit is below the display floor", () => {
    // High-res image: sourceScale 13.5 → display floor = 1.35. But the figure
    // only fits at zoom 0.9 (fitZoomFloor) — the floor must drop to 0.9 so
    // zoom-out can reach a fully-visible figure instead of stopping at 1.35.
    expect(clampViewZoom(0.5, 13.5, 0.9)).toBe(0.9);
    // Fit above the display floor: display floor still wins (don't raise it).
    expect(clampViewZoom(0.5, 13.5, 5)).toBeCloseTo(1.35, 6);
    // A zero/degenerate container must not collapse the floor to 0.
    expect(clampViewZoom(0.5, 13.5, 0)).toBeCloseTo(1.35, 6);
  });
});

describe("fitZoom", () => {
  it("returns the largest zoom that fits the model in the container", () => {
    // model 800x600, container 400x600 → width-bound → 0.5
    expect(fitZoom(400, 600, 800, 600)).toBeCloseTo(0.5, 6);
    // container 800x300 → height-bound → 0.5
    expect(fitZoom(800, 300, 800, 600)).toBeCloseTo(0.5, 6);
    // container exactly the model → 1
    expect(fitZoom(800, 600, 800, 600)).toBeCloseTo(1, 6);
  });

  it("never returns 0 or negative for a zero-sized container", () => {
    expect(fitZoom(0, 0, 800, 600)).toBeGreaterThan(0);
  });

  it("never magnifies past maxZoom for content smaller than the container", () => {
    // A large pane around an empty 800x600 figure (sourceScale 1) would
    // otherwise fit at ~1.66 and blow the blank canvas up. Cap at 1.
    expect(fitZoom(1400, 1000, 800, 600, 1)).toBeCloseTo(1, 6);
    // Still shrinks to fit when the model is larger than the container.
    expect(fitZoom(400, 600, 800, 600, 1)).toBeCloseTo(0.5, 6);
    // A high-res figure (sourceScale 5) may fit-magnify up to display-100%.
    expect(fitZoom(8000, 6000, 800, 600, 5)).toBeCloseTo(5, 6);
  });
});

describe("zoomToCssSize", () => {
  it("multiplies model dims by zoom", () => {
    expect(zoomToCssSize(2, 800, 600)).toEqual({ cssW: 1600, cssH: 1200 });
    expect(zoomToCssSize(0.5, 800, 600)).toEqual({ cssW: 400, cssH: 300 });
  });
});

describe("scrollForCursorZoom", () => {
  it("keeps the model point under the cursor fixed", () => {
    // Before: cssW 800, scrollLeft 0, cursor at x=400 (model x=400).
    // After zoom 2x: cssW 1600, the same model x=400 is now at css x=800.
    // To keep it under cursorX=400, scrollLeft must become 800-400=400.
    const r = scrollForCursorZoom({
      cursorX: 400,
      cursorY: 300,
      oldScrollLeft: 0,
      oldScrollTop: 0,
      oldCssW: 800,
      oldCssH: 600,
      newCssW: 1600,
      newCssH: 1200,
    });
    expect(r.scrollLeft).toBeCloseTo(400, 6);
    expect(r.scrollTop).toBeCloseTo(300, 6);
  });

  it("clamps scroll offsets to >= 0", () => {
    const r = scrollForCursorZoom({
      cursorX: 0,
      cursorY: 0,
      oldScrollLeft: 0,
      oldScrollTop: 0,
      oldCssW: 800,
      oldCssH: 600,
      newCssW: 400,
      newCssH: 300,
    });
    expect(r.scrollLeft).toBeGreaterThanOrEqual(0);
    expect(r.scrollTop).toBeGreaterThanOrEqual(0);
  });
});
