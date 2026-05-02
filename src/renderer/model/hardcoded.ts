import type { Figure } from "./types";
import { DEFAULT_TRANSFORM } from "./panels";
import { DEFAULT_GLOBAL_STYLE } from "./global-style";

export const SAMPLE_IMAGE_URL = "/fixtures/sample.png";
export const SAMPLE_IMAGE_ID = "sample";

/**
 * The single, hard-coded figure rendered in M2. M3 replaces this with
 * a real, drag-driven image pool + grid state.
 */
export const HARDCODED_FIGURE: Figure = {
  canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
  grid: { rows: 2, cols: 2, gutterPx: 12, gutterColor: "#FFFFFF" },
  panels: [
    { row: 0, col: 0, kind: "image", imageId: SAMPLE_IMAGE_ID, transform: DEFAULT_TRANSFORM },
    { row: 0, col: 1, kind: "placeholder", label: "B" },
    { row: 1, col: 0, kind: "placeholder", label: "C" },
    { row: 1, col: 1, kind: "placeholder", label: "D" },
  ],
  annotations: [],
  globalStyle: DEFAULT_GLOBAL_STYLE,
};
