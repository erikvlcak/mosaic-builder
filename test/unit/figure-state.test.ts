import { describe, it, expect } from "vitest";
import { initialFigureState } from "../../src/renderer/model/figure-state";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";

describe("initialFigureState — M6 shape", () => {
  it("includes empty annotations, default global style, and empty letterOverrides", () => {
    const s = initialFigureState();
    expect(s.annotations).toEqual([]);
    expect(s.globalStyle).toEqual(DEFAULT_GLOBAL_STYLE);
    expect(s.letterOverrides).toEqual({});
  });

  it("preserves pre-M6 fields (pool, panels, rows, cols, gutter)", () => {
    const s = initialFigureState();
    expect(s.pool).toEqual([]);
    expect(s.rows).toBe(2);
    expect(s.cols).toBe(2);
    expect(s.panels).toHaveLength(4);
    expect(s.gutterPx).toBe(12);
    expect(s.gutterColor).toBe("#FFFFFF");
  });

});
