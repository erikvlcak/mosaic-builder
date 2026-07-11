import { describe, it, expect } from "vitest";
import { SAMPLE_FIGURE } from "../helpers/sample-figure";

// OffscreenCanvas is not available in Node by default. Skip cleanly so
// CI without a browser-like env still runs the rest of the suite.
const HAS_OFFSCREEN = typeof OffscreenCanvas !== "undefined";

describe.skipIf(!HAS_OFFSCREEN)("renderFigureToPngBlob", () => {
  it("produces a PNG blob with non-zero size for a 2x2 figure", async () => {
    const { renderFigureToPngBlob } = await import(
      "../../src/renderer/render/export-renderer"
    );

    const blob = await renderFigureToPngBlob(SAMPLE_FIGURE, new Map());
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(0);
  });
});
