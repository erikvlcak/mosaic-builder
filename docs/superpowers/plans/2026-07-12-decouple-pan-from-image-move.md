# Decouple Canvas Panning from Image Moving — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make plain left-drag on the canvas always pan the view, and move image moving/swapping entirely to the tray, so the two gestures never collide.

**Architecture:** Panels stop being HTML5-draggable (removing the drag-to-swap that pre-empted the pan handler). The tray becomes the single surface for moving images: a tray drag of an already-placed image resolves to `SWAP_PANELS` (move onto an empty panel, swap onto an occupied one). `dispatchDrop` and its preview twin `previewForDrop` are updated in lockstep; placed thumbnails become draggable.

**Tech Stack:** React 18 + TypeScript, Vitest (`environment: node`; component tests use `@testing-library/react` + jsdom via a `// @vitest-environment jsdom` file header), pnpm.

## Global Constraints

- Toolchain pinned: Node 22, pnpm 10. Run tests with `pnpm vitest run <file>`.
- ESLint is type-checked and runs `--max-warnings 0`. Unused vars error unless prefixed `_`. Both `pnpm lint` and `pnpm typecheck` must stay green.
- Prettier must pass (`pnpm format` to auto-fix).
- Reducers return the **same state reference** on no-op; `dispatchDrop`/`previewForDrop` return `null` / `{ valid: false }` on no-op — preserve this.
- `src/preload/api.ts` is the IPC contract source of truth. This plan does not touch IPC.
- No new dependencies.

---

## File Structure

- `src/renderer/dnd/dispatch-drop.ts` — MODIFY: tray-drag-of-placed-image → swap/move; drop the `kind: "panel"` branch.
- `src/renderer/dnd/preview-for-drop.ts` — MODIFY: mirror the new `dispatchDrop` logic for the hover preview; drop the `kind: "panel"` branch.
- `src/renderer/components/Grid/GridCells.tsx` — MODIFY: panels never `draggable`; remove `onDragStart` panel-payload path and the `grab` cursor.
- `src/renderer/components/Sidebar/Thumbnail.tsx` — MODIFY: placed thumbnails become draggable and emit `{ kind: "tray", imageId }`.
- `src/renderer/styles.css` — MODIFY: give `.thumb--placed` a `grab` cursor.
- Tests: `test/unit/dispatch-drop.test.ts`, `test/unit/preview-for-drop.test.ts`, `test/unit/grid-cells-modes.test.tsx`, `test/unit/thumbnail.test.tsx` — MODIFY.

The `DragPayload` `{ kind: "panel"; panelId }` variant (`src/renderer/dnd/drag-payload.ts`) is left in place (unused) to avoid touching the wire format — do NOT delete it in this plan.

---

## Task 1: Tray drag moves/swaps placed images (`dispatchDrop` + `previewForDrop`)

**Files:**
- Modify: `src/renderer/dnd/dispatch-drop.ts`
- Modify: `src/renderer/dnd/preview-for-drop.ts`
- Test: `test/unit/dispatch-drop.test.ts`
- Test: `test/unit/preview-for-drop.test.ts`

**Interfaces:**
- Consumes: `swapPanels(aPanelId, bPanelId)`, `placeIntoPanel(imageId, panelId)`, `replaceIntoPanel(imageId, panelId)` from `src/renderer/model/figure-actions.ts` (all already imported in `dispatch-drop.ts`). `SWAP_PANELS` already handles both move (empty target) and swap (occupied target) and relocates image-bound annotations.
- Produces: `dispatchDrop(state, ev)` returns a `FigureAction | null`; `previewForDrop(state, source, hoverPanelId)` returns `DropPreview` (`{ valid: false } | { valid: true; targetImageId: string; sourceGhost?: { panelId: string; imageId: string } }`). Both consumed by `GridCells` and `App`. Signatures unchanged.

- [ ] **Step 1: Update the `dispatch-drop` tests to the new semantics**

Replace the `"tray drop with already-placed image is no-op"` test and the two `"panel → ..."` tests in `test/unit/dispatch-drop.test.ts` (lines 78–110) with the block below. Keep the two existing tray tests (lines 46–76) as-is.

```typescript
  it("tray drop of a placed image onto a different EMPTY panel emits SWAP_PANELS (move)", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 0, 1);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const action = dispatchDrop(s, {
      from: { kind: "tray", imageId: "a" },
      targetPanelId: p2,
    });
    expect(action).toEqual({ type: "SWAP_PANELS", aPanelId: p1, bPanelId: p2 });
  });

  it("tray drop of a placed image onto a different OCCUPIED panel emits SWAP_PANELS (swap)", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    s = figureReducer(s, addToPool(IMG_B));
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 0, 1);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, placeIntoPanel("b", p2));
    const action = dispatchDrop(s, {
      from: { kind: "tray", imageId: "a" },
      targetPanelId: p2,
    });
    expect(action).toEqual({ type: "SWAP_PANELS", aPanelId: p1, bPanelId: p2 });
  });

  it("tray drop of a placed image onto its OWN panel is a no-op", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const action = dispatchDrop(s, {
      from: { kind: "tray", imageId: "a" },
      targetPanelId: p1,
    });
    expect(action).toBe(null);
  });
```

- [ ] **Step 2: Run the dispatch-drop tests to verify the new ones fail**

Run: `pnpm vitest run test/unit/dispatch-drop.test.ts`
Expected: FAIL — the three new tests fail (current `dispatchDrop` returns `null` for a placed tray image, not `SWAP_PANELS`). The two kept tray tests still pass.

- [ ] **Step 3: Rewrite `dispatchDrop`**

Replace the entire body of `dispatchDrop` in `src/renderer/dnd/dispatch-drop.ts` (the function starting at line 15) with:

```typescript
export function dispatchDrop(
  state: FigureState,
  ev: DropEvent,
): FigureAction | null {
  const target = state.panels.find((p) => p.id === ev.targetPanelId);
  if (target === undefined) return null;

  // Only tray drags exist now — panels are no longer draggable. (The
  // DragPayload "panel" variant is retained for wire-format stability but
  // is never produced by the UI.)
  if (ev.from.kind !== "tray") return null;

  const imageId = ev.from.imageId;
  const sourcePanel = state.panels.find((p) => p.imageId === imageId);

  // Already placed → this is a rearrange from the tray.
  if (sourcePanel !== undefined) {
    if (sourcePanel.id === ev.targetPanelId) return null; // dropped on itself
    // SWAP_PANELS covers both cases: target empty → move; occupied → swap.
    return swapPanels(sourcePanel.id, ev.targetPanelId);
  }

  // Not placed yet → place (empty target) or replace (occupied target).
  if (target.imageId !== undefined) {
    return replaceIntoPanel(imageId, ev.targetPanelId);
  }
  return placeIntoPanel(imageId, ev.targetPanelId);
}
```

Note: `swapPanels`, `placeIntoPanel`, `replaceIntoPanel` are already imported at the top of the file. Prettier/ESLint may flag no unused imports — all three are still used.

- [ ] **Step 4: Run the dispatch-drop tests to verify they pass**

Run: `pnpm vitest run test/unit/dispatch-drop.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Update the `preview-for-drop` tests to the new semantics**

In `test/unit/preview-for-drop.test.ts`, replace the `"tray drag whose image is already placed → invalid"` test (lines 70–78) and the three `"panel ..."` tests (lines 80–121) with the block below. Keep the first three tests (lines 46–68).

```typescript
  it("tray drag of a placed image onto its OWN panel → invalid", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    const p1 = panelIdAt(s, 0, 0);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const r = previewForDrop(s, { kind: "tray", imageId: "a" }, p1);
    expect(r).toEqual({ valid: false });
  });

  it("tray drag of a placed image onto a different EMPTY panel → valid, no sourceGhost", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 0, 1);
    s = figureReducer(s, placeIntoPanel("a", p1));
    const r = previewForDrop(s, { kind: "tray", imageId: "a" }, p2);
    expect(r).toEqual({ valid: true, targetImageId: "a" });
  });

  it("tray drag of a placed image onto a different OCCUPIED panel → valid with sourceGhost", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool(IMG_A));
    s = figureReducer(s, addToPool(IMG_B));
    const p1 = panelIdAt(s, 0, 0);
    const p2 = panelIdAt(s, 0, 1);
    s = figureReducer(s, placeIntoPanel("a", p1));
    s = figureReducer(s, placeIntoPanel("b", p2));
    const r = previewForDrop(s, { kind: "tray", imageId: "a" }, p2);
    expect(r).toEqual({
      valid: true,
      targetImageId: "a",
      sourceGhost: { panelId: p1, imageId: "b" },
    });
  });
```

- [ ] **Step 6: Run the preview-for-drop tests to verify the new ones fail**

Run: `pnpm vitest run test/unit/preview-for-drop.test.ts`
Expected: FAIL — the placed-image tray cases fail (current `previewForDrop` returns `{ valid: false }` for a placed tray image).

- [ ] **Step 7: Rewrite `previewForDrop`**

Replace the entire body of `previewForDrop` in `src/renderer/dnd/preview-for-drop.ts` (the function starting at line 18) with:

```typescript
export function previewForDrop(
  state: FigureState,
  source: DragPayload,
  hoverPanelId: string | null,
): DropPreview {
  if (hoverPanelId === null) return { valid: false };
  const target = state.panels.find((p) => p.id === hoverPanelId);
  if (target === undefined) return { valid: false };

  // Panels are no longer draggable; only tray payloads reach here. (The
  // "panel" variant is retained for wire-format stability but never produced.)
  if (source.kind !== "tray") return { valid: false };

  const imageId = source.imageId;
  const sourcePanel = state.panels.find((p) => p.imageId === imageId);

  // Already placed → rearrange (move onto empty / swap onto occupied).
  if (sourcePanel !== undefined) {
    if (sourcePanel.id === hoverPanelId) return { valid: false }; // onto itself
    const out: DropPreview = { valid: true, targetImageId: imageId };
    if (target.imageId !== undefined) {
      // Swap: the target's current image ghosts back into the source panel.
      out.sourceGhost = { panelId: sourcePanel.id, imageId: target.imageId };
    }
    return out;
  }

  // Not placed yet → place / replace; the dragged image lands in the target.
  return { valid: true, targetImageId: imageId };
}
```

- [ ] **Step 8: Run the preview-for-drop tests to verify they pass**

Run: `pnpm vitest run test/unit/preview-for-drop.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 9: Typecheck, lint, format**

Run: `pnpm typecheck && pnpm lint && pnpm format`
Expected: no errors. (If ESLint flags an unused import in either file, remove only the genuinely-unused one — but all of `swapPanels`/`placeIntoPanel`/`replaceIntoPanel` remain used in `dispatch-drop.ts`.)

- [ ] **Step 10: Commit**

```bash
git add src/renderer/dnd/dispatch-drop.ts src/renderer/dnd/preview-for-drop.ts \
        test/unit/dispatch-drop.test.ts test/unit/preview-for-drop.test.ts
git commit -m "feat(dnd): tray drag of a placed image moves/swaps via SWAP_PANELS"
```

---

## Task 2: Panels are never draggable (`GridCells`)

**Files:**
- Modify: `src/renderer/components/Grid/GridCells.tsx:330-341` (remove `onDragStart` panel payload), `:375` (`draggable`), `:397-406` (`cursor`), `:411-412` (JSX)
- Test: `test/unit/grid-cells-modes.test.tsx:108-134` and `:164-...`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GridCells` panels render `draggable={false}` in every mode. Selection/edit-mode click behavior is unchanged.

- [ ] **Step 1: Update the grid-cells-modes tests**

In `test/unit/grid-cells-modes.test.tsx`, change the test at line 108 so a selected image panel is NOT draggable. Replace its title and its final assertion:

Replace the test title:
```
  it("image panel is HTML5-draggable when it is in selected mode (drag-to-swap is armed)", () => {
```
with:
```
  it("image panel is NOT HTML5-draggable even in selected mode (drag == pan; move is tray-only)", () => {
```

And replace that same test's closing assertion:
```typescript
    expect(
      screen.getByTestId(`panel-${p.row}-${p.col}`).getAttribute("draggable"),
    ).toBe("true");
```
with:
```typescript
    expect(
      screen.getByTestId(`panel-${p.row}-${p.col}`).getAttribute("draggable"),
    ).toBe("false");
```

- [ ] **Step 2: Update the "grab cursor" assertion**

The test at line 164 (`"selected image panel shows solid focus outline and grab cursor"`) asserts a grab cursor that no longer exists. Change its title to:
```
  it("selected image panel shows solid focus outline (no grab cursor — drag pans)", () => {
```
Then, in that test's body, replace this exact assertion line:
```typescript
    expect(el.style.cursor).toBe("grab");
```
with:
```typescript
    expect(el.style.cursor).toBe("default");
```
Leave the two following outline assertions (`toContain("solid")` and `toContain("var(--c-accent)")`) unchanged.

- [ ] **Step 3: Run the grid-cells-modes tests to verify they fail**

Run: `pnpm vitest run test/unit/grid-cells-modes.test.tsx`
Expected: FAIL — the two edited tests fail (panel is still `draggable="true"` and cursor is still `"grab"` in current code).

- [ ] **Step 4: Make panels never draggable**

In `src/renderer/components/Grid/GridCells.tsx`, replace the `draggable` computation (line 375 and its preceding comment block, lines 367–375):

```typescript
        // Drag rules:
        //   editing → never draggable (PanelInteractionLayer owns gestures)
        //   selected → draggable iff occupied (drag-to-swap)
        //   no-mode → never draggable; the annotation backdrop owns
        //     pointerdown here so the user can rubber-band a marquee over
        //     the panel's annotations. To move the image the user must
        //     first single-click to select (green border + grab cursor),
        //     which arms drag-to-swap on the next gesture.
        const draggable = occupied && isSelected;
```
with:
```typescript
        // Panels are never HTML5-draggable: a plain left-drag on the canvas
        // always pans the view (useCanvasZoom), so a native dragstart here
        // would collide with panning. Moving/swapping an image is done from
        // the tray (drag a placed thumbnail onto a panel → SWAP_PANELS).
        const draggable = false;
```

- [ ] **Step 5: Remove the grab cursor**

Replace the cursor computation (lines 397–406):

```typescript
        // Cursor rules:
        //   editing → default (PanelInteractionLayer sits on top with its own)
        //   selected + occupied → grab (drag-to-swap is armed)
        //   occupied unselected → default (annotation backdrop owns pointer)
        //   empty → default
        const cursor = isEditing
          ? "default"
          : isSelected && occupied
            ? "grab"
            : "default";
```
with:
```typescript
        // Cursor is always default now — panels aren't grabbable (drag pans).
        const cursor = "default";
```

- [ ] **Step 6: Neutralize the panel `onDragStart`**

Panels render `draggable={false}`, so `onDragStart` can no longer fire from a panel. Remove the panel-payload body so no `kind: "panel"` payload is ever produced. Replace `onDragStart` (lines 330–341):

```typescript
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
          onDragSourceChange({ kind: "panel", panelId: panel.id });
        }
```
with:
```typescript
        // Panels are draggable={false}; this never fires from a panel, but
        // guard defensively so no panel drag can start.
        function onDragStart(e: React.DragEvent<HTMLDivElement>): void {
          e.preventDefault();
        }
```

- [ ] **Step 7: Remove now-unused imports if any**

`serializeDrag` may now be unused in `GridCells.tsx` (it was only used by the panel `onDragStart`). Check the file: if `serializeDrag` has no other use, remove it from the import at the top (`import { ..., serializeDrag, ... } from "../../dnd/drag-payload";`). Keep `DRAG_MIME` and `parseDrag` — they are still used by `onDragOver`/`onDropEvt`.

- [ ] **Step 8: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors (this catches a stale `serializeDrag` import).

- [ ] **Step 9: Run the grid-cells-modes tests to verify they pass**

Run: `pnpm vitest run test/unit/grid-cells-modes.test.tsx`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/components/Grid/GridCells.tsx test/unit/grid-cells-modes.test.tsx
git commit -m "feat(canvas): panels never draggable so left-drag always pans"
```

---

## Task 3: Placed thumbnails become draggable (`Thumbnail` + CSS)

**Files:**
- Modify: `src/renderer/components/Sidebar/Thumbnail.tsx:66-89`
- Modify: `src/renderer/styles.css:718-721` (`.thumb--placed` cursor)
- Test: `test/unit/thumbnail.test.tsx`

**Interfaces:**
- Consumes: `serializeDrag`, `DRAG_MIME` (already imported in `Thumbnail.tsx`).
- Produces: a placed `Thumbnail` renders `draggable` and, on `dragStart`, emits `{ kind: "tray", imageId }` via `dataTransfer` and `onDragSourceChange`. `dispatchDrop` (Task 1) routes that to a move/swap.

- [ ] **Step 1: Add tests for placed-thumbnail dragging**

Append to `test/unit/thumbnail.test.tsx`, inside a new `describe` (place it after the existing `describe` blocks). The file already imports `render`, `screen`, `fireEvent` from `@testing-library/react` and `vi` from vitest, plus a local `img(id)` helper — reuse them. If `fireEvent` is not yet imported, add it to the `@testing-library/react` import.

```typescript
describe("Thumbnail placed-image dragging", () => {
  it("placed thumbnails are draggable", () => {
    render(<Thumbnail item={img("a")} bitmap={undefined} placed />);
    const el = screen.getByTestId("thumb-a");
    expect(el.getAttribute("draggable")).toBe("true");
  });

  it("dragging a placed thumbnail emits a tray payload and reports the source", () => {
    const onDragSourceChange = vi.fn();
    render(
      <Thumbnail
        item={img("a")}
        bitmap={undefined}
        placed
        onDragSourceChange={onDragSourceChange}
      />,
    );
    const el = screen.getByTestId("thumb-a");
    const setData = vi.fn();
    fireEvent.dragStart(el, {
      dataTransfer: { setData, effectAllowed: "" },
    });
    expect(setData).toHaveBeenCalledWith(
      "application/x-mosaic-drag",
      JSON.stringify({ kind: "tray", imageId: "a" }),
    );
    expect(onDragSourceChange).toHaveBeenCalledWith({
      kind: "tray",
      imageId: "a",
    });
  });
});
```

- [ ] **Step 2: Run the thumbnail tests to verify the new ones fail**

Run: `pnpm vitest run test/unit/thumbnail.test.tsx`
Expected: FAIL — placed thumbnails are currently `draggable={false}` and `onDragStart` early-returns for placed images.

- [ ] **Step 3: Make placed thumbnails draggable**

In `src/renderer/components/Sidebar/Thumbnail.tsx`, replace the `onDragStart` guard (lines 66–77):

```typescript
  function onDragStart(e: React.DragEvent<HTMLDivElement>): void {
    if (placed) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(
      DRAG_MIME,
      serializeDrag({ kind: "tray", imageId: item.id }),
    );
    e.dataTransfer.effectAllowed = "move";
    onDragSourceChange?.({ kind: "tray", imageId: item.id });
  }
```
with:
```typescript
  // Both unplaced and placed thumbnails drag the SAME tray payload. dispatchDrop
  // routes by whether the image is already placed: unplaced → place/replace,
  // placed → move/swap (SWAP_PANELS). This is the only way to move a placed
  // image now that panels aren't draggable.
  function onDragStart(e: React.DragEvent<HTMLDivElement>): void {
    e.dataTransfer.setData(
      DRAG_MIME,
      serializeDrag({ kind: "tray", imageId: item.id }),
    );
    e.dataTransfer.effectAllowed = "move";
    onDragSourceChange?.({ kind: "tray", imageId: item.id });
  }
```

- [ ] **Step 4: Set `draggable` true for all thumbnails**

In the same file, change the wrapper `<div>` prop (line 89) from:
```typescript
      draggable={!placed}
```
to:
```typescript
      draggable
```

- [ ] **Step 5: Update the `clickable` comment (placed thumbs are no longer fully inert)**

Replace the comment above `clickable` (lines 82–84):
```typescript
  // Unplaced thumbnails double as click-to-place candidates AND keyboard
  // entry points: click arms placement, Enter places into the first empty
  // panel. Placed thumbnails are inert (they can't be re-dragged or placed).
  const clickable = !placed && onSelectForPlace !== undefined;
```
with:
```typescript
  // Unplaced thumbnails double as click-to-place candidates AND keyboard
  // entry points: click arms placement, Enter places into the first empty
  // panel. Placed thumbnails are NOT click-to-place, but they ARE draggable
  // (drag onto a panel to move/swap the placed image).
  const clickable = !placed && onSelectForPlace !== undefined;
```

- [ ] **Step 6: Give placed thumbnails a grab cursor**

In `src/renderer/styles.css`, replace the `.thumb--placed` rule (lines 718–721):
```css
.thumb--placed {
  /* "Placed" reads as done (check badge), not disabled — keep full contrast. */
  cursor: default;
}
```
with:
```css
.thumb--placed {
  /* "Placed" reads as done (check badge), not disabled — keep full contrast.
     Still draggable: drag onto a panel to move/swap the placed image. */
  cursor: grab;
}
.thumb--placed:active {
  cursor: grabbing;
}
```

- [ ] **Step 7: Run the thumbnail tests to verify they pass**

Run: `pnpm vitest run test/unit/thumbnail.test.tsx`
Expected: PASS.

- [ ] **Step 8: Typecheck, lint, format**

Run: `pnpm typecheck && pnpm lint && pnpm format`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/Sidebar/Thumbnail.tsx src/renderer/styles.css \
        test/unit/thumbnail.test.tsx
git commit -m "feat(tray): placed thumbnails are draggable to move/swap their image"
```

---

## Task 4: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass (0 failures). Watch specifically for any OTHER test that assumed panel-to-panel drag or "placed thumbs inert" — if one fails, read it and update it to the new behavior (panels never draggable; placed thumbs draggable; tray drag of a placed image → swap/move), then re-run.

- [ ] **Step 2: Typecheck + lint (final)**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors, zero warnings.

- [ ] **Step 3: Drive the app to confirm the fix end-to-end**

Use the `verify` skill (or the browser harness pattern used previously: build with `pnpm build`, serve `dist/renderer` with a `window.api` stub whose `openImages` returns a real image, drive with the Playwright MCP browser). Confirm, with the app zoomed in and an image placed in a panel:

1. **Pan over a selected image panel:** click the image panel to select it, then press-drag starting inside it — assert the scroll section's `scrollLeft`/`scrollTop` change (view pans) and the image stays in its original panel (no move/swap).
2. **Tray move/swap:** drag the placed image's tray thumbnail onto a different panel — assert the image moves (empty target) or swaps (occupied target).

Record the before/after scroll offsets and panel image ids as evidence.

- [ ] **Step 4: Final commit (if Step 1 required touching any extra test)**

```bash
git add -A
git commit -m "test: update remaining tests for tray-only image move"
```
(Skip if nothing else changed.)

---

## Notes for the implementer

- **Why `SWAP_PANELS` for both move and swap:** its reducer swaps the two panels' `imageId`/`transform`; if the target is empty, one side is `undefined`, so the image simply relocates and the source empties. It also relocates image-bound annotations (scale bars, labels) — do not reinvent this in `dispatchDrop`.
- **Do not delete the `DragPayload` `panel` variant** (`drag-payload.ts`). It's retained for wire-format stability; both `dispatchDrop` and `previewForDrop` keep a defensive `kind !== "tray"` guard.
- **Lockstep invariant:** `dispatchDrop` and `previewForDrop` must agree on accept/reject. If you change one, change the other — Task 1 does both together for this reason.
