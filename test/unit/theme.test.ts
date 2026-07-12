// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveEffectiveTheme,
  readStoredChoice,
  writeStoredChoice,
  applyThemeAttr,
  THEME_STORAGE_KEY,
} from "../../src/renderer/theme/theme";

describe("resolveEffectiveTheme", () => {
  it("follows the OS preference when choice is 'system'", () => {
    expect(resolveEffectiveTheme("system", true)).toBe("dark");
    expect(resolveEffectiveTheme("system", false)).toBe("light");
  });
  it("pins the explicit choice regardless of OS preference", () => {
    expect(resolveEffectiveTheme("light", true)).toBe("light");
    expect(resolveEffectiveTheme("dark", false)).toBe("dark");
  });
});

describe("readStoredChoice / writeStoredChoice", () => {
  beforeEach(() => localStorage.clear());
  it("defaults to 'system' when nothing is stored", () => {
    expect(readStoredChoice()).toBe("system");
  });
  it("defaults to 'system' when the stored value is garbage", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "chartreuse");
    expect(readStoredChoice()).toBe("system");
  });
  it("round-trips a valid choice", () => {
    writeStoredChoice("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(readStoredChoice()).toBe("dark");
  });
});

describe("applyThemeAttr", () => {
  it("removes data-theme for 'system' (lets the media query drive)", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    applyThemeAttr("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
  it("stamps the explicit choice", () => {
    applyThemeAttr("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    applyThemeAttr("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
