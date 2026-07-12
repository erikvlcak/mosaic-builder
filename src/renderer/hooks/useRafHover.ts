import { useCallback, useEffect, useRef } from "react";

export interface RafHoverSetter {
  (value: string | null): void;
  /**
   * Commit the pending value synchronously and cancel the queued frame.
   * Call from a `drop` handler: the drop clears hover state itself, so a
   * frame firing afterward must not resurrect the stale hovered id.
   */
  flushNow: (this: void) => void;
}

/**
 * Coalesces a high-frequency stream of hover-target updates (HTML5 `dragover`
 * fires ~60×/s and continues even while the cursor is stationary) into at most
 * one React state commit per animation frame — skipping the commit when the
 * target is unchanged, and resolving the intra-frame null/target fight in
 * favor of the target.
 *
 * Why this exists: the drop-preview lives in `FigureState`-derived render — a
 * hover change re-runs the reducer + re-derives the figure + repaints the
 * full-resolution canvas. Committing that on every `dragover` starves the
 * browser's native drag loop and makes the preview flicker.
 *
 * The flicker has two independent sources; this hook kills both:
 *  1. Frequency — rAF caps recompute at one/frame, aligned to paint.
 *  2. The null/target fight — over an *empty* target panel the annotation
 *     backdrop and the GridCells panel beneath it BOTH own drag events, so the
 *     browser interleaves `dragover(target)` and `dragleave(→null)` on every
 *     sub-pixel boundary crossing. Committing the last value would toggle the
 *     preview target→null→target. So within a frame a real target always beats
 *     an interleaved null; null only wins a frame that saw no target at all
 *     (a genuine leave onto a gutter still tears the preview down next frame).
 */
export function useRafHover(
  onCommit: (value: string | null) => void,
): RafHoverSetter {
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  // The value most recently committed to React state. Dedup source of truth.
  const committedRef = useRef<string | null>(null);
  // This frame's resolution: the last non-null target seen wins; `sawTarget`
  // records whether any non-null arrived, so a frame that saw only null still
  // commits null. `hasPending` distinguishes "a frame is queued" from idle.
  const pendingTargetRef = useRef<string | null>(null);
  const sawTargetRef = useRef(false);
  const hasPendingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const commitPending = useCallback((): void => {
    rafRef.current = null;
    if (!hasPendingRef.current) return;
    hasPendingRef.current = false;
    const value = sawTargetRef.current ? pendingTargetRef.current : null;
    pendingTargetRef.current = null;
    sawTargetRef.current = false;
    if (value === committedRef.current) return;
    committedRef.current = value;
    onCommitRef.current(value);
  }, []);

  const setHover = useCallback(
    (value: string | null): void => {
      // Idle → same target: nothing to do (stationary cursor over the current
      // preview target keeps firing dragover). Bail before touching frame
      // state so we don't leave a stale latch behind with no frame to drain it.
      if (
        !hasPendingRef.current &&
        value === committedRef.current &&
        value !== null
      ) {
        return;
      }
      // Opening a fresh frame: reset this frame's latch. `hasPending` false
      // means the previous frame already drained (or none was queued).
      if (!hasPendingRef.current) {
        pendingTargetRef.current = null;
        sawTargetRef.current = false;
      }
      // A real target latches and wins the frame; an interleaved null
      // dragleave blip is ignored once a target was seen this frame.
      if (value !== null) {
        pendingTargetRef.current = value;
        sawTargetRef.current = true;
      }
      hasPendingRef.current = true;
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(commitPending);
      }
    },
    [commitPending],
  );

  const flushNow = useCallback((): void => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    commitPending();
  }, [commitPending]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const setter = setHover as RafHoverSetter;
  setter.flushNow = flushNow;
  return setter;
}
