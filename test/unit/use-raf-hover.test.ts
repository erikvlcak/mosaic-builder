// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRafHover } from "../../src/renderer/hooks/useRafHover";

// A controllable requestAnimationFrame: rAF callbacks queue until flushRaf()
// runs them, so a test can pump a whole burst of setHover() calls through a
// single frame and assert the coalescing.
let rafQueue: FrameRequestCallback[] = [];
let rafSeq = 0;

beforeEach(() => {
  rafQueue = [];
  rafSeq = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    rafQueue.push(cb);
    return ++rafSeq;
  });
  vi.stubGlobal("cancelAnimationFrame", (): void => {
    // The hook cancels by id, but for these tests we drive frames explicitly
    // via flushRaf(); a no-op cancel is sufficient because flushRaf only runs
    // callbacks the hook still considers pending (it re-checks its own ref).
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function flushRaf(): void {
  const q = rafQueue;
  rafQueue = [];
  for (const cb of q) cb(performance.now?.() ?? 0);
}

describe("useRafHover", () => {
  it("coalesces a burst of setHover() calls into a single commit per frame", () => {
    const onCommit = vi.fn<(v: string | null) => void>();
    const { result } = renderHook(() => useRafHover(onCommit));

    act(() => {
      // A dragover burst: many events, all in the same frame.
      result.current("a");
      result.current("b");
      result.current("c");
    });
    // Nothing committed yet — the frame hasn't run.
    expect(onCommit).not.toHaveBeenCalled();

    act(() => flushRaf());
    // Exactly one commit, carrying the LATEST value from the burst.
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenLastCalledWith("c");
  });

  it("skips the commit entirely when the value has not changed", () => {
    const onCommit = vi.fn<(v: string | null) => void>();
    const { result } = renderHook(() => useRafHover(onCommit));

    // First frame commits "a".
    act(() => result.current("a"));
    act(() => flushRaf());
    expect(onCommit).toHaveBeenCalledTimes(1);

    // A stationary cursor keeps firing dragover with the same target — these
    // must not schedule or commit anything.
    act(() => {
      result.current("a");
      result.current("a");
    });
    act(() => flushRaf());
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("commits null (drag-leave) like any other value", () => {
    const onCommit = vi.fn<(v: string | null) => void>();
    const { result } = renderHook(() => useRafHover(onCommit));

    act(() => result.current("a"));
    act(() => flushRaf());
    act(() => result.current(null));
    act(() => flushRaf());

    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenLastCalledWith(null);
  });

  it("a later frame reflects the newest value after an intervening change", () => {
    const onCommit = vi.fn<(v: string | null) => void>();
    const { result } = renderHook(() => useRafHover(onCommit));

    act(() => result.current("a"));
    act(() => flushRaf());
    act(() => result.current("b"));
    act(() => flushRaf());

    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });

  it("within one frame, a non-null target beats a null clear regardless of order", () => {
    // The flicker repro: over an empty target the annotation-layer backdrop and
    // the GridCells panel underneath BOTH own drag events, so the browser fires
    // dragover(target) and dragleave(null) against each other on every sub-pixel
    // boundary crossing. If the null (arriving last) won, the preview would
    // toggle target→null→target = flicker. A frame that saw any real target
    // must commit that target, not the interleaved null.
    const onCommit = vi.fn<(v: string | null) => void>();
    const { result } = renderHook(() => useRafHover(onCommit));

    // Order 1: over, then leave (null arrives LAST) — the common case.
    act(() => {
      result.current("target");
      result.current(null);
    });
    act(() => flushRaf());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenLastCalledWith("target");

    // Order 2: leave, then over — same frame, target still wins.
    act(() => {
      result.current(null);
      result.current("target2");
    });
    act(() => flushRaf());
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenLastCalledWith("target2");
  });

  it("a frame that saw ONLY null commits null (genuine drag-leave still clears)", () => {
    const onCommit = vi.fn<(v: string | null) => void>();
    const { result } = renderHook(() => useRafHover(onCommit));

    act(() => result.current("target"));
    act(() => flushRaf());
    expect(onCommit).toHaveBeenLastCalledWith("target");

    // Next frame: only null (cursor truly left onto a gutter — no dragover
    // re-asserts a panel). Null must win so the preview tears down.
    act(() => result.current(null));
    act(() => flushRaf());
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenLastCalledWith(null);
  });

  it("flushNow() commits the pending value immediately and cancels the frame", () => {
    const onCommit = vi.fn<(v: string | null) => void>();
    const { result } = renderHook(() => useRafHover(onCommit));

    act(() => {
      result.current("a");
      // Drop fires synchronously; the pending hover must be flushed so the
      // drop's own state (cleared hover) isn't clobbered by a late frame.
      result.current.flushNow();
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenLastCalledWith("a");

    // The already-scheduled frame must be a no-op now (value drained).
    act(() => flushRaf());
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
