// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useKeyboardShortcuts } from "../../src/renderer/hooks/useKeyboardShortcuts";

afterEach(() => cleanup());

const noop = {
  onMerge: () => {},
  onUnmerge: () => {},
  onEscape: () => {},
};

function pressDelete(): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key: "Delete", cancelable: true });
  window.dispatchEvent(e);
  return e;
}

describe("Delete/Backspace: annotation delete vs panel unplace priority", () => {
  it("unplaces the panel when no annotation consumes the keystroke", () => {
    const onDeleteAnnotation = vi.fn(() => false); // nothing selected
    const onUnplacePanel = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({ ...noop, onDeleteAnnotation, onUnplacePanel }),
    );
    const e = pressDelete();
    expect(onDeleteAnnotation).toHaveBeenCalledOnce();
    expect(onUnplacePanel).toHaveBeenCalledOnce();
    expect(e.defaultPrevented).toBe(true);
  });

  it("annotation selection wins: unplace is NOT called when the annotation handler consumes", () => {
    const onDeleteAnnotation = vi.fn(() => true); // an annotation was deleted
    const onUnplacePanel = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({ ...noop, onDeleteAnnotation, onUnplacePanel }),
    );
    pressDelete();
    expect(onDeleteAnnotation).toHaveBeenCalledOnce();
    expect(onUnplacePanel).not.toHaveBeenCalled();
  });

  it("Backspace behaves like Delete", () => {
    const onUnplacePanel = vi.fn();
    renderHook(() => useKeyboardShortcuts({ ...noop, onUnplacePanel }));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", cancelable: true }),
    );
    expect(onUnplacePanel).toHaveBeenCalledOnce();
  });
});
