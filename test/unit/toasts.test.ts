// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useToasts } from "../../src/renderer/hooks/useToasts";

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
