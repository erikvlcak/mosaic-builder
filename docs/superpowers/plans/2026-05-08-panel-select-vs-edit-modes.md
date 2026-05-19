# Panel Select vs Edit Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-click-to-pan-and-zoom behavior with single-click-selects (drag-to-swap enabled) + double-click-edits (pan/zoom enabled), with distinct visual treatments per mode.

**Architecture:** Replace `App.tsx`'s binary `focusedPanelId: string | null` with a discriminated tristate `PanelInteraction = { mode: "selected" | "editing", panelId } | null`. `GridCells` keeps an image panel HTML5-draggable while `mode !== "editing"`, so `selected` panels can swap. `PanelInteractionLayer` mounts only when `mode === "editing"` (unchanged behavior, just gated on the new state and with a dashed-orange outline instead of solid blue). No reducer or state-shape changes.

**Tech Stack:** React 18, TypeScript strict, Vitest + @testing-library/react (jsdom), pnpm.

**Reference spec:** [docs/superpowers/specs/2026-05-08-panel-select-vs-edit-modes-design.md](../specs/2026-05-08-panel-select-vs-edit-modes-design.md)

---

## File Structure

| File                                                     | Action     | Responsibility                                                                                                                                                                                        |
| -------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/model/panel-interaction.ts`                | **Create** | Defines `PanelInteraction` type and three pure helpers (`selectedIdOf`, `editingIdOf`, `focusedIdOf`). Single home for the union so both App and GridCells import it.                                 |
| `src/renderer/components/Grid/GridCells.tsx`             | **Modify** | Accept `panelInteraction` prop instead of `focusedPanelId`. Wire `onDoubleClick`. Adjust `draggable` and outline/cursor styling per panel mode.                                                       |
| `src/renderer/App.tsx`                                   | **Modify** | Replace `focusedPanelId` state with `panelInteraction`. Add single-click and double-click handlers that respect mode rules. Mount `PanelInteractionLayer` only when editing. Update Esc / new / open. |
| `src/renderer/components/Grid/PanelInteractionLayer.tsx` | **Modify** | Change focus outline from solid blue to dashed `var(--c-warn)`. No behavioral change.                                                                                                                 |
| `test/unit/panel-interaction.test.ts`                    | **Create** | Tests for the three helpers.                                                                                                                                                                          |
| `test/unit/grid-cells-modes.test.tsx`                    | **Create** | Tests for GridCells single-click vs double-click + draggable behavior + outline class.                                                                                                                |
| `test/unit/panel-interaction-layer.test.tsx`             | **Create** | One assertion: outline style is dashed `var(--c-warn)`.                                                                                                                                               |

---

## Task 1: PanelInteraction type + pure helpers

**Files:**

- Create: `src/renderer/model/panel-interaction.ts`
- Test: `test/unit/panel-interaction.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/panel-interaction.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  selectedIdOf,
  editingIdOf,
  focusedIdOf,
  type PanelInteraction,
} from "../../src/renderer/model/panel-interaction";

describe("PanelInteraction helpers", () => {
  it("selectedIdOf returns id only when mode is selected", () => {
    expect(selectedIdOf(null)).toBeNull();
    expect(selectedIdOf({ mode: "selected", panelId: "p1" })).toBe("p1");
    expect(selectedIdOf({ mode: "editing", panelId: "p1" })).toBeNull();
  });

  it("editingIdOf returns id only when mode is editing", () => {
    expect(editingIdOf(null)).toBeNull();
    expect(editingIdOf({ mode: "selected", panelId: "p1" })).toBeNull();
    expect(editingIdOf({ mode: "editing", panelId: "p1" })).toBe("p1");
  });

  it("focusedIdOf returns id for either mode, null otherwise", () => {
    expect(focusedIdOf(null)).toBeNull();
    expect(focusedIdOf({ mode: "selected", panelId: "p1" })).toBe("p1");
    expect(focusedIdOf({ mode: "editing", panelId: "p2" })).toBe("p2");
  });

  // Compile-only: discriminated union narrows correctly. If this stops
  // compiling under `tsc --noEmit`, the union type has regressed.
  it("PanelInteraction narrows by mode", () => {
    const x: PanelInteraction = { mode: "selected", panelId: "p1" };
    if (x !== null && x.mode === "selected") {
      expect(x.panelId).toBe("p1");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/panel-interaction.test.ts`
Expected: FAIL — module `../../src/renderer/model/panel-interaction` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/model/panel-interaction.ts`:

```typescript
/**
 * UI-layer state for which panel the user is interacting with.
 *
 * - `selected`: single-click; HTML5 drag-to-swap enabled, pan/zoom NOT.
 * - `editing`: double-click; pan/zoom enabled, drag-to-swap NOT.
 * - `null`: nothing.
 *
 * Lives outside FigureState because it is UI-only (not part of undo/redo
 * history, not serialized to .mosaic files).
 */
export type PanelInteraction =
  | { mode: "selected"; panelId: string }
  | { mode: "editing"; panelId: string }
  | null;

export function selectedIdOf(pi: PanelInteraction): string | null {
  return pi !== null && pi.mode === "selected" ? pi.panelId : null;
}

export function editingIdOf(pi: PanelInteraction): string | null {
  return pi !== null && pi.mode === "editing" ? pi.panelId : null;
}

export function focusedIdOf(pi: PanelInteraction): string | null {
  return pi !== null ? pi.panelId : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/panel-interaction.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Run typecheck to ensure no regressions**

Run: `pnpm tsc --noEmit -p tsconfig.renderer.json`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/model/panel-interaction.ts test/unit/panel-interaction.test.ts
git commit -m "feat(panels): PanelInteraction discriminated tristate

UI-layer model for selected vs editing panel modes. Pure helpers
(selectedIdOf, editingIdOf, focusedIdOf) destructure the union
without leaking mode-checks to call sites."
```

---

## Task 2: GridCells supports per-panel selected vs editing state

**Files:**

- Modify: `src/renderer/components/Grid/GridCells.tsx`
- Create: `test/unit/grid-cells-modes.test.tsx`

This task changes GridCells' API: it now takes `panelInteraction: PanelInteraction` instead of `focusedPanelId: string | null`, and a new `onPanelDoubleClick: (panelId: string) => void` prop. The corresponding wiring in App.tsx is changed in Task 3, so this task will leave App.tsx temporarily mismatched. We accept that — the typecheck failure exists only between Task 2 and Task 3. We only run the new test in Task 2's verify step (not the full typecheck) to keep the TDD loop tight; the full typecheck runs at the end of Task 3.

- [ ] **Step 1: Write the failing test**

Create `test/unit/grid-cells-modes.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GridCells } from "../../src/renderer/components/Grid/GridCells";
import { initialFigureState } from "../../src/renderer/model/figure-state";
import type { FigureState } from "../../src/renderer/model/figure-state";
import type { PanelInteraction } from "../../src/renderer/model/panel-interaction";

function stateWithImage(): FigureState {
  // Default initialFigureState gives a 2x2 grid of empty panels. Place an
  // imageId on the first panel so it counts as "occupied".
  const s = initialFigureState();
  const first = s.panels[0]!;
  return {
    ...s,
    pool: [
      {
        id: "img1",
        filename: "a.png",
        filePath: "/a.png",
        mime: "image/png",
        width: 100,
        height: 100,
        bitDepth: 8,
      },
    ],
    panels: s.panels.map((p, i) =>
      i === 0
        ? {
            ...p,
            imageId: "img1",
            transform: {
              fit: "contain",
              panX: 0,
              panY: 0,
              zoom: 1,
              rotation: 0,
              flipH: false,
              flipV: false,
            },
          }
        : p,
    ),
  };
}

function renderGrid(opts: {
  interaction: PanelInteraction;
  onPanelClick?: (id: string) => void;
  onPanelDoubleClick?: (id: string) => void;
}): {
  state: FigureState;
  onPanelClick: ReturnType<typeof vi.fn>;
  onPanelDoubleClick: ReturnType<typeof vi.fn>;
} {
  const state = stateWithImage();
  const onPanelClick = vi.fn(opts.onPanelClick);
  const onPanelDoubleClick = vi.fn(opts.onPanelDoubleClick);
  render(
    <GridCells
      state={state}
      figurePxW={800}
      figurePxH={600}
      cssW={800}
      cssH={600}
      onDrop={vi.fn()}
      selection={new Set<string>()}
      onCellShiftClick={vi.fn()}
      panelInteraction={opts.interaction}
      onPanelClick={onPanelClick}
      onPanelDoubleClick={onPanelDoubleClick}
    />,
  );
  return { state, onPanelClick, onPanelDoubleClick };
}

describe("GridCells — selected vs editing modes", () => {
  it("single-click on image panel calls onPanelClick", () => {
    const { state, onPanelClick } = renderGrid({ interaction: null });
    const p = state.panels[0]!;
    fireEvent.click(screen.getByTestId(`panel-${p.row}-${p.col}`));
    expect(onPanelClick).toHaveBeenCalledWith(p.id);
  });

  it("double-click on image panel calls onPanelDoubleClick", () => {
    const { state, onPanelDoubleClick } = renderGrid({ interaction: null });
    const p = state.panels[0]!;
    fireEvent.doubleClick(screen.getByTestId(`panel-${p.row}-${p.col}`));
    expect(onPanelDoubleClick).toHaveBeenCalledWith(p.id);
  });

  it("image panel is HTML5-draggable when no panel is editing", () => {
    const { state } = renderGrid({ interaction: null });
    const p = state.panels[0]!;
    const el = screen.getByTestId(`panel-${p.row}-${p.col}`);
    expect(el.getAttribute("draggable")).toBe("true");
  });

  it("image panel is HTML5-draggable when it is in selected mode (the bug fix)", () => {
    const { state } = renderGrid({ interaction: null }); // get id
    const p = state.panels[0]!;
    // Re-render with this panel in selected mode.
    const onPanelClick = vi.fn();
    const onPanelDoubleClick = vi.fn();
    const interaction: PanelInteraction = { mode: "selected", panelId: p.id };
    render(
      <GridCells
        state={stateWithImage()}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={interaction}
        onPanelClick={onPanelClick}
        onPanelDoubleClick={onPanelDoubleClick}
      />,
    );
    // Two grids exist after the second render; pick the second instance.
    const els = screen.getAllByTestId(`panel-${p.row}-${p.col}`);
    expect(els[els.length - 1]!.getAttribute("draggable")).toBe("true");
  });

  it("image panel is NOT HTML5-draggable when it is in editing mode", () => {
    const s = stateWithImage();
    const p = s.panels[0]!;
    render(
      <GridCells
        state={s}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={{ mode: "editing", panelId: p.id }}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId(`panel-${p.row}-${p.col}`).getAttribute("draggable"),
    ).toBe("false");
  });

  it("selected image panel shows solid focus outline and grab cursor", () => {
    const s = stateWithImage();
    const p = s.panels[0]!;
    render(
      <GridCells
        state={s}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={{ mode: "selected", panelId: p.id }}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
      />,
    );
    const el = screen.getByTestId(`panel-${p.row}-${p.col}`);
    expect(el.style.cursor).toBe("grab");
    // Outline uses the focus-stroke token.
    expect(el.style.outline).toContain("solid");
    expect(el.style.outline).toContain("var(--c-focus-stroke)");
  });

  it("editing image panel shows NO outline from GridCells (PanelInteractionLayer owns it)", () => {
    const s = stateWithImage();
    const p = s.panels[0]!;
    render(
      <GridCells
        state={s}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={{ mode: "editing", panelId: p.id }}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
      />,
    );
    const el = screen.getByTestId(`panel-${p.row}-${p.col}`);
    // Falls through to the transparent dashed default (the "neither" branch).
    expect(el.style.outline).toContain("dashed transparent");
  });

  it("shift-click on 1x1 image panel still toggles merge selection (does NOT enter selected mode)", () => {
    const s = stateWithImage();
    const p = s.panels[0]!;
    const onPanelClick = vi.fn();
    const onPanelDoubleClick = vi.fn();
    const onCellShiftClick = vi.fn();
    render(
      <GridCells
        state={s}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        selection={new Set()}
        onCellShiftClick={onCellShiftClick}
        panelInteraction={null}
        onPanelClick={onPanelClick}
        onPanelDoubleClick={onPanelDoubleClick}
      />,
    );
    fireEvent.click(screen.getByTestId(`panel-${p.row}-${p.col}`), {
      shiftKey: true,
    });
    expect(onCellShiftClick).toHaveBeenCalledWith(p.row, p.col);
    expect(onPanelClick).not.toHaveBeenCalled();
    expect(onPanelDoubleClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/grid-cells-modes.test.tsx`
Expected: FAIL — GridCells does not yet accept `panelInteraction` / `onPanelDoubleClick` props (TS error in test file when vitest transpiles, OR runtime: props ignored, draggable still based on `focusedPanelId`).

- [ ] **Step 3: Modify GridCells.tsx**

Replace the entire contents of `src/renderer/components/Grid/GridCells.tsx` with:

```tsx
import { useState } from "react";
import type { FigureState } from "../../model/figure-state";
import { cellKey } from "../../model/figure-state";
import { computePanelRects } from "../../render/coords";
import { DEFAULT_GLOBAL_STYLE } from "../../model/global-style";
import {
  type PanelInteraction,
  selectedIdOf,
  editingIdOf,
} from "../../model/panel-interaction";
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
  /** Per-cell merge selection. Shift-click toggles. */
  selection: ReadonlySet<string>;
  onCellShiftClick: (row: number, col: number) => void;
  /** Tristate: which panel (if any) is selected or editing. */
  panelInteraction: PanelInteraction;
  onPanelClick: (panelId: string) => void;
  onPanelDoubleClick: (panelId: string) => void;
}

export function GridCells({
  state,
  figurePxW,
  figurePxH,
  cssW,
  cssH,
  onDrop,
  selection,
  onCellShiftClick,
  panelInteraction,
  onPanelClick,
  onPanelDoubleClick,
}: Props): JSX.Element {
  const [hoverPanelId, setHoverPanelId] = useState<string | null>(null);

  const selectedId = selectedIdOf(panelInteraction);
  const editingId = editingIdOf(panelInteraction);

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
    annotations: [],
    globalStyle: DEFAULT_GLOBAL_STYLE,
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
      {/* Selection layer (unchanged) */}
      {Array.from({ length: state.rows * state.cols }).map((_, idx) => {
        const row = Math.floor(idx / state.cols);
        const col = idx % state.cols;
        const k = cellKey(row, col);
        const sel = selection.has(k);

        const availW = figurePxW - state.gutterPx * (state.cols + 1);
        const availH = figurePxH - state.gutterPx * (state.rows + 1);
        const cellW = Math.floor(availW / state.cols);
        const cellH = Math.floor(availH / state.rows);
        const x = state.gutterPx + col * (cellW + state.gutterPx);
        const y = state.gutterPx + row * (cellH + state.gutterPx);

        return (
          <div
            key={`sel-${k}`}
            data-testid={`cell-sel-${row}-${col}`}
            style={{
              position: "absolute",
              left: x * sx,
              top: y * sy,
              width: cellW * sx,
              height: cellH * sy,
              pointerEvents: "none",
              boxSizing: "border-box",
              outline: sel
                ? "2px solid var(--c-select-stroke)"
                : "1px dashed transparent",
              outlineOffset: -2,
              background: sel ? "var(--c-select-fill)" : "transparent",
              transition: "outline-color 80ms ease, background 80ms ease",
            }}
          />
        );
      })}

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

        function onClick(e: React.MouseEvent<HTMLDivElement>): void {
          if (e.shiftKey) {
            if (panel.rowSpan === 1 && panel.colSpan === 1) {
              onCellShiftClick(panel.row, panel.col);
            }
            return;
          }
          onPanelClick(panel.id);
        }

        function onDoubleClick(): void {
          if (!occupied) return;
          onPanelDoubleClick(panel.id);
        }

        const isSelected = selectedId === panel.id;
        const isEditing = editingId === panel.id;

        // Drag rules:
        //   editing → never draggable (PanelInteractionLayer owns gestures)
        //   selected or no-mode → draggable iff occupied
        // The selected-stays-draggable case is the bug fix: today, any focus
        // disables drag, so single-click eats the drag-to-swap gesture.
        const draggable = occupied && !isEditing;

        // Outline rules:
        //   hover (DnD) → strong hover-stroke
        //   editing → none here; PanelInteractionLayer draws its own
        //   selected (image OR empty) → solid focus-stroke
        //   neither → transparent dashed (default placeholder line)
        const outline =
          hoverPanelId === panel.id
            ? "3px solid var(--c-hover-stroke)"
            : isEditing
              ? "1px dashed transparent"
              : isSelected
                ? "2px solid var(--c-focus-stroke)"
                : "1px dashed transparent";

        // Cursor rules:
        //   editing → default (PanelInteractionLayer sits on top with its own)
        //   occupied → grab (selectable / draggable)
        //   empty → default
        const cursor = isEditing ? "default" : occupied ? "grab" : "default";

        return (
          <div
            key={panel.id}
            draggable={draggable}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDropEvt}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            data-testid={`panel-${panel.row}-${panel.col}`}
            data-panel-id={panel.id}
            data-mode={
              isEditing ? "editing" : isSelected ? "selected" : undefined
            }
            style={{
              position: "absolute",
              left: r.x * sx,
              top: r.y * sy,
              width: r.w * sx,
              height: r.h * sy,
              pointerEvents: "auto",
              cursor,
              outline,
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/grid-cells-modes.test.tsx`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/Grid/GridCells.tsx test/unit/grid-cells-modes.test.tsx
git commit -m "feat(grid): GridCells supports selected vs editing per-panel modes

Single-click → onPanelClick. Double-click → onPanelDoubleClick.
draggable = occupied && mode !== 'editing' so 'selected' panels
remain HTML5-draggable (this is the drag-to-swap fix). Outline +
cursor differ per mode; the editing panel's chrome is owned by
PanelInteractionLayer."
```

---

## Task 3: Wire App.tsx + restyle PanelInteractionLayer

**Files:**

- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/Grid/PanelInteractionLayer.tsx`
- Create: `test/unit/panel-interaction-layer.test.tsx`

This task closes the loop: App owns the new tristate, dispatches single/double click into selected/editing, mounts `PanelInteractionLayer` only when editing, and the layer's outline becomes dashed warm orange.

- [ ] **Step 1: Write the failing test for PanelInteractionLayer outline**

Create `test/unit/panel-interaction-layer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PanelInteractionLayer } from "../../src/renderer/components/Grid/PanelInteractionLayer";
import type { PanelTransform } from "../../src/renderer/model/panels";

describe("PanelInteractionLayer — editing-mode outline", () => {
  it("renders a dashed warn-color outline (distinct from the selected focus-stroke)", () => {
    const transform: PanelTransform = {
      fit: "contain",
      panX: 0,
      panY: 0,
      zoom: 1,
      rotation: 0,
      flipH: false,
      flipV: false,
    };
    // Minimal ImageBitmap stub — the layer reads .width and .height only
    // for pan-clamping math. The cast is safe in this jsdom-only test.
    const bitmap = { width: 100, height: 100 } as unknown as ImageBitmap;
    render(
      <PanelInteractionLayer
        panelId="p1"
        panelRect={{ x: 0, y: 0, w: 200, h: 200 }}
        transform={transform}
        bitmap={bitmap}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        dispatch={vi.fn()}
        onCommit={vi.fn()}
      />,
    );
    const el = screen.getByTestId("panel-interaction-layer");
    expect(el.style.outline).toContain("dashed");
    expect(el.style.outline).toContain("var(--c-warn)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/panel-interaction-layer.test.tsx`
Expected: FAIL — current outline is `3px solid #0066FF`, contains neither `dashed` nor `var(--c-warn)`.

- [ ] **Step 3: Update PanelInteractionLayer outline**

In `src/renderer/components/Grid/PanelInteractionLayer.tsx`, change the outline at line ~202 from:

```tsx
        outline: "3px solid #0066FF",
        outlineOffset: -3,
```

to:

```tsx
        // Dashed warm orange distinguishes editing mode from the solid
        // focus-stroke green that GridCells draws around a selected panel.
        outline: "3px dashed var(--c-warn)",
        outlineOffset: -3,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/unit/panel-interaction-layer.test.tsx`
Expected: PASS — 1 test.

- [ ] **Step 5: Modify App.tsx — replace focusedPanelId with panelInteraction**

In `src/renderer/App.tsx`:

**5a.** Add an import (after line 14 or wherever the model imports group is):

```tsx
import {
  type PanelInteraction,
  editingIdOf,
  focusedIdOf,
} from "./model/panel-interaction";
```

**5b.** Replace line 67 from:

```tsx
const [focusedPanelId, setFocusedPanelId] = useState<string | null>(null);
```

to:

```tsx
const [panelInteraction, setPanelInteraction] =
  useState<PanelInteraction>(null);
const focusedPanelId = focusedIdOf(panelInteraction);
```

**5c.** Replace the body of `onUnmerge` (lines 159–165) with the same logic — `focusedPanelId` is still computed, so this works as-is. No change needed.

**5d.** Replace the `focusedPanel` memo (lines 167–173) — no change needed; it derives from `focusedPanelId` which we just kept as a derived value.

**5e.** Replace the `onEscape` body (line 215–220):

```tsx
const onEscape = useCallback(() => {
  selection.clear();
  setPanelInteraction(null);
  setSelectedAnnotationId(null);
  setActiveTool("select");
}, [selection]);
```

**5f.** Replace the `onNew` body's panel-clearing line (line 346):

```tsx
setPanelInteraction(null);
```

(replacing `setFocusedPanelId(null);`)

**5g.** Add two new handlers before the `useKeyboardShortcuts` call (so they're in scope below). Insert after the `onResetTransform` handler (line ~206):

```tsx
const onPanelSingleClick = useCallback(
  (panelId: string) => {
    // Single-click while already editing this same panel: no-op (stay
    // in editing so the user doesn't lose pan/zoom state mid-drag).
    if (
      panelInteraction !== null &&
      panelInteraction.mode === "editing" &&
      panelInteraction.panelId === panelId
    ) {
      return;
    }
    // Same shape for image and empty panels — empty panels can't drag
    // anyway (GridCells gates on `occupied`), but they still need
    // "selected" focus for the Unmerge action and properties panel.
    setPanelInteraction({ mode: "selected", panelId });
  },
  [panelInteraction],
);

const onPanelDoubleClick = useCallback((panelId: string) => {
  const panel = stateRef.current.panels.find((p) => p.id === panelId);
  if (panel === undefined || panel.imageId === undefined) return;
  setPanelInteraction({ mode: "editing", panelId });
}, []);
```

**5h.** Replace the `<GridCells>` props block (lines 489–500) with:

```tsx
<GridCells
  state={state}
  figurePxW={FIGURE_PX_W}
  figurePxH={FIGURE_PX_H}
  cssW={CANVAS_CSS_W}
  cssH={CANVAS_CSS_H}
  onDrop={onDrop}
  selection={selection.selected}
  onCellShiftClick={selection.toggle}
  panelInteraction={panelInteraction}
  onPanelClick={onPanelSingleClick}
  onPanelDoubleClick={onPanelDoubleClick}
/>
```

**5i.** Gate the `PanelInteractionLayer` mount on editing mode. Replace the existing block (lines 501–517) with:

```tsx
{
  editingIdOf(panelInteraction) !== null &&
    selectedImagePanel !== undefined &&
    focusedPanelRect !== null &&
    focusedBitmap !== undefined &&
    selectedImagePanel.transform !== undefined && (
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
    );
}
```

(`editingIdOf(panelInteraction) !== null` is the new gate. The other conditions stay because they protect against the first render frame after the panel state changes — `selectedImagePanel` derives from `focusedPanelId` which derives from `panelInteraction.panelId`, so when editing is set, `selectedImagePanel` becomes the same panel.)

- [ ] **Step 6: Run typecheck**

Run: `pnpm tsc --noEmit -p tsconfig.renderer.json`
Expected: 0 errors.

- [ ] **Step 7: Run the full test suite**

Run: `pnpm vitest run`
Expected: ALL tests pass — including the new ones from Tasks 1, 2, 3, and all pre-existing tests (none of them depend on the GridCells props that changed, because none of the existing tests render GridCells directly with those props).

If any pre-existing test fails because it imported a now-unused symbol, fix the import list. Do not change the test logic.

- [ ] **Step 8: Manual smoke test**

Run: `pnpm dev` (or whatever the dev script is — check `package.json` `scripts.dev`).

Verify in the running app:

1. Add an image, place it in a panel.
2. Single-click the image panel: cursor changes to `grab`, solid green outline appears, **drag to another panel — the swap works** (this is the bug fix).
3. Double-click the image panel: dashed orange outline replaces the green; pointer-drag pans the image; wheel zooms.
4. Press Esc: outline disappears, cursor returns to default.
5. Single-click panel A, then single-click panel B: outline moves from A to B.
6. Double-click panel A (now editing); single-click panel B: A exits editing, B becomes selected.
7. Add a second image and try drag-to-swap from a `selected` panel — works.

If any step fails, stop and debug before committing.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/Grid/PanelInteractionLayer.tsx test/unit/panel-interaction-layer.test.tsx
git commit -m "feat(panels): single-click selects, double-click edits

App owns a PanelInteraction tristate (selected | editing | null).
Single-click on an image panel sets selected — drag-to-swap is
re-enabled in this state, fixing the long-standing bug where any
click on an image trapped the gesture in pan/zoom. Double-click
enters editing, which mounts PanelInteractionLayer (now styled
with a dashed warn-orange outline so the two modes are visually
distinct). Esc clears either mode."
```

---

## Self-review checklist (run after Task 3 commit)

Re-read the spec at [docs/superpowers/specs/2026-05-08-panel-select-vs-edit-modes-design.md](../specs/2026-05-08-panel-select-vs-edit-modes-design.md) and confirm:

- [ ] **Behavior matrix row-by-row:** every row is exercised by at least one of the smoke-test steps or a unit test. (Empty-panel click, shift-click 1×1, switch-from-editing-to-other-panel, Esc, etc.)
- [ ] **No reducer / state-shape changes:** `git diff main -- src/renderer/model/figure-state.ts src/renderer/model/figure-actions.ts src/renderer/model/panels.ts` shows no changes.
- [ ] **No serialized format changes:** `git diff main -- src/renderer/model/serialize.ts src/renderer/model/schema.ts` shows no changes (these files might not exist under those exact names — adjust to whatever holds the .mosaic format).
- [ ] **Visual distinction:** selected = solid green; editing = dashed orange; cursors differ. Verified in smoke step 2 vs 3.
- [ ] **Edge case: panel that loses its image while in selected/editing:** if the user replaces or clears an image while a panel is `selected`/`editing`, the existing `selectedImagePanel?.imageId !== undefined` guard already gates `PanelInteractionLayer` rendering and the toolbar's pan/zoom buttons. No additional code needed for this case beyond what's in the spec — `panelInteraction` may briefly point to a panel without an image, but no UI misbehaves. Confirm by manually replacing an image while editing.
