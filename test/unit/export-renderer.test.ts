import { describe, it, expect } from "vitest";
import { renderFigureToOffscreen } from "../../src/renderer/render/export-renderer";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import type { Figure } from "../../src/renderer/model/types";

const HAS_OFFSCREEN = typeof OffscreenCanvas !== "undefined";

describe.skipIf(!HAS_OFFSCREEN)("renderFigureToOffscreen", () => {
  it("paints an opaque base so the bitmap has no transparent pixels (JPEG/TIFF/PDF flatten requirement)", () => {
    // A figure whose declared background carries alpha < 1. Without the
    // opaque base fill, transparent pixels in the resulting bitmap would be
    // flattened to black by the JPEG encoder.
    const figure: Figure = {
      canvas: { widthPx: 16, heightPx: 16, background: "#00000000" },
      grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#00000000" },
      panels: [{ row: 0, col: 0, kind: "placeholder", label: "" }],
      annotations: [],
      globalStyle: DEFAULT_GLOBAL_STYLE,
    };

    const out = renderFigureToOffscreen(figure, new Map());
    const ctx = out.canvas.getContext("2d");
    expect(ctx).not.toBeNull();
    if (ctx === null) return;

    const data = ctx.getImageData(0, 0, out.width, out.height).data;
    let zeroAlphaCount = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) zeroAlphaCount += 1;
    }
    expect(zeroAlphaCount).toBe(0);
  });
});
