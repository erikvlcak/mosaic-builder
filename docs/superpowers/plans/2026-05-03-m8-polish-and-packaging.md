# M8 — Polish + Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the app so a scientist can install it and ship a figure: a Properties sidebar exposing every per-annotation/per-panel/global-style knob, a real native menu (File/Edit/View) with accelerators that mirror the toolbar, a non-blocking error/info toast UI, an app icon, and signed/notarizable electron-builder artifacts for mac/win/linux.

**Architecture:** All M8 work is additive on top of the M1–M7 stack. Three subsystems built sequentially:

1. **Properties sidebar (right-hand panel)** — a single `<PropertiesPanel>` component switches on the current selection (focused image panel, selected annotation, or "no selection" → canvas + global style). Every input is a controlled component that dispatches existing `figure-actions.ts` action creators. Continuous edits (sliders, color pickers, text fields) coalesce into a single undo entry via the **same** `beginInteraction()/commit()` pattern M7 introduced for pan/zoom: a `useFieldCommit` hook calls `history.commit()` on `onBlur` / `onChange-debounced(400ms)` so typing into a font-size field is one history step, not one per keystroke.

2. **Native menu + Edit accelerators** — a new `src/main/menu.ts` builds an `Electron.Menu` with File (New/Open/Save/Save As/Export…), Edit (Undo/Redo/Cut/Copy/Paste), View (Reset Zoom), Help. File menu items send IPC messages to the renderer that trigger the same code paths as the existing toolbar buttons. Cmd/Ctrl-S, Cmd/Ctrl-O, Cmd/Ctrl-Shift-S, Cmd/Ctrl-N use the menu's native accelerator field — the keyboard shortcut hook keeps Cmd/Ctrl-Z and the unmodified letters (M, U, R, H, V, 0).

3. **Toast system + packaging** — a tiny `useToasts()` hook + `<ToastTray>` component replaces the inline error `<span>`. Toasts auto-dismiss after 5 s, stack bottom-right, support `error` / `info` / `success` variants. Packaging adds `electron-builder` as a dev dep, `electron-builder.yml`, an `appIcon` resource set (`.icns`, `.ico`, `.png`), `pnpm package` / `pnpm package:all` scripts, and a CI-friendly env-gated mac code-sign block (skipped when `CSC_LINK` is unset).

**Tech Stack:** TypeScript 5.6 strict, React 18.3, Electron 32, Vitest 2.1. **Two new dev deps:** `electron-builder` (packaging) and `png-to-ico` (icon generation script — runs once, outputs are committed). No new runtime deps.

---

## Pre-flight context (read once before starting)

State of the codebase the plan assumes (verified 2026-05-03):

- `src/renderer/App.tsx` (494 lines) is the single mount point. It already has `useHistoryReducer`, `RelinkModal`, `CalibrationModal`, all toolbars, `error` state, and `setError` callsites. M8 keeps `App.tsx` as the orchestrator — extracting state into a sidebar but NOT introducing global stores.
- `src/renderer/state/use-history-reducer.ts` exposes `history.commit()` plus `history.undo()` / `history.redo()`. `SET_PANEL_TRANSFORM` is already in `TRANSIENT_ACTIONS`. M8 adds `UPDATE_ANNOTATION` and `SET_GLOBAL_STYLE` to that set so dragging an annotation and scrubbing a font-size slider both coalesce.
- `src/renderer/model/figure-actions.ts` exports `addAnnotation`, `updateAnnotation`, `removeAnnotation`, `setGlobalStyle`, `setLetterOverride`, etc. All M8 property-panel inputs dispatch these — no new actions are needed except `RESET_FIGURE` (used by File → New).
- `src/renderer/model/annotations.ts` defines `TextAnnotation`, `ArrowAnnotation`, `BoxAnnotation`, `ScaleBarAnnotation` — these drive the per-kind property forms.
- `src/renderer/model/global-style.ts` defines `LetterStyle` and `ScaleBarStyle` — these drive the global-style form.
- `src/main/index.ts:154` registers all IPC handlers via `registerIpc()`. M8 adds menu wiring there. Channels live in `src/preload/api.ts:6` (`API_CHANNELS`) — M8 adds `menu:new` / `menu:open` / `menu:save` / `menu:saveAs` / `menu:export` outbound channels (main → renderer).
- `src/renderer/hooks/useKeyboardShortcuts.ts` already handles M/U/R/H/V/0/Delete/Esc plus Cmd-Z / Cmd-Shift-Z. M8 leaves this hook UNCHANGED — Save/Open/New accelerators move to the native menu.
- Tests: Vitest with `environment: "node"`. Anything that touches React (`render`/`screen`) needs `@testing-library/react` + `jsdom` — neither is installed. **M8 adds `@testing-library/react`, `@testing-library/user-event`, `jsdom` as dev deps**, plus a per-test `// @vitest-environment jsdom` directive on UI test files. Existing node-only tests stay untouched.
- `vite.config.ts` outputs to `dist/renderer`, `dist-electron/main`, `dist-electron/preload`. `electron-builder` consumes those three directories.
- App version lives in `package.json:3` (`"version": "0.1.0"`); also hard-coded in `src/renderer/App.tsx:285` (`appVersion: "0.1.0"` passed to `toMosaicFile`). M8 lifts this into a single constant `src/renderer/app-version.ts` so a bump only edits one place.
- `resources/` is currently `publicDir` and contains only `fixtures/`. M8 adds `resources/icon.png` (1024×1024) and a `scripts/generate-icons.mjs` script that produces `resources/icons/icon.icns`, `icon.ico`, and a 512×512 png — these output files are committed.

---

## File structure

**New files:**

Properties panel (Task group 1):
- `src/renderer/components/Properties/PropertiesPanel.tsx` — root, picks the right form by selection.
- `src/renderer/components/Properties/PanelPropertiesForm.tsx` — image-panel form (fit, pan/zoom readouts, rotation, flip, calibration, letter override).
- `src/renderer/components/Properties/AnnotationPropertiesForm.tsx` — picks per-kind form by `kind`.
- `src/renderer/components/Properties/TextAnnoForm.tsx`
- `src/renderer/components/Properties/ArrowAnnoForm.tsx`
- `src/renderer/components/Properties/BoxAnnoForm.tsx`
- `src/renderer/components/Properties/ScalebarAnnoForm.tsx`
- `src/renderer/components/Properties/CanvasAndGlobalStyleForm.tsx` — shown when nothing is selected; drives `globalStyle` + figure background.
- `src/renderer/components/Properties/inputs/NumberField.tsx` — debounced numeric input.
- `src/renderer/components/Properties/inputs/ColorField.tsx` — `<input type="color">` + hex text.
- `src/renderer/components/Properties/inputs/TextField.tsx` — debounced string input.
- `src/renderer/components/Properties/inputs/SelectField.tsx` — typed `<select>`.
- `src/renderer/components/Properties/inputs/CornerField.tsx` — 4-button tl/tr/bl/br picker.
- `src/renderer/hooks/useFieldCommit.ts` — debounce + commit-on-blur helper.

Toasts (Task group 3):
- `src/renderer/components/Toasts/ToastTray.tsx`
- `src/renderer/hooks/useToasts.ts`

Native menu + IPC (Task group 2):
- `src/main/menu.ts`
- `src/renderer/hooks/useMenuEvents.ts` — listens for main → renderer menu events.

Versioning + icons (Task group 4):
- `src/renderer/app-version.ts` — `export const APP_VERSION = "0.1.0";`
- `electron-builder.yml`
- `scripts/generate-icons.mjs` — png-to-ico + png-to-icns; run once via `pnpm gen:icons`.
- `resources/icon.png` — 1024×1024 source (placeholder colored square OK for v0.1.0).
- `resources/icons/icon.icns` (committed output)
- `resources/icons/icon.ico` (committed output)
- `resources/icons/icon-512.png` (committed output)
- `build/entitlements.mac.plist` — minimal macOS hardened-runtime entitlements.

Tests:
- `test/unit/use-field-commit.test.ts`
- `test/unit/properties-panel-routing.test.ts`
- `test/unit/text-anno-form.test.ts`
- `test/unit/scalebar-anno-form.test.ts`
- `test/unit/canvas-and-global-style-form.test.ts`
- `test/unit/toasts.test.ts`
- `test/unit/menu-build.test.ts` — pure builder; no Electron app.
- `test/unit/app-version.test.ts`

**Modified files:**
- `package.json` — add deps + scripts.
- `src/renderer/state/use-history-reducer.ts` — add `UPDATE_ANNOTATION`, `SET_GLOBAL_STYLE` to `TRANSIENT_ACTIONS`.
- `src/renderer/model/figure-actions.ts` — add `RESET_FIGURE` action + creator + reducer case (reducer lives here, not in `figure-state.ts`).
- `src/preload/api.ts` — add menu event channel constants + types.
- `src/preload/preload.ts` — expose `onMenuEvent(callback)` subscriber.
- `src/main/index.ts` — call `installMenu(mainWindow)` on `ready-to-show`.
- `src/renderer/App.tsx` — mount `<PropertiesPanel>`, `<ToastTray>`; replace inline error `<span>`; lift `error` into toasts; install `useMenuEvents`; wire `RESET_FIGURE` for File → New.
- `README.md` — add Packaging section.
- `vite.config.ts` — add `resources/icons/**` to `publicDir` ignore list (icons are bundled by electron-builder, not Vite).

---

## Task list

> **TDD discipline:** every task that adds production code starts with a failing test.
> **Commit cadence:** one commit per task.
> Type-check before each commit: `pnpm typecheck`.
> All Vitest commands assume cwd = `/Users/erikvlcak/Desktop/mosaic-builder`.

---

### Task 1: Centralize app version

**Files:**
- Create: `src/renderer/app-version.ts`
- Create: `test/unit/app-version.test.ts`
- Modify: `src/renderer/App.tsx` (one line)

Single source for the app version string used in the `.mosaic` file header. Eliminates the `"0.1.0"` literal sitting in `App.tsx` next to the `package.json` value.

- [ ] **Step 1: Write the failing test**

`test/unit/app-version.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { APP_VERSION } from "../../src/renderer/app-version";

describe("APP_VERSION", () => {
  it("matches package.json version", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, "../../package.json"), "utf8"),
    );
    expect(APP_VERSION).toBe(pkg.version);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test app-version`
Expected: FAIL — `Cannot find module '.../app-version'`.

- [ ] **Step 3: Create the module**

`src/renderer/app-version.ts`:

```ts
/** Single source of truth for the app version string. Mirrors package.json `version`.
 *  Update this AND package.json together when bumping. */
export const APP_VERSION = "0.1.0";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test app-version`
Expected: PASS.

- [ ] **Step 5: Use in App.tsx**

In `src/renderer/App.tsx` import:

```ts
import { APP_VERSION } from "./app-version";
```

Replace the literal `appVersion: "0.1.0"` in the `toMosaicFile({...})` call inside `onSaveProject` with `appVersion: APP_VERSION`.

- [ ] **Step 6: Type-check + commit**

```bash
pnpm typecheck
git add src/renderer/app-version.ts src/renderer/App.tsx test/unit/app-version.test.ts
git commit -m "feat(m8): centralize APP_VERSION constant"
```

---

### Task 2: Install jsdom + testing-library for UI tests

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`

The Properties panel tests need a real DOM. Per pre-flight notes, the existing Vitest config uses `environment: "node"`. We keep that as the default and opt-in per file with `// @vitest-environment jsdom`.

- [ ] **Step 1: Install deps**

```bash
pnpm add -D @testing-library/react@16.0.1 @testing-library/user-event@14.5.2 jsdom@25.0.1
```

Pinned versions chosen for React 18.3 compatibility; do not float.

- [ ] **Step 2: Verify Vitest accepts the per-file environment directive**

Create `test/unit/jsdom-smoke.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

describe("jsdom env", () => {
  it("exposes window.document", () => {
    expect(typeof document).toBe("object");
    expect(document.createElement("div")).toBeTruthy();
  });
});
```

Run: `pnpm test jsdom-smoke`
Expected: PASS.

- [ ] **Step 3: Delete the smoke test**

```bash
rm test/unit/jsdom-smoke.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(m8): add jsdom + testing-library dev deps"
```

---

### Task 3: Add `RESET_FIGURE` action

**Files:**
- Modify: `src/renderer/model/figure-actions.ts` (action union + creator + reducer case)
- Modify: `test/unit/figure-actions.test.ts` (append cases)

Used by File → New (Task 14). Existing `RESET_TO_STATE` takes a payload — we want a parameterless "blank slate" for the menu. `figureReducer` lives in `figure-actions.ts` (re-exported from `figure-state.ts:98`); the reducer case goes there.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/figure-actions.test.ts`:

```ts
import { resetFigureAction, figureReducer } from "../../src/renderer/model/figure-actions";
import { initialFigureState } from "../../src/renderer/model/figure-state";

describe("RESET_FIGURE", () => {
  it("returns a fresh initial state regardless of prior state", () => {
    const dirty = figureReducer(initialFigureState(), {
      type: "RESIZE_GRID",
      rows: 5,
      cols: 5,
    });
    const reset = figureReducer(dirty, resetFigureAction());
    expect(reset.rows).toBe(initialFigureState().rows);
    expect(reset.cols).toBe(initialFigureState().cols);
    expect(reset.pool).toEqual([]);
    expect(reset.panels.length).toBeGreaterThan(0);
    expect(reset.annotations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test figure-actions`
Expected: FAIL — `resetFigureAction` is not exported.

- [ ] **Step 3: Add the action type and creator**

In `src/renderer/model/figure-actions.ts`, add to the `FigureAction` union:

```ts
| { type: "RESET_FIGURE" }
```

Add the creator (next to `resetToState`):

```ts
export const resetFigureAction = (): FigureAction => ({ type: "RESET_FIGURE" });
```

- [ ] **Step 4: Handle the case in `figureReducer`**

In `src/renderer/model/figure-actions.ts`, inside the `switch (a.type)` in `figureReducer` (starts at line 201), add a new case:

```ts
case "RESET_FIGURE":
  return initialFigureState();
```

If `initialFigureState` is not yet imported in this file, add at the top: `import { initialFigureState } from "./figure-state";` (the existing file already imports `FigureState` from there, so adding the second symbol is one-line).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test figure-actions`
Expected: PASS.

- [ ] **Step 6: Type-check + commit**

```bash
pnpm typecheck
git add src/renderer/model/figure-actions.ts test/unit/figure-actions.test.ts
git commit -m "feat(m8): add RESET_FIGURE action for File→New"
```

---

### Task 4: Mark `UPDATE_ANNOTATION` and `SET_GLOBAL_STYLE` transient

**Files:**
- Modify: `src/renderer/state/use-history-reducer.ts`
- Modify: `test/unit/use-history-reducer.test.ts`

Without this, every keystroke into a font-size field pushes a history snapshot, and Cmd-Z would undo character by character.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/use-history-reducer.test.ts`:

```ts
import { renderHook, act } from "@testing-library/react";
import { useHistoryReducer } from "../../src/renderer/state/use-history-reducer";
import { initialFigureState } from "../../src/renderer/model/figure-state";
import {
  setGlobalStyle,
  addAnnotation,
  updateAnnotation,
} from "../../src/renderer/model/figure-actions";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";

// @vitest-environment jsdom
describe("transient actions coalesce until commit", () => {
  it("UPDATE_ANNOTATION dispatches do not push history until commit()", () => {
    const { result } = renderHook(() => useHistoryReducer(initialFigureState()));
    const seedAnno = {
      id: "t1", kind: "text" as const, x: 10, y: 10, text: "hi",
      font: "Arial", sizePt: 12, bold: false, italic: false, color: "#000", z: 1,
    };
    act(() => result.current[1](addAnnotation(seedAnno)));
    act(() => result.current[2].commit());
    const undosBefore = result.current[2].canUndo;
    act(() => {
      result.current[1](updateAnnotation("t1", { text: "h" }));
      result.current[1](updateAnnotation("t1", { text: "hi" }));
      result.current[1](updateAnnotation("t1", { text: "hii" }));
    });
    // No commit yet → still only the addAnnotation snapshot in history.
    act(() => result.current[2].undo());
    const stateAfterOneUndo = result.current[0];
    // Single undo wiped all 3 transient updates AND the add — i.e., they
    // were folded into one logical step (the original add).
    expect(stateAfterOneUndo.annotations).toEqual([]);
    expect(undosBefore).toBe(true);
  });

  it("SET_GLOBAL_STYLE is transient", () => {
    const { result } = renderHook(() => useHistoryReducer(initialFigureState()));
    const variantA = { ...DEFAULT_GLOBAL_STYLE,
      letters: { ...DEFAULT_GLOBAL_STYLE.letters, sizePt: 14 } };
    const variantB = { ...DEFAULT_GLOBAL_STYLE,
      letters: { ...DEFAULT_GLOBAL_STYLE.letters, sizePt: 16 } };
    act(() => result.current[1](setGlobalStyle(variantA)));
    act(() => result.current[1](setGlobalStyle(variantB)));
    act(() => result.current[2].commit());
    expect(result.current[0].globalStyle.letters.sizePt).toBe(16);
    act(() => result.current[2].undo());
    // Both transient dispatches collapse into one history step.
    expect(result.current[0].globalStyle.letters.sizePt).toBe(
      initialFigureState().globalStyle.letters.sizePt,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test use-history-reducer`
Expected: FAIL — `UPDATE_ANNOTATION` and `SET_GLOBAL_STYLE` currently each push history.

- [ ] **Step 3: Add the action types to `TRANSIENT_ACTIONS`**

In `src/renderer/state/use-history-reducer.ts`, change:

```ts
const TRANSIENT_ACTIONS: ReadonlySet<FigureAction["type"]> = new Set([
  "SET_PANEL_TRANSFORM",
]);
```

to:

```ts
const TRANSIENT_ACTIONS: ReadonlySet<FigureAction["type"]> = new Set([
  "SET_PANEL_TRANSFORM",
  "UPDATE_ANNOTATION",
  "SET_GLOBAL_STYLE",
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test use-history-reducer`
Expected: PASS (both new cases plus existing ones).

- [ ] **Step 5: Commit**

```bash
pnpm typecheck
git add src/renderer/state/use-history-reducer.ts test/unit/use-history-reducer.test.ts
git commit -m "feat(m8): coalesce annotation + global-style edits into one history step"
```

---

### Task 5: `useFieldCommit` hook (debounce + commit)

**Files:**
- Create: `src/renderer/hooks/useFieldCommit.ts`
- Create: `test/unit/use-field-commit.test.ts`

Wraps the `history.commit` semantics: every input field calls `markDirty()` on each change; the hook auto-commits 400 ms after the last change (or on `flush()` from `onBlur`).

- [ ] **Step 1: Write the failing test**

`test/unit/use-field-commit.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test use-field-commit`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

`src/renderer/hooks/useFieldCommit.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test use-field-commit`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
pnpm typecheck
git add src/renderer/hooks/useFieldCommit.ts test/unit/use-field-commit.test.ts
git commit -m "feat(m8): useFieldCommit hook for debounced undo coalescing"
```

---

### Task 6: Reusable input components

**Files:**
- Create: `src/renderer/components/Properties/inputs/NumberField.tsx`
- Create: `src/renderer/components/Properties/inputs/ColorField.tsx`
- Create: `src/renderer/components/Properties/inputs/TextField.tsx`
- Create: `src/renderer/components/Properties/inputs/SelectField.tsx`
- Create: `src/renderer/components/Properties/inputs/CornerField.tsx`

These are dumb controlled components. They DO NOT call `markDirty()` themselves — the parent form does, after dispatching the action. Keeping them dumb means tests can be DOM-only (no history mocks).

- [ ] **Step 1: Write the failing test for NumberField**

Append `test/unit/properties-inputs.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberField } from "../../src/renderer/components/Properties/inputs/NumberField";

describe("NumberField", () => {
  it("clamps within [min,max] and calls onChange with parsed number", async () => {
    const onChange = vi.fn();
    render(<NumberField label="Size" value={10} min={1} max={20} onChange={onChange} />);
    const input = screen.getByLabelText("Size") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "15");
    expect(onChange).toHaveBeenLastCalledWith(15);
    await userEvent.clear(input);
    await userEvent.type(input, "999");
    expect(onChange).toHaveBeenLastCalledWith(20);
  });

  it("ignores non-numeric input (does not call onChange with NaN)", async () => {
    const onChange = vi.fn();
    render(<NumberField label="X" value={5} onChange={onChange} />);
    const input = screen.getByLabelText("X") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "abc");
    for (const c of onChange.mock.calls) expect(Number.isNaN(c[0])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test properties-inputs`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement NumberField**

`src/renderer/components/Properties/inputs/NumberField.tsx`:

```tsx
import { useId } from "react";

interface Props {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (n: number) => void;
  onBlur?: () => void;
}

export function NumberField({
  label, value, min, max, step = 1, onChange, onBlur,
}: Props): JSX.Element {
  const id = useId();
  return (
    <label
      htmlFor={id}
      style={{ display: "flex", flexDirection: "column", fontSize: 11, gap: 2 }}
    >
      <span style={{ color: "#555" }}>{label}</span>
      <input
        id={id}
        aria-label={label}
        type="number"
        value={value}
        step={step}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        onChange={(e) => {
          const raw = e.currentTarget.value;
          if (raw === "") return;
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          let clamped = n;
          if (min !== undefined && clamped < min) clamped = min;
          if (max !== undefined && clamped > max) clamped = max;
          onChange(clamped);
        }}
        onBlur={onBlur}
        style={{ padding: 4, border: "1px solid #BBB", fontSize: 12 }}
      />
    </label>
  );
}
```

- [ ] **Step 4: Run NumberField test, verify pass**

Run: `pnpm test properties-inputs`
Expected: PASS for both NumberField cases.

- [ ] **Step 5: Implement remaining input components**

`src/renderer/components/Properties/inputs/TextField.tsx`:

```tsx
import { useId } from "react";

interface Props {
  label: string;
  value: string;
  onChange: (s: string) => void;
  onBlur?: () => void;
  multiline?: boolean;
  placeholder?: string;
}

export function TextField({
  label, value, onChange, onBlur, multiline, placeholder,
}: Props): JSX.Element {
  const id = useId();
  const common = {
    id,
    "aria-label": label,
    value,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(e.currentTarget.value),
    onBlur,
    placeholder,
    style: { padding: 4, border: "1px solid #BBB", fontSize: 12, width: "100%" },
  };
  return (
    <label
      htmlFor={id}
      style={{ display: "flex", flexDirection: "column", fontSize: 11, gap: 2 }}
    >
      <span style={{ color: "#555" }}>{label}</span>
      {multiline === true
        ? <textarea {...common} rows={3} />
        : <input type="text" {...common} />}
    </label>
  );
}
```

`src/renderer/components/Properties/inputs/ColorField.tsx`:

```tsx
import { useId } from "react";

interface Props {
  label: string;
  value: string;          // "#RRGGBB" or "#RRGGBBAA"
  onChange: (hex: string) => void;
  onBlur?: () => void;
  allowAlpha?: boolean;
}

const HEX6 = /^#[0-9A-Fa-f]{6}$/;
const HEX8 = /^#[0-9A-Fa-f]{8}$/;

function isValidHex(s: string, allowAlpha: boolean): boolean {
  return HEX6.test(s) || (allowAlpha && HEX8.test(s));
}

export function ColorField({
  label, value, onChange, onBlur, allowAlpha = false,
}: Props): JSX.Element {
  const id = useId();
  // The native picker only emits 6-digit hex; the text input handles 8-digit if allowed.
  const swatch = value.length >= 7 ? value.slice(0, 7) : "#000000";
  return (
    <label
      htmlFor={id}
      style={{ display: "flex", flexDirection: "column", fontSize: 11, gap: 2 }}
    >
      <span style={{ color: "#555" }}>{label}</span>
      <span style={{ display: "flex", gap: 4 }}>
        <input
          id={id}
          aria-label={label}
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.currentTarget.value)}
          onBlur={onBlur}
          style={{ width: 32, height: 26, border: "1px solid #BBB", padding: 0 }}
        />
        <input
          type="text"
          aria-label={`${label} hex`}
          value={value}
          onChange={(e) => {
            const v = e.currentTarget.value;
            if (isValidHex(v, allowAlpha)) onChange(v);
          }}
          onBlur={onBlur}
          style={{ flex: 1, padding: 4, border: "1px solid #BBB", fontSize: 12 }}
        />
      </span>
    </label>
  );
}
```

`src/renderer/components/Properties/inputs/SelectField.tsx`:

```tsx
import { useId } from "react";

interface Option<V extends string> { value: V; label: string; }
interface Props<V extends string> {
  label: string;
  value: V;
  options: ReadonlyArray<Option<V>>;
  onChange: (v: V) => void;
}

export function SelectField<V extends string>({
  label, value, options, onChange,
}: Props<V>): JSX.Element {
  const id = useId();
  return (
    <label
      htmlFor={id}
      style={{ display: "flex", flexDirection: "column", fontSize: 11, gap: 2 }}
    >
      <span style={{ color: "#555" }}>{label}</span>
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value as V)}
        style={{ padding: 4, border: "1px solid #BBB", fontSize: 12 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
```

`src/renderer/components/Properties/inputs/CornerField.tsx`:

```tsx
import type { Corner } from "../../../model/global-style";

interface Props {
  label: string;
  value: Corner;
  onChange: (c: Corner) => void;
}

const CORNERS: ReadonlyArray<{ id: Corner; symbol: string; title: string }> = [
  { id: "tl", symbol: "↖", title: "Top-left" },
  { id: "tr", symbol: "↗", title: "Top-right" },
  { id: "bl", symbol: "↙", title: "Bottom-left" },
  { id: "br", symbol: "↘", title: "Bottom-right" },
];

export function CornerField({ label, value, onChange }: Props): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", fontSize: 11, gap: 2 }}>
      <span style={{ color: "#555" }}>{label}</span>
      <div role="group" aria-label={label} style={{ display: "flex" }}>
        {CORNERS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-label={c.title}
            aria-pressed={value === c.id}
            title={c.title}
            onClick={() => onChange(c.id)}
            style={{
              padding: "4px 8px",
              border: "1px solid #BBB",
              background: value === c.id ? "#0066FF" : "#FFF",
              color: value === c.id ? "#FFF" : "#222",
              cursor: "pointer", fontSize: 12,
            }}
          >
            {c.symbol}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add tests for the remaining inputs (one each)**

Append to `test/unit/properties-inputs.test.ts`:

```ts
import { TextField } from "../../src/renderer/components/Properties/inputs/TextField";
import { ColorField } from "../../src/renderer/components/Properties/inputs/ColorField";
import { SelectField } from "../../src/renderer/components/Properties/inputs/SelectField";
import { CornerField } from "../../src/renderer/components/Properties/inputs/CornerField";

describe("TextField", () => {
  it("emits each typed character via onChange", async () => {
    const onChange = vi.fn();
    render(<TextField label="Caption" value="" onChange={onChange} />);
    const input = screen.getByLabelText("Caption");
    await userEvent.type(input, "hi");
    expect(onChange).toHaveBeenCalledWith("h");
    expect(onChange).toHaveBeenCalledWith("hi");
  });
});

describe("ColorField", () => {
  it("rejects invalid hex from the text input", async () => {
    const onChange = vi.fn();
    render(<ColorField label="C" value="#FF0000" onChange={onChange} />);
    const text = screen.getByLabelText("C hex") as HTMLInputElement;
    await userEvent.clear(text);
    await userEvent.type(text, "not-a-color");
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.clear(text);
    await userEvent.type(text, "#00FF00");
    expect(onChange).toHaveBeenLastCalledWith("#00FF00");
  });
});

describe("SelectField", () => {
  it("emits the chosen value", async () => {
    const onChange = vi.fn();
    render(
      <SelectField label="Fit" value="contain"
        options={[
          { value: "contain", label: "Contain" },
          { value: "cover", label: "Cover" },
        ] as const}
        onChange={onChange} />,
    );
    await userEvent.selectOptions(screen.getByLabelText("Fit"), "cover");
    expect(onChange).toHaveBeenLastCalledWith("cover");
  });
});

describe("CornerField", () => {
  it("emits the picked corner", async () => {
    const onChange = vi.fn();
    render(<CornerField label="Corner" value="tl" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("Bottom-right"));
    expect(onChange).toHaveBeenLastCalledWith("br");
  });
});
```

- [ ] **Step 7: Run all input tests**

Run: `pnpm test properties-inputs`
Expected: PASS (5/5).

- [ ] **Step 8: Commit**

```bash
pnpm typecheck
git add src/renderer/components/Properties/inputs/ test/unit/properties-inputs.test.ts
git commit -m "feat(m8): reusable controlled input components for Properties panel"
```

---

### Task 7: TextAnnoForm + AnnotationPropertiesForm router

**Files:**
- Create: `src/renderer/components/Properties/TextAnnoForm.tsx`
- Create: `src/renderer/components/Properties/AnnotationPropertiesForm.tsx`
- Create: `test/unit/text-anno-form.test.ts`

We build the four annotation-specific forms in two tasks. Task 7 ships TextAnnoForm + the router; Task 8 ships Arrow/Box/Scalebar.

- [ ] **Step 1: Write the failing test**

`test/unit/text-anno-form.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextAnnoForm } from "../../src/renderer/components/Properties/TextAnnoForm";
import type { TextAnnotation } from "../../src/renderer/model/annotations";

const seed: TextAnnotation = {
  id: "t1", kind: "text", x: 10, y: 20, text: "hello",
  font: "Arial", sizePt: 12, bold: false, italic: false, color: "#000000", z: 1,
};

describe("TextAnnoForm", () => {
  it("dispatches updateAnnotation on text edit and markDirty on each change", async () => {
    const dispatch = vi.fn();
    const markDirty = vi.fn();
    const flush = vi.fn();
    render(
      <TextAnnoForm
        anno={seed}
        dispatch={dispatch}
        commit={{ markDirty, flush }}
      />,
    );
    const text = screen.getByLabelText("Text");
    await userEvent.type(text, "!");
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ANNOTATION",
      id: "t1",
      patch: { text: "hello!" },
    });
    expect(markDirty).toHaveBeenCalled();
  });

  it("toggles bold via button and emits one dispatch + one commit per toggle", async () => {
    const dispatch = vi.fn();
    const markDirty = vi.fn();
    const flush = vi.fn();
    render(
      <TextAnnoForm anno={seed} dispatch={dispatch}
        commit={{ markDirty, flush }} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /bold/i }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ANNOTATION",
      id: "t1",
      patch: { bold: true },
    });
    // Boolean toggles flush immediately — no debounce needed for clicks.
    expect(flush).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test text-anno-form`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement TextAnnoForm**

`src/renderer/components/Properties/TextAnnoForm.tsx`:

```tsx
import type { Dispatch } from "react";
import type { TextAnnotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import { updateAnnotation, removeAnnotation } from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { TextField } from "./inputs/TextField";
import { NumberField } from "./inputs/NumberField";
import { ColorField } from "./inputs/ColorField";

interface Props {
  anno: TextAnnotation;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

const FONT_OPTIONS = [
  "Arial, Helvetica, sans-serif",
  "Helvetica, Arial, sans-serif",
  "Times New Roman, serif",
  "Georgia, serif",
  "Courier New, monospace",
];

const toggleBtn = (active: boolean): React.CSSProperties => ({
  padding: "4px 8px",
  border: "1px solid #BBB",
  background: active ? "#0066FF" : "#FFF",
  color: active ? "#FFF" : "#222",
  cursor: "pointer", fontSize: 12,
});

export function TextAnnoForm({ anno, dispatch, commit }: Props): JSX.Element {
  function patch(p: Partial<TextAnnotation>, immediate = false): void {
    dispatch(updateAnnotation(anno.id, p));
    if (immediate) commit.flush();
    else commit.markDirty();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <TextField label="Text" value={anno.text} multiline
        onChange={(text) => patch({ text })}
        onBlur={commit.flush} />
      <label style={{ display: "flex", flexDirection: "column", fontSize: 11, gap: 2 }}>
        <span style={{ color: "#555" }}>Font</span>
        <select
          aria-label="Font"
          value={anno.font}
          onChange={(e) => patch({ font: e.currentTarget.value }, true)}
          style={{ padding: 4, border: "1px solid #BBB", fontSize: 12 }}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f}>{f.split(",")[0]}</option>
          ))}
        </select>
      </label>
      <NumberField label="Size (pt)" value={anno.sizePt} min={4} max={144}
        onChange={(sizePt) => patch({ sizePt })}
        onBlur={commit.flush} />
      <div style={{ display: "flex", gap: 4 }}>
        <button type="button" aria-label="Bold"
          aria-pressed={anno.bold} title="Bold"
          onClick={() => patch({ bold: !anno.bold }, true)}
          style={toggleBtn(anno.bold)}>B</button>
        <button type="button" aria-label="Italic"
          aria-pressed={anno.italic} title="Italic"
          onClick={() => patch({ italic: !anno.italic }, true)}
          style={{ ...toggleBtn(anno.italic), fontStyle: "italic" }}>I</button>
      </div>
      <ColorField label="Color" value={anno.color}
        onChange={(color) => patch({ color })}
        onBlur={commit.flush} />
      <ColorField label="Background"
        value={anno.bgColor ?? "#FFFFFF00"}
        onChange={(bgColor) => patch({ bgColor })}
        onBlur={commit.flush}
        allowAlpha />
      <button type="button"
        onClick={() => { dispatch(removeAnnotation(anno.id)); commit.flush(); }}
        style={{ padding: "4px 8px", border: "1px solid #BBB",
                 background: "#FFF", cursor: "pointer", fontSize: 12,
                 color: "#A00" }}>
        Delete annotation
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test text-anno-form`
Expected: PASS.

- [ ] **Step 5: Implement AnnotationPropertiesForm router**

`src/renderer/components/Properties/AnnotationPropertiesForm.tsx`:

```tsx
import type { Dispatch } from "react";
import type { Annotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { TextAnnoForm } from "./TextAnnoForm";
// Stubs for the not-yet-written forms; Task 8 fills these in.
function ArrowAnnoForm(_p: { anno: Extract<Annotation, { kind: "arrow" }>;
  dispatch: Dispatch<FigureAction>; commit: FieldCommit }): JSX.Element {
  return <em>Arrow form coming in Task 8</em>;
}
function BoxAnnoForm(_p: { anno: Extract<Annotation, { kind: "box" }>;
  dispatch: Dispatch<FigureAction>; commit: FieldCommit }): JSX.Element {
  return <em>Box form coming in Task 8</em>;
}
function ScalebarAnnoForm(_p: { anno: Extract<Annotation, { kind: "scalebar" }>;
  dispatch: Dispatch<FigureAction>; commit: FieldCommit }): JSX.Element {
  return <em>Scale-bar form coming in Task 8</em>;
}

interface Props {
  anno: Annotation;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

export function AnnotationPropertiesForm({
  anno, dispatch, commit,
}: Props): JSX.Element {
  switch (anno.kind) {
    case "text":     return <TextAnnoForm     anno={anno} dispatch={dispatch} commit={commit} />;
    case "arrow":    return <ArrowAnnoForm    anno={anno} dispatch={dispatch} commit={commit} />;
    case "box":      return <BoxAnnoForm      anno={anno} dispatch={dispatch} commit={commit} />;
    case "scalebar": return <ScalebarAnnoForm anno={anno} dispatch={dispatch} commit={commit} />;
  }
}
```

- [ ] **Step 6: Commit**

```bash
pnpm typecheck
git add src/renderer/components/Properties/TextAnnoForm.tsx src/renderer/components/Properties/AnnotationPropertiesForm.tsx test/unit/text-anno-form.test.ts
git commit -m "feat(m8): TextAnnoForm + AnnotationPropertiesForm router"
```

---

### Task 8: Arrow / Box / Scalebar annotation forms

**Files:**
- Create: `src/renderer/components/Properties/ArrowAnnoForm.tsx`
- Create: `src/renderer/components/Properties/BoxAnnoForm.tsx`
- Create: `src/renderer/components/Properties/ScalebarAnnoForm.tsx`
- Modify: `src/renderer/components/Properties/AnnotationPropertiesForm.tsx` (replace stubs with real imports)
- Create: `test/unit/scalebar-anno-form.test.ts`

ScaleBar is the only one that exposes calibration-aware UX (length unit), so it gets its own test. Arrow and Box are mechanically similar to Text and don't add risk.

- [ ] **Step 1: Write the failing scalebar test**

`test/unit/scalebar-anno-form.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScalebarAnnoForm } from "../../src/renderer/components/Properties/ScalebarAnnoForm";
import type { ScaleBarAnnotation } from "../../src/renderer/model/annotations";

const seed: ScaleBarAnnotation = {
  id: "s1", kind: "scalebar", panelId: "p1", z: 5,
  lengthValue: 50, lengthUnit: "um",
};

describe("ScalebarAnnoForm", () => {
  it("dispatches lengthValue + lengthUnit changes", async () => {
    const dispatch = vi.fn();
    const commit = { markDirty: vi.fn(), flush: vi.fn() };
    render(<ScalebarAnnoForm anno={seed} dispatch={dispatch} commit={commit} />);
    await userEvent.selectOptions(screen.getByLabelText("Unit"), "mm");
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ANNOTATION", id: "s1",
      patch: { lengthUnit: "mm" },
    });
    expect(commit.flush).toHaveBeenCalled();
  });

  it("can override the corner per-instance", async () => {
    const dispatch = vi.fn();
    const commit = { markDirty: vi.fn(), flush: vi.fn() };
    render(<ScalebarAnnoForm anno={seed} dispatch={dispatch} commit={commit} />);
    await userEvent.click(screen.getByLabelText("Top-left"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ANNOTATION", id: "s1",
      patch: { cornerOverride: "tl" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test scalebar-anno-form`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement ArrowAnnoForm**

`src/renderer/components/Properties/ArrowAnnoForm.tsx`:

```tsx
import type { Dispatch } from "react";
import type { ArrowAnnotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import { updateAnnotation, removeAnnotation } from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { ColorField } from "./inputs/ColorField";
import { NumberField } from "./inputs/NumberField";
import { SelectField } from "./inputs/SelectField";

interface Props {
  anno: ArrowAnnotation;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

export function ArrowAnnoForm({ anno, dispatch, commit }: Props): JSX.Element {
  function patch(p: Partial<ArrowAnnotation>, immediate = false): void {
    dispatch(updateAnnotation(anno.id, p));
    if (immediate) commit.flush(); else commit.markDirty();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <ColorField label="Color" value={anno.color}
        onChange={(color) => patch({ color })} onBlur={commit.flush} />
      <NumberField label="Thickness (px)" value={anno.thicknessPx} min={1} max={32}
        onChange={(thicknessPx) => patch({ thicknessPx })}
        onBlur={commit.flush} />
      <SelectField label="Arrowhead"
        value={anno.head}
        options={[
          { value: "none",   label: "None" },
          { value: "open",   label: "Open" },
          { value: "filled", label: "Filled" },
        ] as const}
        onChange={(head) => patch({ head }, true)} />
      <button type="button"
        onClick={() => { dispatch(removeAnnotation(anno.id)); commit.flush(); }}
        style={{ padding: "4px 8px", border: "1px solid #BBB",
                 background: "#FFF", cursor: "pointer",
                 fontSize: 12, color: "#A00" }}>
        Delete annotation
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Implement BoxAnnoForm**

`src/renderer/components/Properties/BoxAnnoForm.tsx`:

```tsx
import type { Dispatch } from "react";
import type { BoxAnnotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import { updateAnnotation, removeAnnotation } from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { ColorField } from "./inputs/ColorField";
import { NumberField } from "./inputs/NumberField";

interface Props {
  anno: BoxAnnotation;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

export function BoxAnnoForm({ anno, dispatch, commit }: Props): JSX.Element {
  function patch(p: Partial<BoxAnnotation>, immediate = false): void {
    dispatch(updateAnnotation(anno.id, p));
    if (immediate) commit.flush(); else commit.markDirty();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <ColorField label="Stroke" value={anno.stroke}
        onChange={(stroke) => patch({ stroke })} onBlur={commit.flush} />
      <NumberField label="Stroke width (px)"
        value={anno.strokeWidthPx} min={0} max={32}
        onChange={(strokeWidthPx) => patch({ strokeWidthPx })}
        onBlur={commit.flush} />
      <ColorField label="Fill" value={anno.fill ?? "#00000000"}
        onChange={(fill) => patch({ fill })}
        onBlur={commit.flush}
        allowAlpha />
      <button type="button"
        onClick={() => { dispatch(removeAnnotation(anno.id)); commit.flush(); }}
        style={{ padding: "4px 8px", border: "1px solid #BBB",
                 background: "#FFF", cursor: "pointer",
                 fontSize: 12, color: "#A00" }}>
        Delete annotation
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Implement ScalebarAnnoForm**

`src/renderer/components/Properties/ScalebarAnnoForm.tsx`:

```tsx
import type { Dispatch } from "react";
import type { ScaleBarAnnotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import { updateAnnotation, removeAnnotation } from "../../model/figure-actions";
import type { Corner } from "../../model/global-style";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { NumberField } from "./inputs/NumberField";
import { SelectField } from "./inputs/SelectField";
import { CornerField } from "./inputs/CornerField";

interface Props {
  anno: ScaleBarAnnotation;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

export function ScalebarAnnoForm({ anno, dispatch, commit }: Props): JSX.Element {
  function patch(p: Partial<ScaleBarAnnotation>, immediate = false): void {
    dispatch(updateAnnotation(anno.id, p));
    if (immediate) commit.flush(); else commit.markDirty();
  }
  const corner: Corner = anno.cornerOverride ?? "br";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <NumberField label="Length"
        value={anno.lengthValue} min={0.001} step={1}
        onChange={(lengthValue) => patch({ lengthValue })}
        onBlur={commit.flush} />
      <SelectField label="Unit"
        value={anno.lengthUnit}
        options={[
          { value: "um", label: "µm" },
          { value: "mm", label: "mm" },
          { value: "px", label: "px" },
        ] as const}
        onChange={(lengthUnit) => patch({ lengthUnit }, true)} />
      <CornerField label="Corner override"
        value={corner}
        onChange={(c) => patch({ cornerOverride: c }, true)} />
      <button type="button"
        onClick={() => { dispatch(removeAnnotation(anno.id)); commit.flush(); }}
        style={{ padding: "4px 8px", border: "1px solid #BBB",
                 background: "#FFF", cursor: "pointer",
                 fontSize: 12, color: "#A00" }}>
        Delete annotation
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Replace stubs in AnnotationPropertiesForm**

Edit `src/renderer/components/Properties/AnnotationPropertiesForm.tsx`. Remove the three local stub functions and add real imports:

```tsx
import { ArrowAnnoForm } from "./ArrowAnnoForm";
import { BoxAnnoForm } from "./BoxAnnoForm";
import { ScalebarAnnoForm } from "./ScalebarAnnoForm";
```

- [ ] **Step 7: Run scalebar test, verify pass**

Run: `pnpm test scalebar-anno-form`
Expected: PASS.

- [ ] **Step 8: Run full suite for regressions**

Run: `pnpm test`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
pnpm typecheck
git add src/renderer/components/Properties/ArrowAnnoForm.tsx src/renderer/components/Properties/BoxAnnoForm.tsx src/renderer/components/Properties/ScalebarAnnoForm.tsx src/renderer/components/Properties/AnnotationPropertiesForm.tsx test/unit/scalebar-anno-form.test.ts
git commit -m "feat(m8): Arrow/Box/Scalebar annotation property forms"
```

---

### Task 9: PanelPropertiesForm

**Files:**
- Create: `src/renderer/components/Properties/PanelPropertiesForm.tsx`
- Create: `test/unit/panel-properties-form.test.ts`

Shown when an image-bearing panel is focused. Exposes: fit, rotation (read-only with rotate-90 button), flips, pan/zoom readout (read-only — drag is the canonical edit), reset, calibration button, and the per-panel **letter override** text field.

- [ ] **Step 1: Write the failing test**

`test/unit/panel-properties-form.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PanelPropertiesForm } from "../../src/renderer/components/Properties/PanelPropertiesForm";
import type { Panel } from "../../src/renderer/model/panels";

const panel: Panel = {
  id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1,
  imageId: "img1",
  transform: { fit: "contain", panX: 0, panY: 0,
               zoom: 1, rotation: 0, flipH: false, flipV: false },
};

describe("PanelPropertiesForm", () => {
  it("dispatches setLetterOverride when the override field changes", async () => {
    const dispatch = vi.fn();
    render(
      <PanelPropertiesForm
        panel={panel} letterOverride={undefined}
        dispatch={dispatch}
        onCalibrate={() => {}}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
      />,
    );
    await userEvent.type(screen.getByLabelText("Subpanel letter"), "A");
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_LETTER_OVERRIDE", panelId: "p1", letter: "A",
    });
  });

  it("calls onCalibrate when the Calibrate button is clicked", async () => {
    const onCalibrate = vi.fn();
    render(
      <PanelPropertiesForm
        panel={panel} letterOverride={undefined}
        dispatch={vi.fn()} onCalibrate={onCalibrate}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /calibrate/i }));
    expect(onCalibrate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test panel-properties-form`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

`src/renderer/components/Properties/PanelPropertiesForm.tsx`:

```tsx
import type { Dispatch } from "react";
import type { Panel } from "../../model/panels";
import type { FigureAction } from "../../model/figure-actions";
import {
  setPanelFit, rotatePanel90, flipPanelH, flipPanelV,
  resetPanelTransform, setLetterOverride,
} from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { SelectField } from "./inputs/SelectField";
import { TextField } from "./inputs/TextField";

interface Props {
  panel: Panel;
  letterOverride: string | undefined;
  dispatch: Dispatch<FigureAction>;
  onCalibrate: () => void;
  commit: FieldCommit;
}

const btn: React.CSSProperties = {
  padding: "4px 8px", border: "1px solid #BBB", background: "#FFF",
  cursor: "pointer", fontSize: 12,
};

export function PanelPropertiesForm({
  panel, letterOverride, dispatch, onCalibrate, commit,
}: Props): JSX.Element {
  const t = panel.transform;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <SelectField label="Fit"
        value={t.fit}
        options={[
          { value: "contain", label: "Contain" },
          { value: "cover",   label: "Cover" },
          { value: "stretch", label: "Stretch" },
        ] as const}
        onChange={(fit) => { dispatch(setPanelFit(panel.id, fit)); commit.flush(); }} />

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button type="button" style={btn}
          onClick={() => { dispatch(rotatePanel90(panel.id)); commit.flush(); }}>
          Rotate 90°
        </button>
        <button type="button" style={btn} aria-pressed={t.flipH}
          onClick={() => { dispatch(flipPanelH(panel.id)); commit.flush(); }}>
          Flip H
        </button>
        <button type="button" style={btn} aria-pressed={t.flipV}
          onClick={() => { dispatch(flipPanelV(panel.id)); commit.flush(); }}>
          Flip V
        </button>
        <button type="button" style={btn}
          onClick={() => { dispatch(resetPanelTransform(panel.id)); commit.flush(); }}>
          Reset transform
        </button>
      </div>

      <div style={{ fontSize: 11, color: "#777", lineHeight: 1.5 }}>
        Pan: ({t.panX.toFixed(0)}, {t.panY.toFixed(0)}) px<br />
        Zoom: {t.zoom.toFixed(2)}× &middot; Rotation: {t.rotation}°
      </div>

      <TextField label="Subpanel letter"
        value={letterOverride ?? ""}
        placeholder="(auto)"
        onChange={(s) => {
          dispatch(setLetterOverride(panel.id, s === "" ? null : s));
          commit.markDirty();
        }}
        onBlur={commit.flush} />

      <button type="button" style={btn} onClick={onCalibrate}>
        Calibrate scale…
      </button>
    </div>
  );
}
```

Note: `setLetterOverride(panelId: string, override: string | null)` already exists with the right signature — `null` clears the override (verified at `src/renderer/model/figure-actions.ts:470` where the reducer deletes the entry when `override === null`). No changes to `figure-actions.ts` are required for this task.

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm test panel-properties-form`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck
git add src/renderer/components/Properties/PanelPropertiesForm.tsx src/renderer/model/figure-actions.ts test/unit/panel-properties-form.test.ts test/unit/figure-actions.test.ts
git commit -m "feat(m8): PanelPropertiesForm with letter override + calibrate hook"
```

---

### Task 10: CanvasAndGlobalStyleForm

**Files:**
- Create: `src/renderer/components/Properties/CanvasAndGlobalStyleForm.tsx`
- Create: `test/unit/canvas-and-global-style-form.test.ts`

Shown when nothing is selected. Drives the figure-wide global style (letters + scalebar) and the figure background. Canvas mode/dpi UI is deferred — `FigureCanvas` is currently a single hard-coded constant in `App.tsx` (Task 14 lifts that into state). For now this form drives `globalStyle` only.

- [ ] **Step 1: Write the failing test**

`test/unit/canvas-and-global-style-form.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CanvasAndGlobalStyleForm } from "../../src/renderer/components/Properties/CanvasAndGlobalStyleForm";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";

describe("CanvasAndGlobalStyleForm", () => {
  it("dispatches SET_GLOBAL_STYLE when the letters font size changes", async () => {
    const dispatch = vi.fn();
    render(
      <CanvasAndGlobalStyleForm
        globalStyle={DEFAULT_GLOBAL_STYLE}
        dispatch={dispatch}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
      />,
    );
    const input = screen.getByLabelText("Letters size (pt)") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "16");
    const last = dispatch.mock.calls.at(-1)?.[0];
    expect(last.type).toBe("SET_GLOBAL_STYLE");
    expect(last.style.letters.sizePt).toBe(16);
  });

  it("dispatches when the scalebar corner changes", async () => {
    const dispatch = vi.fn();
    const commit = { markDirty: vi.fn(), flush: vi.fn() };
    render(
      <CanvasAndGlobalStyleForm
        globalStyle={DEFAULT_GLOBAL_STYLE} dispatch={dispatch} commit={commit}
      />,
    );
    const tlButtons = screen.getAllByLabelText("Top-left");
    // tlButtons[0] is letters' corner; tlButtons[1] is scalebar's.
    await userEvent.click(tlButtons[1]);
    const last = dispatch.mock.calls.at(-1)?.[0];
    expect(last.style.scalebar.corner).toBe("tl");
    expect(commit.flush).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test canvas-and-global-style-form`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

`src/renderer/components/Properties/CanvasAndGlobalStyleForm.tsx`:

```tsx
import type { Dispatch } from "react";
import type { FigureAction } from "../../model/figure-actions";
import { setGlobalStyle } from "../../model/figure-actions";
import type { GlobalAnnoStyle, LetterStyle, ScaleBarStyle } from "../../model/global-style";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { NumberField } from "./inputs/NumberField";
import { ColorField } from "./inputs/ColorField";
import { CornerField } from "./inputs/CornerField";

interface Props {
  globalStyle: GlobalAnnoStyle;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

export function CanvasAndGlobalStyleForm({
  globalStyle, dispatch, commit,
}: Props): JSX.Element {
  function patchLetters(p: Partial<LetterStyle>, immediate = false): void {
    const next: GlobalAnnoStyle = {
      ...globalStyle,
      letters: { ...globalStyle.letters, ...p },
    };
    dispatch(setGlobalStyle(next));
    if (immediate) commit.flush(); else commit.markDirty();
  }
  function patchScalebar(p: Partial<ScaleBarStyle>, immediate = false): void {
    const next: GlobalAnnoStyle = {
      ...globalStyle,
      scalebar: { ...globalStyle.scalebar, ...p },
    };
    dispatch(setGlobalStyle(next));
    if (immediate) commit.flush(); else commit.markDirty();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 12, color: "#444" }}>Subpanel letters</h3>
      <NumberField label="Letters size (pt)" value={globalStyle.letters.sizePt}
        min={4} max={144}
        onChange={(sizePt) => patchLetters({ sizePt })}
        onBlur={commit.flush} />
      <ColorField label="Letters color" value={globalStyle.letters.color}
        onChange={(color) => patchLetters({ color })}
        onBlur={commit.flush} />
      <CornerField label="Letters corner"
        value={globalStyle.letters.corner}
        onChange={(c) => patchLetters({ corner: c }, true)} />

      <h3 style={{ margin: 0, fontSize: 12, color: "#444", marginTop: 8 }}>Scale bar</h3>
      <NumberField label="Scale-bar thickness (px)"
        value={globalStyle.scalebar.thicknessPx} min={1} max={32}
        onChange={(thicknessPx) => patchScalebar({ thicknessPx })}
        onBlur={commit.flush} />
      <ColorField label="Scale-bar color" value={globalStyle.scalebar.barColor}
        onChange={(barColor) => patchScalebar({ barColor, color: barColor })}
        onBlur={commit.flush} />
      <NumberField label="Scale-bar label size (pt)"
        value={globalStyle.scalebar.sizePt} min={4} max={48}
        onChange={(sizePt) => patchScalebar({ sizePt })}
        onBlur={commit.flush} />
      <CornerField label="Scale-bar corner"
        value={globalStyle.scalebar.corner}
        onChange={(c) => patchScalebar({ corner: c }, true)} />
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
        <input type="checkbox"
          checked={globalStyle.scalebar.showLabel}
          onChange={(e) =>
            patchScalebar({ showLabel: e.currentTarget.checked }, true)} />
        Show scale-bar label
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm test canvas-and-global-style-form`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
pnpm typecheck
git add src/renderer/components/Properties/CanvasAndGlobalStyleForm.tsx test/unit/canvas-and-global-style-form.test.ts
git commit -m "feat(m8): CanvasAndGlobalStyleForm for figure-wide style"
```

---

### Task 11: PropertiesPanel root + mount in App.tsx

**Files:**
- Create: `src/renderer/components/Properties/PropertiesPanel.tsx`
- Create: `test/unit/properties-panel-routing.test.ts`
- Modify: `src/renderer/App.tsx`

Routes selection → form. Right-hand sidebar (~300 px). Lives next to the centered canvas section.

- [ ] **Step 1: Write the failing test**

`test/unit/properties-panel-routing.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PropertiesPanel } from "../../src/renderer/components/Properties/PropertiesPanel";
import { initialFigureState } from "../../src/renderer/model/figure-state";

describe("PropertiesPanel routes by selection", () => {
  it("renders the global form when nothing is selected", () => {
    render(
      <PropertiesPanel
        state={initialFigureState()}
        focusedPanel={undefined}
        selectedAnno={undefined}
        dispatch={vi.fn()}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
        onCalibrate={() => {}}
      />,
    );
    expect(screen.getByText(/Subpanel letters/)).toBeTruthy();
  });

  it("renders TextAnnoForm when a text annotation is selected", () => {
    const state = initialFigureState();
    render(
      <PropertiesPanel
        state={state}
        focusedPanel={undefined}
        selectedAnno={{
          id: "t1", kind: "text", x: 0, y: 0, text: "hi",
          font: "Arial", sizePt: 12, bold: false, italic: false,
          color: "#000", z: 1,
        }}
        dispatch={vi.fn()}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
        onCalibrate={() => {}}
      />,
    );
    expect(screen.getByLabelText("Text")).toBeTruthy();
  });

  it("renders PanelPropertiesForm when a focused image panel is given", () => {
    const state = initialFigureState();
    render(
      <PropertiesPanel
        state={state}
        focusedPanel={{
          id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1,
          imageId: "img1",
          transform: { fit: "contain", panX: 0, panY: 0, zoom: 1,
                       rotation: 0, flipH: false, flipV: false },
        }}
        selectedAnno={undefined}
        dispatch={vi.fn()}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
        onCalibrate={() => {}}
      />,
    );
    expect(screen.getByLabelText("Subpanel letter")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test properties-panel-routing`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement PropertiesPanel**

`src/renderer/components/Properties/PropertiesPanel.tsx`:

```tsx
import type { Dispatch } from "react";
import type { FigureState } from "../../model/figure-state";
import type { FigureAction } from "../../model/figure-actions";
import type { Annotation } from "../../model/annotations";
import type { Panel } from "../../model/panels";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { CanvasAndGlobalStyleForm } from "./CanvasAndGlobalStyleForm";
import { AnnotationPropertiesForm } from "./AnnotationPropertiesForm";
import { PanelPropertiesForm } from "./PanelPropertiesForm";

interface Props {
  state: FigureState;
  focusedPanel: Panel | undefined;
  selectedAnno: Annotation | undefined;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
  onCalibrate: () => void;
}

export function PropertiesPanel({
  state, focusedPanel, selectedAnno, dispatch, commit, onCalibrate,
}: Props): JSX.Element {
  let title: string;
  let body: JSX.Element;
  if (selectedAnno !== undefined) {
    title = `${selectedAnno.kind[0].toUpperCase()}${selectedAnno.kind.slice(1)} annotation`;
    body = (
      <AnnotationPropertiesForm
        anno={selectedAnno} dispatch={dispatch} commit={commit}
      />
    );
  } else if (focusedPanel?.imageId !== undefined) {
    title = `Panel ${focusedPanel.id.slice(0, 6)}`;
    body = (
      <PanelPropertiesForm
        panel={focusedPanel}
        letterOverride={state.letterOverrides[focusedPanel.id]}
        dispatch={dispatch}
        commit={commit}
        onCalibrate={onCalibrate}
      />
    );
  } else {
    title = "Figure";
    body = (
      <CanvasAndGlobalStyleForm
        globalStyle={state.globalStyle} dispatch={dispatch} commit={commit}
      />
    );
  }
  return (
    <aside
      data-testid="properties-panel"
      style={{
        width: 300, padding: 12, borderLeft: "1px solid #DDD",
        background: "#FAFAFA", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 12,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 14, color: "#333" }}>{title}</h2>
      {body}
    </aside>
  );
}
```

`state.letterOverrides` is the existing field on `FigureState`; if it is named differently (e.g. a `Map`), replace the access with the correct read. Verify by grepping `letterOverride` in `src/renderer/model/figure-state.ts` before this step and adjust.

- [ ] **Step 4: Run routing test, verify pass**

Run: `pnpm test properties-panel-routing`
Expected: PASS (3/3).

- [ ] **Step 5: Mount in App.tsx**

In `src/renderer/App.tsx`:

a) Import:

```tsx
import { PropertiesPanel } from "./components/Properties/PropertiesPanel";
import { useFieldCommit } from "./hooks/useFieldCommit";
```

b) Inside `App()`, after `const focusedBitmap = …`, derive:

```tsx
const fieldCommit = useFieldCommit(history.commit, 400);
const selectedAnno = useMemo(
  () => state.annotations.find((a) => a.id === selectedAnnotationId),
  [state.annotations, selectedAnnotationId],
);
```

c) In the JSX, change the surrounding `<div style={{ display: "flex", flex: 1, minHeight: 0 }}>` to add the `<PropertiesPanel>` AFTER the `<section>` that contains the canvas. Insert as a sibling:

```tsx
<PropertiesPanel
  state={state}
  focusedPanel={selectedImagePanel}
  selectedAnno={selectedAnno}
  dispatch={dispatch}
  commit={fieldCommit}
  onCalibrate={onCalibrate}
/>
```

(Tray on the left, canvas in the middle, properties on the right.)

- [ ] **Step 6: Type-check + visual smoke test**

```bash
pnpm typecheck
pnpm dev
```

Manually verify in the running app (do not skip this — type errors won't catch broken JSX layout):
1. Empty figure → right sidebar shows "Figure / Subpanel letters / Scale bar".
2. Add an image, click the panel → right sidebar shows "Panel … / Fit / Rotate / Subpanel letter".
3. Add a Text annotation, select it → right sidebar shows the text form.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/Properties/PropertiesPanel.tsx src/renderer/App.tsx test/unit/properties-panel-routing.test.ts
git commit -m "feat(m8): mount PropertiesPanel sidebar in App"
```

---

### Task 12: Toast tray + `useToasts` hook

**Files:**
- Create: `src/renderer/hooks/useToasts.ts`
- Create: `src/renderer/components/Toasts/ToastTray.tsx`
- Create: `test/unit/toasts.test.ts`
- Modify: `src/renderer/App.tsx`

Replaces the inline `<span style={{ color: "#B00" }}>` with a stack of dismissible toasts. Auto-dismiss after 5 s. Three variants.

- [ ] **Step 1: Write the failing test**

`test/unit/toasts.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useToasts } from "../../src/renderer/hooks/useToasts";

describe("useToasts", () => {
  it("auto-dismisses after the TTL", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToasts(5000));
    act(() => result.current.push({ kind: "error", message: "boom" }));
    expect(result.current.toasts.length).toBe(1);
    act(() => { vi.advanceTimersByTime(4999); });
    expect(result.current.toasts.length).toBe(1);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.toasts.length).toBe(0);
    vi.useRealTimers();
  });

  it("dismiss(id) removes a specific toast immediately", () => {
    const { result } = renderHook(() => useToasts(5000));
    let id1 = "";
    act(() => { id1 = result.current.push({ kind: "info", message: "a" }); });
    act(() => { result.current.push({ kind: "info", message: "b" }); });
    expect(result.current.toasts.length).toBe(2);
    act(() => result.current.dismiss(id1));
    expect(result.current.toasts.length).toBe(1);
    expect(result.current.toasts[0].message).toBe("b");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test toasts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `useToasts`**

`src/renderer/hooks/useToasts.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";

export type ToastKind = "error" | "info" | "success";
export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

export interface UseToasts {
  toasts: ReadonlyArray<Toast>;
  push(t: Omit<Toast, "id">): string;
  dismiss(id: string): void;
}

let counter = 0;
function newId(): string {
  counter += 1;
  return `t${counter}-${Date.now()}`;
}

export function useToasts(ttlMs = 5000): UseToasts {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string): void => {
    const t = timersRef.current.get(id);
    if (t !== undefined) clearTimeout(t);
    timersRef.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((t: Omit<Toast, "id">): string => {
    const id = newId();
    const toast: Toast = { id, ...t };
    setToasts((prev) => [...prev, toast]);
    const timer = setTimeout(() => dismiss(id), ttlMs);
    timersRef.current.set(id, timer);
    return id;
  }, [ttlMs, dismiss]);

  useEffect(() => {
    return () => {
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

  return { toasts, push, dismiss };
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm test toasts`
Expected: PASS (2/2).

- [ ] **Step 5: Implement `ToastTray`**

`src/renderer/components/Toasts/ToastTray.tsx`:

```tsx
import type { Toast, ToastKind } from "../../hooks/useToasts";

interface Props {
  toasts: ReadonlyArray<Toast>;
  onDismiss: (id: string) => void;
}

const COLORS: Record<ToastKind, { bg: string; border: string; fg: string }> = {
  error:   { bg: "#FFEFEF", border: "#C00", fg: "#700" },
  info:    { bg: "#EEF4FF", border: "#06C", fg: "#024" },
  success: { bg: "#EFFFF4", border: "#063", fg: "#042" },
};

export function ToastTray({ toasts, onDismiss }: Props): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 16, right: 16,
        display: "flex", flexDirection: "column", gap: 8,
        zIndex: 1000, maxWidth: 360,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => {
        const c = COLORS[t.kind];
        return (
          <div key={t.id}
            style={{
              background: c.bg, border: `1px solid ${c.border}`,
              color: c.fg, padding: "8px 10px", borderRadius: 4,
              fontSize: 12, fontFamily: "system-ui, sans-serif",
              display: "flex", gap: 8, alignItems: "flex-start",
              pointerEvents: "auto",
              boxShadow: "0 2px 6px rgba(0,0,0,.08)",
            }}>
            <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>{t.message}</span>
            <button type="button" aria-label="Dismiss"
              onClick={() => onDismiss(t.id)}
              style={{
                background: "transparent", border: "none",
                color: c.fg, cursor: "pointer", fontSize: 14, padding: 0,
              }}>×</button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Wire into App.tsx**

In `src/renderer/App.tsx`:

a) Import:

```tsx
import { useToasts } from "./hooks/useToasts";
import { ToastTray } from "./components/Toasts/ToastTray";
```

b) Replace `const [error, setError] = useState<string | null>(null);` with:

```tsx
const toasts = useToasts(5000);
```

c) Replace every `setError(msg)` callsite with `toasts.push({ kind: "error", message: msg })`. Replace `setError(null)` callsites by deleting them — toasts are additive, not a singleton.

d) Replace the inline `{error !== null && (<span …>{error}</span>)}` block with a render at the bottom of `<main>`:

```tsx
<ToastTray toasts={toasts.toasts} onDismiss={toasts.dismiss} />
```

e) Add success toasts:
- After successful save: `toasts.push({ kind: "success", message: "Project saved" });`
- After successful open: `toasts.push({ kind: "success", message: "Project loaded" });`

- [ ] **Step 7: Type-check + visual smoke test**

```bash
pnpm typecheck
pnpm dev
```

Manually verify: dragging in a corrupt file produces a red toast; clicking × dismisses; saving shows a green toast that fades after 5 s.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/hooks/useToasts.ts src/renderer/components/Toasts/ToastTray.tsx src/renderer/App.tsx test/unit/toasts.test.ts
git commit -m "feat(m8): toast tray for errors and success messages"
```

---

### Task 13: Native menu (main process side)

**Files:**
- Create: `src/main/menu.ts`
- Create: `test/unit/menu-build.test.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/main/index.ts`

The menu builder is a pure function returning an `Electron.MenuItemConstructorOptions[]`. The only Electron-touched line is the final `Menu.buildFromTemplate(...)` call inside `installMenu()` — that we cover with a manual smoke test, not a unit test.

- [ ] **Step 1: Write the failing test**

`test/unit/menu-build.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { buildMenuTemplate } from "../../src/main/menu";

describe("buildMenuTemplate", () => {
  it("includes File submenu with New/Open/Save/Save As/Export and accelerators", () => {
    const send = vi.fn();
    const tpl = buildMenuTemplate({
      isMac: false,
      send,
    });
    const file = tpl.find((m) => (m.label ?? "").toLowerCase() === "file");
    expect(file).toBeDefined();
    const labels = (file?.submenu as { label?: string }[])
      .map((x) => x.label ?? "");
    expect(labels).toEqual(
      expect.arrayContaining(["New", "Open…", "Save", "Save As…"]),
    );
    // Find New and click it to verify it sends the menu:new event.
    const newItem = (file?.submenu as { label?: string;
      click?: () => void; accelerator?: string }[]).find((x) => x.label === "New");
    expect(newItem?.accelerator).toBe("CommandOrControl+N");
    newItem?.click?.();
    expect(send).toHaveBeenCalledWith("menu:new");
  });

  it("uses Cmd shortcuts on macOS and adds the app menu", () => {
    const tpl = buildMenuTemplate({ isMac: true, send: vi.fn() });
    expect((tpl[0]?.label ?? "").toLowerCase()).toBe("mosaic builder");
    const file = tpl.find((m) => (m.label ?? "").toLowerCase() === "file");
    const open = (file?.submenu as { label?: string;
      accelerator?: string }[]).find((x) => x.label === "Open…");
    expect(open?.accelerator).toBe("CommandOrControl+O");
  });

  it("Edit menu has Undo/Redo with Cmd-Z / Cmd-Shift-Z that send IPC events", () => {
    const send = vi.fn();
    const tpl = buildMenuTemplate({ isMac: false, send });
    const edit = tpl.find((m) => (m.label ?? "").toLowerCase() === "edit");
    const items = edit?.submenu as { label?: string;
      accelerator?: string; click?: () => void }[];
    const undo = items.find((x) => x.label === "Undo");
    const redo = items.find((x) => x.label === "Redo");
    expect(undo?.accelerator).toBe("CommandOrControl+Z");
    expect(redo?.accelerator).toBe("CommandOrControl+Shift+Z");
    undo?.click?.();
    redo?.click?.();
    expect(send).toHaveBeenCalledWith("menu:undo");
    expect(send).toHaveBeenCalledWith("menu:redo");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test menu-build`
Expected: FAIL — module missing.

- [ ] **Step 3: Add channel constants to preload api**

In `src/preload/api.ts`, after the existing `API_CHANNELS`, add:

```ts
export const MENU_EVENTS = {
  new: "menu:new",
  open: "menu:open",
  save: "menu:save",
  saveAs: "menu:save-as",
  exportPng: "menu:export-png",
  exportJpeg: "menu:export-jpeg",
  exportTiff: "menu:export-tiff",
  exportPdf: "menu:export-pdf",
  undo: "menu:undo",
  redo: "menu:redo",
} as const;

export type MenuEvent = (typeof MENU_EVENTS)[keyof typeof MENU_EVENTS];
```

Add to the `MosaicApi` interface:

```ts
onMenuEvent(handler: (event: MenuEvent) => void): () => void;
```

(The hook returns an unsubscribe function.)

- [ ] **Step 4: Bind in preload**

In `src/preload/preload.ts`, replace the `api: MosaicApi = { ... }` literal so that it also includes:

```ts
onMenuEvent(handler) {
  const listener = (_e: Electron.IpcRendererEvent, ev: MenuEvent) => handler(ev);
  ipcRenderer.on("menu:event", listener);
  return () => { ipcRenderer.off("menu:event", listener); };
},
```

Add `import { MENU_EVENTS, type MenuEvent } from "./api";` at the top.

- [ ] **Step 5: Implement `buildMenuTemplate`**

`src/main/menu.ts`:

```ts
import { Menu, BrowserWindow, type MenuItemConstructorOptions } from "electron";
import { MENU_EVENTS, type MenuEvent } from "../preload/api";

export interface BuildMenuArgs {
  isMac: boolean;
  /** Sends a menu event to the renderer. Injected for testability. */
  send: (event: MenuEvent) => void;
}

export function buildMenuTemplate(
  { isMac, send }: BuildMenuArgs,
): MenuItemConstructorOptions[] {
  const file: MenuItemConstructorOptions = {
    label: "File",
    submenu: [
      { label: "New", accelerator: "CommandOrControl+N",
        click: () => send(MENU_EVENTS.new) },
      { label: "Open…", accelerator: "CommandOrControl+O",
        click: () => send(MENU_EVENTS.open) },
      { type: "separator" },
      { label: "Save", accelerator: "CommandOrControl+S",
        click: () => send(MENU_EVENTS.save) },
      { label: "Save As…", accelerator: "CommandOrControl+Shift+S",
        click: () => send(MENU_EVENTS.saveAs) },
      { type: "separator" },
      { label: "Export as PNG…", click: () => send(MENU_EVENTS.exportPng) },
      { label: "Export as JPEG…", click: () => send(MENU_EVENTS.exportJpeg) },
      { label: "Export as TIFF…", click: () => send(MENU_EVENTS.exportTiff) },
      { label: "Export as PDF…", click: () => send(MENU_EVENTS.exportPdf) },
      { type: "separator" },
      isMac ? { role: "close" as const } : { role: "quit" as const },
    ],
  };
  const edit: MenuItemConstructorOptions = {
    label: "Edit",
    submenu: [
      { label: "Undo", accelerator: "CommandOrControl+Z",
        click: () => send(MENU_EVENTS.undo) },
      { label: "Redo", accelerator: "CommandOrControl+Shift+Z",
        click: () => send(MENU_EVENTS.redo) },
      { type: "separator" },
      { role: "cut" }, { role: "copy" }, { role: "paste" },
      { role: "selectAll" },
    ],
  };
  const view: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      { role: "reload" }, { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  };
  const help: MenuItemConstructorOptions = {
    label: "Help",
    submenu: [
      { label: "About Mosaic Builder", role: "about" },
    ],
  };
  if (isMac) {
    const appMenu: MenuItemConstructorOptions = {
      label: "Mosaic Builder",
      submenu: [
        { role: "about" }, { type: "separator" },
        { role: "services" }, { type: "separator" },
        { role: "hide" }, { role: "hideOthers" }, { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    };
    return [appMenu, file, edit, view, help];
  }
  return [file, edit, view, help];
}

export function installMenu(window: BrowserWindow): void {
  const isMac = process.platform === "darwin";
  const send = (event: MenuEvent): void => {
    window.webContents.send("menu:event", event);
  };
  const tpl = buildMenuTemplate({ isMac, send });
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}
```

- [ ] **Step 6: Install in main**

In `src/main/index.ts`, near the top add:

```ts
import { installMenu } from "./menu";
```

Inside `createWindow()`, after `mainWindow = new BrowserWindow(...)` and BEFORE the `mainWindow.once("ready-to-show", ...)` block, add:

```ts
installMenu(mainWindow);
```

- [ ] **Step 7: Run menu test, verify pass**

Run: `pnpm test menu-build`
Expected: PASS (3/3).

- [ ] **Step 8: Manual smoke test**

```bash
pnpm dev
```

Open the app menu bar (mac: top of screen; win/linux: window). Verify:
1. File → has New, Open…, Save, Save As…, Export submenu, all four export formats.
2. Cmd-N (mac) / Ctrl-N (win/linux) — main process console should show no error; renderer needs Task 14 to actually react to the event.

- [ ] **Step 9: Commit**

```bash
pnpm typecheck
git add src/main/menu.ts src/main/index.ts src/preload/api.ts src/preload/preload.ts test/unit/menu-build.test.ts
git commit -m "feat(m8): native menu with File/Edit/View accelerators"
```

---

### Task 14: Renderer wires menu events

**Files:**
- Create: `src/renderer/hooks/useMenuEvents.ts`
- Modify: `src/renderer/App.tsx`

Renderer subscribes to `onMenuEvent` and dispatches to existing handlers. Pure plumbing.

- [ ] **Step 1: Write the failing test**

`test/unit/use-menu-events.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMenuEvents } from "../../src/renderer/hooks/useMenuEvents";

describe("useMenuEvents", () => {
  it("subscribes via window.api.onMenuEvent and forwards to handlers", () => {
    let listener: ((ev: string) => void) | undefined;
    const unsubscribe = vi.fn();
    (globalThis as { api?: unknown }).api = {
      onMenuEvent: (cb: (ev: string) => void) => {
        listener = cb;
        return unsubscribe;
      },
    };
    const handlers = {
      onNew: vi.fn(), onOpen: vi.fn(), onSave: vi.fn(), onSaveAs: vi.fn(),
      onExportPng: vi.fn(), onExportJpeg: vi.fn(), onExportTiff: vi.fn(),
      onExportPdf: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(),
    };
    const { unmount } = renderHook(() => useMenuEvents(handlers));
    listener?.("menu:save");
    listener?.("menu:undo");
    expect(handlers.onSave).toHaveBeenCalledTimes(1);
    expect(handlers.onUndo).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test use-menu-events`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

`src/renderer/hooks/useMenuEvents.ts`:

```ts
import { useEffect, useRef } from "react";

export interface MenuEventHandlers {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExportPng: () => void;
  onExportJpeg: () => void;
  onExportTiff: () => void;
  onExportPdf: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function useMenuEvents(handlers: MenuEventHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const unsubscribe = window.api.onMenuEvent((ev) => {
      const h = ref.current;
      switch (ev) {
        case "menu:new":         h.onNew();        break;
        case "menu:open":        h.onOpen();       break;
        case "menu:save":        h.onSave();       break;
        case "menu:save-as":     h.onSaveAs();     break;
        case "menu:export-png":  h.onExportPng();  break;
        case "menu:export-jpeg": h.onExportJpeg(); break;
        case "menu:export-tiff": h.onExportTiff(); break;
        case "menu:export-pdf":  h.onExportPdf();  break;
        case "menu:undo":        h.onUndo();       break;
        case "menu:redo":        h.onRedo();       break;
      }
    });
    return unsubscribe;
  }, []);
}
```

- [ ] **Step 4: Wire in App.tsx**

a) Import:

```tsx
import { useMenuEvents } from "./hooks/useMenuEvents";
import { resetFigureAction } from "./model/figure-actions";
```

b) Add `onNew`, `onSaveAs` callbacks. `onSaveAs` is `onSaveProject` with `setProjectPath(null)` first so the dialog suggests a fresh path:

```tsx
const onNew = useCallback(() => {
  dispatch(resetFigureAction());
  setBitmaps(new Map());
  setProjectPath(null);
  setFocusedPanelId(null);
  setSelectedAnnotationId(null);
  toasts.push({ kind: "info", message: "New figure" });
}, [toasts]);

const onSaveAs = useCallback(async () => {
  setProjectPath(null);
  await onSaveProject();
}, [onSaveProject]);
```

c) Use existing `ExportMenu` action functions if they exist as exported callbacks; otherwise extract the four format-specific handlers from `ExportMenu.tsx` so they can be invoked from menu events. Concretely, expose them as top-level callbacks in `App.tsx`:

```tsx
// In ExportMenu.tsx, add an imperative API. Or pull the export logic out of
// ExportMenu and make it a hook used by both ExportMenu and App.
```

If extracting the export logic is bigger than 30 lines of code movement, defer it and have menu events for export simply route to `toasts.push({ kind: "info", message: "Use the Export menu in the toolbar" })` — note this in the manual checklist as a known v0.1 limitation.

d) Wire `useMenuEvents`:

```tsx
useMenuEvents({
  onNew,
  onOpen: onOpenProject,
  onSave: onSaveProject,
  onSaveAs,
  onExportPng:  () => toasts.push({ kind: "info", message: "Use Export → PNG in the toolbar" }),
  onExportJpeg: () => toasts.push({ kind: "info", message: "Use Export → JPEG in the toolbar" }),
  onExportTiff: () => toasts.push({ kind: "info", message: "Use Export → TIFF in the toolbar" }),
  onExportPdf:  () => toasts.push({ kind: "info", message: "Use Export → PDF in the toolbar" }),
  onUndo: history.undo,
  onRedo: history.redo,
});
```

(If you choose to extract the export logic in step (c), replace the four `() => toasts.push(...)` calls with the real export callbacks.)

- [ ] **Step 5: Run test, verify pass**

Run: `pnpm test use-menu-events`
Expected: PASS.

- [ ] **Step 6: Manual smoke test**

```bash
pnpm dev
```

Verify:
1. Cmd/Ctrl-N clears the figure (toast: "New figure"). 
2. Cmd/Ctrl-S opens save dialog. 
3. Cmd/Ctrl-Shift-S forces a fresh path each time. 
4. Cmd/Ctrl-Z / Cmd/Ctrl-Shift-Z undo and redo (was working before via shortcut hook; still works because the menu accelerator and the hook do the same thing — the menu accelerator wins on platforms that support it but functionality is unchanged).

- [ ] **Step 7: Commit**

```bash
pnpm typecheck
git add src/renderer/hooks/useMenuEvents.ts src/renderer/App.tsx test/unit/use-menu-events.test.ts
git commit -m "feat(m8): renderer dispatches menu events to existing actions"
```

---

### Task 15: App icon assets + generation script

**Files:**
- Create: `resources/icon.png` (1024×1024 RGBA — placeholder OK)
- Create: `scripts/generate-icons.mjs`
- Create: `resources/icons/icon.icns` (output)
- Create: `resources/icons/icon.ico` (output)
- Create: `resources/icons/icon-512.png` (output)
- Modify: `package.json` (add `gen:icons` script + `png-to-ico` dev dep)

For v0.1.0 the icon is a placeholder; what matters for M8 is the build pipeline and committed artifacts. A solid color gradient with "M" glyph is fine.

- [ ] **Step 1: Create the source icon**

Use any tool to produce a 1024×1024 PNG with alpha. If you don't have one handy, generate one in JS:

`scripts/make-placeholder-icon.mjs`:

```js
// One-off — creates resources/icon.png. Delete after first run.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const W = 1024, H = 1024;
// Minimal PNG via the Canvas API isn't available in Node; use sharp temporarily.
// Easier: ship a tiny pre-made PNG. In practice, drop a 1024×1024 PNG by hand.
console.error("Drop a 1024×1024 RGBA PNG at resources/icon.png and re-run.");
process.exit(1);
```

Practical guidance: produce `resources/icon.png` by hand (Preview / GIMP / Figma) with a 1024×1024 canvas, dark blue background (`#0B2A4A`), white serif "M" centered. Commit it.

- [ ] **Step 2: Install `png-to-ico` + `iconutil` setup**

```bash
pnpm add -D png-to-ico@2.1.8
```

For `.icns`, the build script uses macOS's bundled `iconutil` (no install needed on mac). On Windows/Linux, the script gracefully skips `.icns` generation and warns — `electron-builder` only needs `.icns` when packaging mac, and that step runs on a mac CI runner.

- [ ] **Step 3: Implement `generate-icons.mjs`**

`scripts/generate-icons.mjs`:

```js
#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "resources/icon.png");
const OUT = resolve(ROOT, "resources/icons");

if (!existsSync(SRC)) {
  console.error(`Missing source icon: ${SRC}`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

// 1. 512×512 PNG (used as Linux .desktop icon and electron-builder fallback).
//    sips ships with macOS; on Linux/Win this step requires ImageMagick `magick`.
function resizePng(srcPng, dstPng, size) {
  if (process.platform === "darwin") {
    execFileSync("sips", ["-z", String(size), String(size), srcPng, "--out", dstPng],
      { stdio: "inherit" });
  } else {
    try {
      execFileSync("magick", [srcPng, "-resize", `${size}x${size}`, dstPng],
        { stdio: "inherit" });
    } catch {
      // Fall back to plain copy at full size — electron-builder will resize.
      writeFileSync(dstPng, readFileSync(srcPng));
    }
  }
}
resizePng(SRC, resolve(OUT, "icon-512.png"), 512);

// 2. ICO (Windows). Multiple sizes embedded.
const ico = await pngToIco([SRC]);
writeFileSync(resolve(OUT, "icon.ico"), ico);

// 3. ICNS (macOS only — needs iconutil).
if (process.platform === "darwin") {
  const tmp = resolve(OUT, "_iconset.iconset");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const sizes = [16, 32, 64, 128, 256, 512, 1024];
  for (const s of sizes) {
    resizePng(SRC, resolve(tmp, `icon_${s}x${s}.png`), s);
    if (s <= 512) {
      resizePng(SRC, resolve(tmp, `icon_${s}x${s}@2x.png`), s * 2);
    }
  }
  execFileSync("iconutil", ["-c", "icns", tmp, "-o", resolve(OUT, "icon.icns")],
    { stdio: "inherit" });
  rmSync(tmp, { recursive: true, force: true });
} else {
  console.warn("iconutil not available; skipping .icns. " +
    "Re-run on macOS to refresh resources/icons/icon.icns.");
}

console.log("Icons regenerated.");
```

- [ ] **Step 4: Add the script to package.json**

Add to `"scripts"`:

```json
"gen:icons": "node scripts/generate-icons.mjs"
```

- [ ] **Step 5: Run it once**

```bash
pnpm gen:icons
```

Expected output: `resources/icons/icon.ico`, `resources/icons/icon-512.png`, and (on macOS) `resources/icons/icon.icns`.

- [ ] **Step 6: Commit**

```bash
git add resources/icon.png resources/icons/ scripts/generate-icons.mjs package.json pnpm-lock.yaml
git commit -m "feat(m8): app icon source + multi-format generation script"
```

---

### Task 16: electron-builder config + package scripts

**Files:**
- Create: `electron-builder.yml`
- Create: `build/entitlements.mac.plist`
- Modify: `package.json`
- Modify: `README.md`

Mac code-signing is opt-in via env vars (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`). Without those, the .dmg builds unsigned — sufficient for internal lab use; the README documents the env vars for when the user is ready to sign.

- [ ] **Step 1: Install electron-builder**

```bash
pnpm add -D electron-builder@25.0.5
```

- [ ] **Step 2: Write entitlements**

`build/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key><true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
    <key>com.apple.security.cs.disable-library-validation</key><true/>
    <key>com.apple.security.files.user-selected.read-write</key><true/>
  </dict>
</plist>
```

- [ ] **Step 3: Write builder config**

`electron-builder.yml`:

```yaml
appId: com.mosaicbuilder.app
productName: Mosaic Builder
copyright: Copyright © 2026 Mosaic Builder contributors
asar: true
directories:
  output: release
  buildResources: build
files:
  - dist/renderer/**
  - dist-electron/**
  - package.json
  - "!**/{.DS_Store,Thumbs.db}"
  - "!**/*.{ts,tsx,map}"
extraResources:
  - from: resources/icons
    to: icons
mac:
  category: public.app-category.graphics-design
  icon: resources/icons/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  target:
    - target: dmg
      arch: [x64, arm64]
    - target: zip
      arch: [x64, arm64]
win:
  icon: resources/icons/icon.ico
  target:
    - target: nsis
      arch: [x64]
linux:
  icon: resources/icons/icon-512.png
  category: Graphics
  target:
    - target: AppImage
      arch: [x64]
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
publish: null
```

- [ ] **Step 4: Add package scripts**

In `package.json` `"scripts"`:

```json
"build": "tsc -b && vite build",
"package": "pnpm build && electron-builder --publish=never",
"package:mac": "pnpm build && electron-builder --mac --publish=never",
"package:win": "pnpm build && electron-builder --win --publish=never",
"package:linux": "pnpm build && electron-builder --linux --publish=never",
"package:all": "pnpm build && electron-builder -mwl --publish=never"
```

- [ ] **Step 5: Add packaging section to README**

Append to `README.md`:

```md
## Packaging

```sh
pnpm gen:icons   # regenerate icns/ico/png from resources/icon.png (run once)
pnpm package     # current OS only → release/
pnpm package:mac # mac-only build (requires macOS host)
pnpm package:win # windows build (cross-build from any host via electron-builder)
pnpm package:linux
```

### Mac code-signing (optional)

To produce a signed and notarized `.dmg`, set these env vars before
running `pnpm package:mac`:

```sh
export CSC_LINK=/path/to/Developer-ID-Application.p12
export CSC_KEY_PASSWORD=<p12 password>
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=ABCD1234
```

Without these set, the `.dmg` is built unsigned — fine for internal
testing but Gatekeeper will warn end users.
```

- [ ] **Step 6: Verify build runs (no signing)**

```bash
pnpm build
```

Expected: no errors; `dist/renderer/index.html`, `dist-electron/main/index.js`, `dist-electron/preload/preload.js` all exist.

- [ ] **Step 7: Verify package runs**

```bash
pnpm package
```

Expected: `release/` directory contains a `.dmg` (mac), `.exe`/`.nsis` installer (win), or `.AppImage` (linux). The first run downloads electron prebuilds — allow up to 5 minutes. If signing env vars are unset, expect a "skipping code-signing" warning, not an error.

If `pnpm package` fails on a non-mac platform with "Cannot build for mac", that's expected — `pnpm package:linux` or `pnpm package:win` is the correct invocation.

- [ ] **Step 8: Smoke-test the artifact**

Open the produced installer / `.AppImage` / `.dmg`, install, launch. Verify the app icon appears in the dock/taskbar. Verify File menu and the rest of the app works. Close.

- [ ] **Step 9: Commit**

```bash
git add electron-builder.yml build/entitlements.mac.plist package.json pnpm-lock.yaml README.md
git commit -m "feat(m8): electron-builder packaging for mac/win/linux"
```

---

### Task 17: Final pass — manual checklist + status doc

**Files:**
- Modify: `README.md` — bump status line to M8.

This is the green-light gate. No code changes — only run the manual checklist end-to-end. Anything that fails goes back to whichever earlier task owns it.

- [ ] **Step 1: Run the full automated suite**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all green. Fix anything that fails before continuing.

- [ ] **Step 2: Manual end-to-end run-through**

Launch `pnpm dev` and execute, in order, ALL fifteen scenarios from the source plan's "Verification → Manual end-to-end scenarios" section:

1. Launch; new 3×3 project at 7×5 in @ 300 DPI.
2. Drag in 5 PNG, 2 JPEG, 2 TIFF (one 16-bit microscope w/ resolution tags, one without).
3. Auto-calibration appears for the tagged TIFF; manual calibration modal works for the other.
4. Place by drag from tray; swap two; replace one (verify tray re-grouping: unplaced first, placed greyed below).
5. Merge top row (1×3); unmerge; re-merge top-left 2×2.
6. Per-panel: switch fit Contain/Cover/Stretch; pan + zoom in Cover (verify gutter never shows); rotate 90, flip H/V.
7. Subpanel letters: auto on; override one to "A1" via Properties → Subpanel letter; toggle global off/on.
8. Scale bar on a TIFF panel: confirm `50 µm` correct at zoom=1; zoom in 2×, confirm bar visually doubles in figure pixels.
9. Add text, arrow, box; edit colors, fonts, thickness via Properties panel; drag to reposition.
10. `Cmd-Z` 20× across all the above; `Cmd-Shift-Z` back; verify no orphan state and that property-panel edits collapse into single undo steps.
11. Save `.mosaic`; close app; reopen via File → Open; verify exact reproduction.
12. Move source image folder; reopen — verify relink dialog and recovery.
13. Export PNG, JPEG (q=0.85), TIFF, PDF at 300 DPI via toolbar Export menu. Open in Preview / Acrobat / ImageJ — verify dimensions in inches and physical scale-bar correct.
14. Open exported TIFF in ImageJ — verify resolution tags carried through.
15. Stress: 50 images in pool, 10×10 grid, all panels filled — editor stays > 30 fps; export completes under 30s.

For each: if it passes, tick it below in the commit message; if it fails, file the bug and either fix in the relevant task or add a known-issue line to `docs/superpowers/plans/2026-05-03-m8-known-issues.md`.

- [ ] **Step 3: Bump README status**

Edit the last line of `README.md`:

```md
Status: M8 (polish + packaging). See `docs/superpowers/plans/` for milestone plans.
```

- [ ] **Step 4: Build a release artifact one more time**

```bash
pnpm package
```

Verify the produced installer launches cleanly. This is the artifact you ship.

- [ ] **Step 5: Final commit**

```bash
git add README.md
git commit -m "docs(m8): mark M8 complete"
```

---

## Self-review notes

Spec coverage check against the plan's M8 line ("Properties panels finalized, keyboard shortcuts, error toasts, app icon, electron-builder configs, signed mac/win artifacts"):

- **Properties panels finalized** → Tasks 6–11 (panel + 4 annotation forms + global style + routing).
- **Keyboard shortcuts** → mostly already done in M7's `useKeyboardShortcuts`; M8 adds File menu accelerators (Tasks 13–14: Cmd-N/O/S/Shift-S, plus menu-driven Undo/Redo as a redundancy).
- **Error toasts** → Task 12.
- **App icon** → Task 15.
- **electron-builder configs** → Task 16.
- **Signed mac/win artifacts** → Task 16, env-var-gated. Genuine signing requires real Apple Developer ID / Authenticode cert from the user, which is out of scope for an automated plan; the plan documents the env vars and tests the unsigned path.

Type-consistency notes:

- `FieldCommit` interface from Task 5 is used by every form in Tasks 7–11, with the exact same shape.
- `setLetterOverride(panelId, override)` already accepts `string | null` (verified at `src/renderer/model/figure-actions.ts`). Tasks 9 and 11 use `null` for clearing — no signature changes needed.
- `state.letterOverrides` is `Record<string, string>` on `FigureState` (verified at `src/renderer/model/figure-state.ts:51`). The Task 11 read `state.letterOverrides[focusedPanel.id]` returns `string | undefined` as required by `PanelPropertiesForm`'s `letterOverride` prop.
- Test environments: every UI test file carries `// @vitest-environment jsdom`. The default config stays `node`.
