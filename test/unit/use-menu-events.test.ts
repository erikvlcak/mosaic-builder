// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMenuEvents } from "../../src/renderer/hooks/useMenuEvents";

describe("useMenuEvents", () => {
  it("subscribes via window.api.onMenuEvent and forwards to handlers", () => {
    let listener: ((ev: string) => void) | undefined;
    const unsubscribe = vi.fn();
    // Simulate the preload-injected window.api shape, restricted to what the
    // hook touches (just `onMenuEvent`).
    (
      globalThis as unknown as {
        api: { onMenuEvent: (cb: (ev: string) => void) => () => void };
      }
    ).api = {
      onMenuEvent: (cb) => {
        listener = cb;
        return unsubscribe;
      },
    };
    const handlers = {
      onNew: vi.fn(),
      onOpen: vi.fn(),
      onSave: vi.fn(),
      onSaveAs: vi.fn(),
      onExportPng: vi.fn(),
      onExportJpeg: vi.fn(),
      onExportTiff: vi.fn(),
      onExportPdf: vi.fn(),
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
      onZoomFit: vi.fn(),
      onZoomActual: vi.fn(),
    };
    const { unmount } = renderHook(() => useMenuEvents(handlers));
    listener?.("menu:save");
    listener?.("menu:undo");
    listener?.("menu:zoom-in");
    listener?.("menu:zoom-fit");
    expect(handlers.onSave).toHaveBeenCalledTimes(1);
    expect(handlers.onUndo).toHaveBeenCalledTimes(1);
    expect(handlers.onZoomIn).toHaveBeenCalledTimes(1);
    expect(handlers.onZoomFit).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
