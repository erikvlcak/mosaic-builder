// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  detectMac,
  glyphsFor,
  MAC_GLYPHS,
  PC_GLYPHS,
} from "../../src/renderer/platform/shortcuts";

// Strings captured from a real Electron 43 renderer, not invented. The two
// APIs spell the platform differently and are available in different contexts;
// shipping the wrong branch printed Windows hints on macOS.
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.47 Electron/43.1.0 Safari/537.36";
const WIN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.47 Electron/43.1.0 Safari/537.36";

describe("detectMac", () => {
  it('matches userAgentData.platform "macOS" despite the lowercase m', () => {
    expect(detectMac({ userAgentData: { platform: "macOS" } })).toBe(true);
  });

  it('matches the UA string "Macintosh" when userAgentData is absent', () => {
    // file:// in a packaged build drops userAgentData — this is the only
    // signal left there.
    expect(detectMac({ userAgent: MAC_UA })).toBe(true);
  });

  it("detects a Mac when both sources are present (dev-server case)", () => {
    expect(
      detectMac({ userAgentData: { platform: "macOS" }, userAgent: MAC_UA }),
    ).toBe(true);
  });

  it("reports false on Windows from either source", () => {
    expect(detectMac({ userAgentData: { platform: "Windows" } })).toBe(false);
    expect(detectMac({ userAgent: WIN_UA })).toBe(false);
    expect(
      detectMac({ userAgentData: { platform: "Windows" }, userAgent: WIN_UA }),
    ).toBe(false);
  });

  it("reports false rather than throwing when navigator tells us nothing", () => {
    expect(detectMac({})).toBe(false);
    expect(detectMac({ userAgentData: {} })).toBe(false);
  });
});

describe("glyphsFor", () => {
  it("selects the Mac glyph set on darwin", () => {
    expect(glyphsFor(true)).toBe(MAC_GLYPHS);
  });

  it("selects the word-based set everywhere else", () => {
    expect(glyphsFor(false)).toBe(PC_GLYPHS);
  });
});

describe("chord", () => {
  it("sets Mac glyphs flush, the way Apple's own menus do", () => {
    expect(MAC_GLYPHS.chord(MAC_GLYPHS.mod, "Z")).toBe("⌘Z");
    expect(MAC_GLYPHS.chord(MAC_GLYPHS.shift, MAC_GLYPHS.mod, "Z")).toBe("⇧⌘Z");
  });

  it("joins Windows/Linux key names with +", () => {
    expect(PC_GLYPHS.chord(PC_GLYPHS.mod, "Z")).toBe("Ctrl+Z");
    expect(PC_GLYPHS.chord(PC_GLYPHS.shift, PC_GLYPHS.mod, "Z")).toBe(
      "Shift+Ctrl+Z",
    );
  });

  it("spells out the zoom keys so Windows never renders 'Ctrl++'", () => {
    expect(PC_GLYPHS.chord(PC_GLYPHS.mod, PC_GLYPHS.plus)).toBe("Ctrl+Plus");
    expect(PC_GLYPHS.chord(PC_GLYPHS.mod, PC_GLYPHS.minus)).toBe("Ctrl+Minus");
  });
});

describe("PC glyph set", () => {
  it("contains no Mac-only symbols — they render as tofu or confuse PC users", () => {
    const printed = [
      PC_GLYPHS.mod,
      PC_GLYPHS.shift,
      PC_GLYPHS.alt,
      PC_GLYPHS.del,
      PC_GLYPHS.plus,
      PC_GLYPHS.minus,
    ].join(" ");
    expect(printed).not.toMatch(/[⌘⇧⌥⌫]/);
  });
});
