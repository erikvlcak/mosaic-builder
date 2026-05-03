import { useCallback, useEffect, useRef } from "react";

export interface FieldCommit {
  /** Mark a pending edit; (re)starts the debounce window. */
  markDirty(): void;
  /** Flush any pending edit immediately. Safe no-op when clean. */
  flush(): void;
}

/**
 * Wraps `history.commit` so that a burst of field edits collapses into one
 * undo entry. Call `markDirty()` on every change; call `flush()` from
 * `onBlur`/Escape so a quick blur commits without waiting for the timer.
 */
export function useFieldCommit(
  commit: () => void,
  debounceMs = 400,
): FieldCommit {
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    commitRef.current();
  }, []);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      commitRef.current();
    }, debounceMs);
  }, [debounceMs]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return { markDirty, flush };
}
