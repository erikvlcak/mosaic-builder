// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useKeyboardShortcuts } from "../../src/renderer/hooks/useKeyboardShortcuts";

afterEach(() => cleanup());

function press(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const e = new KeyboardEvent("keydown", {
    key,
    metaKey: true,
    cancelable: true,
    ...opts,
  });
  window.dispatchEvent(e);
  return e;
}

const noop = {
  onMerge: () => {},
  onUnmerge: () => {},
  onEscape: () => {},
};

describe("zoom keyboard shortcuts", () => {
  it("Cmd-= zooms in, Cmd-- zooms out", () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    renderHook(() => useKeyboardShortcuts({ ...noop, onZoomIn, onZoomOut }));
    press("=");
    press("-");
    expect(onZoomIn).toHaveBeenCalledOnce();
    expect(onZoomOut).toHaveBeenCalledOnce();
  });

  it("Cmd-0 fits, Cmd-1 actual size", () => {
    const onZoomFit = vi.fn();
    const onZoomActual = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({ ...noop, onZoomFit, onZoomActual }),
    );
    press("0");
    press("1");
    expect(onZoomFit).toHaveBeenCalledOnce();
    expect(onZoomActual).toHaveBeenCalledOnce();
  });

  it("does not trigger without the Cmd/Ctrl modifier", () => {
    const onZoomFit = vi.fn();
    renderHook(() => useKeyboardShortcuts({ ...noop, onZoomFit }));
    // bare '0' is the reset-transform binding, not zoom-fit
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "0" }));
    expect(onZoomFit).not.toHaveBeenCalled();
  });
});
