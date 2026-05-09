import { describe, it, expect } from "vitest";
import {
  SYMBOL_LIBRARY,
  SYMBOL_LIBRARY_BY_ID,
  SYMBOL_CATEGORIES,
  type SymbolDef,
} from "../../src/renderer/symbols/library";

describe("SYMBOL_LIBRARY", () => {
  it("has 24 entries", () => {
    expect(SYMBOL_LIBRARY).toHaveLength(24);
  });

  it("has unique ids", () => {
    const ids = SYMBOL_LIBRARY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers all four categories", () => {
    const seen = new Set(SYMBOL_LIBRARY.map((s) => s.category));
    expect(seen).toEqual(new Set(["arrow", "shape", "marker", "bracket"]));
  });

  it("every category has at least one entry", () => {
    for (const c of SYMBOL_CATEGORIES) {
      expect(SYMBOL_LIBRARY.some((s) => s.category === c)).toBe(true);
    }
  });

  it("every pathD is a non-empty string composed only of valid SVG path tokens", () => {
    // Path2D is a browser-only constructor and the project's Vitest envs
    // (node + jsdom) don't ship it, so we structurally validate instead:
    //   - non-empty
    //   - first non-whitespace token is an absolute moveto ("M")
    //   - every character is one of: SVG path commands, numbers, separators
    const TOKEN_RE = /^[\s\d.,\-+eEMmLlHhVvCcSsQqTtAaZz]+$/;
    for (const def of SYMBOL_LIBRARY) {
      expect(def.pathD.length).toBeGreaterThan(0);
      expect(def.pathD.trimStart().startsWith("M")).toBe(true);
      expect(TOKEN_RE.test(def.pathD)).toBe(true);
    }
  });

  it("includes the three migration-target arrow ids", () => {
    const required = [
      "arrow-open-right",
      "arrow-filled-right",
      "arrow-line-right",
    ];
    const ids = new Set(SYMBOL_LIBRARY.map((s) => s.id));
    for (const id of required) expect(ids.has(id)).toBe(true);
  });

  it("SYMBOL_LIBRARY_BY_ID is consistent with SYMBOL_LIBRARY", () => {
    expect(SYMBOL_LIBRARY_BY_ID.size).toBe(SYMBOL_LIBRARY.length);
    for (const def of SYMBOL_LIBRARY) {
      expect(SYMBOL_LIBRARY_BY_ID.get(def.id)).toBe(def);
    }
  });

  it("each SymbolDef has well-typed fields", () => {
    for (const def of SYMBOL_LIBRARY) {
      const ok: SymbolDef = def;
      expect(typeof ok.id).toBe("string");
      expect(typeof ok.label).toBe("string");
      expect(typeof ok.pathD).toBe("string");
      expect(typeof ok.fill).toBe("boolean");
    }
  });
});
