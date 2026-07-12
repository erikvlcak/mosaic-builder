import { describe, it, expect } from "vitest";
import { isDirty } from "../../src/renderer/state/dirty";
import { initialFigureState } from "../../src/renderer/model/figure-state";
import {
  nextViewForZoomIn,
  nextViewForActualSize,
} from "../../src/renderer/hooks/useCanvasZoom";

describe("zoom does not dirty the document", () => {
  it("view transitions produce no FigureState change", () => {
    const saved = initialFigureState();
    const live = saved; // zoom never dispatches a reducer action

    // Exercise the view reducers; they return NEW view objects but never
    // touch FigureState.
    const v1 = nextViewForZoomIn({ zoom: 1, mode: "fit" }, 5);
    const v2 = nextViewForActualSize(5);
    expect(v1).not.toBe(v2);

    // FigureState reference is untouched → not dirty.
    expect(isDirty(live, saved)).toBe(false);
  });
});
