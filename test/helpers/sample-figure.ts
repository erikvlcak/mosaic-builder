import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_TRANSFORM } from "../../src/renderer/model/panels";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";

export const SAMPLE_IMAGE_ID = "sample";

/**
 * A small, self-contained figure used by the (OffscreenCanvas-gated) export
 * tests. Lives under test/ rather than src/ — it was the M2 milestone's
 * hard-coded figure and is no longer referenced by any production code.
 */
export const SAMPLE_FIGURE: Figure = {
  canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
  grid: { rows: 2, cols: 2, gutterPx: 12, gutterColor: "#FFFFFF" },
  panels: [
    {
      row: 0,
      col: 0,
      kind: "image",
      imageId: SAMPLE_IMAGE_ID,
      transform: DEFAULT_TRANSFORM,
    },
    { row: 0, col: 1, kind: "placeholder", label: "B" },
    { row: 1, col: 0, kind: "placeholder", label: "C" },
    { row: 1, col: 1, kind: "placeholder", label: "D" },
  ],
  annotations: [],
  globalStyle: DEFAULT_GLOBAL_STYLE,
};
