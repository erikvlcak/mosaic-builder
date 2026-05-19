# M7 — Project Save/Load + Undo/Redo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist figures to a `.mosaic` JSON file (with relink-on-missing-image flow) and add Cmd/Ctrl-Z undo / Cmd/Ctrl-Shift-Z redo backed by a 10-deep ring buffer of immutable `FigureState` snapshots.

**Architecture:** Two independent subsystems built sequentially. (A) A generic `history.ts` ring buffer wraps the existing `figureReducer`; pan/zoom drags use a transient action class plus an explicit `commit()` on `pointerup` so a single drag costs one history slot. (B) A versioned `.mosaic` JSON schema serializes `FigureState` + figure-canvas dims; loader resolves images by `relPath` → `sourcePath` → user re-pick (modal); bitmap cache is rebuilt on load by replaying the existing `decodeImageBytes` pipeline. Bitmaps live outside both history and `.mosaic` — ImageBitmaps are runtime-only.

**Tech Stack:** TypeScript 5.6 strict, React 18.3 `useReducer`, Vitest 2.1, Electron 32 (`ipcMain.handle` + `contextBridge`), Node `crypto` (sha256), Node `fs/promises` + `path`. **No new dependencies.** (No immer, no zustand, no zod — the existing vanilla reducer is enough; we hand-roll a small validator.)

---

## Pre-flight context (read once before starting)

Current state of the codebase the plan assumes:

- `src/renderer/model/figure-state.ts` exports `FigureState`, `initialFigureState()`, and re-exports `figureReducer`.
- `src/renderer/model/figure-actions.ts` exports the `FigureAction` union and `figureReducer`.
- `src/renderer/App.tsx:54` uses `const [state, dispatch] = useReducer(figureReducer, undefined, () => initialFigureState())`. M7 replaces this call site only — every other dispatch site stays the same.
- `src/renderer/App.tsx:57` holds the bitmap cache: `useState<Map<string, ImageBitmap>>(new Map())`. Bitmaps are NEVER persisted.
- `src/renderer/components/Grid/PanelInteractionLayer.tsx:97,150` dispatches `setPanelTransform` on every `wheel` and `pointermove`. This is the only continuous mutator; M7 marks it transient and adds a single explicit `commit()` on `pointerup`.
- `src/renderer/hooks/useKeyboardShortcuts.ts:25` returns early on `metaKey || ctrlKey`. M7 must re-enter that branch only for `z`/`Z` so the existing M/U/R/H/V/0/Delete/Escape behavior is unchanged.
- `src/main/index.ts:94` registers IPC; `src/preload/api.ts:6` lists channels. M7 adds `project:save` and `project:load`.
- `src/renderer/components/Annotations/CalibrationModal.tsx` is the reference pattern for the relink modal.
- Tests live in `test/unit/` named `*.test.ts`; runner is Vitest (`pnpm test`), config `vitest.config.ts` sets `environment: "node"`. The Node environment matters: tests that touch `ImageBitmap` won't work — keep history/schema tests pure-data.
- File paths from `openImages` are absolute and pre-resolved (`src/main/open-images.ts:54` calls `path.resolve`).

---

## File structure

**New files:**

- `src/renderer/state/history.ts` — generic immutable ring-buffer history (pure, no React).
- `src/renderer/state/use-history-reducer.ts` — React hook wrapping `useReducer` with `history.ts`.
- `src/renderer/model/schema.ts` — `MosaicFileV1` types + `validateMosaicFileV1` + version dispatch.
- `src/renderer/model/serialize.ts` — `toMosaicFile()` and `fromMosaicFile()` pure converters.
- `src/main/project-io.ts` — main-process `saveProject` / `loadProject` (sha256, fs read/write, path picker glue).
- `src/main/sha256.ts` — tiny wrapper around `node:crypto` for file hashing.
- `src/renderer/components/Modals/RelinkModal.tsx` — UI for resolving missing images on load.
- `test/unit/history.test.ts`
- `test/unit/schema.test.ts`
- `test/unit/serialize.test.ts`
- `test/unit/project-io.test.ts`
- `test/unit/sha256.test.ts`

**Modified files:**

- `src/renderer/model/figure-actions.ts` — add `RESET_TO_STATE` action (used by load-from-disk).
- `src/renderer/App.tsx` — swap `useReducer` for `useHistoryReducer`; add Save/Save As/Open buttons; wire load → bitmap rehydrate + relink modal.
- `src/renderer/hooks/useKeyboardShortcuts.ts` — add `onUndo`/`onRedo` handlers gated on Cmd/Ctrl modifier.
- `src/preload/api.ts` — add `project:save` / `project:load` channels and types.
- `src/preload/preload.ts` — bind new channels.
- `src/main/index.ts` — register new IPC handlers.
- `src/main/dialogs.ts` — add `pickMosaicSavePath` and `pickMosaicOpenPath`.

---

## Task list

> **TDD discipline:** every task that adds production code starts with a failing test.
> **Commit cadence:** one commit per task.
> Type-check before each commit: `pnpm typecheck`.

---

### Task 1: Generic history ring (10-deep)

**Files:**

- Create: `src/renderer/state/history.ts`
- Create: `test/unit/history.test.ts`

The history is a pure data type, generic over the snapshot type. We test it on a trivial number-state for clarity, then plug `FigureState` in later.

- [ ] **Step 1: Write the failing test**

`test/unit/history.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  emptyHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  MAX_HISTORY,
  type History,
} from "../../src/renderer/state/history";

describe("history ring buffer", () => {
  it("starts empty and reports no undo/redo", () => {
    const h: History<number> = emptyHistory();
    expect(h.past).toEqual([]);
    expect(h.future).toEqual([]);
  });

  it("push records previous state in `past` and clears `future`", () => {
    let h: History<number> = emptyHistory();
    h = pushHistory(h, 1, 2); // prev=1, next=2
    h = pushHistory(h, 2, 3);
    expect(h.past).toEqual([1, 2]);
    expect(h.future).toEqual([]);
  });

  it("undo moves current → future, returns top of past as current", () => {
    let h: History<number> = emptyHistory();
    h = pushHistory(h, 1, 2);
    h = pushHistory(h, 2, 3);
    const u = undoHistory(h, 3);
    expect(u).toEqual({
      next: 2,
      history: { past: [1], future: [3] },
    });
  });

  it("redo is the inverse of undo", () => {
    let h: History<number> = emptyHistory();
    h = pushHistory(h, 1, 2);
    const u = undoHistory(h, 2);
    expect(u).not.toBeNull();
    const r = redoHistory(u!.history, u!.next);
    expect(r).toEqual({
      next: 2,
      history: { past: [1], future: [] },
    });
  });

  it("undo on empty past returns null", () => {
    const h: History<number> = emptyHistory();
    expect(undoHistory(h, 0)).toBeNull();
  });

  it("redo on empty future returns null", () => {
    const h: History<number> = emptyHistory();
    expect(redoHistory(h, 0)).toBeNull();
  });

  it("a new push after undo discards the future", () => {
    let h: History<number> = emptyHistory();
    h = pushHistory(h, 1, 2);
    h = pushHistory(h, 2, 3);
    const u = undoHistory(h, 3)!;
    const next = pushHistory(u.history, u.next, 99);
    expect(next.future).toEqual([]);
    expect(next.past).toEqual([1, 2]);
  });

  it("caps past at MAX_HISTORY (=10), dropping the oldest", () => {
    expect(MAX_HISTORY).toBe(10);
    let h: History<number> = emptyHistory();
    let cur = 0;
    // 12 pushes → past should hold the 10 most-recent prior states (0..11 prev).
    for (let i = 0; i < 12; i++) {
      h = pushHistory(h, cur, cur + 1);
      cur += 1;
    }
    expect(h.past.length).toBe(10);
    expect(h.past[0]).toBe(2); // oldest retained
    expect(h.past[9]).toBe(11); // most recent past
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/history.test.ts`
Expected: FAIL — `Cannot find module '../../src/renderer/state/history'`.

- [ ] **Step 3: Write the implementation**

`src/renderer/state/history.ts`:

```ts
/**
 * Generic immutable history ring buffer for undo/redo. Stores up to
 * MAX_HISTORY prior snapshots in `past`; `future` holds states peeled off
 * by undo and re-applied by redo. Any non-undo/non-redo push clears
 * `future` (no branching timeline). Capped at 10 entries — the oldest
 * past snapshot is dropped on overflow. Snapshots are stored by reference;
 * the caller is responsible for snapshot immutability.
 */

export const MAX_HISTORY = 10;

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/history.test.ts`
Expected: PASS — 7 tests pass.

- [ ] **Step 5: Type-check and commit**

```bash
pnpm typecheck
git add src/renderer/state/history.ts test/unit/history.test.ts
git commit -m "feat(m7): generic 10-deep history ring buffer"
```

---

### Task 2: `useHistoryReducer` hook with transient + commit

**Files:**

- Create: `src/renderer/state/use-history-reducer.ts`
- Modify: `src/renderer/model/figure-actions.ts` (add one new action: `RESET_TO_STATE`)
- Modify: `test/unit/figure-actions.test.ts` (add a test for `RESET_TO_STATE`)
- Test: hook tested via behavior in subsequent tasks (App-integration task validates it; unit-testing a React hook in node-environment would require @testing-library/react which is not installed and is out of scope for M7)

The hook layers on top of `useReducer`. It returns `[state, dispatch, { undo, redo, commit, canUndo, canRedo }]`. Transient action types skip the history push; on `commit()` the next action's pre-state is pushed.

- [ ] **Step 1: Add the `RESET_TO_STATE` action — write the failing test**

In `test/unit/figure-actions.test.ts`, append a new `describe` block at the end of the file. First read the file to find the last `});` closing the outermost describe so the new block sits at top level:

```ts
describe("RESET_TO_STATE", () => {
  it("replaces the entire FigureState with the provided one", () => {
    __resetPanelIdsForTests();
    const a = initialFigureState();
    const b: FigureState = {
      ...initialFigureState(),
      gutterPx: 99,
      gutterColor: "#123456",
    };
    const next = figureReducer(a, { type: "RESET_TO_STATE", state: b });
    expect(next).toBe(b); // identity preserved — it's a wholesale replace
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/unit/figure-actions.test.ts -t "RESET_TO_STATE"`
Expected: FAIL — `figureReducer` exhaustive-check rejects unknown action OR test sees the reducer return `a` unchanged.

- [ ] **Step 3: Add `RESET_TO_STATE` to the action union and reducer**

In `src/renderer/model/figure-actions.ts`, add to the `FigureAction` union (alphabetized with the others is fine; place it last for diff clarity):

```ts
  | { type: "SET_IMAGE_CALIBRATION"; imageId: string; calibration: Calibration | null }
  | { type: "RESET_TO_STATE"; state: FigureState };
```

Add the action creator near the bottom of the action creators section:

```ts
export const resetToState = (state: FigureState): FigureAction => ({
  type: "RESET_TO_STATE",
  state,
});
```

In the reducer's switch, add a case BEFORE the `default:`:

```ts
    case "RESET_TO_STATE": {
      return a.state;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/figure-actions.test.ts -t "RESET_TO_STATE"`
Expected: PASS.

- [ ] **Step 5: Implement `useHistoryReducer`**

`src/renderer/state/use-history-reducer.ts`:

```ts
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
const TRANSIENT_ACTIONS: ReadonlySet<FigureAction["type"]> = new Set([
  "SET_PANEL_TRANSFORM",
]);

interface HistoryControls {
  undo: () => void;
  redo: () => void;
  /**
   * Push the *current* state onto the undo stack. Call this on
   * `pointerup` after a drag-driven sequence of transient dispatches.
   * No-ops if the current state is identical (===) to the last commit.
   */
  commit: () => void;
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
      const r = redoHistory(c.history, c.state);
      if (r === null) return c;
      return { state: r.next, history: r.history, lastCommitted: r.next };
    }
  }
}

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
```

- [ ] **Step 6: Type-check**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/state/use-history-reducer.ts \
        src/renderer/model/figure-actions.ts \
        test/unit/figure-actions.test.ts
git commit -m "feat(m7): RESET_TO_STATE action + useHistoryReducer with transient/commit"
```

---

### Task 3: Wire `useHistoryReducer` into `App.tsx`

**Files:**

- Modify: `src/renderer/App.tsx:54` (`useReducer` → `useHistoryReducer`); pass new history controls to keyboard hook
- Modify: `src/renderer/components/Grid/PanelInteractionLayer.tsx` (call `commit()` on `pointerup` and on `wheel` end)

This is a structural change — no new behavior visible to the user yet. We verify by running the full existing test suite and the dev app smoke test. Hook behavior is end-to-end-tested via the keyboard task below; no new unit test in this step.

- [ ] **Step 1: Replace `useReducer` with `useHistoryReducer` in App.tsx**

In `src/renderer/App.tsx`, replace lines 1–32 imports adding the new hook:

Top of file — add this import line just below the existing `from "./model/figure-actions"` block:

```ts
import { useHistoryReducer } from "./state/use-history-reducer";
```

And remove `useReducer` from the React import on line 1 (leave `useCallback`, `useMemo`, `useRef`, `useState`).

Replace line 54:

```ts
const [state, dispatch] = useReducer(figureReducer, undefined, () =>
  initialFigureState(),
);
```

with:

```ts
const [state, dispatch, history] = useHistoryReducer(initialFigureState());
```

Also remove the now-unused import `figureReducer` from `./model/figure-actions` if ESLint flags it.

- [ ] **Step 2: Pass `commit` to `PanelInteractionLayer` so pointerup commits the drag**

In `src/renderer/App.tsx`, update the JSX where `PanelInteractionLayer` is mounted (around line 367) — add a new prop `onCommit={history.commit}`:

```tsx
<PanelInteractionLayer
  panelId={selectedImagePanel.id}
  panelRect={focusedPanelRect}
  transform={selectedImagePanel.transform}
  bitmap={focusedBitmap}
  figurePxW={FIGURE_PX_W}
  figurePxH={FIGURE_PX_H}
  cssW={CANVAS_CSS_W}
  cssH={CANVAS_CSS_H}
  dispatch={dispatch}
  onCommit={history.commit}
/>
```

In `src/renderer/components/Grid/PanelInteractionLayer.tsx`:

Add to the `Props` interface (after the existing `dispatch` prop on line 22):

```ts
  /**
   * Called once on `pointerup` and on a debounced wheel-end so a drag or
   * a sequence of wheel events records a single history entry.
   */
  onCommit: () => void;
```

Destructure it in the function signature alongside `dispatch`:

```ts
export function PanelInteractionLayer({
  panelId,
  panelRect,
  transform,
  bitmap,
  figurePxW,
  figurePxH,
  cssW,
  cssH,
  dispatch,
  onCommit,
}: Props): JSX.Element | null {
```

Update `stateRef` initialization on line 49–50 to include `onCommit`:

```ts
const stateRef = useRef({
  panelId,
  panelRect,
  transform,
  bitmap,
  figurePxW,
  figurePxH,
  cssW,
  cssH,
  dispatch,
  onCommit,
});
stateRef.current = {
  panelId,
  panelRect,
  transform,
  bitmap,
  figurePxW,
  figurePxH,
  cssW,
  cssH,
  dispatch,
  onCommit,
};
```

In `onWheel` (line 69–98), after `s.dispatch(setPanelTransform(s.panelId, next));` debounce a single commit by 250ms. Add a wheel-end timer ref ABOVE `useEffect`:

```ts
const wheelEndRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Then inside `onWheel`, replace the current trailing dispatch line so the body ends with:

```ts
s.dispatch(setPanelTransform(s.panelId, next));
if (wheelEndRef.current !== null) clearTimeout(wheelEndRef.current);
wheelEndRef.current = setTimeout(() => {
  wheelEndRef.current = null;
  s.onCommit();
}, 250);
```

In `onPointerUp` (line 153), call commit after releasing capture:

```ts
function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
  const drag = dragRef.current;
  if (drag === null || drag.pointerId !== e.pointerId) return;
  if (ref.current?.hasPointerCapture(e.pointerId)) {
    ref.current.releasePointerCapture(e.pointerId);
  }
  dragRef.current = null;
  onCommit();
}
```

- [ ] **Step 3: Run the existing test suite**

Run: `pnpm test`
Expected: all existing tests still pass. The full suite contains hundreds of tests; none of them touch the changed lines except by importing `App.tsx`-adjacent symbols.

- [ ] **Step 4: Type-check**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Smoke test the dev app manually**

Run: `pnpm dev`

Verify:

- App loads, no console errors.
- Add an image, place into a cell.
- Pan/zoom works on the focused panel exactly as before (no visible change).
- Rotate, flip, reset still work.

(No automated assertion — this step exists to catch obvious wiring breakage before the keyboard shortcut goes live.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/Grid/PanelInteractionLayer.tsx
git commit -m "feat(m7): wire useHistoryReducer + pointerup/wheel-end commit"
```

---

### Task 4: Cmd/Ctrl-Z and Cmd/Ctrl-Shift-Z keyboard shortcuts

**Files:**

- Modify: `src/renderer/hooks/useKeyboardShortcuts.ts`
- Modify: `src/renderer/App.tsx` — pass `onUndo`/`onRedo` to the hook
- Test: extend `test/unit/figure-actions.test.ts` with a small undo/redo round-trip; the hook itself isn't unit-tested (no React testing-library installed).

- [ ] **Step 1: Write the failing test — undo/redo round-trip via combined reducer**

Create `test/unit/use-history-reducer.test.ts`. We test the _combined reducer_ directly (it's exported as the inner function only — so for testability, also export it from `use-history-reducer.ts`).

First, edit `src/renderer/state/use-history-reducer.ts` to export the inner functions for testing. Add `export` to `combinedReducer` and add an explicit type export:

```ts
export type { Combined, CombinedAction };
export { combinedReducer };
```

Place those export statements at the bottom of the file. Also remove the leading `function` `interface` keyword duplication if needed — `interface Combined` and `interface CombinedAction` and `function combinedReducer` are already declared, so the export-at-end form works.

Now create `test/unit/use-history-reducer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  combinedReducer,
  type Combined,
} from "../../src/renderer/state/use-history-reducer";
import {
  initialFigureState,
  type FigureState,
} from "../../src/renderer/model/figure-state";
import {
  setGutterPx,
  setPanelTransform,
} from "../../src/renderer/model/figure-actions";
import { DEFAULT_TRANSFORM } from "../../src/renderer/model/panels";

function startCombined(): Combined {
  const s = initialFigureState();
  return { state: s, history: { past: [], future: [] }, lastCommitted: s };
}

describe("combinedReducer — undo/redo", () => {
  it("non-transient action pushes prev state onto past", () => {
    const c0 = startCombined();
    const c1 = combinedReducer(c0, {
      kind: "dispatch",
      action: setGutterPx(20),
    });
    expect(c1.state.gutterPx).toBe(20);
    expect(c1.history.past).toHaveLength(1);
    expect(c1.history.past[0]!.gutterPx).toBe(c0.state.gutterPx);
  });

  it("undo restores prior state", () => {
    let c = startCombined();
    c = combinedReducer(c, { kind: "dispatch", action: setGutterPx(20) });
    c = combinedReducer(c, { kind: "undo" });
    expect(c.state.gutterPx).toBe(12); // initialFigureState default
    expect(c.history.future).toHaveLength(1);
  });

  it("redo replays the undone state", () => {
    let c = startCombined();
    c = combinedReducer(c, { kind: "dispatch", action: setGutterPx(20) });
    c = combinedReducer(c, { kind: "undo" });
    c = combinedReducer(c, { kind: "redo" });
    expect(c.state.gutterPx).toBe(20);
    expect(c.history.future).toHaveLength(0);
  });

  it("transient SET_PANEL_TRANSFORM does not push a history entry", () => {
    // Place an image first so the panel has a transform to update.
    let c = startCombined();
    const panelId = c.state.panels[0]!.id;
    // Manually inject a placed image — we just want a panel with a transform.
    const stateWithImage: FigureState = {
      ...c.state,
      pool: [
        {
          id: "img1",
          filename: "x.png",
          filePath: "/x.png",
          mime: "image/png",
          width: 100,
          height: 100,
          bitDepth: 8,
        },
      ],
      panels: c.state.panels.map((p) =>
        p.id === panelId
          ? { ...p, imageId: "img1", transform: DEFAULT_TRANSFORM }
          : p,
      ),
    };
    c = {
      state: stateWithImage,
      history: { past: [], future: [] },
      lastCommitted: stateWithImage,
    };

    c = combinedReducer(c, {
      kind: "dispatch",
      action: setPanelTransform(panelId, { ...DEFAULT_TRANSFORM, panX: 5 }),
    });
    expect(c.history.past).toHaveLength(0);
    expect(c.state.panels.find((p) => p.id === panelId)!.transform!.panX).toBe(
      5,
    );

    // commit() pushes the pre-drag state.
    c = combinedReducer(c, { kind: "commit" });
    expect(c.history.past).toHaveLength(1);
    expect(
      c.history.past[0]!.panels.find((p) => p.id === panelId)!.transform!.panX,
    ).toBe(0);
  });

  it("RESET_TO_STATE clears history", () => {
    let c = startCombined();
    c = combinedReducer(c, { kind: "dispatch", action: setGutterPx(20) });
    expect(c.history.past).toHaveLength(1);
    const fresh = initialFigureState();
    c = combinedReducer(c, {
      kind: "dispatch",
      action: { type: "RESET_TO_STATE", state: fresh },
    });
    expect(c.history.past).toHaveLength(0);
    expect(c.history.future).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/unit/use-history-reducer.test.ts`
Expected: FAIL — `combinedReducer is not exported`. Add the exports listed above.

- [ ] **Step 3: Re-run the test**

Expected: all 5 tests pass.

- [ ] **Step 4: Add `onUndo`/`onRedo` to the keyboard shortcuts hook**

Edit `src/renderer/hooks/useKeyboardShortcuts.ts`. Replace the current `ShortcutHandlers` interface and the `onKey` function:

Replace lines 3–13 with:

```ts
export interface ShortcutHandlers {
  onMerge: () => void;
  onUnmerge: () => void;
  onEscape: () => void;
  onRotate90?: () => void;
  onFlipH?: () => void;
  onFlipV?: () => void;
  onResetTransform?: () => void;
  /** Delete / Backspace removes the currently-selected annotation. */
  onDeleteAnnotation?: () => void;
  /** Cmd/Ctrl-Z. */
  onUndo?: () => void;
  /** Cmd/Ctrl-Shift-Z. */
  onRedo?: () => void;
}
```

Replace the `onKey` function body (lines 22–62) with one that:

1. Handles Cmd/Ctrl-Z FIRST, before the early-return on modifier keys.
2. Falls through to the existing logic only when no modifier is held.

```ts
export function useKeyboardShortcuts(h: ShortcutHandlers): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      // Cmd/Ctrl-Z and Cmd/Ctrl-Shift-Z come first — they intentionally
      // require a modifier and would otherwise be filtered out below.
      const isModZ =
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        (e.key === "z" || e.key === "Z");
      if (isModZ) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) {
          if (h.onRedo) h.onRedo();
        } else {
          if (h.onUndo) h.onUndo();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        h.onMerge();
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        h.onUnmerge();
      } else if (e.key === "r" || e.key === "R") {
        if (h.onRotate90) {
          e.preventDefault();
          h.onRotate90();
        }
      } else if (e.key === "h" || e.key === "H") {
        if (h.onFlipH) {
          e.preventDefault();
          h.onFlipH();
        }
      } else if (e.key === "v" || e.key === "V") {
        if (h.onFlipV) {
          e.preventDefault();
          h.onFlipV();
        }
      } else if (e.key === "0") {
        if (h.onResetTransform) {
          e.preventDefault();
          h.onResetTransform();
        }
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        h.onDeleteAnnotation
      ) {
        e.preventDefault();
        h.onDeleteAnnotation();
      } else if (e.key === "Escape") {
        h.onEscape();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [h]);
}
```

- [ ] **Step 5: Wire the new handlers in `App.tsx`**

In `src/renderer/App.tsx`, at the existing `useKeyboardShortcuts({...})` call (around line 205), add `onUndo` and `onRedo`:

```tsx
useKeyboardShortcuts({
  onMerge,
  onUnmerge,
  onEscape,
  onRotate90,
  onFlipH,
  onFlipV,
  onResetTransform,
  onDeleteAnnotation,
  onUndo: history.undo,
  onRedo: history.redo,
});
```

- [ ] **Step 6: Type-check + run all tests**

Run: `pnpm typecheck && pnpm test`
Expected: all tests pass, including the new `use-history-reducer.test.ts`.

- [ ] **Step 7: Manual smoke test**

Run `pnpm dev`. Confirm:

- Place an image, change gutter to 24 px, then Cmd-Z / Ctrl-Z → gutter returns to 12.
- Cmd-Shift-Z / Ctrl-Shift-Z → gutter goes back to 24.
- Pan an image, release pointer, then Cmd-Z → pan reverts to pre-drag position (single history entry per drag).
- Make 11 distinct edits, undo 11×; the 11th undo should be a no-op (only 10 retained).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/hooks/useKeyboardShortcuts.ts \
        src/renderer/App.tsx \
        src/renderer/state/use-history-reducer.ts \
        test/unit/use-history-reducer.test.ts
git commit -m "feat(m7): undo/redo via Cmd/Ctrl-Z and Cmd/Ctrl-Shift-Z"
```

---

### Task 5: `.mosaic` schema types and validator

**Files:**

- Create: `src/renderer/model/schema.ts`
- Create: `test/unit/schema.test.ts`

The schema is a hand-rolled validator returning a discriminated `Result<T>` (no zod). The schema mirrors `FigureState` plus a `canvas` block (figure dims/bg) and pool entries gain `relPath` and `sha256`.

- [ ] **Step 1: Write the failing test**

`test/unit/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  validateMosaicFile,
  CURRENT_SCHEMA_VERSION,
  type MosaicFileV1,
} from "../../src/renderer/model/schema";

const MIN_VALID: MosaicFileV1 = {
  schemaVersion: 1,
  app: "mosaic-builder",
  appVersion: "0.1.0",
  createdAt: "2026-05-02T10:00:00Z",
  modifiedAt: "2026-05-02T10:00:00Z",
  canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
  state: {
    pool: [],
    panels: [
      { id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1 },
      { id: "p2", row: 0, col: 1, rowSpan: 1, colSpan: 1 },
      { id: "p3", row: 1, col: 0, rowSpan: 1, colSpan: 1 },
      { id: "p4", row: 1, col: 1, rowSpan: 1, colSpan: 1 },
    ],
    rows: 2,
    cols: 2,
    gutterPx: 12,
    gutterColor: "#FFFFFF",
    annotations: [],
    globalStyle: {
      letters: {
        enabled: true,
        font: "Arial",
        sizePt: 12,
        color: "#000000",
        corner: "tl",
        paddingPx: 6,
        bold: true,
      },
      scalebar: {
        font: "Arial",
        sizePt: 10,
        color: "#FFFFFF",
        barColor: "#FFFFFF",
        thicknessPx: 4,
        corner: "br",
        paddingPx: 8,
        showLabel: true,
      },
    },
    letterOverrides: {},
  },
};

describe("validateMosaicFile", () => {
  it("CURRENT_SCHEMA_VERSION is 1", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });

  it("accepts a minimal valid file", () => {
    const r = validateMosaicFile(MIN_VALID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.schemaVersion).toBe(1);
      expect(r.value.state.rows).toBe(2);
    }
  });

  it("rejects missing schemaVersion with a descriptive error", () => {
    const bad = { ...MIN_VALID } as Record<string, unknown>;
    delete bad.schemaVersion;
    const r = validateMosaicFile(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("schemaVersion");
  });

  it("rejects an unknown future schemaVersion", () => {
    const r = validateMosaicFile({ ...MIN_VALID, schemaVersion: 99 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("schemaVersion");
  });

  it("rejects non-object input (string, null, array)", () => {
    expect(validateMosaicFile("hi").ok).toBe(false);
    expect(validateMosaicFile(null).ok).toBe(false);
    expect(validateMosaicFile([]).ok).toBe(false);
  });

  it("rejects malformed pool entries (missing filename)", () => {
    const bad = {
      ...MIN_VALID,
      state: {
        ...MIN_VALID.state,
        pool: [
          {
            id: "x",
            filePath: "/x",
            mime: "image/png",
            width: 1,
            height: 1,
            bitDepth: 8,
          },
        ],
      },
    };
    const r = validateMosaicFile(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("pool");
  });

  it("accepts pool entries with optional relPath and sha256", () => {
    const ok = {
      ...MIN_VALID,
      state: {
        ...MIN_VALID.state,
        pool: [
          {
            id: "x",
            filename: "x.png",
            filePath: "/abs/x.png",
            relPath: "./images/x.png",
            sha256: "abc123",
            mime: "image/png",
            width: 10,
            height: 10,
            bitDepth: 8,
          },
        ],
      },
    };
    expect(validateMosaicFile(ok).ok).toBe(true);
  });

  it("rejects rows > 10 or rows < 1", () => {
    expect(
      validateMosaicFile({
        ...MIN_VALID,
        state: { ...MIN_VALID.state, rows: 0 },
      }).ok,
    ).toBe(false);
    expect(
      validateMosaicFile({
        ...MIN_VALID,
        state: { ...MIN_VALID.state, rows: 11 },
      }).ok,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/unit/schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the schema validator**

`src/renderer/model/schema.ts`:

```ts
/**
 * `.mosaic` file schema (v1) + a hand-rolled validator returning a typed
 * Result. We don't use zod — the codebase has no validator dep, the schema
 * is small, and the error messages are tightly tied to the file shape.
 *
 * The on-disk file mirrors `FigureState` (under a `state` field) plus a
 * `canvas` block for figure dimensions/background and book-keeping fields
 * (schemaVersion, app, appVersion, timestamps). Pool entries on disk gain
 * an optional `relPath` (relative to the .mosaic file) and `sha256` for
 * integrity warnings; both are added by `serialize.ts`, not the reducer.
 */

import type { FigureState } from "./figure-state";
import type { ImagePoolItem } from "./pool";
import type { Panel } from "./panels";

export const CURRENT_SCHEMA_VERSION = 1 as const;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface MosaicFileV1 {
  schemaVersion: 1;
  app: "mosaic-builder";
  appVersion: string;
  createdAt: string;
  modifiedAt: string;
  canvas: {
    widthPx: number;
    heightPx: number;
    background: string;
  };
  /**
   * Mirrors `FigureState` 1:1, EXCEPT pool entries may carry `relPath`
   * and `sha256` which the runtime store ignores (they're only used by
   * the loader).
   */
  state: FigureState & {
    pool: (ImagePoolItem & { relPath?: string; sha256?: string })[];
  };
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isStr(x: unknown): x is string {
  return typeof x === "string";
}

function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function isInt(x: unknown): x is number {
  return isNum(x) && Number.isInteger(x);
}

function isHex(x: unknown): x is string {
  return isStr(x) && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(x);
}

function err<T>(msg: string): Result<T> {
  return { ok: false, error: msg };
}

function validatePool(
  x: unknown,
  path: string,
): Result<MosaicFileV1["state"]["pool"]> {
  if (!Array.isArray(x)) return err(`${path}: expected array`);
  const out: MosaicFileV1["state"]["pool"] = [];
  for (let i = 0; i < x.length; i++) {
    const item = x[i];
    if (!isObj(item)) return err(`${path}[${i}]: expected object`);
    if (!isStr(item.id)) return err(`${path}[${i}].id: expected string`);
    if (!isStr(item.filename))
      return err(`${path}[${i}].filename: expected string`);
    if (!isStr(item.filePath))
      return err(`${path}[${i}].filePath: expected string`);
    if (
      item.mime !== "image/png" &&
      item.mime !== "image/jpeg" &&
      item.mime !== "image/tiff"
    ) {
      return err(`${path}[${i}].mime: must be image/png|image/jpeg|image/tiff`);
    }
    if (!isInt(item.width) || item.width <= 0)
      return err(`${path}[${i}].width: positive int`);
    if (!isInt(item.height) || item.height <= 0)
      return err(`${path}[${i}].height: positive int`);
    if (item.bitDepth !== 8 && item.bitDepth !== 16) {
      return err(`${path}[${i}].bitDepth: must be 8 or 16`);
    }
    if (item.relPath !== undefined && !isStr(item.relPath)) {
      return err(`${path}[${i}].relPath: expected string`);
    }
    if (item.sha256 !== undefined && !isStr(item.sha256)) {
      return err(`${path}[${i}].sha256: expected string`);
    }
    if (item.calibration !== undefined) {
      const c = item.calibration;
      if (!isObj(c)) return err(`${path}[${i}].calibration: expected object`);
      if (c.unit !== "um" && c.unit !== "mm" && c.unit !== "px") {
        return err(`${path}[${i}].calibration.unit: must be um|mm|px`);
      }
      if (!isNum(c.pixelsPerUnit) || c.pixelsPerUnit <= 0) {
        return err(`${path}[${i}].calibration.pixelsPerUnit: positive number`);
      }
      if (c.source !== "tiff-meta" && c.source !== "manual") {
        return err(
          `${path}[${i}].calibration.source: must be tiff-meta|manual`,
        );
      }
    }
    out.push(item as MosaicFileV1["state"]["pool"][number]);
  }
  return { ok: true, value: out };
}

function validatePanels(x: unknown, path: string): Result<Panel[]> {
  if (!Array.isArray(x)) return err(`${path}: expected array`);
  for (let i = 0; i < x.length; i++) {
    const p = x[i];
    if (!isObj(p)) return err(`${path}[${i}]: expected object`);
    if (!isStr(p.id)) return err(`${path}[${i}].id`);
    if (!isInt(p.row) || p.row < 0) return err(`${path}[${i}].row`);
    if (!isInt(p.col) || p.col < 0) return err(`${path}[${i}].col`);
    if (!isInt(p.rowSpan) || p.rowSpan < 1) return err(`${path}[${i}].rowSpan`);
    if (!isInt(p.colSpan) || p.colSpan < 1) return err(`${path}[${i}].colSpan`);
    if (p.imageId !== undefined && !isStr(p.imageId))
      return err(`${path}[${i}].imageId`);
    if (p.transform !== undefined) {
      const t = p.transform;
      if (!isObj(t)) return err(`${path}[${i}].transform: expected object`);
      if (t.fit !== "contain" && t.fit !== "cover" && t.fit !== "stretch") {
        return err(`${path}[${i}].transform.fit`);
      }
      if (!isNum(t.panX)) return err(`${path}[${i}].transform.panX`);
      if (!isNum(t.panY)) return err(`${path}[${i}].transform.panY`);
      if (!isNum(t.zoom) || t.zoom <= 0)
        return err(`${path}[${i}].transform.zoom`);
      if (
        t.rotation !== 0 &&
        t.rotation !== 90 &&
        t.rotation !== 180 &&
        t.rotation !== 270
      ) {
        return err(`${path}[${i}].transform.rotation`);
      }
      if (typeof t.flipH !== "boolean")
        return err(`${path}[${i}].transform.flipH`);
      if (typeof t.flipV !== "boolean")
        return err(`${path}[${i}].transform.flipV`);
    }
  }
  return { ok: true, value: x as Panel[] };
}

function validateAnnotations(
  x: unknown,
  path: string,
): Result<FigureState["annotations"]> {
  if (!Array.isArray(x)) return err(`${path}: expected array`);
  for (let i = 0; i < x.length; i++) {
    const a = x[i];
    if (!isObj(a)) return err(`${path}[${i}]: expected object`);
    if (!isStr(a.id)) return err(`${path}[${i}].id`);
    if (!isNum(a.z)) return err(`${path}[${i}].z`);
    if (a.panelId !== undefined && !isStr(a.panelId))
      return err(`${path}[${i}].panelId`);
    const k = a.kind;
    if (k === "text") {
      if (
        !isNum(a.x) ||
        !isNum(a.y) ||
        !isStr(a.text) ||
        !isStr(a.font) ||
        !isNum(a.sizePt) ||
        typeof a.bold !== "boolean" ||
        typeof a.italic !== "boolean" ||
        !isStr(a.color)
      ) {
        return err(`${path}[${i}]: malformed text annotation`);
      }
    } else if (k === "arrow") {
      if (
        !isNum(a.x1) ||
        !isNum(a.y1) ||
        !isNum(a.x2) ||
        !isNum(a.y2) ||
        !isStr(a.color) ||
        !isNum(a.thicknessPx) ||
        (a.head !== "none" && a.head !== "open" && a.head !== "filled")
      ) {
        return err(`${path}[${i}]: malformed arrow annotation`);
      }
    } else if (k === "box") {
      if (
        !isNum(a.x) ||
        !isNum(a.y) ||
        !isNum(a.w) ||
        !isNum(a.h) ||
        !isStr(a.stroke) ||
        !isNum(a.strokeWidthPx)
      ) {
        return err(`${path}[${i}]: malformed box annotation`);
      }
    } else if (k === "scalebar") {
      if (
        !isStr(a.panelId) ||
        !isNum(a.lengthValue) ||
        (a.lengthUnit !== "um" &&
          a.lengthUnit !== "mm" &&
          a.lengthUnit !== "px")
      ) {
        return err(`${path}[${i}]: malformed scalebar annotation`);
      }
    } else {
      return err(`${path}[${i}].kind: must be text|arrow|box|scalebar`);
    }
  }
  return { ok: true, value: x as FigureState["annotations"] };
}

function validateGlobalStyle(
  x: unknown,
  path: string,
): Result<FigureState["globalStyle"]> {
  if (!isObj(x)) return err(`${path}: expected object`);
  const l = x.letters;
  if (!isObj(l)) return err(`${path}.letters: expected object`);
  if (typeof l.enabled !== "boolean") return err(`${path}.letters.enabled`);
  if (
    !isStr(l.font) ||
    !isNum(l.sizePt) ||
    !isHex(l.color) ||
    !isNum(l.paddingPx) ||
    typeof l.bold !== "boolean"
  ) {
    return err(`${path}.letters: malformed`);
  }
  if (l.bgColor !== undefined && !isHex(l.bgColor))
    return err(`${path}.letters.bgColor`);
  if (
    l.corner !== "tl" &&
    l.corner !== "tr" &&
    l.corner !== "bl" &&
    l.corner !== "br"
  ) {
    return err(`${path}.letters.corner`);
  }
  const s = x.scalebar;
  if (!isObj(s)) return err(`${path}.scalebar: expected object`);
  if (
    !isStr(s.font) ||
    !isNum(s.sizePt) ||
    !isHex(s.color) ||
    !isHex(s.barColor) ||
    !isNum(s.thicknessPx) ||
    !isNum(s.paddingPx) ||
    typeof s.showLabel !== "boolean"
  ) {
    return err(`${path}.scalebar: malformed`);
  }
  if (
    s.corner !== "tl" &&
    s.corner !== "tr" &&
    s.corner !== "bl" &&
    s.corner !== "br"
  ) {
    return err(`${path}.scalebar.corner`);
  }
  return { ok: true, value: x as FigureState["globalStyle"] };
}

export function validateMosaicFile(x: unknown): Result<MosaicFileV1> {
  if (!isObj(x)) return err("root: expected object");
  if (x.schemaVersion === undefined) return err("schemaVersion: required");
  if (x.schemaVersion !== 1)
    return err(`schemaVersion: unsupported (${String(x.schemaVersion)})`);
  if (x.app !== "mosaic-builder") return err("app: must be 'mosaic-builder'");
  if (!isStr(x.appVersion)) return err("appVersion: expected string");
  if (!isStr(x.createdAt)) return err("createdAt: expected ISO string");
  if (!isStr(x.modifiedAt)) return err("modifiedAt: expected ISO string");

  if (!isObj(x.canvas)) return err("canvas: expected object");
  if (!isInt(x.canvas.widthPx) || x.canvas.widthPx <= 0)
    return err("canvas.widthPx");
  if (!isInt(x.canvas.heightPx) || x.canvas.heightPx <= 0)
    return err("canvas.heightPx");
  if (!isHex(x.canvas.background))
    return err("canvas.background: expected #RRGGBB(AA)");

  if (!isObj(x.state)) return err("state: expected object");
  const st = x.state;
  if (!isInt(st.rows) || st.rows < 1 || st.rows > 10)
    return err("state.rows: 1..10");
  if (!isInt(st.cols) || st.cols < 1 || st.cols > 10)
    return err("state.cols: 1..10");
  if (!isInt(st.gutterPx) || st.gutterPx < 0)
    return err("state.gutterPx: non-negative int");
  if (!isHex(st.gutterColor)) return err("state.gutterColor");

  const pool = validatePool(st.pool, "state.pool");
  if (!pool.ok) return pool;
  const panels = validatePanels(st.panels, "state.panels");
  if (!panels.ok) return panels;
  const ann = validateAnnotations(st.annotations, "state.annotations");
  if (!ann.ok) return ann;
  const gs = validateGlobalStyle(st.globalStyle, "state.globalStyle");
  if (!gs.ok) return gs;

  if (!isObj(st.letterOverrides))
    return err("state.letterOverrides: expected object");
  for (const k in st.letterOverrides) {
    if (!isStr((st.letterOverrides as Record<string, unknown>)[k])) {
      return err(`state.letterOverrides.${k}: expected string`);
    }
  }

  return { ok: true, value: x as unknown as MosaicFileV1 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/schema.test.ts`
Expected: all 8 tests pass.

- [ ] **Step 5: Type-check + commit**

```bash
pnpm typecheck
git add src/renderer/model/schema.ts test/unit/schema.test.ts
git commit -m "feat(m7): .mosaic v1 schema types and hand-rolled validator"
```

---

### Task 6: Serializer / deserializer (pure)

**Files:**

- Create: `src/renderer/model/serialize.ts`
- Create: `test/unit/serialize.test.ts`

`toMosaicFile()` builds a `MosaicFileV1` from `(state, canvas, mosaicPath)`, computing `relPath` for each pool item using a path module compatible with both Node and browser. We use `node:path/posix` for relative paths to keep cross-platform `.mosaic` files portable (always forward-slash). Deserialization is the inverse — strip `relPath`/`sha256`, but keep them returned alongside so the loader can attempt path resolution.

- [ ] **Step 1: Write the failing test**

`test/unit/serialize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  toMosaicFile,
  fromMosaicFile,
} from "../../src/renderer/model/serialize";
import { initialFigureState } from "../../src/renderer/model/figure-state";
import type { ImagePoolItem } from "../../src/renderer/model/pool";

const SAMPLE_IMG: ImagePoolItem = {
  id: "img1",
  filename: "sample.png",
  filePath: "/Users/erik/proj/images/sample.png",
  mime: "image/png",
  width: 100,
  height: 100,
  bitDepth: 8,
};

describe("toMosaicFile", () => {
  it("emits schemaVersion=1, app=mosaic-builder, copies state through", () => {
    const f = toMosaicFile({
      state: initialFigureState(),
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/Users/erik/proj/figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    expect(f.schemaVersion).toBe(1);
    expect(f.app).toBe("mosaic-builder");
    expect(f.appVersion).toBe("0.1.0");
    expect(f.createdAt).toBe("2026-05-02T10:00:00Z");
    expect(f.canvas.widthPx).toBe(800);
    expect(f.state.rows).toBe(2);
  });

  it("computes posix relPath relative to .mosaic dir", () => {
    const state = { ...initialFigureState(), pool: [SAMPLE_IMG] };
    const f = toMosaicFile({
      state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/Users/erik/proj/figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    expect(f.state.pool[0]!.relPath).toBe("./images/sample.png");
    expect(f.state.pool[0]!.filePath).toBe(
      "/Users/erik/proj/images/sample.png",
    );
  });

  it("falls back to no relPath if filePath is on a different volume / windows drive", () => {
    const winImg: ImagePoolItem = {
      ...SAMPLE_IMG,
      filePath: "D:\\\\elsewhere\\\\sample.png",
    };
    const state = { ...initialFigureState(), pool: [winImg] };
    const f = toMosaicFile({
      state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/Users/erik/proj/figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    // Different volume: relPath must be undefined; absolute fallback only.
    expect(f.state.pool[0]!.relPath).toBeUndefined();
  });

  it("attaches sha256 if provided in shaByImageId", () => {
    const state = { ...initialFigureState(), pool: [SAMPLE_IMG] };
    const f = toMosaicFile({
      state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/Users/erik/proj/figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
      shaByImageId: { img1: "deadbeef" },
    });
    expect(f.state.pool[0]!.sha256).toBe("deadbeef");
  });
});

describe("fromMosaicFile", () => {
  it("returns the contained FigureState and canvas, stripping relPath/sha256 from runtime pool", () => {
    const file = toMosaicFile({
      state: { ...initialFigureState(), pool: [SAMPLE_IMG] },
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: "/Users/erik/proj/figure.mosaic",
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
      shaByImageId: { img1: "deadbeef" },
    });
    const r = fromMosaicFile(file);
    expect(r.state.pool[0]!.id).toBe("img1");
    // runtime pool item has no relPath/sha256 — those are loader-side hints.
    expect(
      (r.state.pool[0] as Record<string, unknown>).relPath,
    ).toBeUndefined();
    expect((r.state.pool[0] as Record<string, unknown>).sha256).toBeUndefined();
    expect(r.canvas.widthPx).toBe(800);
    // relink hints surfaced separately for the loader.
    expect(r.relinkHints[0]).toEqual({
      imageId: "img1",
      filePath: "/Users/erik/proj/images/sample.png",
      relPath: "./images/sample.png",
      sha256: "deadbeef",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/unit/serialize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the serializer**

`src/renderer/model/serialize.ts`:

```ts
/**
 * Pure serializer/deserializer between runtime FigureState (+ canvas)
 * and the on-disk MosaicFileV1 shape. No fs, no hashing, no IPC — those
 * happen one layer up in the main-process project-io.
 *
 * Path strategy:
 *   - On save: compute `relPath` = posix-style path relative to the .mosaic
 *     file's containing directory, when both paths share a common root.
 *     If they don't (different windows volumes, etc.), omit relPath and
 *     leave `filePath` as the only hint.
 *   - On load: the runtime `pool[]` strips relPath/sha256 — they're not
 *     part of FigureState. They're returned alongside as `relinkHints`
 *     so the loader can resolve files.
 */

import path from "node:path";
import type { FigureState } from "./figure-state";
import type { MosaicFileV1 } from "./schema";

export interface RelinkHint {
  imageId: string;
  filePath: string;
  relPath?: string;
  sha256?: string;
}

export interface ToMosaicInput {
  state: FigureState;
  canvas: { widthPx: number; heightPx: number; background: string };
  /** Absolute path to the .mosaic file we're writing to. */
  mosaicPath: string;
  appVersion: string;
  /** Defaults to `() => new Date().toISOString()`. Test seam. */
  now?: () => string;
  /** Optional sha256-by-imageId map. Hashing happens in the main process. */
  shaByImageId?: Record<string, string>;
}

export function toMosaicFile(inp: ToMosaicInput): MosaicFileV1 {
  const now = inp.now ?? (() => new Date().toISOString());
  const baseDir = path.dirname(inp.mosaicPath);
  const stamp = now();

  const pool = inp.state.pool.map((item) => {
    const out: MosaicFileV1["state"]["pool"][number] = { ...item };
    const rel = posixRelative(baseDir, item.filePath);
    if (rel !== null) out.relPath = rel;
    const sha = inp.shaByImageId?.[item.id];
    if (sha !== undefined) out.sha256 = sha;
    return out;
  });

  return {
    schemaVersion: 1,
    app: "mosaic-builder",
    appVersion: inp.appVersion,
    createdAt: stamp,
    modifiedAt: stamp,
    canvas: { ...inp.canvas },
    state: { ...inp.state, pool },
  };
}

export interface FromMosaicResult {
  state: FigureState;
  canvas: { widthPx: number; heightPx: number; background: string };
  relinkHints: RelinkHint[];
}

export function fromMosaicFile(file: MosaicFileV1): FromMosaicResult {
  const relinkHints: RelinkHint[] = [];
  const runtimePool = file.state.pool.map((item) => {
    const { relPath, sha256, ...rest } = item;
    const hint: RelinkHint = { imageId: rest.id, filePath: rest.filePath };
    if (relPath !== undefined) hint.relPath = relPath;
    if (sha256 !== undefined) hint.sha256 = sha256;
    relinkHints.push(hint);
    return rest;
  });
  return {
    state: { ...file.state, pool: runtimePool },
    canvas: { ...file.canvas },
    relinkHints,
  };
}

/**
 * Compute a posix-form relative path from `fromDir` to `toFile`, or null
 * if they don't share a common root (e.g. different windows drives, or
 * `toFile` isn't an absolute path). The returned path always begins with
 * "./" or "../" so it's unambiguously relative.
 */
function posixRelative(fromDir: string, toFile: string): string | null {
  if (!path.isAbsolute(toFile)) return null;
  // Detect different windows drives (e.g. C: vs D:) — node:path.relative
  // returns an absolute-looking path in that case which we must reject.
  const r = path.relative(fromDir, toFile);
  if (r === "" || path.isAbsolute(r)) return null;
  // Normalize to posix separators for cross-platform .mosaic files.
  const posix = r.split(path.sep).join("/");
  return posix.startsWith(".") ? posix : `./${posix}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/serialize.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Type-check + commit**

```bash
pnpm typecheck
git add src/renderer/model/serialize.ts test/unit/serialize.test.ts
git commit -m "feat(m7): pure serializer for .mosaic files (posix relPath, relink hints)"
```

---

### Task 7: sha256 helper for main process

**Files:**

- Create: `src/main/sha256.ts`
- Create: `test/unit/sha256.test.ts`

- [ ] **Step 1: Write the failing test**

`test/unit/sha256.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sha256OfBytes } from "../../src/main/sha256";

describe("sha256OfBytes", () => {
  it("hashes empty input deterministically", () => {
    const h = sha256OfBytes(new Uint8Array());
    expect(h).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("hashes 'abc' to the known sha256", () => {
    const bytes = new TextEncoder().encode("abc");
    expect(sha256OfBytes(bytes)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/unit/sha256.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/main/sha256.ts`:

```ts
import { createHash } from "node:crypto";

/** Returns the lowercase hex sha256 of the given bytes. */
export function sha256OfBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/sha256.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check + commit**

```bash
pnpm typecheck
git add src/main/sha256.ts test/unit/sha256.test.ts
git commit -m "feat(m7): node:crypto sha256 helper"
```

---

### Task 8: Save/Open native dialogs

**Files:**

- Modify: `src/main/dialogs.ts`
- Modify: `test/unit/dialogs.test.ts`

- [ ] **Step 1: Extend the existing `electron` mock to also stub `showOpenDialog`, then write the failing test**

In `test/unit/dialogs.test.ts`, replace the top-of-file mock setup (lines 9–17) with:

```ts
const showSaveDialog = vi.fn();
const showOpenDialog = vi.fn();

vi.mock("electron", () => ({
  dialog: { showSaveDialog, showOpenDialog },
}));

beforeEach(() => {
  showSaveDialog.mockReset();
  showOpenDialog.mockReset();
});
```

Then append two new describe blocks at the end of the file:

```ts
describe("pickMosaicSavePath", () => {
  it("uses .mosaic extension and the Mosaic project filter", async () => {
    showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: "/tmp/figure.mosaic",
    });
    const { pickMosaicSavePath } = await import("../../src/main/dialogs");
    const r = await pickMosaicSavePath({
      parentWindow: null,
      defaultName: "figure.mosaic",
    });
    expect(r).toEqual({ canceled: false, filePath: "/tmp/figure.mosaic" });
    expect(callOpts().filters).toEqual([
      { name: "Mosaic project", extensions: ["mosaic"] },
    ]);
  });
});

describe("pickMosaicOpenPath", () => {
  it("returns the picked file path", async () => {
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/tmp/figure.mosaic"],
    });
    const { pickMosaicOpenPath } = await import("../../src/main/dialogs");
    const r = await pickMosaicOpenPath({ parentWindow: null });
    expect(r).toEqual({ canceled: false, filePath: "/tmp/figure.mosaic" });
  });

  it("returns canceled when user dismisses the dialog", async () => {
    showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });
    const { pickMosaicOpenPath } = await import("../../src/main/dialogs");
    const r = await pickMosaicOpenPath({ parentWindow: null });
    expect(r.canceled).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/unit/dialogs.test.ts -t "Mosaic"`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement**

In `src/main/dialogs.ts`, append:

```ts
export async function pickMosaicSavePath(
  input: PickPathInput,
): Promise<PickPathResult> {
  return showSave(
    input.parentWindow,
    "Save mosaic project",
    input.defaultName,
    [{ name: "Mosaic project", extensions: ["mosaic"] }],
  );
}

export interface PickOpenInput {
  parentWindow: BrowserWindow | null;
}

export async function pickMosaicOpenPath(
  input: PickOpenInput,
): Promise<PickPathResult> {
  const opts = {
    title: "Open mosaic project",
    filters: [{ name: "Mosaic project", extensions: ["mosaic"] }],
    properties: ["openFile"] as const,
  };
  const r =
    input.parentWindow !== null
      ? await dialog.showOpenDialog(input.parentWindow, opts)
      : await dialog.showOpenDialog(opts);
  if (r.canceled || r.filePaths.length === 0) {
    return { canceled: true, filePath: undefined };
  }
  return { canceled: false, filePath: r.filePaths[0]! };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/dialogs.test.ts`
Expected: all pass (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/main/dialogs.ts test/unit/dialogs.test.ts
git commit -m "feat(m7): native save/open dialogs for .mosaic files"
```

---

### Task 9: Main-process project IO (save + load + image-relink read)

**Files:**

- Create: `src/main/project-io.ts`
- Create: `test/unit/project-io.test.ts`

The main process owns fs IO for `.mosaic` (write JSON; on load: read + parse + try to read each linked image file from disk to pass back bytes for the renderer to decode). Path resolution order: `relPath` (joined to `.mosaic` dir) → absolute `filePath`. If neither exists, the renderer's relink modal collects a user-picked replacement.

The IPC contract for load includes per-image disk reads done eagerly in main — that way the renderer doesn't need fs access. We return: `{ file: MosaicFileV1, images: { imageId, filePath, mime, bytes }[], missing: { imageId, attemptedPaths }[] }`.

- [ ] **Step 1: Write the failing test**

`test/unit/project-io.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  saveProjectToPath,
  loadProjectFromPath,
} from "../../src/main/project-io";
import { initialFigureState } from "../../src/renderer/model/figure-state";
import { toMosaicFile } from "../../src/renderer/model/serialize";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "mosaic-io-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("saveProjectToPath", () => {
  it("writes JSON with .mosaic extension; refuses other extensions", async () => {
    const target = path.join(dir, "fig.mosaic");
    const file = toMosaicFile({
      state: initialFigureState(),
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: target,
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    await saveProjectToPath(target, file);
    const text = await readFile(target, "utf8");
    const parsed = JSON.parse(text);
    expect(parsed.schemaVersion).toBe(1);

    await expect(
      saveProjectToPath(path.join(dir, "fig.json"), file),
    ).rejects.toThrow(/extension/);
  });
});

describe("loadProjectFromPath", () => {
  it("reads + validates the file and resolves images by relPath then filePath", async () => {
    // Set up: save an image and a project that references it relatively.
    const imgRel = "./img.png";
    const imgAbs = path.join(dir, "img.png");
    // Trivial 1-byte file — main-process IO doesn't decode, just passes bytes.
    await writeFile(imgAbs, Buffer.from([0x89]));

    const target = path.join(dir, "fig.mosaic");
    const stateWithImg = {
      ...initialFigureState(),
      pool: [
        {
          id: "img1",
          filename: "img.png",
          filePath: imgAbs,
          mime: "image/png" as const,
          width: 1,
          height: 1,
          bitDepth: 8 as const,
        },
      ],
    };
    const file = toMosaicFile({
      state: stateWithImg,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: target,
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    expect(file.state.pool[0]!.relPath).toBe(imgRel);
    await saveProjectToPath(target, file);

    const r = await loadProjectFromPath(target);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.schemaVersion).toBe(1);
    expect(r.images).toHaveLength(1);
    expect(r.images[0]!.imageId).toBe("img1");
    expect(r.images[0]!.bytes.byteLength).toBe(1);
    expect(r.missing).toHaveLength(0);
  });

  it("flags missing images instead of crashing", async () => {
    const target = path.join(dir, "fig.mosaic");
    const ghostAbs = path.join(dir, "ghost.png");
    const stateWithImg = {
      ...initialFigureState(),
      pool: [
        {
          id: "ghost",
          filename: "ghost.png",
          filePath: ghostAbs,
          mime: "image/png" as const,
          width: 1,
          height: 1,
          bitDepth: 8 as const,
        },
      ],
    };
    const file = toMosaicFile({
      state: stateWithImg,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: target,
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    await saveProjectToPath(target, file);

    const r = await loadProjectFromPath(target);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.images).toHaveLength(0);
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0]!.imageId).toBe("ghost");
    expect(r.missing[0]!.filename).toBe("ghost.png");
    expect(r.missing[0]!.attemptedPaths.length).toBeGreaterThanOrEqual(1);
  });

  it("returns ok:false on schema validation failure", async () => {
    const target = path.join(dir, "fig.mosaic");
    await writeFile(target, JSON.stringify({ not: "valid" }));
    const r = await loadProjectFromPath(target);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("schemaVersion");
  });

  it("warns when sha256 mismatches the loaded bytes", async () => {
    const imgAbs = path.join(dir, "img.png");
    await writeFile(imgAbs, Buffer.from([0x89]));
    const target = path.join(dir, "fig.mosaic");
    const stateWithImg = {
      ...initialFigureState(),
      pool: [
        {
          id: "img1",
          filename: "img.png",
          filePath: imgAbs,
          mime: "image/png" as const,
          width: 1,
          height: 1,
          bitDepth: 8 as const,
        },
      ],
    };
    const file = toMosaicFile({
      state: stateWithImg,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: target,
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
      shaByImageId: { img1: "deadbeef" }, // intentionally wrong
    });
    await saveProjectToPath(target, file);

    const r = await loadProjectFromPath(target);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.images[0]!.shaMismatch).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/unit/project-io.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/main/project-io.ts`:

```ts
import { writeFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  validateMosaicFile,
  type MosaicFileV1,
} from "../renderer/model/schema";
import { mimeFromExt, type ImageMime } from "./mime";
import { sha256OfBytes } from "./sha256";

export interface ResolvedImage {
  imageId: string;
  filePath: string;
  mime: ImageMime;
  bytes: Uint8Array;
  /** True if a stored sha256 exists and disagrees with the loaded bytes. */
  shaMismatch: boolean;
}

export interface MissingImage {
  imageId: string;
  filename: string;
  attemptedPaths: string[];
}

export type LoadProjectResult =
  | { ok: false; error: string }
  | {
      ok: true;
      file: MosaicFileV1;
      images: ResolvedImage[];
      missing: MissingImage[];
    };

const ALLOWED_EXT = [".mosaic"];

export async function saveProjectToPath(
  target: string,
  file: MosaicFileV1,
): Promise<void> {
  const ext = path.extname(target).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    throw new Error(
      `saveProjectToPath: extension must be .mosaic (got "${ext}")`,
    );
  }
  const json = JSON.stringify(file, null, 2);
  await writeFile(target, json, "utf8");
}

export async function loadProjectFromPath(
  target: string,
): Promise<LoadProjectResult> {
  let raw: string;
  try {
    raw = await readFile(target, "utf8");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      ok: false,
      error: `JSON parse: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const v = validateMosaicFile(parsed);
  if (!v.ok) return { ok: false, error: v.error };
  const file = v.value;

  const baseDir = path.dirname(target);
  const images: ResolvedImage[] = [];
  const missing: MissingImage[] = [];

  for (const item of file.state.pool) {
    const tries: string[] = [];
    if (typeof item.relPath === "string") {
      tries.push(path.resolve(baseDir, item.relPath));
    }
    if (typeof item.filePath === "string" && path.isAbsolute(item.filePath)) {
      // Avoid duplicate try if relPath already resolved to the same absolute path.
      const abs = path.resolve(item.filePath);
      if (!tries.includes(abs)) tries.push(abs);
    }

    let resolvedBytes: Uint8Array | null = null;
    let resolvedPath: string | null = null;
    for (const p of tries) {
      try {
        const s = await stat(p);
        if (!s.isFile()) continue;
        const buf = await readFile(p);
        resolvedBytes = new Uint8Array(
          buf.buffer,
          buf.byteOffset,
          buf.byteLength,
        );
        resolvedPath = p;
        break;
      } catch {
        // try next
      }
    }

    if (resolvedBytes === null || resolvedPath === null) {
      missing.push({
        imageId: item.id,
        filename: item.filename,
        attemptedPaths: tries,
      });
      continue;
    }

    const mime = mimeFromExt(resolvedPath) ?? item.mime;
    const shaMismatch =
      typeof item.sha256 === "string" &&
      sha256OfBytes(resolvedBytes) !== item.sha256;

    images.push({
      imageId: item.id,
      filePath: resolvedPath,
      mime,
      bytes: resolvedBytes,
      shaMismatch,
    });
  }

  return { ok: true, file, images, missing };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/project-io.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Type-check + commit**

```bash
pnpm typecheck
git add src/main/project-io.ts test/unit/project-io.test.ts
git commit -m "feat(m7): main-process project save/load with sha256 + missing-image hints"
```

---

### Task 10: IPC channels + preload bindings

**Files:**

- Modify: `src/preload/api.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/main/index.ts`
- Modify: `test/unit/preload-api-shape.test.ts`

- [ ] **Step 1: Update the preload-api-shape test**

In `test/unit/preload-api-shape.test.ts`:

(a) Inside the first `it("declares stable channel names", ...)` block, add two new assertions at the bottom:

```ts
expect(API_CHANNELS.projectSave).toBe("mosaic:project-save");
expect(API_CHANNELS.projectLoad).toBe("mosaic:project-load");
```

(b) Inside the third `it("MosaicApi shape", ...)` block, the `fake: MosaicApi` literal must satisfy the (now-extended) interface. Append to the literal:

```ts
      saveProject: () => Promise.resolve({ ok: true, filePath: "/tmp/x.mosaic" }),
      loadProject: () => Promise.resolve({ ok: false, reason: "canceled" }),
```

And append two `expect(...).toBe("function")` assertions at the bottom of that block:

```ts
expect(typeof fake.saveProject).toBe("function");
expect(typeof fake.loadProject).toBe("function");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/unit/preload-api-shape.test.ts`
Expected: FAIL — `projectSave` is not on `API_CHANNELS`.

- [ ] **Step 3: Extend the API contract**

In `src/preload/api.ts`, add to `API_CHANNELS`:

```ts
export const API_CHANNELS = {
  ping: "mosaic:ping",
  exportPng: "mosaic:export-png",
  exportJpeg: "mosaic:export-jpeg",
  exportTiff: "mosaic:export-tiff",
  exportPdf: "mosaic:export-pdf",
  openImages: "mosaic:open-images",
  projectSave: "mosaic:project-save",
  projectLoad: "mosaic:project-load",
} as const;
```

Below `OpenImagesResult`, add the project DTOs and result types:

```ts
import type { MosaicFileV1 } from "../renderer/model/schema";

export interface SaveProjectInput {
  /**
   * Already-built MosaicFileV1 from the renderer. Main process writes it
   * to disk after picking a path; main does NOT mutate the file other
   * than possibly re-stamping `modifiedAt` (caller passes a fresh value).
   */
  file: MosaicFileV1;
  /** Suggested filename for the save dialog (e.g. "untitled.mosaic"). */
  defaultName: string;
}

export type SaveProjectResult =
  | { ok: true; filePath: string }
  | { ok: false; reason: "canceled" | "write-failed"; message?: string };

export interface MissingImageDto {
  imageId: string;
  filename: string;
  attemptedPaths: string[];
}

export interface ResolvedImageDto {
  imageId: string;
  filePath: string;
  mime: OpenImagesMime;
  bytes: Uint8Array;
  shaMismatch: boolean;
}

export type LoadProjectResult =
  | {
      ok: false;
      reason: "canceled" | "validation-failed" | "read-failed";
      message?: string;
    }
  | {
      ok: true;
      filePath: string;
      file: MosaicFileV1;
      images: ResolvedImageDto[];
      missing: MissingImageDto[];
    };
```

Extend `MosaicApi`:

```ts
export interface MosaicApi {
  ping(): Promise<number>;
  exportPng(bytes: Uint8Array, defaultName: string): Promise<ExportResult>;
  exportJpeg(bytes: Uint8Array, defaultName: string): Promise<ExportResult>;
  exportTiff(bytes: Uint8Array, defaultName: string): Promise<ExportResult>;
  exportPdf(bytes: Uint8Array, defaultName: string): Promise<ExportResult>;
  openImages(): Promise<OpenImagesResult>;
  saveProject(input: SaveProjectInput): Promise<SaveProjectResult>;
  loadProject(): Promise<LoadProjectResult>;
}
```

- [ ] **Step 4: Wire preload bindings**

In `src/preload/preload.ts`, add:

```ts
import {
  API_CHANNELS,
  type ExportResult,
  type LoadProjectResult,
  type MosaicApi,
  type OpenImagesResult,
  type SaveProjectInput,
  type SaveProjectResult,
} from "./api";
```

Then inside the `api: MosaicApi` object, append:

```ts
  saveProject: (input: SaveProjectInput) =>
    ipcRenderer.invoke(API_CHANNELS.projectSave, input) as Promise<SaveProjectResult>,
  loadProject: () =>
    ipcRenderer.invoke(API_CHANNELS.projectLoad) as Promise<LoadProjectResult>,
```

- [ ] **Step 5: Wire main-process handlers**

In `src/main/index.ts`, add imports near the top:

```ts
import { pickMosaicOpenPath, pickMosaicSavePath } from "./dialogs";
import { saveProjectToPath, loadProjectFromPath } from "./project-io";
import type { SaveProjectInput } from "../preload/api";
```

Inside `registerIpc()` (after the existing handlers), add:

```ts
ipcMain.handle(
  API_CHANNELS.projectSave,
  async (event, input: SaveProjectInput) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    const picked = await pickMosaicSavePath({
      parentWindow: senderWindow,
      defaultName: input.defaultName,
    });
    if (picked.canceled || picked.filePath === undefined) {
      return { ok: false, reason: "canceled" } as const;
    }
    try {
      await saveProjectToPath(picked.filePath, input.file);
      return { ok: true, filePath: picked.filePath } as const;
    } catch (e) {
      return {
        ok: false,
        reason: "write-failed",
        message: e instanceof Error ? e.message : String(e),
      } as const;
    }
  },
);

ipcMain.handle(API_CHANNELS.projectLoad, async (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  const picked = await pickMosaicOpenPath({ parentWindow: senderWindow });
  if (picked.canceled || picked.filePath === undefined) {
    return { ok: false, reason: "canceled" } as const;
  }
  const r = await loadProjectFromPath(picked.filePath);
  if (!r.ok) {
    return {
      ok: false,
      reason: "validation-failed",
      message: r.error,
    } as const;
  }
  return {
    ok: true,
    filePath: picked.filePath,
    file: r.file,
    images: r.images,
    missing: r.missing,
  } as const;
});
```

- [ ] **Step 6: Type-check + run all tests**

Run: `pnpm typecheck && pnpm test`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/preload/api.ts src/preload/preload.ts src/main/index.ts \
        test/unit/preload-api-shape.test.ts
git commit -m "feat(m7): IPC channels for project save/load"
```

---

### Task 11: Save/Open buttons in toolbar + load wiring (no relink modal yet)

**Files:**

- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/state/load-project.ts` — small helper that decodes `ResolvedImageDto[]` into `Map<string, ImageBitmap>` and dispatches `RESET_TO_STATE`

This task ships save and a happy-path load (all images present). The relink modal lands in Task 12 — for now, we surface a console error / inline error if `missing.length > 0` so the rest of the wiring is testable.

- [ ] **Step 1: Implement the load helper**

Create `src/renderer/state/load-project.ts`:

```ts
import type { Dispatch } from "react";
import { decodeImageBytes } from "../image/decode-bytes";
import type { FigureAction } from "../model/figure-actions";
import { resetToState } from "../model/figure-actions";
import { fromMosaicFile } from "../model/serialize";
import type { LoadProjectResult, ResolvedImageDto } from "../../preload/api";

export interface LoadOutcome {
  /** Image ids whose bytes failed to decode after disk read. */
  decodeFailures: { imageId: string; message: string }[];
  /** Per-image bitmaps to merge into the App's bitmap-cache state. */
  bitmaps: Map<string, ImageBitmap>;
}

/**
 * Apply a successful LoadProjectResult to the renderer:
 *   1. Decode every ResolvedImageDto.bytes into an ImageBitmap.
 *   2. Dispatch RESET_TO_STATE with the deserialized FigureState.
 *
 * Caller is responsible for replacing the bitmap cache map AND surfacing
 * `decodeFailures` and the loader's `missing` array (caller already has
 * the latter from the IPC result).
 */
export async function applyLoadedProject(
  result: Extract<LoadProjectResult, { ok: true }>,
  dispatch: Dispatch<FigureAction>,
): Promise<LoadOutcome> {
  const bitmaps = new Map<string, ImageBitmap>();
  const decodeFailures: LoadOutcome["decodeFailures"] = [];

  for (const img of result.images) {
    try {
      const decoded = await decodeImageBytes(img.bytes, img.mime);
      bitmaps.set(img.imageId, decoded.bitmap);
    } catch (e) {
      decodeFailures.push({
        imageId: img.imageId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const r = fromMosaicFile(result.file);
  dispatch(resetToState(r.state));

  return { bitmaps, decodeFailures };
}

export type { ResolvedImageDto };
```

- [ ] **Step 2: Add Save / Save As / Open buttons to the toolbar header**

In `src/renderer/App.tsx`:

Add imports near the top:

```ts
import { applyLoadedProject } from "./state/load-project";
import { toMosaicFile } from "./model/serialize";
```

Add component state for the current project file path (used for "Save" without re-prompting in M8 — for M7 we keep it simple: every Save acts as Save-As. Add a state slot anyway so the UI can show the loaded path in the title bar later).

Add near other state declarations (after line 63):

```ts
const [projectPath, setProjectPath] = useState<string | null>(null);
const [missingImages, setMissingImages] = useState<
  { imageId: string; filename: string; attemptedPaths: string[] }[]
>([]);
```

Add the save handler after `onCalibrate`:

```ts
const onSaveProject = useCallback(async () => {
  setError(null);
  const file = toMosaicFile({
    state,
    canvas: {
      widthPx: FIGURE_PX_W,
      heightPx: FIGURE_PX_H,
      background: CANVAS_BG,
    },
    mosaicPath: projectPath ?? "untitled.mosaic",
    appVersion: "0.1.0",
  });
  const r = await window.api.saveProject({
    file,
    defaultName:
      projectPath !== null ? basename(projectPath) : "untitled.mosaic",
  });
  if (!r.ok) {
    if (r.reason !== "canceled") {
      setError(`Save failed: ${r.message ?? r.reason}`);
    }
    return;
  }
  setProjectPath(r.filePath);
}, [state, projectPath]);

const onOpenProject = useCallback(async () => {
  setError(null);
  const r = await window.api.loadProject();
  if (!r.ok) {
    if (r.reason !== "canceled") {
      setError(`Open failed: ${r.message ?? r.reason}`);
    }
    return;
  }
  const outcome = await applyLoadedProject(r, dispatch);
  setBitmaps(outcome.bitmaps);
  setProjectPath(r.filePath);
  setMissingImages(r.missing);
  if (outcome.decodeFailures.length > 0) {
    setError(
      `Some images failed to decode: ${outcome.decodeFailures
        .map((f) => f.imageId)
        .join(", ")}`,
    );
  }
}, []);
```

Add buttons in the header (insert just after the existing `<ExportMenu .../>` line near line 286):

```tsx
        <button
          type="button"
          onClick={() => {
            void onOpenProject();
          }}
          data-testid="open-project"
        >
          Open…
        </button>
        <button
          type="button"
          onClick={() => {
            void onSaveProject();
          }}
          data-testid="save-project"
        >
          Save
        </button>
```

- [ ] **Step 3: Type-check**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Manual smoke test**

Run `pnpm dev`. Verify:

- Add 2 images, place them. Click **Save** → native dialog → save as `figure.mosaic`.
- Quit and relaunch (or just click **Open…**) → pick `figure.mosaic` → grid + images reappear in the same positions.
- Verify undo/redo still works after open.
- Open a `.mosaic` whose images have moved (rename the folder before reopening): observe the inline error indicating missing images, but the grid + non-image state still renders.

(Task 12 replaces the inline error with a proper relink modal.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/state/load-project.ts src/renderer/App.tsx
git commit -m "feat(m7): Save/Open project IPC wiring (no relink modal yet)"
```

---

### Task 12: Relink modal for missing images on load

**Files:**

- Create: `src/renderer/components/Modals/RelinkModal.tsx`
- Modify: `src/renderer/App.tsx` — render `RelinkModal` when `missingImages.length > 0`
- Add a single-image re-pick path: extend `openImages` is overkill; we can reuse the existing IPC for now. The modal calls `window.api.openImages()` and the user picks ONE file at a time (filtered by basename match in the UI).

- [ ] **Step 1: Implement RelinkModal**

`src/renderer/components/Modals/RelinkModal.tsx`:

```ts
import { useState } from "react";
import type { Dispatch } from "react";
import { decodeImageBytes } from "../../image/decode-bytes";
import type { FigureAction } from "../../model/figure-actions";

export interface MissingEntry {
  imageId: string;
  filename: string;
  attemptedPaths: string[];
}

interface Props {
  missing: MissingEntry[];
  onRelinked: (
    bitmaps: Map<string, ImageBitmap>,
    stillMissing: MissingEntry[],
  ) => void;
  onClose: () => void;
  dispatch: Dispatch<FigureAction>;
}

/**
 * One-by-one relink: shows a list of missing images. Clicking "Locate…"
 * opens the native file picker; the user picks one file and we attempt
 * to decode it. On success, the imageId is removed from the missing list
 * and its bitmap is reported via `onRelinked`. The user can also "Skip"
 * an image (keeps the pool entry but no bitmap — placed panels render
 * as a missing-image placeholder).
 */
export function RelinkModal({
  missing,
  onRelinked,
  onClose,
  dispatch: _dispatch,
}: Props): JSX.Element {
  const [pending, setPending] = useState<MissingEntry[]>(missing);
  const [resolved, setResolved] = useState<Map<string, ImageBitmap>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onLocate(entry: MissingEntry): Promise<void> {
    setBusy(entry.imageId);
    setError(null);
    const r = await window.api.openImages();
    if (r.canceled) {
      setBusy(null);
      return;
    }
    if (r.files.length === 0) {
      setBusy(null);
      setError("No file selected.");
      return;
    }
    const f = r.files[0]!;
    try {
      const decoded = await decodeImageBytes(f.bytes, f.mime);
      setResolved((prev) => {
        const next = new Map(prev);
        next.set(entry.imageId, decoded.bitmap);
        return next;
      });
      setPending((prev) => prev.filter((p) => p.imageId !== entry.imageId));
    } catch (e) {
      setError(`Decode failed for ${f.filePath}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  function onSkip(entry: MissingEntry): void {
    setPending((prev) => prev.filter((p) => p.imageId !== entry.imageId));
  }

  function onDone(): void {
    onRelinked(resolved, pending);
    onClose();
  }

  return (
    <div
      data-testid="relink-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        data-testid="relink-modal"
        style={{
          background: "#FFF",
          borderRadius: 6,
          padding: 16,
          minWidth: 480,
          maxHeight: "80vh",
          overflow: "auto",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 14 }}>
          Locate missing images
        </h2>
        <p style={{ margin: "0 0 12px", color: "#555" }}>
          The project references files that aren't where it expected.
          Click <strong>Locate…</strong> to point at the correct file, or
          <strong> Skip</strong> to leave the panel empty.
        </p>
        {missing.length === 0 ? (
          <p>(none)</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>
                  Filename
                </th>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>
                  Status
                </th>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {missing.map((entry) => {
                const isPending = pending.some((p) => p.imageId === entry.imageId);
                const isResolved = resolved.has(entry.imageId);
                const isBusy = busy === entry.imageId;
                return (
                  <tr key={entry.imageId} style={{ borderTop: "1px solid #EEE" }}>
                    <td style={{ padding: "4px 6px" }}>{entry.filename}</td>
                    <td style={{ padding: "4px 6px" }}>
                      {isResolved ? (
                        <span style={{ color: "#080" }}>relinked</span>
                      ) : isPending ? (
                        <span style={{ color: "#B00" }}>missing</span>
                      ) : (
                        <span style={{ color: "#888" }}>skipped</span>
                      )}
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      {isPending && (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              void onLocate(entry);
                            }}
                            data-testid={`relink-locate-${entry.imageId}`}
                          >
                            {isBusy ? "Picking…" : "Locate…"}
                          </button>
                          <button
                            type="button"
                            onClick={() => onSkip(entry)}
                            style={{ marginLeft: 4 }}
                            data-testid={`relink-skip-${entry.imageId}`}
                          >
                            Skip
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {error !== null && (
          <p style={{ margin: "8px 0 0", color: "#B00" }}>{error}</p>
        )}
        <div
          style={{
            marginTop: 12,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onDone}
            data-testid="relink-done"
            disabled={pending.length > 0}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render the modal in App.tsx**

In `src/renderer/App.tsx`:

Add the import:

```ts
import { RelinkModal } from "./components/Modals/RelinkModal";
```

In the JSX, just after the `CalibrationModal` block at the bottom of `<main>` (around line 396), add:

```tsx
{
  missingImages.length > 0 && (
    <RelinkModal
      missing={missingImages}
      dispatch={dispatch}
      onClose={() => setMissingImages([])}
      onRelinked={(newBitmaps, stillMissing) => {
        setBitmaps((prev) => {
          const next = new Map(prev);
          for (const [k, v] of newBitmaps) next.set(k, v);
          return next;
        });
        setMissingImages(stillMissing);
      }}
    />
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Manual smoke test (the M7 verification scenario from the design doc)**

Run `pnpm dev`:

1. New project → add 3 images → place 2 of them → Save as `figure.mosaic` next to the source images.
2. Quit.
3. Move the source images to a sibling folder.
4. Relaunch → Open `figure.mosaic`.
5. The relink modal appears with all 3 missing entries (since both relPath and filePath now fail to resolve).
6. Click **Locate…** on each row, pick the moved file. The status flips to "relinked".
7. Click **Done**. The figure renders with the same panel placements.
8. Save back to `figure.mosaic`; on the next open, no relink modal (paths are fresh).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/Modals/RelinkModal.tsx src/renderer/App.tsx
git commit -m "feat(m7): missing-image relink modal"
```

---

### Task 13: End-to-end save → undo → save round-trip test

**Files:**

- Create: `test/unit/m7-roundtrip.test.ts`

A pure-data integration test that exercises the full M7 surface without React or the renderer. It builds a state, mutates it through the reducer, simulates undo, then serializes/validates/deserializes — verifying nothing is lost and undo doesn't break serialization.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from "vitest";
import {
  initialFigureState,
  figureReducer,
  __resetPanelIdsForTests,
} from "../../src/renderer/model/figure-state";
import {
  addToPool,
  placeIntoPanel,
  setGutterPx,
  resetToState,
} from "../../src/renderer/model/figure-actions";
import {
  toMosaicFile,
  fromMosaicFile,
} from "../../src/renderer/model/serialize";
import { validateMosaicFile } from "../../src/renderer/model/schema";
import { combinedReducer } from "../../src/renderer/state/use-history-reducer";
import type { Combined } from "../../src/renderer/state/use-history-reducer";

const MOSAIC_PATH = "/tmp/proj/fig.mosaic";

describe("M7 round-trip — reducer × history × serialize × validate", () => {
  it("save → undo → save preserves the active state and validates", () => {
    __resetPanelIdsForTests();
    const initial = initialFigureState();
    let combined: Combined = {
      state: initial,
      history: { past: [], future: [] },
      lastCommitted: initial,
    };

    combined = combinedReducer(combined, {
      kind: "dispatch",
      action: addToPool({
        id: "img1",
        filename: "a.png",
        filePath: "/tmp/proj/a.png",
        mime: "image/png",
        width: 100,
        height: 100,
        bitDepth: 8,
      }),
    });
    const firstPanel = combined.state.panels[0]!;
    combined = combinedReducer(combined, {
      kind: "dispatch",
      action: placeIntoPanel("img1", firstPanel.id),
    });
    combined = combinedReducer(combined, {
      kind: "dispatch",
      action: setGutterPx(20),
    });
    expect(combined.state.gutterPx).toBe(20);
    expect(combined.history.past.length).toBe(3);

    // Save snapshot 1.
    const file1 = toMosaicFile({
      state: combined.state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: MOSAIC_PATH,
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    expect(validateMosaicFile(file1).ok).toBe(true);

    // Undo back to gutter=12 and save snapshot 2.
    combined = combinedReducer(combined, { kind: "undo" });
    expect(combined.state.gutterPx).toBe(12);
    const file2 = toMosaicFile({
      state: combined.state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: MOSAIC_PATH,
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:01Z",
    });
    expect(validateMosaicFile(file2).ok).toBe(true);
    expect(file2.state.gutterPx).toBe(12);

    // Reload snapshot 1 via fromMosaicFile + RESET_TO_STATE.
    const r = fromMosaicFile(file1);
    combined = combinedReducer(combined, {
      kind: "dispatch",
      action: resetToState(r.state),
    });
    expect(combined.state.gutterPx).toBe(20);
    expect(
      combined.state.panels.find((p) => p.id === firstPanel.id)?.imageId,
    ).toBe("img1");
    // RESET_TO_STATE clears history.
    expect(combined.history.past.length).toBe(0);
    expect(combined.history.future.length).toBe(0);
  });

  it("relink hint preserves sha256 + relPath through save/load", () => {
    const state = {
      ...initialFigureState(),
      pool: [
        {
          id: "img1",
          filename: "a.png",
          filePath: "/tmp/proj/a.png",
          mime: "image/png" as const,
          width: 1,
          height: 1,
          bitDepth: 8 as const,
        },
      ],
    };
    const file = toMosaicFile({
      state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: MOSAIC_PATH,
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
      shaByImageId: { img1: "abc" },
    });
    expect(validateMosaicFile(file).ok).toBe(true);
    const r = fromMosaicFile(file);
    expect(r.relinkHints[0]).toEqual({
      imageId: "img1",
      filePath: "/tmp/proj/a.png",
      relPath: "./a.png",
      sha256: "abc",
    });
  });
});
```

- [ ] **Step 2: Run + verify pass**

Run: `pnpm vitest run test/unit/m7-roundtrip.test.ts`
Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add test/unit/m7-roundtrip.test.ts
git commit -m "test(m7): reducer × history × serialize × schema round-trip"
```

---

### Task 14: M7 milestone doc

**Files:**

- Create: `docs/plans/m7-project-save-load-and-undo-redo.md`

A short shipped-feature notes file mirroring `docs/plans/m6-annotations-and-tiff.md`. This is the only documentation file in M7 — no README changes, no new top-level docs.

- [ ] **Step 1: Write the file**

`docs/plans/m7-project-save-load-and-undo-redo.md`:

```markdown
# M7 — Project save/load + undo/redo

## Shipped

- `.mosaic` JSON v1 schema with hand-rolled validator (`src/renderer/model/schema.ts`).
- Pure serializer/deserializer (`src/renderer/model/serialize.ts`) — posix `relPath`, sha256 hint, no fs.
- Main-process IO (`src/main/project-io.ts`) — save, load, sha256 mismatch flag, missing-image enumeration.
- Two new IPC channels: `mosaic:project-save`, `mosaic:project-load`.
- Toolbar Save / Open buttons.
- Relink modal (`src/renderer/components/Modals/RelinkModal.tsx`) for missing-on-load images.
- Undo/redo backed by a generic 10-deep ring buffer (`src/renderer/state/history.ts`)
  - `useHistoryReducer` (`src/renderer/state/use-history-reducer.ts`).
  * Pan/zoom drags = transient + explicit `commit()` on `pointerup` / wheel-end (250ms debounce).
  * `RESET_TO_STATE` (used by project-load) clears history.
- Cmd/Ctrl-Z undo, Cmd/Ctrl-Shift-Z redo, gated to ignore typing targets.
- Bitmaps NEVER persist — they live in `useState<Map<string, ImageBitmap>>` in
  `App.tsx` and are rebuilt on load by re-running `decodeImageBytes` over the
  bytes returned by main-process project-load.

## Test coverage

- `test/unit/history.test.ts` — pure ring-buffer mechanics + 10-cap.
- `test/unit/use-history-reducer.test.ts` — transient/commit/undo/redo over `figureReducer`.
- `test/unit/schema.test.ts` — validator accepts/rejects.
- `test/unit/serialize.test.ts` — relPath posix form, sha256 attach, fromMosaicFile relink hints.
- `test/unit/sha256.test.ts` — node:crypto wrapper.
- `test/unit/project-io.test.ts` — save round-trip, missing-image flag, sha256 mismatch flag, validation failure.
- `test/unit/m7-roundtrip.test.ts` — reducer × history × serialize × schema integration.

## Out of scope (deferred)

- Multi-snapshot save (overwriting `Save` without re-prompting): every Save
  in M7 is effectively Save-As. M8 will track the active project path and
  add a separate Save vs Save As.
- Schema migrations: there's only v1, so no migration table is needed yet.
- Recent-projects list.
```

- [ ] **Step 2: Commit**

```bash
git add docs/plans/m7-project-save-load-and-undo-redo.md
git commit -m "docs(m7): what shipped"
```

---

## Final verification

Run the entire test suite and a manual end-to-end pass:

```bash
pnpm typecheck
pnpm test
pnpm dev
```

Manual scenario (mirrors the design doc's verification §11–12):

1. Launch; place 3 images across a 2×2 grid (one merged 2×1 cell).
2. Adjust panel transforms (rotate one, zoom one).
3. Add a text annotation and a scale bar (TIFF panel).
4. Cmd-Z 5×, then Cmd-Shift-Z 5× — verify the figure returns exactly to the pre-undo state.
5. Save to `figure.mosaic`. Move the source images. Reopen → relink modal appears, locate each, Done. Figure matches.
6. Make 11 distinct edits, undo 11×: only 10 unwind (the 11th is a no-op).
7. Confirm the file size of `figure.mosaic` is small (under 50 KB for a typical figure — no image bytes embedded).

---

## Self-review checklist (recorded for reference)

**Spec coverage** (from the design doc's M7 line + Tracer-bullet milestones):

- ✅ `.mosaic` write: Tasks 5–6 (schema + serialize), 9 (save), 10 (IPC), 11 (UI button).
- ✅ `.mosaic` read with relative paths: Tasks 6 (`relPath` posix), 9 (resolve order).
- ✅ Undo/redo wired to all mutations: Task 2 (history wraps `figureReducer`, all action types), Task 4 (keyboard).
- ✅ Missing-image relink modal: Task 12.
- ✅ 10-deep cap (user requirement, narrower than spec's 100): Task 1 (`MAX_HISTORY = 10`), tested.
- ✅ Bitmaps excluded from snapshots: documented in Pre-flight; `useHistoryReducer` only manages `FigureState`, bitmap `Map` lives in `App.tsx` `useState`.
- ✅ sha256 mismatch surfaced: Task 9 (`shaMismatch: true` on `ResolvedImageDto`); UI handling in M8 (TODO).

**Type consistency check**:

- `MosaicFileV1` (Task 5) ↔ `toMosaicFile` return type (Task 6) ↔ `loadProjectFromPath` return field `file` (Task 9): same.
- `RESET_TO_STATE` action (Task 2) ↔ `resetToState` creator ↔ used in Task 11.
- `History<T>` shape (Task 1: `{past, future}`) consistent throughout.
- `commit()` exposed via `HistoryControls` (Task 2), consumed via `onCommit` prop on `PanelInteractionLayer` (Task 3).

**Placeholder scan**: none of TBD/TODO/"add appropriate handling"/"similar to Task N" appear; every code step contains the actual code.
