// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useKeyboardShortcuts } from "../../src/renderer/hooks/useKeyboardShortcuts";

afterEach(() => cleanup());

const noop = {
  onMerge: () => {},
  onUnmerge: () => {},
  onEscape: () => {},
};

describe("zoom keyboard shortcuts are single-bound to the View menu", () => {
  it("the in-page shortcut hook ignores ⌘+/⌘−/⌘0/⌘1 (the menu accelerator owns them)", () => {
    renderHook(() => useKeyboardShortcuts(noop));
    for (const key of ["=", "+", "-", "0", "1"]) {
      const e = new KeyboardEvent("keydown", {
        key,
        metaKey: true,
        cancelable: true,
      });
      window.dispatchEvent(e);
      // Not preventDefaulted → nothing here claims the keystroke; a second
      // binding would double-fire against the View-menu accelerator.
      expect(e.defaultPrevented).toBe(false);
    }
  });
});
