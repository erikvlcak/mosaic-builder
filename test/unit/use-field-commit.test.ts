// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFieldCommit } from "../../src/renderer/hooks/useFieldCommit";

describe("useFieldCommit", () => {
  it("debounces commits 400ms after last markDirty()", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const { result } = renderHook(() => useFieldCommit(commit, 400));
    act(() => result.current.markDirty());
    act(() => { vi.advanceTimersByTime(200); });
    act(() => result.current.markDirty());
    act(() => { vi.advanceTimersByTime(399); });
    expect(commit).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(commit).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("flush() commits immediately and cancels the pending timer", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const { result } = renderHook(() => useFieldCommit(commit, 400));
    act(() => result.current.markDirty());
    act(() => result.current.flush());
    expect(commit).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(commit).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("flush() with no pending dirty does nothing", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useFieldCommit(commit, 400));
    act(() => result.current.flush());
    expect(commit).not.toHaveBeenCalled();
  });
});
