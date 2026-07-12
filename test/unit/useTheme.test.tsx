// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "../../src/renderer/theme/useTheme";
import { THEME_STORAGE_KEY } from "../../src/renderer/theme/theme";

function stubMatchMedia(prefersDark: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: prefersDark,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    stubMatchMedia(true); // OS prefers dark by default in these tests
  });

  it("defaults to system and resolves the OS preference", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.choice).toBe("system");
    expect(result.current.effectiveTheme).toBe("dark");
  });

  it("pinning light wins over a dark OS and persists + stamps the attribute", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setChoice("light"));
    expect(result.current.choice).toBe("light");
    expect(result.current.effectiveTheme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("reads a previously stored choice on mount", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.choice).toBe("dark");
    expect(result.current.effectiveTheme).toBe("dark");
  });
});
