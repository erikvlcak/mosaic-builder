# M4 — Grid Model + Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the M3 fixed 2×2 grid + per-cell `placements` map with a configurable rows×cols grid (1..10 each) whose unit of identity is a **rectangular panel** (rowSpan/colSpan). The user can change rows, cols, gutter px, and gutter color; shift-click cells to multi-select; press **Merge / `M`** to fuse a rectangular selection of 1×1 panels into a single panel; press **Unmerge / `U`** to split a merged panel back into 1×1s. Drag-and-drop, swap, and replace continue to work, but operate on **panel ids** rather than cell coordinates.

**Architecture:** The figure model gains a first-class `Panel` type (`{ id, row, col, rowSpan, colSpan, imageId? }`) and `FigureState.placements: Map<CellKey, imageId>` is replaced by `FigureState.panels: Panel[]`. A grid invariant — *every cell `(r,c)` in `[0,rows)×[0,cols)` is covered by exactly one panel, panels don't overlap* — is enforced by every reducer branch and asserted in tests. New reducer actions: `RESIZE_GRID`, `SET_GUTTER_PX`, `SET_GUTTER_COLOR`, `MERGE_CELLS`, `UNMERGE_PANEL`. Existing actions (`PLACE_FROM_TRAY`, `SWAP_CELLS`, `REPLACE_FROM_TRAY`) are ported from cell-keyed to panel-id-keyed (`PLACE_INTO_PANEL`, `SWAP_PANELS`, `REPLACE_INTO_PANEL`). `computePanelRects` is updated to span multiple cells; the renderer's `HardCodedPanel` gains optional `rowSpan`/`colSpan` (default 1). Multi-select for merge is **ephemeral** — it lives in component-local React state, not in `FigureState`, so M5/M7's undo doesn't have to wrap selection. New UI: a `GridControls` panel (rows/cols/gutter pickers) in the header and a `MergeControls` toolbar with `M`/`U` keyboard shortcuts. dnd-kit is still deferred to a later milestone — native HTML5 DnD continues to suffice.

**Tech Stack:** TypeScript 5.6 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), React 18.3 (`useReducer`, `useState`, native HTML5 DnD, keyboard `useEffect`), HTML5 Canvas 2D + `OffscreenCanvas` (already in M3), Vitest.

---

## File Structure

**Create:**

- `src/renderer/model/panels.ts` — the `Panel` type, the cell-coverage invariant helpers, and three pure functions:
  - `panelCovers(p, row, col): boolean`
  - `findPanelAt(panels, row, col): Panel | null`
  - `assertPanelsCoverGrid(panels, rows, cols): void` — throws on overlap or gap. Used in tests + reducer dev-mode asserts.
- `src/renderer/model/grid-resize.ts` — pure `resizePanels(panels, fromRows, fromCols, toRows, toCols): { panels: Panel[]; releasedImageIds: string[] }`. Splits merged panels that straddle the new bounds, drops panels entirely outside the new bounds (returning their image ids as released so the reducer keeps them in the pool but unplaced).
- `src/renderer/model/merge.ts` — pure `canMergeSelection(panels, selection: CellCoord[]): { ok: true; rect: Rect } | { ok: false; reason: string }` and `mergePanels(panels, rect): Panel[]`, `unmergePanel(panels, panelId): Panel[]`.
- `src/renderer/render/letters.ts` — pure `cellLabel(index): string` covering A..Z then AA..AZ etc., extracted from the inline helper currently in `figure-derivations.ts`. M4 needs labels for up to 100 cells (10×10), which exceeds the existing 26-letter table.
- `src/renderer/components/Toolbar/GridControls.tsx` — three labeled inputs (rows 1..10, cols 1..10, gutter 0..40 px) and a color input for gutter color, plus a "Reset" button.
- `src/renderer/components/Toolbar/MergeControls.tsx` — two buttons ("Merge", "Unmerge"), each with a hint of its keyboard shortcut. Disabled state piped from props.
- `src/renderer/hooks/useMergeSelection.ts` — small hook returning `{ selected, isSelected, toggle, clear }` over a `Set<CellKey>`. Pure JS-side, but co-located with the components that use it.
- `src/renderer/hooks/useKeyboardShortcuts.ts` — registers `M` (merge), `U` (unmerge), `Escape` (clear selection) globally; ignores when focus is in an input/textarea/contenteditable.

**Modify:**

- `src/renderer/model/types.ts` — extend `HardCodedPanel` with optional `rowSpan?: number` and `colSpan?: number` (default 1 when missing). No breaking change to M3 fixtures because the existing values omit these fields.
- `src/renderer/model/figure-state.ts` — replace `placements: Map<CellKey, string>` with `panels: Panel[]`; widen `rows`/`cols` initial defaults still 2×2; `initialFigureState()` now returns 4 default `Panel` objects covering the 2×2 grid.
- `src/renderer/model/figure-actions.ts` — port action union to panel ids; add new actions; remove `placements` references.
- `src/renderer/model/figure-derivations.ts` — emit `HardCodedPanel`s with `rowSpan`/`colSpan` from `Panel.rowSpan`/`colSpan`; use the new `cellLabel` for placeholders (label is computed from the panel's top-left cell index).
- `src/renderer/render/coords.ts` — extend `computePanelRects` to honor `rowSpan`/`colSpan` so a merged panel renders as one big rect spanning the cells (with internal gutters absorbed into the panel's body — see Task 6 for the formula).
- `src/renderer/render/draw-figure.ts` — no logic change; the `HardCodedPanel` shape it consumes already gets correct `rowSpan`/`colSpan` via the updated `computePanelRects`. Verify nothing breaks via existing tests.
- `src/renderer/dnd/dispatch-drop.ts` — accept `targetPanelId` instead of `target: CellCoord`; emit `PLACE_INTO_PANEL`, `SWAP_PANELS`, `REPLACE_INTO_PANEL`.
- `src/renderer/components/Grid/GridCells.tsx` — switch from one drop target per cell to one drop target per **panel** (so merged panels are one drop region). Add a click handler that, when **shift** is held, toggles the cell into the merge selection set and renders a distinct selection ring.
- `src/renderer/App.tsx` — wire the new `GridControls`, `MergeControls`, and the keyboard shortcut hook; thread the merge selection set through to `GridCells`; thread `rows`/`cols`/`gutterPx`/`gutterColor` through `deriveFigure` instead of using module-level constants.
- `src/renderer/render/editor-renderer.ts` — no change expected; verify after Task 6.
- `src/renderer/render/export-renderer.ts` — no change expected; verify after Task 6.
- `src/renderer/components/Toolbar/ExportButton.tsx` — no change expected.

**Test (Vitest):**

- `test/unit/panels.test.ts` — `panelCovers`, `findPanelAt` (returns the merged panel for any inner cell), `assertPanelsCoverGrid` (passes on default 2×2; throws on overlap; throws on gap).
- `test/unit/grid-resize.test.ts` — shrink past a panel returns its image id as released; shrink across a merged panel splits it into 1×1s in the surviving area; grow appends fresh 1×1 panels in row-major order.
- `test/unit/merge.test.ts` — `canMergeSelection` accepts a contiguous rectangle of 1×1 panels; rejects non-rectangular L-shapes; rejects when any included cell is part of a merged panel; `mergePanels` produces one panel with the rect bounds and discards the constituents (preserving `imageId` of the top-left cell only — others are released to the tray); `unmergePanel` re-creates rowSpan*colSpan 1×1 panels with the merged panel's `imageId` going to the top-left.
- `test/unit/figure-actions.test.ts` — extend with `RESIZE_GRID`, `SET_GUTTER_PX`, `SET_GUTTER_COLOR`, `MERGE_CELLS`, `UNMERGE_PANEL`, plus port existing assertions to `PLACE_INTO_PANEL`, `SWAP_PANELS`, `REPLACE_INTO_PANEL`.
- `test/unit/figure-derivations.test.ts` — extend: a merged panel emits a single `HardCodedPanel` with `rowSpan>1`/`colSpan>1`; placeholder label of the merged panel matches the row-major index of its top-left cell.
- `test/unit/figure-layout.test.ts` — extend `computePanelRects` to assert merged-panel rect math with internal gutters absorbed: a 1×3 merged panel on a 2×3 grid spans the full content width minus the outer gutter on both sides.
- `test/unit/dispatch-drop.test.ts` — port to panel ids: drag tray→empty panel emits `PLACE_INTO_PANEL`; drag panel→panel emits `SWAP_PANELS`; drag tray→occupied panel emits `REPLACE_INTO_PANEL`; same-panel drop is a no-op; tray drop with an already-placed image is a no-op.
- `test/unit/letters.test.ts` — `cellLabel(0)`=`"A"`, `cellLabel(25)`=`"Z"`, `cellLabel(26)`=`"AA"`, `cellLabel(99)`=`"CV"`.

**Fixtures:** none new. Existing `resources/fixtures/sample.png`, `red.png`, `blue.jpg` are sufficient for manual testing.

---

## Conventions for this plan

- All new files use ES module imports, no CommonJS.
- Renderer code: no Node imports. Main code: no DOM imports. (M4 touches renderer only.)
- Strict mode is on; satisfy `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Each task ends with a commit. Commit messages follow the existing `feat(scope): summary (M4.N)` style visible in `git log`.
- Tests live in `test/unit/`, matching the existing layout.
- Reducer tests use plain literal state objects — no React, no fakes.
- Pure logic (panels.ts, grid-resize.ts, merge.ts, letters.ts) is testable in Node with zero DOM.
- We deliberately keep dnd-kit deferred. Native HTML5 DnD scales fine for one drag at a time; M5 (selection-mode pan/zoom) and M7 (undo wrapping) will revisit.
- Multi-select is **ephemeral** state — never persisted in `FigureState`, so it's not part of the model snapshot M7 will undo.
- We **break** the current `figure-state.ts`/`figure-actions.ts`/`dispatch-drop.ts` API on purpose — the `placements` map is dead in M4. Fix all call sites in the same task that introduces the new shape.

---

## Task 0: Define the `Panel` type and invariant helpers

**Files:**
- Create: `src/renderer/model/panels.ts`
- Test: `test/unit/panels.test.ts`

The `Panel` is the central new abstraction in M4. Everything downstream (state, reducer, derivations, layout, DnD) keys off it. We start with a pure module + invariants so later tasks can lean on `assertPanelsCoverGrid` in their tests.

- [ ] **Step 1: Write the failing test**

Create `test/unit/panels.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  panelCovers,
  findPanelAt,
  assertPanelsCoverGrid,
  type Panel,
} from "../../src/renderer/model/panels";

const def = (
  id: string,
  row: number,
  col: number,
  rowSpan = 1,
  colSpan = 1,
): Panel => ({ id, row, col, rowSpan, colSpan });

describe("panelCovers", () => {
  it("covers its own top-left cell", () => {
    expect(panelCovers(def("p", 1, 2), 1, 2)).toBe(true);
  });
  it("covers all cells inside a merged rect", () => {
    const m = def("m", 0, 0, 2, 3);
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 3; c++) expect(panelCovers(m, r, c)).toBe(true);
    expect(panelCovers(m, 2, 0)).toBe(false);
    expect(panelCovers(m, 0, 3)).toBe(false);
  });
});

describe("findPanelAt", () => {
  it("returns the merged panel for any cell inside it", () => {
    const ps: Panel[] = [
      def("a", 0, 0, 2, 2),
      def("b", 0, 2),
      def("c", 1, 2),
    ];
    expect(findPanelAt(ps, 0, 0)?.id).toBe("a");
    expect(findPanelAt(ps, 1, 1)?.id).toBe("a");
    expect(findPanelAt(ps, 0, 2)?.id).toBe("b");
    expect(findPanelAt(ps, 1, 2)?.id).toBe("c");
    expect(findPanelAt(ps, 5, 5)).toBe(null);
  });
});

describe("assertPanelsCoverGrid", () => {
  it("passes on default 2x2 with four 1x1 panels", () => {
    const ps: Panel[] = [
      def("a", 0, 0),
      def("b", 0, 1),
      def("c", 1, 0),
      def("d", 1, 1),
    ];
    expect(() => assertPanelsCoverGrid(ps, 2, 2)).not.toThrow();
  });

  it("passes when a merged 1x2 panel covers an entire row", () => {
    const ps: Panel[] = [
      def("hero", 0, 0, 1, 2),
      def("c", 1, 0),
      def("d", 1, 1),
    ];
    expect(() => assertPanelsCoverGrid(ps, 2, 2)).not.toThrow();
  });

  it("throws on overlap", () => {
    const ps: Panel[] = [def("a", 0, 0, 1, 2), def("b", 0, 1)];
    expect(() => assertPanelsCoverGrid(ps, 1, 2)).toThrow(/overlap/i);
  });

  it("throws on gap", () => {
    const ps: Panel[] = [def("a", 0, 0)];
    expect(() => assertPanelsCoverGrid(ps, 1, 2)).toThrow(/gap|uncovered/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- panels.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/renderer/model/panels.ts`:

```ts
/**
 * A rectangular panel covering one or more cells of the figure grid.
 * Invariant (enforced by reducer + asserted in tests): the panels in a
 * FigureState cover every cell in [0,rows) × [0,cols) exactly once.
 */
export interface Panel {
  id: string;
  row: number;
  col: number;
  rowSpan: number; // >= 1
  colSpan: number; // >= 1
  imageId?: string;
}

export function panelCovers(p: Panel, row: number, col: number): boolean {
  return (
    row >= p.row &&
    row < p.row + p.rowSpan &&
    col >= p.col &&
    col < p.col + p.colSpan
  );
}

export function findPanelAt(
  panels: readonly Panel[],
  row: number,
  col: number,
): Panel | null {
  for (const p of panels) if (panelCovers(p, row, col)) return p;
  return null;
}

/**
 * Throws if `panels` does not partition [0,rows) × [0,cols) — i.e. any
 * cell is uncovered or covered by more than one panel.
 */
export function assertPanelsCoverGrid(
  panels: readonly Panel[],
  rows: number,
  cols: number,
): void {
  const seen: (string | null)[] = Array.from(
    { length: rows * cols },
    () => null,
  );
  for (const p of panels) {
    if (p.rowSpan < 1 || p.colSpan < 1) {
      throw new Error(`panel ${p.id} has non-positive span`);
    }
    if (
      p.row < 0 ||
      p.col < 0 ||
      p.row + p.rowSpan > rows ||
      p.col + p.colSpan > cols
    ) {
      throw new Error(`panel ${p.id} out of bounds`);
    }
    for (let r = p.row; r < p.row + p.rowSpan; r++) {
      for (let c = p.col; c < p.col + p.colSpan; c++) {
        const i = r * cols + c;
        if (seen[i] !== null) {
          throw new Error(
            `panels overlap at (${r},${c}): ${seen[i]} and ${p.id}`,
          );
        }
        seen[i] = p.id;
      }
    }
  }
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] === null) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      throw new Error(`gap at (${r},${c}) — uncovered`);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- panels.test`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/model/panels.ts test/unit/panels.test.ts
git commit -m "feat(model): Panel type + grid-coverage invariant helpers (M4.0)"
```

---

## Task 1: Cell-label helper for grids beyond 26 cells

**Files:**
- Create: `src/renderer/render/letters.ts`
- Test: `test/unit/letters.test.ts`

The current label helper (inline in `figure-derivations.ts`) returns `"?"` past Z. A 10×10 grid has 100 cells, so we need A..Z, AA..AZ, BA..BZ, … up to at least CV (index 99). Spreadsheet-style numbering: `cellLabel(0)="A"`, `cellLabel(25)="Z"`, `cellLabel(26)="AA"`, `cellLabel(27)="AB"`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/letters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cellLabel } from "../../src/renderer/render/letters";

describe("cellLabel", () => {
  it("labels first 26 cells A..Z", () => {
    expect(cellLabel(0)).toBe("A");
    expect(cellLabel(1)).toBe("B");
    expect(cellLabel(25)).toBe("Z");
  });
  it("rolls over to AA after Z", () => {
    expect(cellLabel(26)).toBe("AA");
    expect(cellLabel(27)).toBe("AB");
    expect(cellLabel(51)).toBe("AZ");
    expect(cellLabel(52)).toBe("BA");
  });
  it("handles the 10x10 max (index 99)", () => {
    expect(cellLabel(99)).toBe("CV");
  });
  it("throws on negative input", () => {
    expect(() => cellLabel(-1)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- letters.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/renderer/render/letters.ts`:

```ts
/**
 * Spreadsheet-style 1-based label for a 0-based row-major cell index.
 * Index 0 → "A", 25 → "Z", 26 → "AA", 99 → "CV".
 */
export function cellLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`cellLabel: invalid index ${index}`);
  }
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- letters.test`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/render/letters.ts test/unit/letters.test.ts
git commit -m "feat(render): cellLabel handles A..Z, AA..CV for up-to-10x10 grids (M4.1)"
```

---

## Task 2: Replace `placements` with `panels` in FigureState

**Files:**
- Modify: `src/renderer/model/figure-state.ts`

Switch the underlying state shape to `panels: Panel[]`. This task only updates the `FigureState` type and `initialFigureState()` — every reducer branch still references `placements` and so will break. We fix them in Task 3 (same commit window — see commit at end of Task 3).

We **don't** commit yet at the end of this task. Task 2 + Task 3 land in the same commit because the reducer cannot compile without both.

- [ ] **Step 1: Update `figure-state.ts`**

Replace the file at `src/renderer/model/figure-state.ts` with:

```ts
import type { ImagePoolItem } from "./pool";
import type { Panel } from "./panels";

export interface CellCoord {
  row: number;
  col: number;
}

export type CellKey = string;

export function cellKey(row: number, col: number): CellKey {
  return `${row},${col}`;
}

/**
 * Panel-centric figure state. A panel covers one or more cells; merged
 * panels have rowSpan/colSpan > 1. Invariant: panels partition
 * [0,rows) × [0,cols) exactly. The reducer enforces this.
 */
export interface FigureState {
  /**
   * Insertion-ordered. New uploads append; placement state lives on
   * `panels[*].imageId` so reordering placements never reshuffles the tray.
   */
  pool: ImagePoolItem[];

  /**
   * Non-overlapping rectangular panels covering the rows×cols grid.
   * Order is irrelevant for correctness but stable insertion order helps
   * deterministic rendering.
   */
  panels: Panel[];

  /** 1..10 in M4. */
  rows: number;
  cols: number;

  /** Gutter is figure-canvas pixels. */
  gutterPx: number;
  /** Hex color, "#RRGGBB" or "#RRGGBBAA". */
  gutterColor: string;
}

let __panelIdCounter = 0;
function nextPanelId(): string {
  __panelIdCounter += 1;
  return `panel-${__panelIdCounter}`;
}

/**
 * Test-only seam: lets the reducer tests reset the id counter so panel
 * ids in assertions stay stable. Production never calls this.
 */
export function __resetPanelIdsForTests(): void {
  __panelIdCounter = 0;
}

function defaultPanels(rows: number, cols: number): Panel[] {
  const out: Panel[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ id: nextPanelId(), row: r, col: c, rowSpan: 1, colSpan: 1 });
    }
  }
  return out;
}

export function initialFigureState(): FigureState {
  return {
    pool: [],
    panels: defaultPanels(2, 2),
    rows: 2,
    cols: 2,
    gutterPx: 12,
    gutterColor: "#FFFFFF",
  };
}

export { newPanelId };

function newPanelId(): string {
  return nextPanelId();
}

export { figureReducer } from "./figure-actions";
```

(Do not commit. Continue to Task 3.)

---

## Task 3: Port the reducer to panel-id-keyed actions

**Files:**
- Modify: `src/renderer/model/figure-actions.ts`
- Modify: `test/unit/figure-actions.test.ts`

Replace the cell-key actions with panel-id actions: `PLACE_INTO_PANEL`, `SWAP_PANELS`, `REPLACE_INTO_PANEL`. Keep `ADD_TO_POOL` and `REMOVE_FROM_POOL` as-is. New actions for grid config land in Task 4.

- [ ] **Step 1: Replace the test file**

Overwrite `test/unit/figure-actions.test.ts` with:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { ImagePoolItem } from "../../src/renderer/model/pool";
import {
  initialFigureState,
  figureReducer,
  __resetPanelIdsForTests,
  type FigureState,
} from "../../src/renderer/model/figure-state";
import {
  addToPool,
  placeIntoPanel,
  swapPanels,
  replaceIntoPanel,
  removeFromPool,
} from "../../src/renderer/model/figure-actions";
import { findPanelAt } from "../../src/renderer/model/panels";

const IMG_A: ImagePoolItem = {
  id: "a",
  filename: "a.png",
  filePath: "/x/a.png",
  mime: "image/png",
  width: 100,
  height: 100,
};
const IMG_B: ImagePoolItem = {
  id: "b",
  filename: "b.jpg",
  filePath: "/x/b.jpg",
  mime: "image/jpeg",
  width: 200,
  height: 100,
};

function withPool(...items: ImagePoolItem[]): FigureState {
  let s = initialFigureState();
  for (const it of items) s = figureReducer(s, addToPool(it));
  return s;
}

function panelIdAt(s: FigureState, row: number, col: number): string {
  const p = findPanelAt(s.panels, row, col);
  if (p === null) throw new Error(`no panel at ${row},${col}`);
  return p.id;
}

describe("figureReducer (panel-id actions)", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  it("starts with a 2x2 of four 1x1 panels and empty pool", () => {
    const s = initialFigureState();
    expect(s.pool).toEqual([]);
    expect(s.panels).toHaveLength(4);
    expect(s.rows).toBe(2);
    expect(s.cols).toBe(2);
    expect(s.gutterPx).toBe(12);
    expect(s.panels.every((p) => p.rowSpan === 1 && p.colSpan === 1)).toBe(
      true,
    );
  });

  it("ADD_TO_POOL appends to pool, no placement", () => {
    const s = figureReducer(initialFigureState(), addToPool(IMG_A));
    expect(s.pool).toEqual([IMG_A]);
    expect(s.panels.every((p) => p.imageId === undefined)).toBe(true);
  });

  it("ADD_TO_POOL ignores duplicate ids", () => {
    let s = figureReducer(initialFigureState(), addToPool(IMG_A));
    s = figureReducer(s, addToPool(IMG_A));
    expect(s.pool).toHaveLength(1);
  });

  it("PLACE_INTO_PANEL into empty panel sets imageId", () => {
    const s0 = withPool(IMG_A);
    const pid = panelIdAt(s0, 0, 1);
    const s1 = figureReducer(s0, placeIntoPanel("a", pid));
    const target = s1.panels.find((p) => p.id === pid);
    expect(target?.imageId).toBe("a");
  });

  it("PLACE_INTO_PANEL no-op when image not in pool", () => {
    const s0 = initialFigureState();
    const pid = panelIdAt(s0, 0, 0);
    const s1 = figureReducer(s0, placeIntoPanel("ghost", pid));
    expect(s1).toBe(s0);
  });

  it("PLACE_INTO_PANEL no-op when image already placed elsewhere", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 1, 1);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const before = s;
    s = figureReducer(s, placeIntoPanel("a", p2));
    expect(s).toBe(before);
  });

  it("PLACE_INTO_PANEL no-op when target panel already occupied", () => {
    let s = withPool(IMG_A, IMG_B);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const before = s;
    s = figureReducer(s, placeIntoPanel("b", p1));
    expect(s).toBe(before);
  });

  it("SWAP_PANELS swaps two occupied panels", () => {
    let s = withPool(IMG_A, IMG_B);
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 1, 1);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, placeIntoPanel("b", p2));
    s = figureReducer(s, swapPanels(p1, p2));
    expect(s.panels.find((p) => p.id === p1)?.imageId).toBe("b");
    expect(s.panels.find((p) => p.id === p2)?.imageId).toBe("a");
  });

  it("SWAP_PANELS moves image into empty panel when one side is empty", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 0, 1);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, swapPanels(p1, p2));
    expect(s.panels.find((p) => p.id === p1)?.imageId).toBeUndefined();
    expect(s.panels.find((p) => p.id === p2)?.imageId).toBe("a");
  });

  it("SWAP_PANELS is a no-op when source equals target", () => {
    let s = withPool(IMG_A);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const s2 = figureReducer(s, swapPanels(p1, p1));
    expect(s2).toBe(s);
  });

  it("REPLACE_INTO_PANEL puts new image in panel; kicked image stays in pool unplaced", () => {
    let s = withPool(IMG_A, IMG_B);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, replaceIntoPanel("b", p1));
    expect(s.panels.find((p) => p.id === p1)?.imageId).toBe("b");
    const placedIds = new Set(
      s.panels.map((p) => p.imageId).filter((x): x is string => x !== undefined),
    );
    expect(placedIds.has("a")).toBe(false);
    expect(s.pool.map((i) => i.id)).toContain("a");
  });

  it("REMOVE_FROM_POOL drops the item and clears any placement", () => {
    let s = withPool(IMG_A, IMG_B);
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, removeFromPool("a"));
    expect(s.pool.map((i) => i.id)).toEqual(["b"]);
    expect(s.panels.find((p) => p.id === p1)?.imageId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- figure-actions`
Expected: FAIL — `placeIntoPanel`/`swapPanels`/`replaceIntoPanel` not exported.

- [ ] **Step 3: Replace `figure-actions.ts`**

Overwrite `src/renderer/model/figure-actions.ts` with:

```ts
import type { ImagePoolItem } from "./pool";
import type { Panel } from "./panels";
import type { FigureState } from "./figure-state";

export type FigureAction =
  | { type: "ADD_TO_POOL"; item: ImagePoolItem }
  | { type: "PLACE_INTO_PANEL"; imageId: string; panelId: string }
  | { type: "SWAP_PANELS"; aPanelId: string; bPanelId: string }
  | { type: "REPLACE_INTO_PANEL"; imageId: string; panelId: string }
  | { type: "REMOVE_FROM_POOL"; imageId: string };

export const addToPool = (item: ImagePoolItem): FigureAction => ({
  type: "ADD_TO_POOL",
  item,
});
export const placeIntoPanel = (
  imageId: string,
  panelId: string,
): FigureAction => ({ type: "PLACE_INTO_PANEL", imageId, panelId });
export const swapPanels = (
  aPanelId: string,
  bPanelId: string,
): FigureAction => ({ type: "SWAP_PANELS", aPanelId, bPanelId });
export const replaceIntoPanel = (
  imageId: string,
  panelId: string,
): FigureAction => ({ type: "REPLACE_INTO_PANEL", imageId, panelId });
export const removeFromPool = (imageId: string): FigureAction => ({
  type: "REMOVE_FROM_POOL",
  imageId,
});

function isImageInPool(s: FigureState, imageId: string): boolean {
  return s.pool.some((p) => p.id === imageId);
}

function findPanelById(panels: Panel[], id: string): Panel | undefined {
  return panels.find((p) => p.id === id);
}

function isImagePlaced(panels: readonly Panel[], imageId: string): boolean {
  return panels.some((p) => p.imageId === imageId);
}

function setPanelImage(
  panels: Panel[],
  panelId: string,
  imageId: string | undefined,
): Panel[] {
  return panels.map((p) =>
    p.id === panelId
      ? imageId === undefined
        ? omitImageId(p)
        : { ...p, imageId }
      : p,
  );
}

function omitImageId(p: Panel): Panel {
  const { imageId: _drop, ...rest } = p;
  return { ...rest, rowSpan: p.rowSpan, colSpan: p.colSpan };
}

export function figureReducer(s: FigureState, a: FigureAction): FigureState {
  switch (a.type) {
    case "ADD_TO_POOL": {
      if (s.pool.some((p) => p.id === a.item.id)) return s;
      return { ...s, pool: [...s.pool, a.item] };
    }

    case "PLACE_INTO_PANEL": {
      if (!isImageInPool(s, a.imageId)) return s;
      if (isImagePlaced(s.panels, a.imageId)) return s;
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined) return s;
      if (target.imageId !== undefined) return s;
      return { ...s, panels: setPanelImage(s.panels, a.panelId, a.imageId) };
    }

    case "SWAP_PANELS": {
      if (a.aPanelId === a.bPanelId) return s;
      const pa = findPanelById(s.panels, a.aPanelId);
      const pb = findPanelById(s.panels, a.bPanelId);
      if (pa === undefined || pb === undefined) return s;
      if (pa.imageId === undefined && pb.imageId === undefined) return s;
      const next = s.panels.map((p) => {
        if (p.id === pa.id) return assignImage(p, pb.imageId);
        if (p.id === pb.id) return assignImage(p, pa.imageId);
        return p;
      });
      return { ...s, panels: next };
    }

    case "REPLACE_INTO_PANEL": {
      if (!isImageInPool(s, a.imageId)) return s;
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined) return s;
      if (target.imageId === a.imageId) return s;
      // If the new image is already placed in some *other* panel, this is a no-op:
      // a "replace" is from the tray, not a 2-cell move. Use SWAP_PANELS for that.
      const placedElsewhere = s.panels.some(
        (p) => p.id !== a.panelId && p.imageId === a.imageId,
      );
      if (placedElsewhere) return s;
      return { ...s, panels: setPanelImage(s.panels, a.panelId, a.imageId) };
    }

    case "REMOVE_FROM_POOL": {
      if (!s.pool.some((p) => p.id === a.imageId)) return s;
      const panels = s.panels.map((p) =>
        p.imageId === a.imageId ? assignImage(p, undefined) : p,
      );
      return {
        ...s,
        pool: s.pool.filter((p) => p.id !== a.imageId),
        panels,
      };
    }
  }
}

function assignImage(p: Panel, imageId: string | undefined): Panel {
  if (imageId === undefined) {
    const { imageId: _drop, ...rest } = p;
    return rest;
  }
  return { ...p, imageId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- figure-actions`
Expected: PASS, all 11 tests.

- [ ] **Step 5: Run the full suite to check what else broke**

Run: `pnpm test`
Expected: failures in `figure-derivations.test.ts`, `dispatch-drop.test.ts`, plus any test that imported `placeFromTray`/`swapCells`/`replaceFromTray`. We fix those in Tasks 5–8. Type-check (`pnpm typecheck`) will fail because `figure-derivations.ts`, `dispatch-drop.ts`, `GridCells.tsx`, `App.tsx` still reference the old API. Continue.

- [ ] **Step 6: Commit Tasks 2 + 3 together**

```bash
git add src/renderer/model/figure-state.ts src/renderer/model/figure-actions.ts test/unit/figure-actions.test.ts
git commit -m "feat(model): panels[] replaces placements map; reducer keys on panel ids (M4.2)"
```

Note: typecheck still fails after this commit. We unblock build in Task 5.

---

## Task 4: Add grid-config reducer actions

**Files:**
- Modify: `src/renderer/model/figure-actions.ts`
- Create: `src/renderer/model/grid-resize.ts`
- Test: `test/unit/grid-resize.test.ts`
- Test: `test/unit/figure-actions.test.ts` (extend)

`RESIZE_GRID` is the trickiest of the new actions: shrinking can drop panels and split merged ones; growing must append fresh 1×1 panels in row-major order. We isolate the logic in a pure module so it's exhaustively testable.

`SET_GUTTER_PX` and `SET_GUTTER_COLOR` are trivial.

- [ ] **Step 1: Write failing test for `resizePanels`**

Create `test/unit/grid-resize.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetPanelIdsForTests,
} from "../../src/renderer/model/figure-state";
import { resizePanels } from "../../src/renderer/model/grid-resize";
import type { Panel } from "../../src/renderer/model/panels";
import { assertPanelsCoverGrid } from "../../src/renderer/model/panels";

const def = (
  id: string,
  row: number,
  col: number,
  rowSpan = 1,
  colSpan = 1,
  imageId?: string,
): Panel => {
  const p: Panel = { id, row, col, rowSpan, colSpan };
  if (imageId !== undefined) p.imageId = imageId;
  return p;
};

describe("resizePanels", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  it("no-op when shape is unchanged", () => {
    const ps = [def("a", 0, 0), def("b", 0, 1), def("c", 1, 0), def("d", 1, 1)];
    const r = resizePanels(ps, 2, 2, 2, 2);
    expect(r.panels).toEqual(ps);
    expect(r.releasedImageIds).toEqual([]);
  });

  it("growing rows appends fresh 1x1 panels in row-major order", () => {
    const ps = [def("a", 0, 0), def("b", 0, 1)];
    const r = resizePanels(ps, 1, 2, 2, 2);
    assertPanelsCoverGrid(r.panels, 2, 2);
    expect(r.panels.filter((p) => p.row === 1)).toHaveLength(2);
    expect(r.releasedImageIds).toEqual([]);
  });

  it("growing cols appends fresh 1x1 panels", () => {
    const ps = [def("a", 0, 0), def("b", 1, 0)];
    const r = resizePanels(ps, 2, 1, 2, 2);
    assertPanelsCoverGrid(r.panels, 2, 2);
  });

  it("shrinking releases image ids of panels that fall out of bounds", () => {
    const ps = [
      def("a", 0, 0, 1, 1, "imgA"),
      def("b", 0, 1, 1, 1, "imgB"),
      def("c", 1, 0, 1, 1, "imgC"),
      def("d", 1, 1, 1, 1, "imgD"),
    ];
    const r = resizePanels(ps, 2, 2, 1, 1);
    assertPanelsCoverGrid(r.panels, 1, 1);
    expect(r.panels).toHaveLength(1);
    expect(r.panels[0]?.imageId).toBe("imgA");
    expect(r.releasedImageIds.sort()).toEqual(["imgB", "imgC", "imgD"]);
  });

  it("shrinking splits a merged panel that straddles the new edge", () => {
    // 2x3 grid with a 1x3 hero panel covering the top row and 3 1x1s below.
    const ps = [
      def("hero", 0, 0, 1, 3, "imgHero"),
      def("c", 1, 0),
      def("d", 1, 1),
      def("e", 1, 2),
    ];
    // Shrink to 2x2 — hero loses col 2.
    const r = resizePanels(ps, 2, 3, 2, 2);
    assertPanelsCoverGrid(r.panels, 2, 2);
    // The hero panel is split into 1x1s in the surviving area; its image
    // sticks with the (0,0) cell — pragmatic choice, matches what the user
    // sees.
    const at00 = r.panels.find((p) => p.row === 0 && p.col === 0);
    const at01 = r.panels.find((p) => p.row === 0 && p.col === 1);
    expect(at00?.rowSpan).toBe(1);
    expect(at00?.colSpan).toBe(1);
    expect(at00?.imageId).toBe("imgHero");
    expect(at01?.imageId).toBeUndefined();
    expect(r.releasedImageIds).toEqual([]);
  });

  it("shrinking releases an image when its merged panel is fully outside", () => {
    const ps = [
      def("hero", 1, 0, 1, 2, "imgHero"),
      def("a", 0, 0),
      def("b", 0, 1),
    ];
    const r = resizePanels(ps, 2, 2, 1, 2);
    assertPanelsCoverGrid(r.panels, 1, 2);
    expect(r.releasedImageIds).toEqual(["imgHero"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- grid-resize`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `grid-resize.ts`**

Create `src/renderer/model/grid-resize.ts`:

```ts
import type { Panel } from "./panels";

export interface ResizeResult {
  panels: Panel[];
  releasedImageIds: string[];
}

let __resizeIdCounter = 0;
function freshId(): string {
  __resizeIdCounter += 1;
  return `panel-resize-${__resizeIdCounter}`;
}

/**
 * Resize the grid from (fromRows × fromCols) to (toRows × toCols).
 *
 * Rules:
 *  - For every existing panel, intersect its rectangle with [0,toRows) × [0,toCols).
 *  - If the intersection is empty, the panel is dropped and its imageId
 *    (if any) is added to releasedImageIds.
 *  - If the intersection is the full original rectangle, the panel is kept
 *    as-is.
 *  - Otherwise (merged panel straddling the new edge), the panel is split
 *    into 1×1 panels covering the intersection. The original imageId is
 *    assigned to the cell that was the panel's top-left if that cell is
 *    inside the intersection; otherwise releasedImageIds receives the image.
 *  - Any cell in [0,toRows) × [0,toCols) not covered by a kept/split panel
 *    gets a new empty 1×1 panel.
 */
export function resizePanels(
  panels: readonly Panel[],
  _fromRows: number,
  _fromCols: number,
  toRows: number,
  toCols: number,
): ResizeResult {
  const released: string[] = [];
  const cover: (Panel | null)[] = Array.from(
    { length: toRows * toCols },
    () => null,
  );
  const out: Panel[] = [];

  for (const p of panels) {
    const r0 = Math.max(0, p.row);
    const c0 = Math.max(0, p.col);
    const r1 = Math.min(toRows, p.row + p.rowSpan);
    const c1 = Math.min(toCols, p.col + p.colSpan);
    if (r0 >= r1 || c0 >= c1) {
      if (p.imageId !== undefined) released.push(p.imageId);
      continue;
    }
    const fullyInside =
      r0 === p.row && c0 === p.col && r1 === p.row + p.rowSpan && c1 === p.col + p.colSpan;
    if (fullyInside) {
      out.push(p);
      for (let r = r0; r < r1; r++)
        for (let c = c0; c < c1; c++) cover[r * toCols + c] = p;
      continue;
    }
    // Split: merged panel partially clipped — emit 1x1 panels.
    const tlInside = p.row >= 0 && p.row < toRows && p.col >= 0 && p.col < toCols;
    let imageAssigned = false;
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        const np: Panel = { id: freshId(), row: r, col: c, rowSpan: 1, colSpan: 1 };
        if (tlInside && r === p.row && c === p.col && p.imageId !== undefined) {
          np.imageId = p.imageId;
          imageAssigned = true;
        }
        out.push(np);
        cover[r * toCols + c] = np;
      }
    }
    if (!imageAssigned && p.imageId !== undefined) released.push(p.imageId);
  }

  // Fill any uncovered cell with a fresh empty 1x1.
  for (let r = 0; r < toRows; r++) {
    for (let c = 0; c < toCols; c++) {
      if (cover[r * toCols + c] === null) {
        const np: Panel = { id: freshId(), row: r, col: c, rowSpan: 1, colSpan: 1 };
        out.push(np);
      }
    }
  }

  // Stable order: row-major by top-left.
  out.sort((a, b) => a.row - b.row || a.col - b.col);

  return { panels: out, releasedImageIds: released };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- grid-resize`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Extend `figure-actions.ts` with grid-config actions**

Open `src/renderer/model/figure-actions.ts`. Extend the `FigureAction` union and add three new branches.

Add to the imports at the top:

```ts
import { resizePanels } from "./grid-resize";
```

Replace the `FigureAction` type with:

```ts
export type FigureAction =
  | { type: "ADD_TO_POOL"; item: ImagePoolItem }
  | { type: "PLACE_INTO_PANEL"; imageId: string; panelId: string }
  | { type: "SWAP_PANELS"; aPanelId: string; bPanelId: string }
  | { type: "REPLACE_INTO_PANEL"; imageId: string; panelId: string }
  | { type: "REMOVE_FROM_POOL"; imageId: string }
  | { type: "RESIZE_GRID"; rows: number; cols: number }
  | { type: "SET_GUTTER_PX"; gutterPx: number }
  | { type: "SET_GUTTER_COLOR"; gutterColor: string };
```

Add corresponding action creators below the existing ones:

```ts
export const resizeGrid = (rows: number, cols: number): FigureAction => ({
  type: "RESIZE_GRID",
  rows,
  cols,
});
export const setGutterPx = (gutterPx: number): FigureAction => ({
  type: "SET_GUTTER_PX",
  gutterPx,
});
export const setGutterColor = (gutterColor: string): FigureAction => ({
  type: "SET_GUTTER_COLOR",
  gutterColor,
});
```

Add three new switch branches inside `figureReducer` (after `REMOVE_FROM_POOL`):

```ts
    case "RESIZE_GRID": {
      const rows = clampInt(a.rows, 1, 10);
      const cols = clampInt(a.cols, 1, 10);
      if (rows === s.rows && cols === s.cols) return s;
      const r = resizePanels(s.panels, s.rows, s.cols, rows, cols);
      // Released imageIds simply stay in the pool unplaced — no pool mutation.
      return { ...s, rows, cols, panels: r.panels };
    }

    case "SET_GUTTER_PX": {
      const gutterPx = clampInt(a.gutterPx, 0, 40);
      if (gutterPx === s.gutterPx) return s;
      return { ...s, gutterPx };
    }

    case "SET_GUTTER_COLOR": {
      if (!isHexColor(a.gutterColor)) return s;
      if (a.gutterColor === s.gutterColor) return s;
      return { ...s, gutterColor: a.gutterColor };
    }
```

Add these helpers at the bottom of the file (above or below `assignImage`):

```ts
function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  const i = Math.round(n);
  return Math.max(lo, Math.min(hi, i));
}

function isHexColor(s: string): boolean {
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s);
}
```

- [ ] **Step 6: Extend the reducer test file**

Append to `test/unit/figure-actions.test.ts` (inside the `describe("figureReducer (panel-id actions)")` block, before the closing `});`):

```ts
  it("RESIZE_GRID grows the grid and adds 1x1 panels", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(
      s0,
      { type: "RESIZE_GRID", rows: 3, cols: 3 } as const,
    );
    expect(s1.rows).toBe(3);
    expect(s1.cols).toBe(3);
    expect(s1.panels).toHaveLength(9);
  });

  it("RESIZE_GRID clamps to 1..10", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(
      s0,
      { type: "RESIZE_GRID", rows: 99, cols: 0 } as const,
    );
    expect(s1.rows).toBe(10);
    expect(s1.cols).toBe(1);
  });

  it("RESIZE_GRID is no-op when the shape is unchanged", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(
      s0,
      { type: "RESIZE_GRID", rows: 2, cols: 2 } as const,
    );
    expect(s1).toBe(s0);
  });

  it("SET_GUTTER_PX clamps and updates", () => {
    let s = initialFigureState();
    s = figureReducer(s, { type: "SET_GUTTER_PX", gutterPx: 20 } as const);
    expect(s.gutterPx).toBe(20);
    s = figureReducer(s, { type: "SET_GUTTER_PX", gutterPx: -5 } as const);
    expect(s.gutterPx).toBe(0);
    s = figureReducer(s, { type: "SET_GUTTER_PX", gutterPx: 999 } as const);
    expect(s.gutterPx).toBe(40);
  });

  it("SET_GUTTER_COLOR accepts hex and rejects junk", () => {
    let s = initialFigureState();
    s = figureReducer(
      s,
      { type: "SET_GUTTER_COLOR", gutterColor: "#000000" } as const,
    );
    expect(s.gutterColor).toBe("#000000");
    const before = s;
    s = figureReducer(
      s,
      { type: "SET_GUTTER_COLOR", gutterColor: "purple" } as const,
    );
    expect(s).toBe(before);
  });
```

- [ ] **Step 7: Run the full reducer test file**

Run: `pnpm test -- figure-actions`
Expected: PASS — all original 11 tests + 5 new tests = 16.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/model/grid-resize.ts test/unit/grid-resize.test.ts src/renderer/model/figure-actions.ts test/unit/figure-actions.test.ts
git commit -m "feat(model): RESIZE_GRID + SET_GUTTER_* actions; pure resizePanels (M4.3)"
```

---

## Task 5: Update `figure-derivations.ts` to emit `rowSpan`/`colSpan`

**Files:**
- Modify: `src/renderer/model/types.ts`
- Modify: `src/renderer/model/figure-derivations.ts`
- Modify: `test/unit/figure-derivations.test.ts`

The renderer's `Figure` shape needs to carry merge information through to `computePanelRects`. Cleanest path: extend `HardCodedPanel` with optional `rowSpan?`/`colSpan?` (default 1). Existing callers (M2/M3 fixtures) keep working.

This task **fixes the typecheck failure** introduced by Tasks 2–3 by making the derivation function consume the new `FigureState.panels` instead of `state.placements`.

- [ ] **Step 1: Extend `types.ts`**

Modify `src/renderer/model/types.ts`:

Replace the `HardCodedPanel` definition with:

```ts
export type HardCodedPanel =
  | {
      row: number;
      col: number;
      kind: "image";
      imageId: string;
      rowSpan?: number;
      colSpan?: number;
    }
  | {
      row: number;
      col: number;
      kind: "placeholder";
      label: string;
      rowSpan?: number;
      colSpan?: number;
    };
```

(Update the comment on line 1–5 to mention M4 added rowSpan/colSpan.)

- [ ] **Step 2: Replace failing test**

Overwrite `test/unit/figure-derivations.test.ts` with:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { Figure } from "../../src/renderer/model/types";
import {
  initialFigureState,
  figureReducer,
  __resetPanelIdsForTests,
} from "../../src/renderer/model/figure-state";
import { addToPool, placeIntoPanel } from "../../src/renderer/model/figure-actions";
import { findPanelAt } from "../../src/renderer/model/panels";
import { deriveFigure } from "../../src/renderer/model/figure-derivations";

const CANVAS = { widthPx: 800, heightPx: 600, background: "#FFFFFF" } as const;

describe("deriveFigure", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  it("derives all-placeholder figure from empty state", () => {
    const s = initialFigureState();
    const f: Figure = deriveFigure(s, { canvas: CANVAS });
    expect(f.canvas).toEqual(CANVAS);
    expect(f.grid.rows).toBe(2);
    expect(f.grid.cols).toBe(2);
    expect(f.grid.gutterPx).toBe(s.gutterPx);
    expect(f.grid.gutterColor).toBe(s.gutterColor);
    expect(f.panels).toHaveLength(4);
    expect(f.panels.map((p) => p.kind)).toEqual([
      "placeholder",
      "placeholder",
      "placeholder",
      "placeholder",
    ]);
    expect(
      f.panels.map((p) => (p.kind === "placeholder" ? p.label : "")),
    ).toEqual(["A", "B", "C", "D"]);
    // 1x1 panels: spans omitted is fine.
    expect(f.panels.every((p) => (p.rowSpan ?? 1) === 1)).toBe(true);
    expect(f.panels.every((p) => (p.colSpan ?? 1) === 1)).toBe(true);
  });

  it("derives image panels for occupied panels", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool({
      id: "img-1", filename: "x.png", filePath: "/x", mime: "image/png",
      width: 1, height: 1,
    }));
    const pid = findPanelAt(s.panels, 0, 1)?.id;
    if (pid === undefined) throw new Error("no panel at (0,1)");
    s = figureReducer(s, placeIntoPanel("img-1", pid));

    const f = deriveFigure(s, { canvas: CANVAS });
    const at01 = f.panels.find((p) => p.row === 0 && p.col === 1);
    expect(at01?.kind).toBe("image");
    if (at01?.kind === "image") {
      expect(at01.imageId).toBe("img-1");
    }
  });

  it("emits rowSpan/colSpan for a merged panel and labels it from its top-left index", () => {
    // Hand-craft a merged 1x2 hero on the top row of a 2x2 grid.
    const s = initialFigureState();
    s.panels = [
      { id: "hero", row: 0, col: 0, rowSpan: 1, colSpan: 2 },
      { id: "c", row: 1, col: 0, rowSpan: 1, colSpan: 1 },
      { id: "d", row: 1, col: 1, rowSpan: 1, colSpan: 1 },
    ];
    const f = deriveFigure(s, { canvas: CANVAS });
    const hero = f.panels.find((p) => p.row === 0 && p.col === 0);
    expect(hero?.rowSpan).toBe(1);
    expect(hero?.colSpan).toBe(2);
    expect(hero?.kind).toBe("placeholder");
    if (hero?.kind === "placeholder") expect(hero.label).toBe("A");
    // Bottom row labels are based on row-major *cell* index → "C","D".
    const c = f.panels.find((p) => p.row === 1 && p.col === 0);
    if (c?.kind === "placeholder") expect(c.label).toBe("C");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- figure-derivations`
Expected: FAIL — old derivation reads `state.placements`; signature mismatch.

- [ ] **Step 4: Replace `figure-derivations.ts`**

Overwrite `src/renderer/model/figure-derivations.ts` with:

```ts
import type { Figure, FigureCanvas, HardCodedPanel } from "./types";
import type { FigureState } from "./figure-state";
import { cellLabel } from "../render/letters";

export interface DeriveOptions {
  canvas: FigureCanvas;
}

export function deriveFigure(
  state: FigureState,
  opts: DeriveOptions,
): Figure {
  const panels: HardCodedPanel[] = state.panels.map((p) => {
    const tlIndex = p.row * state.cols + p.col;
    if (p.imageId !== undefined) {
      return {
        row: p.row,
        col: p.col,
        kind: "image" as const,
        imageId: p.imageId,
        rowSpan: p.rowSpan,
        colSpan: p.colSpan,
      };
    }
    return {
      row: p.row,
      col: p.col,
      kind: "placeholder" as const,
      label: cellLabel(tlIndex),
      rowSpan: p.rowSpan,
      colSpan: p.colSpan,
    };
  });
  return {
    canvas: opts.canvas,
    grid: {
      rows: state.rows,
      cols: state.cols,
      gutterPx: state.gutterPx,
      gutterColor: state.gutterColor,
    },
    panels,
  };
}
```

- [ ] **Step 5: Run derivations test**

Run: `pnpm test -- figure-derivations`
Expected: PASS, all 3 tests.

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: errors remaining only in `dispatch-drop.ts`, `GridCells.tsx`, `App.tsx` (Tasks 6–8). The model + derivations should compile.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/model/types.ts src/renderer/model/figure-derivations.ts test/unit/figure-derivations.test.ts
git commit -m "feat(model): deriveFigure emits rowSpan/colSpan from Panel state (M4.4)"
```

---

## Task 6: Update `computePanelRects` for merged panels

**Files:**
- Modify: `src/renderer/render/coords.ts`
- Modify: `test/unit/figure-layout.test.ts`

A merged panel covering `colSpan` cells should occupy *all* the cells' widths *plus* the `(colSpan - 1)` internal gutters that those cells would otherwise have between them. Same for `rowSpan` and heights. This matches the user mental model: "the gutter disappears inside the merged panel, but stays on its outer edges".

Formula:

```
w = colSpan * cellW + (colSpan - 1) * gutterPx + (isLastColInPanelOnLastGridCol ? wRemainder : 0)
h = rowSpan * cellH + (rowSpan - 1) * gutterPx + (isLastRowInPanelOnLastGridRow ? hRemainder : 0)
x = gutterPx + col * (cellW + gutterPx)
y = gutterPx + row * (cellH + gutterPx)
```

Width remainder still goes to the panel that includes the last column; height remainder goes to the panel that includes the last row.

- [ ] **Step 1: Extend the failing test**

Append to `test/unit/figure-layout.test.ts`:

```ts
describe("computePanelRects with merged panels", () => {
  it("a 1x2 merged top-row panel spans the full content width on a 2x2", () => {
    const rects = computePanelRects({
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      grid: { rows: 2, cols: 2, gutterPx: 12, gutterColor: "#FFFFFF" },
      panels: [
        // hero: row 0, col 0..1
        { row: 0, col: 0, kind: "placeholder", label: "A", rowSpan: 1, colSpan: 2 },
        { row: 1, col: 0, kind: "placeholder", label: "C" },
        { row: 1, col: 1, kind: "placeholder", label: "D" },
      ],
    });
    // cellW = (800 - 3*12) / 2 = 382
    // hero w = 2*382 + 1*12 = 776; covers cols 0..1, includes col 1 = last col so remainder absorbed (=0)
    expect(rects).toHaveLength(3);
    expect(rects[0]).toEqual({ x: 12, y: 12, w: 776, h: 282 });
    expect(rects[1]?.x).toBe(12);
    expect(rects[1]?.y).toBe(12 + 282 + 12);
    expect(rects[2]?.x).toBe(12 + 382 + 12);
  });

  it("a 2x1 merged left-col panel spans full content height on a 2x2", () => {
    const rects = computePanelRects({
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      grid: { rows: 2, cols: 2, gutterPx: 12, gutterColor: "#FFFFFF" },
      panels: [
        { row: 0, col: 0, kind: "placeholder", label: "A", rowSpan: 2, colSpan: 1 },
        { row: 0, col: 1, kind: "placeholder", label: "B" },
        { row: 1, col: 1, kind: "placeholder", label: "D" },
      ],
    });
    // cellH = (600 - 3*12) / 2 = 282
    // tall h = 2*282 + 12 = 576
    expect(rects[0]).toEqual({ x: 12, y: 12, w: 382, h: 576 });
  });

  it("treats omitted rowSpan/colSpan as 1", () => {
    const rects = computePanelRects({
      canvas: { widthPx: 100, heightPx: 100, background: "#FFFFFF" },
      grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFFFFF" },
      panels: [{ row: 0, col: 0, kind: "placeholder", label: "A" }],
    });
    expect(rects[0]).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
});
```

- [ ] **Step 2: Run test to verify the new cases fail**

Run: `pnpm test -- figure-layout`
Expected: the three new tests FAIL — current `computePanelRects` ignores `rowSpan`/`colSpan`. Existing test still passes.

- [ ] **Step 3: Replace `coords.ts`**

Overwrite `src/renderer/render/coords.ts` with:

```ts
import type { Figure, HardCodedPanel } from "../model/types";

export interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Computes the integer pixel rectangle for each panel in figure.panels,
 * in the same order. Outer gutter is included on all four edges; internal
 * gutters between merged-panel cells are absorbed into the merged panel.
 *
 * Width remainder distribution: cells get floor(avail/cols); the panel
 * whose right edge sits on the grid's last column absorbs `wRemainder`,
 * so the right edge always lands on `widthPx - gutter`. Same for rows.
 */
export function computePanelRects(figure: Figure): PanelRect[] {
  const { widthPx, heightPx } = figure.canvas;
  const { rows, cols, gutterPx } = figure.grid;

  const availW = widthPx - gutterPx * (cols + 1);
  const availH = heightPx - gutterPx * (rows + 1);
  const cellW = Math.floor(availW / cols);
  const cellH = Math.floor(availH / rows);
  const wRemainder = availW - cellW * cols;
  const hRemainder = availH - cellH * rows;

  return figure.panels.map((p: HardCodedPanel): PanelRect => {
    const rowSpan = p.rowSpan ?? 1;
    const colSpan = p.colSpan ?? 1;
    const lastColInPanel = p.col + colSpan - 1;
    const lastRowInPanel = p.row + rowSpan - 1;

    const baseW = colSpan * cellW + (colSpan - 1) * gutterPx;
    const baseH = rowSpan * cellH + (rowSpan - 1) * gutterPx;
    const w = baseW + (lastColInPanel === cols - 1 ? wRemainder : 0);
    const h = baseH + (lastRowInPanel === rows - 1 ? hRemainder : 0);
    const x = gutterPx + p.col * (cellW + gutterPx);
    const y = gutterPx + p.row * (cellH + gutterPx);
    return { x, y, w, h };
  });
}
```

- [ ] **Step 4: Run all renderer-related tests**

Run: `pnpm test -- figure-layout draw-figure export-png-shape`
Expected: PASS — original 2x2 case still passes, three new merged-panel cases pass, draw-figure unchanged, export shape unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/render/coords.ts test/unit/figure-layout.test.ts
git commit -m "feat(render): computePanelRects spans merged cells, absorbs internal gutters (M4.5)"
```

---

## Task 7: Port `dispatch-drop` to panel ids

**Files:**
- Modify: `src/renderer/dnd/dispatch-drop.ts`
- Modify: `test/unit/dispatch-drop.test.ts`
- Modify: `src/renderer/dnd/drag-payload.ts`

The drag payload now carries a `panelId` (not `row`/`col`) for cell drags. The dispatch function emits the new panel-id reducer actions.

- [ ] **Step 1: Update `drag-payload.ts`**

Overwrite `src/renderer/dnd/drag-payload.ts` with:

```ts
export const DRAG_MIME = "application/x-mosaic-drag";

export type DragPayload =
  | { kind: "tray"; imageId: string }
  | { kind: "panel"; panelId: string };

export function serializeDrag(p: DragPayload): string {
  return JSON.stringify(p);
}

export function parseDrag(raw: string): DragPayload | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.kind === "tray") {
    if (typeof o.imageId !== "string") return null;
    return { kind: "tray", imageId: o.imageId };
  }
  if (o.kind === "panel") {
    if (typeof o.panelId !== "string") return null;
    return { kind: "panel", panelId: o.panelId };
  }
  return null;
}
```

- [ ] **Step 2: Update the drag-payload test**

Overwrite `test/unit/drag-payload.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { parseDrag, serializeDrag } from "../../src/renderer/dnd/drag-payload";

describe("drag-payload", () => {
  it("round-trips a tray drag", () => {
    const p = { kind: "tray" as const, imageId: "abc" };
    expect(parseDrag(serializeDrag(p))).toEqual(p);
  });

  it("round-trips a panel drag", () => {
    const p = { kind: "panel" as const, panelId: "panel-7" };
    expect(parseDrag(serializeDrag(p))).toEqual(p);
  });

  it("rejects malformed JSON", () => {
    expect(parseDrag("not-json")).toBe(null);
  });

  it("rejects unknown kind", () => {
    expect(parseDrag(JSON.stringify({ kind: "ghost" }))).toBe(null);
  });

  it("rejects missing panelId on panel kind", () => {
    expect(parseDrag(JSON.stringify({ kind: "panel" }))).toBe(null);
  });

  it("rejects non-string imageId on tray kind", () => {
    expect(parseDrag(JSON.stringify({ kind: "tray", imageId: 7 }))).toBe(null);
  });
});
```

- [ ] **Step 3: Run drag-payload test**

Run: `pnpm test -- drag-payload`
Expected: PASS, all 6 tests.

- [ ] **Step 4: Replace dispatch-drop test**

Overwrite `test/unit/dispatch-drop.test.ts` with:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  initialFigureState,
  figureReducer,
  __resetPanelIdsForTests,
  type FigureState,
} from "../../src/renderer/model/figure-state";
import { addToPool, placeIntoPanel } from "../../src/renderer/model/figure-actions";
import { findPanelAt } from "../../src/renderer/model/panels";
import { dispatchDrop } from "../../src/renderer/dnd/dispatch-drop";
import type { ImagePoolItem } from "../../src/renderer/model/pool";

const IMG_A: ImagePoolItem = {
  id: "a", filename: "a.png", filePath: "/x", mime: "image/png", width: 1, height: 1,
};
const IMG_B: ImagePoolItem = {
  id: "b", filename: "b.png", filePath: "/x", mime: "image/png", width: 1, height: 1,
};

function panelIdAt(s: FigureState, row: number, col: number): string {
  const p = findPanelAt(s.panels, row, col);
  if (p === null) throw new Error("no panel");
  return p.id;
}

describe("dispatchDrop", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  it("tray → empty panel emits PLACE_INTO_PANEL", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    const pid = panelIdAt(s, 0, 0);
    const action = dispatchDrop(s, {
      from: { kind: "tray", imageId: "a" },
      targetPanelId: pid,
    });
    expect(action).toEqual({ type: "PLACE_INTO_PANEL", imageId: "a", panelId: pid });
  });

  it("tray → occupied panel emits REPLACE_INTO_PANEL", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    s = figureReducer(s, addToPool(IMG_B));
    const pid = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", pid));
    const action = dispatchDrop(s, {
      from: { kind: "tray", imageId: "b" },
      targetPanelId: pid,
    });
    expect(action).toEqual({
      type: "REPLACE_INTO_PANEL",
      imageId: "b",
      panelId: pid,
    });
  });

  it("tray drop with already-placed image is no-op", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 0, 1);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const action = dispatchDrop(s, {
      from: { kind: "tray", imageId: "a" },
      targetPanelId: p2,
    });
    expect(action).toBe(null);
  });

  it("panel → other panel emits SWAP_PANELS", () => {
    let s = initialFigureState();
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 1, 1);
    const action = dispatchDrop(s, {
      from: { kind: "panel", panelId: p1 },
      targetPanelId: p2,
    });
    expect(action).toEqual({ type: "SWAP_PANELS", aPanelId: p1, bPanelId: p2 });
  });

  it("panel → same panel is no-op", () => {
    const s = initialFigureState();
    const p1 = panelIdAt(s, 0, 0);
    const action = dispatchDrop(s, {
      from: { kind: "panel", panelId: p1 },
      targetPanelId: p1,
    });
    expect(action).toBe(null);
  });
});
```

- [ ] **Step 5: Run dispatch-drop test (will fail — wrong signature)**

Run: `pnpm test -- dispatch-drop`
Expected: FAIL — `dispatchDrop` still expects `target: CellCoord`.

- [ ] **Step 6: Replace `dispatch-drop.ts`**

Overwrite `src/renderer/dnd/dispatch-drop.ts` with:

```ts
import type { FigureState } from "../model/figure-state";
import {
  placeIntoPanel,
  replaceIntoPanel,
  swapPanels,
  type FigureAction,
} from "../model/figure-actions";
import type { DragPayload } from "./drag-payload";

export interface DropEvent {
  from: DragPayload;
  targetPanelId: string;
}

export function dispatchDrop(
  state: FigureState,
  ev: DropEvent,
): FigureAction | null {
  const target = state.panels.find((p) => p.id === ev.targetPanelId);
  if (target === undefined) return null;

  if (ev.from.kind === "panel") {
    if (ev.from.panelId === ev.targetPanelId) return null;
    return swapPanels(ev.from.panelId, ev.targetPanelId);
  }

  // Tray drop: refuse if the image is already placed somewhere.
  if (state.panels.some((p) => p.imageId === ev.from.imageId)) return null;

  if (target.imageId !== undefined) {
    return replaceIntoPanel(ev.from.imageId, ev.targetPanelId);
  }
  return placeIntoPanel(ev.from.imageId, ev.targetPanelId);
}
```

- [ ] **Step 7: Run dispatch-drop test**

Run: `pnpm test -- dispatch-drop`
Expected: PASS, all 5 tests.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/dnd/drag-payload.ts test/unit/drag-payload.test.ts src/renderer/dnd/dispatch-drop.ts test/unit/dispatch-drop.test.ts
git commit -m "feat(dnd): drag/drop keys on panel ids instead of cell coords (M4.6)"
```

---

## Task 8: Update `GridCells.tsx` to render one drop target per panel

**Files:**
- Modify: `src/renderer/components/Grid/GridCells.tsx`

The overlay now renders one absolutely-positioned `<div>` per **panel** (not per cell). A merged 1×2 panel produces one drop target spanning two cells. Selection (for merge) happens on a separate, finer-grained overlay drawn behind the drop targets — see Task 9.

- [ ] **Step 1: Replace `GridCells.tsx`**

Overwrite `src/renderer/components/Grid/GridCells.tsx` with:

```tsx
import { useState } from "react";
import type { FigureState } from "../../model/figure-state";
import { computePanelRects } from "../../render/coords";
import {
  DRAG_MIME,
  parseDrag,
  serializeDrag,
  type DragPayload,
} from "../../dnd/drag-payload";

export interface DropEvent {
  from: DragPayload;
  targetPanelId: string;
}

interface Props {
  state: FigureState;
  /** Figure pixel dimensions (used to compute panel rects). */
  figurePxW: number;
  figurePxH: number;
  /** Wrapper's actual rendered CSS width/height in px. */
  cssW: number;
  cssH: number;
  onDrop: (e: DropEvent) => void;
}

export function GridCells({
  state,
  figurePxW,
  figurePxH,
  cssW,
  cssH,
  onDrop,
}: Props): JSX.Element {
  const [hoverPanelId, setHoverPanelId] = useState<string | null>(null);

  // Build a Figure-shaped object purely for layout. We map state.panels
  // (which already carry rowSpan/colSpan) directly so rect computation
  // matches the rendered figure exactly.
  const rects = computePanelRects({
    canvas: { widthPx: figurePxW, heightPx: figurePxH, background: "#000" },
    grid: {
      rows: state.rows,
      cols: state.cols,
      gutterPx: state.gutterPx,
      gutterColor: state.gutterColor,
    },
    panels: state.panels.map((p) => ({
      row: p.row,
      col: p.col,
      kind: "placeholder" as const,
      label: "",
      rowSpan: p.rowSpan,
      colSpan: p.colSpan,
    })),
  });

  const sx = cssW / figurePxW;
  const sy = cssH / figurePxH;

  return (
    <div
      data-testid="grid-overlay"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {state.panels.map((panel, i) => {
        const r = rects[i];
        if (r === undefined) return null;
        const occupied = panel.imageId !== undefined;

        function onDragOver(e: React.DragEvent<HTMLDivElement>): void {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (hoverPanelId !== panel.id) setHoverPanelId(panel.id);
        }
        function onDragLeave(): void {
          if (hoverPanelId === panel.id) setHoverPanelId(null);
        }
        function onDropEvt(e: React.DragEvent<HTMLDivElement>): void {
          e.preventDefault();
          setHoverPanelId(null);
          const raw = e.dataTransfer.getData(DRAG_MIME);
          const from = parseDrag(raw);
          if (from === null) return;
          onDrop({ from, targetPanelId: panel.id });
        }
        function onDragStart(e: React.DragEvent<HTMLDivElement>): void {
          if (!occupied) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData(
            DRAG_MIME,
            serializeDrag({ kind: "panel", panelId: panel.id }),
          );
          e.dataTransfer.effectAllowed = "move";
        }

        return (
          <div
            key={panel.id}
            draggable={occupied}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDropEvt}
            data-testid={`panel-${panel.row}-${panel.col}`}
            data-panel-id={panel.id}
            style={{
              position: "absolute",
              left: r.x * sx,
              top: r.y * sy,
              width: r.w * sx,
              height: r.h * sy,
              pointerEvents: "auto",
              cursor: occupied ? "grab" : "default",
              outline:
                hoverPanelId === panel.id
                  ? "3px solid #4C9AFF"
                  : "1px dashed transparent",
              outlineOffset: -2,
              transition: "outline-color 80ms ease",
              boxSizing: "border-box",
            }}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Run all tests**

Run: `pnpm test`
Expected: PASS — `GridCells.tsx` has no unit tests (manual test in Task 13). All other tests still green.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/Grid/GridCells.tsx
git commit -m "feat(ui): GridCells renders one drop target per panel (M4.7)"
```

---

## Task 9: Merge selection — pure logic + hook

**Files:**
- Create: `src/renderer/model/merge.ts`
- Create: `src/renderer/hooks/useMergeSelection.ts`
- Test: `test/unit/merge.test.ts`

`canMergeSelection` validates a multi-selected set of cell coords against the current `panels` array. `mergePanels`/`unmergePanel` mutate the panels array in pure form. The reducer's `MERGE_CELLS`/`UNMERGE_PANEL` actions (Task 10) just call these.

- [ ] **Step 1: Write the failing test**

Create `test/unit/merge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Panel } from "../../src/renderer/model/panels";
import {
  canMergeSelection,
  mergePanels,
  unmergePanel,
  type Rect,
} from "../../src/renderer/model/merge";
import { assertPanelsCoverGrid } from "../../src/renderer/model/panels";

const def = (
  id: string,
  row: number,
  col: number,
  rowSpan = 1,
  colSpan = 1,
  imageId?: string,
): Panel => {
  const p: Panel = { id, row, col, rowSpan, colSpan };
  if (imageId !== undefined) p.imageId = imageId;
  return p;
};

const grid2x2: Panel[] = [
  def("a", 0, 0),
  def("b", 0, 1),
  def("c", 1, 0),
  def("d", 1, 1),
];

describe("canMergeSelection", () => {
  it("accepts a contiguous 1x2 rectangle of 1x1 panels", () => {
    const r = canMergeSelection(grid2x2, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rect).toEqual({ row: 0, col: 0, rowSpan: 1, colSpan: 2 });
  });

  it("accepts a 2x2 rectangle", () => {
    const r = canMergeSelection(grid2x2, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rect.rowSpan * r.rect.colSpan).toBe(4);
  });

  it("rejects fewer than 2 cells", () => {
    const r = canMergeSelection(grid2x2, [{ row: 0, col: 0 }]);
    expect(r.ok).toBe(false);
  });

  it("rejects an L-shape", () => {
    const r = canMergeSelection(grid2x2, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects when any cell already belongs to a merged panel", () => {
    const ps: Panel[] = [
      def("hero", 0, 0, 1, 2),
      def("c", 1, 0),
      def("d", 1, 1),
    ];
    const r = canMergeSelection(ps, [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
    ]);
    expect(r.ok).toBe(false);
  });
});

describe("mergePanels", () => {
  it("replaces 1x1 cells in a rect with one merged panel; keeps top-left's image", () => {
    const ps: Panel[] = [
      def("a", 0, 0, 1, 1, "imgA"),
      def("b", 0, 1, 1, 1, "imgB"),
      def("c", 1, 0),
      def("d", 1, 1),
    ];
    const rect: Rect = { row: 0, col: 0, rowSpan: 1, colSpan: 2 };
    const out = mergePanels(ps, rect);
    assertPanelsCoverGrid(out, 2, 2);
    expect(out).toHaveLength(3);
    const merged = out.find((p) => p.rowSpan * p.colSpan > 1);
    expect(merged?.imageId).toBe("imgA");
  });

  it("releases imageIds of non-top-left cells (caller handles tray re-entry)", () => {
    // mergePanels is pure — it does not return released ids; the caller
    // (reducer) computes them by diffing. This test simply asserts the
    // new merged panel only carries the top-left image.
    const ps: Panel[] = [
      def("a", 0, 0, 1, 1, "imgA"),
      def("b", 0, 1, 1, 1, "imgB"),
      def("c", 1, 0),
      def("d", 1, 1),
    ];
    const out = mergePanels(ps, { row: 0, col: 0, rowSpan: 1, colSpan: 2 });
    const merged = out.find((p) => p.colSpan === 2);
    expect(merged?.imageId).toBe("imgA");
    // imgB no longer appears anywhere in the panels array.
    expect(out.some((p) => p.imageId === "imgB")).toBe(false);
  });
});

describe("unmergePanel", () => {
  it("splits a merged panel into 1x1s; top-left keeps the image", () => {
    const ps: Panel[] = [
      def("hero", 0, 0, 1, 2, "imgHero"),
      def("c", 1, 0),
      def("d", 1, 1),
    ];
    const out = unmergePanel(ps, "hero");
    assertPanelsCoverGrid(out, 2, 2);
    const at00 = out.find((p) => p.row === 0 && p.col === 0);
    const at01 = out.find((p) => p.row === 0 && p.col === 1);
    expect(at00?.rowSpan).toBe(1);
    expect(at00?.imageId).toBe("imgHero");
    expect(at01?.imageId).toBeUndefined();
  });

  it("is a no-op on an already-1x1 panel", () => {
    const ps: Panel[] = [
      def("a", 0, 0),
      def("b", 0, 1),
      def("c", 1, 0),
      def("d", 1, 1),
    ];
    const out = unmergePanel(ps, "a");
    expect(out).toEqual(ps);
  });

  it("returns input unchanged if panelId not found", () => {
    const out = unmergePanel(grid2x2, "ghost");
    expect(out).toBe(grid2x2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- merge.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `merge.ts`**

Create `src/renderer/model/merge.ts`:

```ts
import type { Panel } from "./panels";
import { findPanelAt } from "./panels";

export interface CellCoord {
  row: number;
  col: number;
}
export interface Rect {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

export type MergeCheck =
  | { ok: true; rect: Rect }
  | { ok: false; reason: string };

let __mergeIdCounter = 0;
function freshId(): string {
  __mergeIdCounter += 1;
  return `panel-merge-${__mergeIdCounter}`;
}

/**
 * Validates that a selection of cell coords (a) contains at least 2 cells,
 * (b) forms a contiguous rectangle, (c) every cell maps to a 1×1 panel
 * (no merged panels inside the selection — user must unmerge first).
 */
export function canMergeSelection(
  panels: readonly Panel[],
  selection: readonly CellCoord[],
): MergeCheck {
  if (selection.length < 2) return { ok: false, reason: "select at least 2 cells" };

  let minRow = Infinity, maxRow = -Infinity, minCol = Infinity, maxCol = -Infinity;
  for (const c of selection) {
    if (c.row < minRow) minRow = c.row;
    if (c.row > maxRow) maxRow = c.row;
    if (c.col < minCol) minCol = c.col;
    if (c.col > maxCol) maxCol = c.col;
  }
  const rowSpan = maxRow - minRow + 1;
  const colSpan = maxCol - minCol + 1;
  if (rowSpan * colSpan !== selection.length) {
    return { ok: false, reason: "selection is not a filled rectangle" };
  }
  // Dedup check + coverage check.
  const seen = new Set<string>();
  for (const c of selection) {
    const k = `${c.row},${c.col}`;
    if (seen.has(k)) return { ok: false, reason: "duplicate cell in selection" };
    seen.add(k);
    const p = findPanelAt(panels, c.row, c.col);
    if (p === null) return { ok: false, reason: "cell out of grid" };
    if (p.rowSpan !== 1 || p.colSpan !== 1) {
      return { ok: false, reason: "cell already in a merged panel" };
    }
  }
  return {
    ok: true,
    rect: { row: minRow, col: minCol, rowSpan, colSpan },
  };
}

/**
 * Replace every panel inside `rect` with one merged panel. The new panel's
 * imageId is the imageId of the panel currently at `rect.row,rect.col`
 * (top-left); other cells' images are dropped (the reducer's caller must
 * track this and release them back to the unplaced tray section by NOT
 * removing them from the pool).
 *
 * Pure: returns a new array; does not mutate input.
 */
export function mergePanels(panels: readonly Panel[], rect: Rect): Panel[] {
  const inside = (p: Panel): boolean =>
    p.row >= rect.row &&
    p.col >= rect.col &&
    p.row + p.rowSpan <= rect.row + rect.rowSpan &&
    p.col + p.colSpan <= rect.col + rect.colSpan;

  const tlImage = findPanelAt(panels, rect.row, rect.col)?.imageId;
  const merged: Panel = {
    id: freshId(),
    row: rect.row,
    col: rect.col,
    rowSpan: rect.rowSpan,
    colSpan: rect.colSpan,
  };
  if (tlImage !== undefined) merged.imageId = tlImage;

  const out = panels.filter((p) => !inside(p));
  out.push(merged);
  out.sort((a, b) => a.row - b.row || a.col - b.col);
  return out;
}

/**
 * Replace one merged panel with rowSpan*colSpan 1x1 panels. The merged
 * panel's imageId (if any) goes to the top-left cell. No-op on a 1x1.
 */
export function unmergePanel(
  panels: readonly Panel[],
  panelId: string,
): Panel[] {
  const target = panels.find((p) => p.id === panelId);
  if (target === undefined) return panels as Panel[];
  if (target.rowSpan === 1 && target.colSpan === 1) return panels as Panel[];

  const out = panels.filter((p) => p.id !== panelId);
  for (let r = target.row; r < target.row + target.rowSpan; r++) {
    for (let c = target.col; c < target.col + target.colSpan; c++) {
      const p: Panel = { id: freshId(), row: r, col: c, rowSpan: 1, colSpan: 1 };
      if (r === target.row && c === target.col && target.imageId !== undefined) {
        p.imageId = target.imageId;
      }
      out.push(p);
    }
  }
  out.sort((a, b) => a.row - b.row || a.col - b.col);
  return out;
}
```

- [ ] **Step 4: Run test**

Run: `pnpm test -- merge.test`
Expected: PASS, all 9 tests.

- [ ] **Step 5: Implement `useMergeSelection` hook**

Create `src/renderer/hooks/useMergeSelection.ts`:

```ts
import { useCallback, useState } from "react";
import { cellKey } from "../model/figure-state";

export interface MergeSelection {
  selected: ReadonlySet<string>;
  isSelected: (row: number, col: number) => boolean;
  toggle: (row: number, col: number) => void;
  clear: () => void;
  asCoords: () => { row: number; col: number }[];
}

export function useMergeSelection(): MergeSelection {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((row: number, col: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = cellKey(row, col);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback(
    (row: number, col: number) => selected.has(cellKey(row, col)),
    [selected],
  );

  const asCoords = useCallback(() => {
    return Array.from(selected).map((k) => {
      const [r, c] = k.split(",").map(Number);
      return { row: r ?? 0, col: c ?? 0 };
    });
  }, [selected]);

  return { selected, isSelected, toggle, clear, asCoords };
}
```

- [ ] **Step 6: Type-check**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/model/merge.ts test/unit/merge.test.ts src/renderer/hooks/useMergeSelection.ts
git commit -m "feat(model): canMergeSelection + mergePanels/unmergePanel + selection hook (M4.8)"
```

---

## Task 10: MERGE_CELLS / UNMERGE_PANEL reducer actions

**Files:**
- Modify: `src/renderer/model/figure-actions.ts`
- Modify: `test/unit/figure-actions.test.ts`

The reducer composes the pure `mergePanels`/`unmergePanel` from Task 9.

- [ ] **Step 1: Append failing tests**

Append to `test/unit/figure-actions.test.ts` (inside the `describe`):

```ts
  it("MERGE_CELLS merges a contiguous rectangle of 1x1 panels", () => {
    let s = initialFigureState();
    s = figureReducer(s, {
      type: "MERGE_CELLS",
      cells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    } as const);
    expect(s.panels).toHaveLength(3);
    const merged = s.panels.find((p) => p.colSpan === 2);
    expect(merged?.row).toBe(0);
    expect(merged?.col).toBe(0);
    expect(merged?.rowSpan).toBe(1);
  });

  it("MERGE_CELLS is a no-op on an L-shape", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, {
      type: "MERGE_CELLS",
      cells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 0 },
      ],
    } as const);
    expect(s1).toBe(s0);
  });

  it("UNMERGE_PANEL splits a merged panel back to 1x1s", () => {
    let s = initialFigureState();
    s = figureReducer(s, {
      type: "MERGE_CELLS",
      cells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    } as const);
    const merged = s.panels.find((p) => p.colSpan === 2);
    if (merged === undefined) throw new Error("expected merged");
    s = figureReducer(s, {
      type: "UNMERGE_PANEL",
      panelId: merged.id,
    } as const);
    expect(s.panels).toHaveLength(4);
    expect(s.panels.every((p) => p.rowSpan === 1 && p.colSpan === 1)).toBe(true);
  });

  it("UNMERGE_PANEL is a no-op on an unknown panelId", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, {
      type: "UNMERGE_PANEL",
      panelId: "ghost",
    } as const);
    expect(s1).toBe(s0);
  });
```

Also extend the imports at the top to include the new action creators (added in step 3 below):

```ts
import {
  addToPool,
  placeIntoPanel,
  swapPanels,
  replaceIntoPanel,
  removeFromPool,
  mergeCells,
  unmergePanelAction,
} from "../../src/renderer/model/figure-actions";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- figure-actions`
Expected: FAIL — `mergeCells`/`unmergePanelAction` not exported.

- [ ] **Step 3: Extend `figure-actions.ts`**

Open `src/renderer/model/figure-actions.ts`. Add to imports:

```ts
import { canMergeSelection, mergePanels, unmergePanel, type CellCoord } from "./merge";
```

Extend the `FigureAction` union with two new variants (after the existing ones):

```ts
  | { type: "MERGE_CELLS"; cells: CellCoord[] }
  | { type: "UNMERGE_PANEL"; panelId: string };
```

Add action creators:

```ts
export const mergeCells = (cells: CellCoord[]): FigureAction => ({
  type: "MERGE_CELLS",
  cells,
});
export const unmergePanelAction = (panelId: string): FigureAction => ({
  type: "UNMERGE_PANEL",
  panelId,
});
```

Add two switch branches inside `figureReducer`:

```ts
    case "MERGE_CELLS": {
      const check = canMergeSelection(s.panels, a.cells);
      if (!check.ok) return s;
      return { ...s, panels: mergePanels(s.panels, check.rect) };
    }

    case "UNMERGE_PANEL": {
      const next = unmergePanel(s.panels, a.panelId);
      if (next === s.panels) return s;
      return { ...s, panels: next };
    }
```

- [ ] **Step 4: Run reducer tests**

Run: `pnpm test -- figure-actions`
Expected: PASS — original 16 + 4 new = 20.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/model/figure-actions.ts test/unit/figure-actions.test.ts
git commit -m "feat(model): MERGE_CELLS / UNMERGE_PANEL reducer actions (M4.9)"
```

---

## Task 11: GridControls + MergeControls UI components

**Files:**
- Create: `src/renderer/components/Toolbar/GridControls.tsx`
- Create: `src/renderer/components/Toolbar/MergeControls.tsx`

Pure presentational components; their callbacks are wired in `App.tsx` (Task 13). No unit tests — these are thin styling wrappers and exercised manually.

- [ ] **Step 1: Create `GridControls.tsx`**

Create `src/renderer/components/Toolbar/GridControls.tsx`:

```tsx
interface Props {
  rows: number;
  cols: number;
  gutterPx: number;
  gutterColor: string;
  onChangeRows: (rows: number) => void;
  onChangeCols: (cols: number) => void;
  onChangeGutterPx: (px: number) => void;
  onChangeGutterColor: (color: string) => void;
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#666",
  marginRight: 4,
};
const fieldStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
};

export function GridControls({
  rows,
  cols,
  gutterPx,
  gutterColor,
  onChangeRows,
  onChangeCols,
  onChangeGutterPx,
  onChangeGutterColor,
}: Props): JSX.Element {
  return (
    <div
      data-testid="grid-controls"
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: "0 8px",
        borderLeft: "1px solid #DDD",
      }}
    >
      <div style={fieldStyle}>
        <span style={labelStyle}>Rows</span>
        <input
          type="number"
          min={1}
          max={10}
          value={rows}
          onChange={(e) => onChangeRows(Number(e.target.value))}
          style={{ width: 48 }}
          data-testid="grid-rows-input"
        />
      </div>
      <div style={fieldStyle}>
        <span style={labelStyle}>Cols</span>
        <input
          type="number"
          min={1}
          max={10}
          value={cols}
          onChange={(e) => onChangeCols(Number(e.target.value))}
          style={{ width: 48 }}
          data-testid="grid-cols-input"
        />
      </div>
      <div style={fieldStyle}>
        <span style={labelStyle}>Gutter</span>
        <input
          type="number"
          min={0}
          max={40}
          value={gutterPx}
          onChange={(e) => onChangeGutterPx(Number(e.target.value))}
          style={{ width: 48 }}
          data-testid="gutter-px-input"
        />
        <span style={{ fontSize: 11, color: "#999" }}>px</span>
      </div>
      <div style={fieldStyle}>
        <span style={labelStyle}>Color</span>
        <input
          type="color"
          value={gutterColor.length === 7 ? gutterColor : "#FFFFFF"}
          onChange={(e) => onChangeGutterColor(e.target.value.toUpperCase())}
          style={{ width: 32, height: 22, border: "1px solid #DDD" }}
          data-testid="gutter-color-input"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `MergeControls.tsx`**

Create `src/renderer/components/Toolbar/MergeControls.tsx`:

```tsx
interface Props {
  canMerge: boolean;
  canUnmerge: boolean;
  onMerge: () => void;
  onUnmerge: () => void;
}

export function MergeControls({
  canMerge,
  canUnmerge,
  onMerge,
  onUnmerge,
}: Props): JSX.Element {
  return (
    <div
      data-testid="merge-controls"
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        paddingLeft: 8,
        borderLeft: "1px solid #DDD",
      }}
    >
      <button
        type="button"
        onClick={onMerge}
        disabled={!canMerge}
        title="Merge selected cells (M)"
        data-testid="merge-button"
        style={{ padding: "4px 8px" }}
      >
        Merge
      </button>
      <button
        type="button"
        onClick={onUnmerge}
        disabled={!canUnmerge}
        title="Unmerge focused panel (U)"
        data-testid="unmerge-button"
        style={{ padding: "4px 8px" }}
      >
        Unmerge
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/Toolbar/GridControls.tsx src/renderer/components/Toolbar/MergeControls.tsx
git commit -m "feat(ui): GridControls + MergeControls toolbar components (M4.10)"
```

---

## Task 12: Keyboard shortcuts hook (M, U, Escape)

**Files:**
- Create: `src/renderer/hooks/useKeyboardShortcuts.ts`

`M` triggers merge; `U` triggers unmerge; `Escape` clears the merge selection. The hook ignores keys when focus is in an `<input>`, `<textarea>`, or contenteditable to keep the gutter inputs typeable.

- [ ] **Step 1: Implement**

Create `src/renderer/hooks/useKeyboardShortcuts.ts`:

```ts
import { useEffect } from "react";

export interface ShortcutHandlers {
  onMerge: () => void;
  onUnmerge: () => void;
  onEscape: () => void;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function useKeyboardShortcuts(h: ShortcutHandlers): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        h.onMerge();
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        h.onUnmerge();
      } else if (e.key === "Escape") {
        h.onEscape();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [h]);
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/hooks/useKeyboardShortcuts.ts
git commit -m "feat(ui): keyboard shortcuts hook for M/U/Escape (M4.11)"
```

---

## Task 13: Wire GridControls + MergeControls + selection overlay in `App.tsx`

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/Grid/GridCells.tsx` (add a selection overlay layer)

Two visible changes in the UI:
- Header gains the `GridControls` and `MergeControls` rows.
- The grid overlay gains a per-cell selection layer behind the per-panel drop layer. Shift-click a cell to toggle it in/out of the merge selection (with a visible selection ring).

Logic: enable `Merge` only when `canMergeSelection(state.panels, selection)` returns `ok`. Enable `Unmerge` only when there is a focused panel and it's >1×1. For M4 we'll define "focused panel" as **the panel under the most recent click**, tracked in component state.

- [ ] **Step 1: Add a per-cell selection layer to `GridCells.tsx`**

Open `src/renderer/components/Grid/GridCells.tsx`. Add new props and a second mapped layer.

Update the `Props` interface to:

```ts
interface Props {
  state: FigureState;
  figurePxW: number;
  figurePxH: number;
  cssW: number;
  cssH: number;
  onDrop: (e: DropEvent) => void;
  /** Per-cell merge selection. Shift-click toggles. */
  selection: ReadonlySet<string>;
  onCellShiftClick: (row: number, col: number) => void;
  /** Tracks "focused panel" for the Unmerge action. */
  focusedPanelId: string | null;
  onPanelClick: (panelId: string) => void;
}
```

Add this just after the imports:

```ts
import { cellKey } from "../../model/figure-state";
```

Inside the returned JSX, add a new sibling `<div>` *before* the existing panels mapping. This sibling renders a fine-grained per-cell layer used only for shift-click selection (and visual selection rings):

```tsx
      {/* Selection layer — one box per cell, shift-click to toggle.
          Sits underneath the per-panel drop layer; only handles shift-click. */}
      {Array.from({ length: state.rows * state.cols }).map((_, idx) => {
        const row = Math.floor(idx / state.cols);
        const col = idx % state.cols;
        const k = cellKey(row, col);
        const sel = selection.has(k);

        // Compute single-cell rect inline, so this layer doesn't need the panels.
        const availW = figurePxW - state.gutterPx * (state.cols + 1);
        const availH = figurePxH - state.gutterPx * (state.rows + 1);
        const cellW = Math.floor(availW / state.cols);
        const cellH = Math.floor(availH / state.rows);
        const x = state.gutterPx + col * (cellW + state.gutterPx);
        const y = state.gutterPx + row * (cellH + state.gutterPx);

        function onClick(e: React.MouseEvent<HTMLDivElement>): void {
          if (!e.shiftKey) return;
          // Shift-click toggles selection; stop propagation so the panel
          // layer's onClick (which handles "focus this panel") does not fire.
          e.stopPropagation();
          onCellShiftClick(row, col);
        }

        return (
          <div
            key={`sel-${k}`}
            onClick={onClick}
            data-testid={`cell-sel-${row}-${col}`}
            style={{
              position: "absolute",
              left: x * sx,
              top: y * sy,
              width: cellW * sx,
              height: cellH * sy,
              pointerEvents: "auto",
              boxSizing: "border-box",
              outline: sel
                ? "2px solid #FFC400"
                : "1px dashed transparent",
              outlineOffset: -2,
              background: sel ? "rgba(255,196,0,0.10)" : "transparent",
              transition: "outline-color 80ms ease, background 80ms ease",
            }}
          />
        );
      })}
```

In the existing per-panel mapping, add an `onClick` handler that calls `onPanelClick(panel.id)` (without shift, so the selection layer's `stopPropagation` keeps shift-clicks out of focus). Add to the panel `<div>` props:

```tsx
            onClick={() => onPanelClick(panel.id)}
            data-focused={focusedPanelId === panel.id ? "true" : undefined}
```

And tweak the outline rule to also highlight focused panels:

```ts
              outline:
                hoverPanelId === panel.id
                  ? "3px solid #4C9AFF"
                  : focusedPanelId === panel.id
                    ? "2px solid #00875A"
                    : "1px dashed transparent",
```

- [ ] **Step 2: Update `App.tsx`**

Overwrite `src/renderer/App.tsx` with:

```tsx
import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { EditorCanvas } from "./components/Canvas/EditorCanvas";
import { ExportButton } from "./components/Toolbar/ExportButton";
import { GridControls } from "./components/Toolbar/GridControls";
import { MergeControls } from "./components/Toolbar/MergeControls";
import { Tray } from "./components/Sidebar/Tray";
import { GridCells, type DropEvent } from "./components/Grid/GridCells";
import {
  initialFigureState,
  type FigureState,
} from "./model/figure-state";
import {
  addToPool,
  figureReducer,
  resizeGrid,
  setGutterPx,
  setGutterColor,
  mergeCells,
  unmergePanelAction,
} from "./model/figure-actions";
import { newImageId, type ImagePoolItem } from "./model/pool";
import { deriveFigure } from "./model/figure-derivations";
import { decodeImageBytes } from "./image/decode-bytes";
import { dispatchDrop } from "./dnd/dispatch-drop";
import { canMergeSelection } from "./model/merge";
import { useMergeSelection } from "./hooks/useMergeSelection";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

const FIGURE_PX_W = 800;
const FIGURE_PX_H = 600;
const CANVAS_BG = "#FFFFFF";
const CANVAS_CSS_W = 800;
const CANVAS_CSS_H = 600;

function basename(p: string): string {
  const ix = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return ix >= 0 ? p.slice(ix + 1) : p;
}

export function App(): JSX.Element {
  const [state, dispatch] = useReducer(figureReducer, undefined, () =>
    initialFigureState(),
  );
  const [bitmaps, setBitmaps] = useState<Map<string, ImageBitmap>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [focusedPanelId, setFocusedPanelId] = useState<string | null>(null);
  const stateRef = useRef<FigureState>(state);
  stateRef.current = state;

  const selection = useMergeSelection();

  const figure = useMemo(
    () =>
      deriveFigure(state, {
        canvas: {
          widthPx: FIGURE_PX_W,
          heightPx: FIGURE_PX_H,
          background: CANVAS_BG,
        },
      }),
    [state],
  );

  const placedIds = useMemo(
    () =>
      new Set(
        state.panels
          .map((p) => p.imageId)
          .filter((x): x is string => x !== undefined),
      ),
    [state.panels],
  );

  const onAddImagesClick = useCallback(async (): Promise<void> => {
    setError(null);
    let result;
    try {
      result = await window.api.openImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (result.canceled) return;
    for (const f of result.files) {
      let bm: ImageBitmap;
      try {
        bm = await decodeImageBytes(f.bytes, f.mime);
      } catch (err) {
        setError(
          `decode failed for ${f.filePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }
      const item: ImagePoolItem = {
        id: newImageId(),
        filename: basename(f.filePath),
        filePath: f.filePath,
        mime: f.mime,
        width: bm.width,
        height: bm.height,
      };
      setBitmaps((prev) => {
        const next = new Map(prev);
        next.set(item.id, bm);
        return next;
      });
      dispatch(addToPool(item));
    }
  }, []);

  const onDrop = useCallback((ev: DropEvent): void => {
    const action = dispatchDrop(stateRef.current, ev);
    if (action !== null) dispatch(action);
  }, []);

  const onMerge = useCallback(() => {
    const cells = selection.asCoords();
    const check = canMergeSelection(stateRef.current.panels, cells);
    if (!check.ok) return;
    dispatch(mergeCells(cells));
    selection.clear();
  }, [selection]);

  const onUnmerge = useCallback(() => {
    if (focusedPanelId === null) return;
    const p = stateRef.current.panels.find((x) => x.id === focusedPanelId);
    if (p === undefined) return;
    if (p.rowSpan === 1 && p.colSpan === 1) return;
    dispatch(unmergePanelAction(focusedPanelId));
  }, [focusedPanelId]);

  useKeyboardShortcuts({
    onMerge,
    onUnmerge,
    onEscape: selection.clear,
  });

  const canMerge = useMemo(() => {
    const check = canMergeSelection(state.panels, selection.asCoords());
    return check.ok;
  }, [state.panels, selection]);

  const focusedPanel = focusedPanelId
    ? state.panels.find((p) => p.id === focusedPanelId)
    : undefined;
  const canUnmerge =
    focusedPanel !== undefined &&
    (focusedPanel.rowSpan > 1 || focusedPanel.colSpan > 1);

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        height: "100vh",
        margin: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: 8,
          borderBottom: "1px solid #DDD",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 16 }}>Mosaic Builder</h1>
        <ExportButton figure={figure} images={bitmaps} />
        <GridControls
          rows={state.rows}
          cols={state.cols}
          gutterPx={state.gutterPx}
          gutterColor={state.gutterColor}
          onChangeRows={(rows) => dispatch(resizeGrid(rows, state.cols))}
          onChangeCols={(cols) => dispatch(resizeGrid(state.rows, cols))}
          onChangeGutterPx={(px) => dispatch(setGutterPx(px))}
          onChangeGutterColor={(c) => dispatch(setGutterColor(c))}
        />
        <MergeControls
          canMerge={canMerge}
          canUnmerge={canUnmerge}
          onMerge={onMerge}
          onUnmerge={onUnmerge}
        />
        {error !== null && (
          <span style={{ color: "#B00", fontSize: 12 }}>{error}</span>
        )}
      </header>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Tray
          pool={state.pool}
          bitmaps={bitmaps}
          placedIds={placedIds}
          onAddImagesClick={() => {
            void onAddImagesClick();
          }}
        />
        <section
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: 16,
            overflow: "auto",
          }}
        >
          <div
            style={{
              position: "relative",
              width: CANVAS_CSS_W,
              height: CANVAS_CSS_H,
            }}
          >
            <EditorCanvas figure={figure} images={bitmaps} />
            <GridCells
              state={state}
              figurePxW={FIGURE_PX_W}
              figurePxH={FIGURE_PX_H}
              cssW={CANVAS_CSS_W}
              cssH={CANVAS_CSS_H}
              onDrop={onDrop}
              selection={selection.selected}
              onCellShiftClick={selection.toggle}
              focusedPanelId={focusedPanelId}
              onPanelClick={setFocusedPanelId}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 4: Run all tests**

Run: `pnpm test`
Expected: PASS — every test from M2/M3/M4 still green.

- [ ] **Step 5: Run the lint**

Run: `pnpm lint`
Expected: PASS, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/Grid/GridCells.tsx
git commit -m "feat(ui): wire grid + merge controls; selection overlay; M/U shortcuts (M4.12)"
```

---

## Task 14: Manual smoke test + final demo recording

**Files:** none — this task is verification only.

The source plan calls for "a recorded GIF and a manual-test checklist that passes" at every milestone end. Run the dev app, work through this checklist, fix anything broken, *then* commit a recording (optional).

- [ ] **Step 1: Launch dev**

Run: `pnpm dev`
Expected: Electron window opens with the M3 layout *plus* a "Rows / Cols / Gutter / Color" row and "Merge / Unmerge" buttons in the header. Default grid is still 2×2 with 12px gutter.

- [ ] **Step 2: Resize the grid**

Type **5** in the Cols input. Expected: grid grows to 2×5; existing image placements stay put.

Type **3** in the Rows input. Expected: 3×5 grid; one row of fresh placeholder cells appears at the bottom.

Drop an image into a cell. Type **2** in the Cols input (shrink). Expected: trailing column drops; if its cell had an image, the image returns to the tray as unplaced.

Reset to **2 rows / 2 cols / 12 px / #FFFFFF**.

- [ ] **Step 3: Change gutter px**

Slide gutter to 0. Expected: panels touch with no white between them. Slide to 30. Expected: thick white margins. Set back to 12.

- [ ] **Step 4: Change gutter color**

Click the color swatch, pick `#000000`. Expected: the gutter renders black (the figure background stays white outside the gutter — confirm the **panels** rendering visually). Set back to `#FFFFFF`.

- [ ] **Step 5: Multi-select two cells, merge**

Shift-click cell **(0,0)**, then shift-click cell **(0,1)**. Expected: both show the yellow selection ring. Press **M**. Expected: ring disappears; the two cells fuse into one wide panel spanning the top row of the 2×2.

- [ ] **Step 6: Unmerge**

Click the merged panel (no shift). Expected: green focus ring appears; the **Unmerge** button enables. Press **U** *or* click Unmerge. Expected: panel splits back into two 1×1s. Place an image into the merged panel, then unmerge. Expected: the image stays with the **top-left** cell after the split; the other cell is empty.

- [ ] **Step 7: Cancel via Escape**

Shift-click two cells. Expected: ring on both. Press Escape. Expected: rings disappear; **Merge** button disables.

- [ ] **Step 8: Drag to/from a merged panel**

Add a second image. Drag it from the tray onto the merged 1×2 panel. Expected: it lands in the merged panel and the tray entry greys out (placed). Drag from another cell onto the merged panel. Expected: swap — the kicked image moves into the source cell.

- [ ] **Step 9: Export**

Click **Export as PNG**. Save somewhere. Open the file. Expected: 800×600 PNG; the merged panel renders as one wide rectangle; gutter stripes are correct width.

- [ ] **Step 10: Try the boundary cases**

- Rows = **1**, Cols = **10**: confirm grid fits in 800×600 (gutter remainder absorbed by trailing cells).
- Rows = **10**, Cols = **10**: confirm placeholder labels include `Z`, `AA`, … `CV`.
- Type a non-numeric value into Rows: expected to clamp to a sane value (browser native input rejects non-numbers).

- [ ] **Step 11: Type-focus does not trigger shortcuts**

Click into the Rows input, then press **m**. Expected: "m" lands as input text or is rejected by the number input — but the merge button does not fire. Same for **u**.

- [ ] **Step 12: Final regression sweep**

Run: `pnpm test`
Run: `pnpm typecheck`
Run: `pnpm lint`
Expected: all three pass with 0 errors / 0 warnings.

- [ ] **Step 13: Wrap-up commit**

```bash
git commit --allow-empty -m "chore: M4 — grid model + merge complete (M4.13)"
```

---

## Self-review (writer's checklist)

**Spec coverage** — each M4 requirement maps to a task:

- "Configurable rows/cols (1..10)" → Task 4 (`RESIZE_GRID` clamps to 1..10), Task 11 (number inputs), Task 13 (wired in App).
- "Gutter px and color" → Task 4 (`SET_GUTTER_PX`/`SET_GUTTER_COLOR`), Task 11 (inputs), Task 13.
- "Shift-click multi-select cells" → Tasks 9 (`useMergeSelection` hook) + 13 (selection overlay layer).
- "Merge button" → Task 11 (`MergeControls`), Task 13 (wired).
- "Merge keyboard `M`" → Task 12.
- "Unmerge / `U`" → Task 12; reducer in Task 10; UI in Tasks 11 + 13.
- Underlying model change (Panel with rowSpan/colSpan, partition invariant) → Tasks 0 + 2 + 3.
- Renderer respects merges → Tasks 5 + 6.
- DnD on merged panels → Tasks 7 + 8.

**Placeholder scan**: no TBDs, no "implement later", no naked "add error handling" — every case is either a clamp/no-op decision spelled out in the reducer or covered by a specific test.

**Type consistency check**: `placeIntoPanel`/`swapPanels`/`replaceIntoPanel` (Tasks 3, 7, 10) — used consistently across reducer, dispatch-drop, and tests. `mergeCells`/`unmergePanelAction` (Tasks 9, 10, 13) — same name everywhere. `cellLabel` (Task 1) — used in derivations (Task 5) only. `Panel` (Task 0) — imported by figure-state (Task 2), grid-resize (Task 4), merge (Task 9), figure-actions (Tasks 3, 4, 10).

**One known caveat**: Tasks 2 + 3 land in the same commit because the FigureState shape change can't compile without the reducer port. This is called out at the end of Task 2 and the bottom of Task 3.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-02-m4-grid-model-and-merge.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**
