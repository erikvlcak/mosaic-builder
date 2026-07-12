import { describe, it, expect } from "vitest";
import {
  nextViewForZoomIn,
  nextViewForZoomOut,
  nextViewForActualSize,
  nextViewForPercent,
  deriveCss,
  ZOOM_STEP,
} from "../../src/renderer/hooks/useCanvasZoom";

const SOURCE = 4; // 4x source figure
const MODEL = { w: 800, h: 600 };

describe("useCanvasZoom pure helpers", () => {
  it("zoomIn multiplies by ZOOM_STEP and switches to free mode", () => {
    const v = nextViewForZoomIn({ zoom: 1, mode: "fit" }, SOURCE);
    expect(v.mode).toBe("free");
    expect(v.zoom).toBeCloseTo(ZOOM_STEP, 6);
  });

  it("zoomOut divides by ZOOM_STEP", () => {
    const v = nextViewForZoomOut({ zoom: 2, mode: "free" }, SOURCE);
    expect(v.zoom).toBeCloseTo(2 / ZOOM_STEP, 6);
  });

  it("actualSize sets zoom to sourceScale (display 100%)", () => {
    const v = nextViewForActualSize(SOURCE);
    expect(v).toEqual({ zoom: SOURCE, mode: "free" });
  });

  it("setPercent maps display-% to zoom via sourceScale", () => {
    const v = nextViewForPercent(200, SOURCE);
    // 200% of source-100% → zoom = 2 * sourceScale = 8
    expect(v.zoom).toBeCloseTo(8, 6);
    expect(v.mode).toBe("free");
  });

  it("clamps zoom to the source-scaled bounds", () => {
    const v = nextViewForPercent(100000, SOURCE);
    expect(v.zoom).toBeCloseTo(8 * SOURCE, 6); // ZOOM_MAX * sourceScale
  });

  it("deriveCss returns model*zoom and the display percent", () => {
    const d = deriveCss(
      { zoom: SOURCE, mode: "free" },
      SOURCE,
      MODEL.w,
      MODEL.h,
    );
    expect(d.cssW).toBe(800 * SOURCE);
    expect(d.cssH).toBe(600 * SOURCE);
    expect(d.displayPct).toBe(100); // zoom === sourceScale
  });
});
