// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useToasts, MAX_TOASTS } from "../../src/renderer/hooks/useToasts";

describe("useToasts", () => {
  it("auto-dismisses after the TTL", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToasts(5000));
    act(() => {
      result.current.push({ kind: "error", message: "boom" });
    });
    expect(result.current.toasts.length).toBe(1);
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(result.current.toasts.length).toBe(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toasts.length).toBe(0);
    vi.useRealTimers();
  });

  it("caps the tray at MAX_TOASTS, evicting the oldest (4.3)", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToasts(5000));
    act(() => {
      for (let i = 0; i < MAX_TOASTS + 3; i++) {
        result.current.push({ kind: "error", message: `m${i}` });
      }
    });
    expect(result.current.toasts.length).toBe(MAX_TOASTS);
    // The three oldest (m0, m1, m2) were evicted; the newest survive.
    expect(result.current.toasts[0]?.message).toBe("m3");
    expect(result.current.toasts.at(-1)?.message).toBe(`m${MAX_TOASTS + 2}`);
    // Evicted toasts' timers were cleared: advancing past TTL doesn't throw
    // or double-dismiss, and the surviving count is stable until TTL.
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(result.current.toasts.length).toBe(MAX_TOASTS);
    vi.useRealTimers();
  });

  it("dismiss(id) removes a specific toast immediately", () => {
    const { result } = renderHook(() => useToasts(5000));
    let id1 = "";
    act(() => {
      id1 = result.current.push({ kind: "info", message: "a" });
    });
    act(() => {
      result.current.push({ kind: "info", message: "b" });
    });
    expect(result.current.toasts.length).toBe(2);
    act(() => result.current.dismiss(id1));
    expect(result.current.toasts.length).toBe(1);
    expect(result.current.toasts[0]?.message).toBe("b");
  });
});
