import { describe, it, expect } from "vitest";
import { computeExportScale } from "../../src/renderer/render/export-scale";
import type { ImagePoolItem } from "../../src/renderer/model/pool";

const pool: ImagePoolItem[] = [
  {
    id: "a",
    filename: "a.png",
    filePath: "/a.png",
    mime: "image/png",
    width: 4000,
    height: 3000,
    bitDepth: 8,
  },
];

describe("export scale is independent of editor view/zoom", () => {
  it("depends only on pool + grid + model dims (no view parameter exists)", () => {
    // The editor model dims are always 800x600 regardless of zoom; the same
    // arguments always yield the same export scale. This is the structural
    // guarantee that zooming the editor cannot change exported bytes.
    const s1 = computeExportScale(pool, 1, 1, 0, 800, 600);
    const s2 = computeExportScale(pool, 1, 1, 0, 800, 600);
    expect(s1).toBe(s2);
    expect(s1).toBeCloseTo(5, 6); // 4000/800 = 5 (width-dominant)
  });
});
