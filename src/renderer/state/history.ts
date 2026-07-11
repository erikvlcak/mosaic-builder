/**
 * Generic immutable history ring buffer for undo/redo. Stores up to
 * MAX_HISTORY prior snapshots in `past`; `future` holds states peeled off
 * by undo and re-applied by redo. Any non-undo/non-redo push clears
 * `future` (no branching timeline). Capped at 50 entries — the oldest
 * past snapshot is dropped on overflow. Snapshots share structure (the
 * reducer allocates only changed fields), so the memory cost of a deeper
 * stack is trivial next to the decoded bitmaps. Snapshots are stored by
 * reference; the caller is responsible for snapshot immutability.
 */

export const MAX_HISTORY = 50;

export interface History<T> {
  readonly past: readonly T[];
  readonly future: readonly T[];
}

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] };
}

export function pushHistory<T>(h: History<T>, prev: T, _next: T): History<T> {
  const past = [...h.past, prev];
  if (past.length > MAX_HISTORY) past.shift();
  // Any non-undo/non-redo mutation discards future.
  return { past, future: [] };
}

export function undoHistory<T>(
  h: History<T>,
  current: T,
): { next: T; history: History<T> } | null {
  if (h.past.length === 0) return null;
  const past = h.past.slice(0, -1);
  const restored = h.past[h.past.length - 1] as T;
  const future = [current, ...h.future];
  // future is unbounded by past size, but redo can only re-do as many
  // steps as past held — so future is implicitly bounded by MAX_HISTORY.
  return { next: restored, history: { past, future } };
}

export function redoHistory<T>(
  h: History<T>,
  current: T,
): { next: T; history: History<T> } | null {
  if (h.future.length === 0) return null;
  const restored = h.future[0] as T;
  const future = h.future.slice(1);
  const past = [...h.past, current];
  if (past.length > MAX_HISTORY) past.shift();
  return { next: restored, history: { past, future } };
}
