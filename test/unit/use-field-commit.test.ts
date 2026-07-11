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
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => result.current.markDirty());
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(commit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
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
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(commit).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("flush() with no pending dirty does nothing", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useFieldCommit(commit, 400));
    act(() => result.current.flush());
    expect(commit).not.toHaveBeenCalled();
  });

  it("flushing on a target change yields one commit per target (1.3)", () => {
    // Models App.tsx's edit-target-change effect: editing target 1, then
    // switching selection (which flushes), then editing target 2 must produce
    // two distinct commits — not one coalesced step. Without the flush on the
    // switch, both markDirty bursts share the single debounce timer and
    // collapse into one commit spanning two logically separate edits.
    vi.useFakeTimers();
    const commit = vi.fn();
    const { result } = renderHook(() => useFieldCommit(commit, 400));

    // Edit target 1 (within the debounce window — timer still pending).
    act(() => result.current.markDirty());
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // Selection switches to target 2 → App flushes the pending commit.
    act(() => result.current.flush());
    expect(commit).toHaveBeenCalledTimes(1);

    // Edit target 2, let its own debounce elapse.
    act(() => result.current.markDirty());
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(commit).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
