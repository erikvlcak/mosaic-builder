import { useCallback, useReducer, useRef } from "react";
import {
  emptyHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  type History,
} from "./history";
import { figureReducer, type FigureAction } from "../model/figure-actions";
import { type FigureState } from "../model/figure-state";

/**
 * Action types whose dispatches do NOT push a history snapshot. They mutate
 * state but are coalesced into the next non-transient commit — typically
 * `pointerup` on a pan/zoom drag emits a `commit()` afterwards. Keep this
 * list small; anything missing here records every interim state.
 */
export const TRANSIENT_ACTIONS: ReadonlySet<FigureAction["type"]> = new Set([
  "SET_PANEL_TRANSFORM",
  "UPDATE_ANNOTATION",
  "SET_GLOBAL_STYLE",
  "SET_TRACK_WEIGHT",
  "RESIZE_PANEL_FREEFORM",
]);

interface HistoryControls {
  undo: (this: void) => void;
  redo: (this: void) => void;
  /**
   * Push the *current* state onto the undo stack. Call this on
   * `pointerup` after a drag-driven sequence of transient dispatches.
   * No-ops if the current state is identical (===) to the last commit.
   */
  commit: (this: void) => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface Combined {
  state: FigureState;
  history: History<FigureState>;
  /**
   * State at the moment of the last history push (or initial mount).
   * Used by `commit()` to decide whether the current state has diverged.
   */
  lastCommitted: FigureState;
}

type CombinedAction =
  | { kind: "dispatch"; action: FigureAction }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "commit" };

function combinedReducer(c: Combined, ca: CombinedAction): Combined {
  switch (ca.kind) {
    case "dispatch": {
      const next = figureReducer(c.state, ca.action);
      if (next === c.state) return c;
      // RESET_TO_STATE (project load) clears history wholesale.
      if (ca.action.type === "RESET_TO_STATE") {
        return { state: next, history: emptyHistory(), lastCommitted: next };
      }
      if (TRANSIENT_ACTIONS.has(ca.action.type)) {
        // Apply but don't push.
        return { ...c, state: next };
      }
      // Non-transient: push the *previous committed* state, then update.
      const history = pushHistory(c.history, c.lastCommitted, next);
      return { state: next, history, lastCommitted: next };
    }
    case "commit": {
      if (c.state === c.lastCommitted) return c;
      const history = pushHistory(c.history, c.lastCommitted, c.state);
      return { ...c, history, lastCommitted: c.state };
    }
    case "undo": {
      // First flush any uncommitted transient changes so undo affects them too.
      const base =
        c.state === c.lastCommitted
          ? c
          : {
              ...c,
              history: pushHistory(c.history, c.lastCommitted, c.state),
              lastCommitted: c.state,
            };
      const u = undoHistory(base.history, base.state);
      if (u === null) return base;
      return { state: u.next, history: u.history, lastCommitted: u.next };
    }
    case "redo": {
      // Symmetric with undo: flush any uncommitted transient changes first so
      // they seal into their own step instead of being carried onto `past` as
      // if committed. Flushing clears `future` (pushHistory), which correctly
      // makes redo a no-op here — new edits after an undo fork the timeline and
      // invalidate the redo stack.
      const base =
        c.state === c.lastCommitted
          ? c
          : {
              ...c,
              history: pushHistory(c.history, c.lastCommitted, c.state),
              lastCommitted: c.state,
            };
      const r = redoHistory(base.history, base.state);
      if (r === null) return base;
      return { state: r.next, history: r.history, lastCommitted: r.next };
    }
  }
}

export type { Combined, CombinedAction };
export { combinedReducer };

export function useHistoryReducer(
  initial: FigureState,
): [FigureState, (a: FigureAction) => void, HistoryControls] {
  const [combined, dispatchCombined] = useReducer(combinedReducer, {
    state: initial,
    history: emptyHistory<FigureState>(),
    lastCommitted: initial,
  });

  const dispatch = useCallback((a: FigureAction) => {
    dispatchCombined({ kind: "dispatch", action: a });
  }, []);
  const undo = useCallback(() => dispatchCombined({ kind: "undo" }), []);
  const redo = useCallback(() => dispatchCombined({ kind: "redo" }), []);
  const commit = useCallback(() => dispatchCombined({ kind: "commit" }), []);

  // Avoid stale-closure consumers reading canUndo/canRedo via refs.
  const ctrlRef = useRef<HistoryControls | null>(null);
  ctrlRef.current = {
    undo,
    redo,
    commit,
    canUndo:
      combined.history.past.length > 0 ||
      combined.state !== combined.lastCommitted,
    canRedo: combined.history.future.length > 0,
  };

  return [combined.state, dispatch, ctrlRef.current];
}
