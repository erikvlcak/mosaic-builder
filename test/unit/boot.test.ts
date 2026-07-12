// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { applyStoredTheme } from "../../src/renderer/theme/boot";
import { THEME_STORAGE_KEY } from "../../src/renderer/theme/theme";

describe("applyStoredTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("stamps an explicit stored dark choice onto <html>", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    applyStoredTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("leaves <html> unstamped for a system (default) choice", () => {
    applyStoredTheme();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
