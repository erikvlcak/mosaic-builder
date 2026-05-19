import { describe, it, expect } from "vitest";
import {
  SYMBOL_LIBRARY,
  SYMBOL_LIBRARY_BY_ID,
  DEFAULT_SYMBOL_ID,
  DEFAULT_FILL_MODE,
  DEFAULT_STROKE_STYLE,
  DEFAULT_SYMBOL_COLOR,
  DEFAULT_SYMBOL_STROKE,
} from "../../src/renderer/symbols/library";

describe("symbol library", () => {
  it("contains exactly 6 arrow ids", () => {
    const arrowIds = SYMBOL_LIBRARY.filter((s) =>
      s.id.startsWith("arrow-"),
    ).map((s) => s.id);
    expect(arrowIds.sort()).toEqual([
      "arrow-double-right",
      "arrow-filled-right",
      "arrow-line-right",
      "arrow-open-right",
      "arrow-thick-right",
      "arrow-thin-right",
    ]);
  });

  it("contains the expected shape ids (existing 8 + 12 new)", () => {
    const shapeIds = SYMBOL_LIBRARY.filter((s) =>
      s.id.startsWith("shape-"),
    ).map((s) => s.id);
    expect(shapeIds.sort()).toEqual(
      [
        "shape-asterisk",
        "shape-chevron",
        "shape-circle",
        "shape-cross",
        "shape-diamond",
        "shape-heart",
        "shape-hexagon",
        "shape-lightning",
        "shape-octagon",
        "shape-oval",
        "shape-parallelogram",
        "shape-pentagon",
        "shape-plus",
        "shape-right-triangle",
        "shape-rounded-square",
        "shape-speech-bubble",
        "shape-square",
        "shape-star",
        "shape-trapezoid",
        "shape-triangle",
      ].sort(),
    );
  });

  it("contains no marker-* or bracket-* entries", () => {
    expect(SYMBOL_LIBRARY.some((s) => s.id.startsWith("marker-"))).toBe(false);
    expect(SYMBOL_LIBRARY.some((s) => s.id.startsWith("bracket-"))).toBe(false);
  });

  it("every entry has a `geometry` of 'closed' or 'stroke-only' and no legacy `category` or `fill` fields", () => {
    for (const def of SYMBOL_LIBRARY) {
      expect(def.geometry === "closed" || def.geometry === "stroke-only").toBe(
        true,
      );
      expect(
        (def as unknown as { category?: unknown }).category,
      ).toBeUndefined();
      expect((def as unknown as { fill?: unknown }).fill).toBeUndefined();
    }
  });

  it("classifies the four currently-stroke-only arrows as 'stroke-only'", () => {
    const strokeOnly = [
      "arrow-open-right",
      "arrow-line-right",
      "arrow-double-right",
    ];
    for (const id of strokeOnly) {
      expect(SYMBOL_LIBRARY_BY_ID.get(id)?.geometry).toBe("stroke-only");
    }
  });

  it("classifies the closed arrows as 'closed'", () => {
    for (const id of [
      "arrow-filled-right",
      "arrow-thin-right",
      "arrow-thick-right",
    ]) {
      expect(SYMBOL_LIBRARY_BY_ID.get(id)?.geometry).toBe("closed");
    }
  });

  it("classifies shape-asterisk as stroke-only and the rest of shapes as closed", () => {
    expect(SYMBOL_LIBRARY_BY_ID.get("shape-asterisk")?.geometry).toBe(
      "stroke-only",
    );
    const closedShapes = SYMBOL_LIBRARY.filter(
      (s) => s.id.startsWith("shape-") && s.id !== "shape-asterisk",
    );
    for (const s of closedShapes) {
      expect(s.geometry).toBe("closed");
    }
  });

  it("exposes default constants", () => {
    expect(DEFAULT_SYMBOL_ID).toBe("arrow-filled-right");
    expect(DEFAULT_FILL_MODE).toBe("filled");
    expect(DEFAULT_STROKE_STYLE).toBe("solid");
    expect(typeof DEFAULT_SYMBOL_COLOR).toBe("string");
    expect(typeof DEFAULT_SYMBOL_STROKE).toBe("number");
  });
});
