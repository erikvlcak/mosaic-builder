# Click an Empty Panel to Add an Image — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking the centre of an empty panel opens the native file picker; the chosen images fill forward from that panel and join the side tray.

**Architecture:** A new pure geometry function (`browseZoneRect`) defines a centred hit rectangle inside every empty panel. `GridCells` renders a real `<button>` there, and `AnnotationInteractionLayer` carves a matching hole in its select-mode backdrop so that button actually receives clicks. A new compound reducer action (`IMPORT_IMAGES`) adds images to the pool and fills panels in one undo step, and a new `decodePickedFiles` module holds the decode loop shared by both import entry points.

**Tech Stack:** TypeScript (strict), React 18, Electron, Vitest + @testing-library/react, pnpm 10 / Node 22.

**Spec:** `docs/superpowers/specs/2026-07-21-click-empty-panel-to-add-image-design.md` (commit `0fb3ba8`).

## Global Constraints

- **Zero-warning policy.** `pnpm lint` runs `eslint --max-warnings 0` with type-checked rules. `pnpm typecheck` must stay green across all four project refs.
- **Prettier must pass.** Run `pnpm format` before committing if unsure.
- **Unused vars are errors** unless prefixed `_`.
- **Reducers return the identical state reference (`===`) on a no-op.** Call sites depend on this for memoization.
- **The reducer's `default` branch keeps its `const _exhaustive: never = a` guard.**
- **No comments stating WHAT code does.** Comments explain WHY only — invariants, hidden constraints, derivations.
- **Never mutate state fields in place.** Always allocate new arrays/Maps/Sets.
- **Exports must stay byte-identical.** The empty-panel caption is editor chrome, gated behind `opts.editorHints`, and must never appear on the export path.
- **Exact user-visible copy** (use verbatim):
  - Full caption: `Drag an image here or click to browse`
  - Short caption: `Drag or click to add`
  - Empty-panel hint: `Drag an image here from the tray · Click the centre to browse · ⇧Click cells to merge`
- **Do not add `zod`** or any new runtime dependency.
- Tests live in `test/unit/*.test.ts(x)`. Component tests need the `// @vitest-environment jsdom` pragma on line 1.

---

## Task Order and Dependencies

```
Task 1 (browseZoneRect) ─┬─► Task 5 (GridCells button) ─┬─► Task 7 (App wiring)
                         └─► Task 6 (backdrop holes)    │
Task 2 (caption tiers)                                  │
Task 3 (IMPORT_IMAGES) ─────────────────────────────────┤
Task 4 (decodePickedFiles) ─────────────────────────────┘
                                                        └─► Task 8 (hint bar + verify)
```

Tasks 1–4 are mutually independent and can be done in any order.

---

### Task 1: `browseZoneRect` geometry

The hit rectangle for the "click to browse" affordance. Both `GridCells` (renders the button) and `AnnotationInteractionLayer` (carves the matching backdrop hole) derive from this single definition, so they can never drift apart.

**Files:**

- Modify: `src/renderer/render/coords.ts` (append after the `PanelRect` interface region; anywhere top-level is fine)
- Test: `test/unit/coords-transform.test.ts` (append a new `describe` block at the end)

**Interfaces:**

- Consumes: `PanelRect` (already exported from `src/renderer/render/coords.ts:5`)
- Produces: `browseZoneRect(rect: PanelRect): PanelRect` — used by Task 5 and Task 6.

- [ ] **Step 1: Write the failing test**

Append to the end of `test/unit/coords-transform.test.ts`:

```ts
describe("browseZoneRect — empty-panel click-to-browse hit target", () => {
  it("centres a 70% x 60% box inside a typical panel", () => {
    const z = browseZoneRect({ x: 10, y: 20, w: 200, h: 150 });
    expect(z).toEqual({ x: 40, y: 50, w: 140, h: 90 });
  });

  it("caps width at 280 and height at 120 on an oversized panel", () => {
    const z = browseZoneRect({ x: 0, y: 0, w: 1000, h: 800 });
    expect(z).toEqual({ x: 360, y: 340, w: 280, h: 120 });
  });

  it("stays proportional on a small panel (no minimum size)", () => {
    const z = browseZoneRect({ x: 5, y: 7, w: 60, h: 40 });
    expect(z).toEqual({ x: 14, y: 15, w: 42, h: 24 });
  });

  it("is always fully contained by its panel", () => {
    const panels = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 3, y: 9, w: 137, h: 401 },
      { x: 0, y: 0, w: 4000, h: 4000 },
      { x: 250, y: 250, w: 1, h: 1 },
    ];
    for (const p of panels) {
      const z = browseZoneRect(p);
      expect(z.x).toBeGreaterThanOrEqual(p.x);
      expect(z.y).toBeGreaterThanOrEqual(p.y);
      expect(z.x + z.w).toBeLessThanOrEqual(p.x + p.w);
      expect(z.y + z.h).toBeLessThanOrEqual(p.y + p.h);
    }
  });
});
```

Add `browseZoneRect` to the existing import block at the top of the file (which currently imports `rotatedImageDims`, `baseScale`, `clampCoverPan`, `clampZoom`, `snapTransform`, `panForCursorZoom`, `clamp` from `"../../src/renderer/render/coords"`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/unit/coords-transform.test.ts -t "browseZoneRect"`
Expected: FAIL — `browseZoneRect is not a function` (or a TS/import error).

- [ ] **Step 3: Write the implementation**

Add to `src/renderer/render/coords.ts`:

```ts
const BROWSE_ZONE_W_RATIO = 0.7;
const BROWSE_ZONE_H_RATIO = 0.6;
const BROWSE_ZONE_MAX_W = 280;
const BROWSE_ZONE_MAX_H = 120;

/**
 * Hit rectangle for the click-to-browse affordance on an empty panel.
 * Proportional so it tracks panel size, but capped so a full-bleed panel
 * still leaves a wide border where a click selects and a drag pans.
 *
 * Single source of truth: GridCells positions its <button> from this, and
 * AnnotationInteractionLayer carves the matching backdrop hole from it. If
 * the two ever disagreed the button would silently stop receiving clicks.
 */
export function browseZoneRect(rect: PanelRect): PanelRect {
  const w = Math.min(rect.w * BROWSE_ZONE_W_RATIO, BROWSE_ZONE_MAX_W);
  const h = Math.min(rect.h * BROWSE_ZONE_H_RATIO, BROWSE_ZONE_MAX_H);
  return {
    x: rect.x + (rect.w - w) / 2,
    y: rect.y + (rect.h - h) / 2,
    w,
    h,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/unit/coords-transform.test.ts -t "browseZoneRect"`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/render/coords.ts test/unit/coords-transform.test.ts
git commit -m "feat(coords): add browseZoneRect for the empty-panel browse target"
```

---

### Task 2: Size-aware empty-panel caption

The new copy is ~40% longer than today's `"Drag an image here"`, and `drawPlaceholder` has no overflow guard. Add ordered tiers so a panel too small in _either_ axis draws no caption at all.

**Files:**

- Modify: `src/renderer/render/draw-figure.ts:66` (the `DRAG_HINT_TEXT` constant) and `src/renderer/render/draw-figure.ts:217-245` (`drawPlaceholder`)
- Test: `test/unit/draw-figure.test.ts:179-211` (replace three existing caption tests)

**Interfaces:**

- Consumes: `PanelRect`, the existing `drawPlaceholder(ctx, rect, label, showCaption, theme)` signature (unchanged).
- Produces: nothing consumed by later tasks. Task 8 references the caption strings only as user-visible copy.

**Heads-up on the existing tests:** the shared `FIG` fixture at `test/unit/draw-figure.test.ts:129` is a 200×200 canvas with a 2×2 grid and a 10px gutter, so each panel is ~85px wide. Under the new tiers that is below `CAPTION_MIN_W`, so `FIG` panels draw **no** caption. The three existing caption tests must be replaced with fixtures sized for each tier, not merely have their strings swapped.

- [ ] **Step 1: Write the failing tests**

In `test/unit/draw-figure.test.ts`, delete these three existing tests entirely:

- `"draws no 'Drag an image here' caption by default (export path)"`
- `"draws a 'Drag an image here' caption on every empty panel when editorHints is on"`
- `"shows the caption even with an empty pool (first-run guidance)"`

Insert this block in their place:

```ts
const FULL_CAPTION = "Drag an image here or click to browse";
const SHORT_CAPTION = "Drag or click to add";

/** 1x1 grid with no gutter, so the single panel IS the whole canvas. */
function onePanelFig(widthPx: number, heightPx: number): Figure {
  return {
    canvas: { widthPx, heightPx, background: "#FFF" },
    grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
    panels: [
      {
        panelId: "p1",
        row: 0,
        col: 0,
        kind: "placeholder",
        label: "A",
        rowSpan: 1,
        colSpan: 1,
      },
    ],
    annotations: [],
    globalStyle: DEFAULT_GLOBAL_STYLE,
  };
}

function captionsDrawn(ctx: { calls: Call[] }): string[] {
  return ctx.calls
    .filter(
      (c) =>
        c.op === "fillText" &&
        (c.args[0] === FULL_CAPTION || c.args[0] === SHORT_CAPTION),
    )
    .map((c) => String(c.args[0]));
}

it("draws no caption at all on the export path (no editorHints)", () => {
  const ctx = makeRecorder();
  drawFigure(ctx, onePanelFig(400, 200), new Map());
  expect(captionsDrawn(ctx)).toEqual([]);
});

it("draws the full caption on a wide panel when editorHints is on", () => {
  const ctx = makeRecorder();
  drawFigure(ctx, onePanelFig(400, 200), new Map(), new Map(), {
    editorHints: true,
  });
  expect(captionsDrawn(ctx)).toEqual([FULL_CAPTION]);
});

it("falls back to the short caption on a mid-width panel", () => {
  const ctx = makeRecorder();
  drawFigure(ctx, onePanelFig(160, 120), new Map(), new Map(), {
    editorHints: true,
  });
  expect(captionsDrawn(ctx)).toEqual([SHORT_CAPTION]);
});

it("draws no caption when the panel is too narrow", () => {
  const ctx = makeRecorder();
  drawFigure(ctx, onePanelFig(80, 200), new Map(), new Map(), {
    editorHints: true,
  });
  expect(captionsDrawn(ctx)).toEqual([]);
});

it("draws no caption on a wide-but-short panel (height tier is checked first)", () => {
  const ctx = makeRecorder();
  drawFigure(ctx, onePanelFig(400, 50), new Map(), new Map(), {
    editorHints: true,
  });
  expect(captionsDrawn(ctx)).toEqual([]);
});

it("still shows the caption with an empty pool (first-run guidance)", () => {
  const ctx = makeRecorder();
  drawFigure(ctx, onePanelFig(400, 200), new Map(), new Map(), {
    editorHints: true,
  });
  expect(captionsDrawn(ctx).length).toBeGreaterThan(0);
});

it("keeps the letter dead-centre when no caption is drawn", () => {
  const ctx = makeRecorder();
  // 400x50: caption suppressed, so the letter must NOT carry the -14 nudge.
  drawFigure(ctx, onePanelFig(400, 50), new Map(), new Map(), {
    editorHints: true,
  });
  const letter = ctx.calls.find(
    (c) => c.op === "fillText" && c.args[0] === "A",
  );
  expect(letter?.args[2]).toBe(25);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run test/unit/draw-figure.test.ts`
Expected: FAIL — the caption tests find `"Drag an image here"` instead of the new strings, so `captionsDrawn` returns `[]` where a caption is expected.

- [ ] **Step 3: Write the implementation**

In `src/renderer/render/draw-figure.ts`, replace the `DRAG_HINT_TEXT` constant at line 66:

```ts
const DRAG_HINT_TEXT = "Drag an image here or click to browse";
const DRAG_HINT_TEXT_SHORT = "Drag or click to add";
const CAPTION_MIN_W = 96;
const CAPTION_MIN_H = 64;
const CAPTION_FULL_MIN_W = 240;
```

Add this helper above `drawPlaceholder`:

```ts
/**
 * Tiers are ordered, not independent: a panel too small in EITHER axis is
 * rejected first, so a wide-but-short panel can't match on width alone and
 * then overflow its own height. 13px text needs roughly 240px to fit the
 * full string.
 */
function captionFor(rect: PanelRect): string | null {
  if (rect.w < CAPTION_MIN_W || rect.h < CAPTION_MIN_H) return null;
  return rect.w >= CAPTION_FULL_MIN_W ? DRAG_HINT_TEXT : DRAG_HINT_TEXT_SHORT;
}
```

Then replace the body of `drawPlaceholder` from the `const cx` line to the end (currently `src/renderer/render/draw-figure.ts:230-244`):

```ts
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const caption = showCaption ? captionFor(rect) : null;
  ctx.fillStyle = dark ? PLACEHOLDER_LABEL_DARK : PLACEHOLDER_LABEL;
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Nudge the letter up a touch when a caption sits below it so the pair stays
  // visually centered; keep it dead-center when there's no caption.
  ctx.fillText(label, cx, caption !== null ? cy - 14 : cy);

  if (caption !== null) {
    ctx.fillStyle = dark ? PLACEHOLDER_CAPTION_DARK : PLACEHOLDER_CAPTION;
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(caption, cx, cy + 14);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run test/unit/draw-figure.test.ts`
Expected: PASS — all tests in the file, including the 7 new caption tests.

- [ ] **Step 5: Confirm no other test referenced the old string**

Run: `grep -rn "Drag an image here\"" test/ src/`
Expected: only `src/renderer/components/StatusHints/HintBar.tsx` and `test/unit/hint-bar.test.tsx` (both handled in Task 8). No hits in `draw-figure` or `editor-renderer` tests.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/render/draw-figure.ts test/unit/draw-figure.test.ts
git commit -m "feat(render): size-aware empty-panel caption mentioning click-to-browse"
```

---

### Task 3: `IMPORT_IMAGES` compound action

One action that adds N images to the pool and optionally fills panels forward — so the whole import is a single undo step instead of N.

**Files:**

- Modify: `src/renderer/model/figure-actions.ts` (action union near line 52, creator near line 122, reducer case near the `PLACE_INTO_PANEL` case at line 398)
- Test: `test/unit/figure-actions.test.ts` (append a new `describe` block)

**Interfaces:**

- Consumes: `ImagePoolItem` (from `src/renderer/model/pool.ts`), and the module-local helpers `findPanelById` and `setPanelImage` already used by the `PLACE_INTO_PANEL` case.
- Produces: `importImages(items: ImagePoolItem[], startPanelId?: string): FigureAction` — used by Task 7.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/figure-actions.test.ts`. `IMG_A` / `IMG_B` already exist in this file (line 62); this block adds `IMG_C` and `IMG_D` locally.

```ts
describe("IMPORT_IMAGES — batch import as one undoable transition", () => {
  const IMG_C: ImagePoolItem = {
    id: "c",
    filename: "c.png",
    filePath: "/x/c.png",
    mime: "image/png",
    width: 100,
    height: 100,
    bitDepth: 8,
  };
  const IMG_D: ImagePoolItem = {
    id: "d",
    filename: "d.png",
    filePath: "/x/d.png",
    mime: "image/png",
    width: 100,
    height: 100,
    bitDepth: 8,
  };

  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  it("adds every item to the pool when no start panel is given", () => {
    const s = initialFigureState();
    const next = figureReducer(s, importImages([IMG_A, IMG_B]));
    expect(next.pool.map((p) => p.id)).toEqual(["a", "b"]);
    expect(next.panels.every((p) => p.imageId === undefined)).toBe(true);
  });

  it("fills forward from the start panel in row-major order", () => {
    // initialFigureState is a 2x2 grid: panels are [0,0] [0,1] [1,0] [1,1].
    const s = initialFigureState();
    const start = s.panels[1]!; // row 0, col 1
    const next = figureReducer(
      s,
      importImages([IMG_A, IMG_B, IMG_C], start.id),
    );
    expect(next.panels[1]!.imageId).toBe("a");
    expect(next.panels[2]!.imageId).toBe("b");
    expect(next.panels[3]!.imageId).toBe("c");
    expect(next.panels[0]!.imageId).toBeUndefined();
  });

  it("does not wrap around — leftovers stay unplaced in the pool", () => {
    const s = initialFigureState();
    const start = s.panels[3]!; // last panel of the 2x2 grid
    const next = figureReducer(
      s,
      importImages([IMG_A, IMG_B, IMG_C], start.id),
    );
    expect(next.panels[3]!.imageId).toBe("a");
    expect(next.panels[0]!.imageId).toBeUndefined();
    // All three are in the pool; only one is placed.
    expect(next.pool.map((p) => p.id)).toEqual(["a", "b", "c"]);
    const placed = next.panels.filter((p) => p.imageId !== undefined);
    expect(placed).toHaveLength(1);
  });

  it("skips hidden panels when filling forward", () => {
    const s0 = initialFigureState();
    const s = figureReducer(s0, setPanelHidden(s0.panels[1]!.id, true));
    const start = s.panels[0]!;
    const next = figureReducer(s, importImages([IMG_A, IMG_B], start.id));
    expect(next.panels[0]!.imageId).toBe("a");
    expect(next.panels[1]!.imageId).toBeUndefined();
    expect(next.panels[2]!.imageId).toBe("b");
  });

  it("skips already-occupied panels when filling forward", () => {
    const s0 = withPool(IMG_A);
    const s = figureReducer(s0, placeIntoPanel("a", s0.panels[1]!.id));
    const start = s.panels[0]!;
    const next = figureReducer(s, importImages([IMG_B, IMG_C], start.id));
    expect(next.panels[0]!.imageId).toBe("b");
    expect(next.panels[1]!.imageId).toBe("a");
    expect(next.panels[2]!.imageId).toBe("c");
  });

  it("adds to the pool but places nothing when the start panel is occupied", () => {
    const s0 = withPool(IMG_A);
    const s = figureReducer(s0, placeIntoPanel("a", s0.panels[0]!.id));
    const next = figureReducer(s, importImages([IMG_B], s.panels[0]!.id));
    expect(next.pool.map((p) => p.id)).toEqual(["a", "b"]);
    expect(next.panels[1]!.imageId).toBeUndefined();
  });

  it("adds to the pool but places nothing when the start panel is hidden", () => {
    const s0 = initialFigureState();
    const s = figureReducer(s0, setPanelHidden(s0.panels[0]!.id, true));
    const next = figureReducer(s, importImages([IMG_A], s.panels[0]!.id));
    expect(next.pool.map((p) => p.id)).toEqual(["a"]);
    expect(next.panels.every((p) => p.imageId === undefined)).toBe(true);
  });

  it("adds to the pool but places nothing for an unknown start panel id", () => {
    const s = initialFigureState();
    const next = figureReducer(s, importImages([IMG_A], "no-such-panel"));
    expect(next.pool.map((p) => p.id)).toEqual(["a"]);
    expect(next.panels.every((p) => p.imageId === undefined)).toBe(true);
  });

  it("returns the same state reference for an empty item list", () => {
    const s = initialFigureState();
    expect(figureReducer(s, importImages([]))).toBe(s);
    expect(figureReducer(s, importImages([], s.panels[0]!.id))).toBe(s);
  });

  it("returns the same state reference when every id is already pooled", () => {
    const s = withPool(IMG_A, IMG_B);
    expect(figureReducer(s, importImages([IMG_A, IMG_B]))).toBe(s);
  });

  it("adds only the ids that are new", () => {
    const s = withPool(IMG_A);
    const next = figureReducer(s, importImages([IMG_A, IMG_B]));
    expect(next.pool.map((p) => p.id)).toEqual(["a", "b"]);
  });
});
```

Add `importImages` to the existing import block from `"../../src/renderer/model/figure-actions"` at the top of the file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run test/unit/figure-actions.test.ts -t "IMPORT_IMAGES"`
Expected: FAIL — `importImages` is not exported.

- [ ] **Step 3: Add the action variant and creator**

In `src/renderer/model/figure-actions.ts`, add to the `FigureAction` union next to `ADD_TO_POOL` (line 52):

```ts
  | { type: "IMPORT_IMAGES"; items: ImagePoolItem[]; startPanelId?: string }
```

Add the creator next to `addToPool` (around line 122):

```ts
export const importImages = (
  items: ImagePoolItem[],
  startPanelId?: string,
): FigureAction => ({
  type: "IMPORT_IMAGES",
  items,
  ...(startPanelId !== undefined ? { startPanelId } : {}),
});
```

- [ ] **Step 4: Add the reducer case**

Insert directly after the `ADD_TO_POOL` case (which ends at line 387):

```ts
    case "IMPORT_IMAGES": {
      if (a.items.length === 0) return s;
      const pooled = new Set(s.pool.map((p) => p.id));
      // Only fresh ids get placed: an id already in the pool may already be
      // on a panel, and an image may occupy at most one panel.
      const fresh = a.items.filter((it) => !pooled.has(it.id));
      if (fresh.length === 0) return s;
      const pool = [...s.pool, ...fresh];

      if (a.startPanelId === undefined) return { ...s, pool };
      const start = findPanelById(s.panels, a.startPanelId);
      if (start === undefined) return { ...s, pool };
      if (start.imageId !== undefined || start.hidden === true) {
        return { ...s, pool };
      }

      // Fill forward only, never wrapping back to earlier empties. Sorted by
      // (row, col) rather than trusting `s.panels` order so the fill order
      // always matches the row-major auto-letter order shown on the canvas.
      const candidates = s.panels
        .filter((p) => p.imageId === undefined && p.hidden !== true)
        .sort((x, y) => x.row - y.row || x.col - y.col)
        .filter(
          (p) => p.row > start.row || (p.row === start.row && p.col >= start.col),
        );

      let panels = s.panels;
      const n = Math.min(fresh.length, candidates.length);
      for (let i = 0; i < n; i++) {
        panels = setPanelImage(panels, candidates[i]!.id, fresh[i]!.id);
      }
      return { ...s, pool, panels };
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run test/unit/figure-actions.test.ts`
Expected: PASS — the whole file, including the 11 new `IMPORT_IMAGES` tests.

- [ ] **Step 6: Verify the reducer stays exhaustive and typed**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0. If the `_exhaustive: never` guard errors, the new case was misplaced outside the `switch`.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/model/figure-actions.ts test/unit/figure-actions.test.ts
git commit -m "feat(model): IMPORT_IMAGES action — batch pool add + fill forward in one undo step"
```

---

### Task 4: `decodePickedFiles` shared decode helper

Two entry points now need "turn picked files into pool items", so the loop currently inlined in `App.onAddImagesClick` moves to its own module. This also makes the behavior testable without mounting `App` (no test currently does).

**Files:**

- Create: `src/renderer/basename.ts`
- Create: `src/renderer/image/decode-picked-files.ts`
- Test: `test/unit/decode-picked-files.test.ts` (new)
- Modify: `src/renderer/App.tsx:114-117` (delete the local `basename`, import it instead)

**Interfaces:**

- Consumes: `decodeImageBytes` from `src/renderer/image/decode-bytes.ts`; `newImageId` and `ImagePoolItem` from `src/renderer/model/pool.ts`; `OpenedFileDto` from `src/preload/api.ts`.
- Produces:

  - `basename(p: string): string`
  - `interface DecodedPick { items: ImagePoolItem[]; bitmaps: Map<string, ImageBitmap>; failures: string[] }`
  - `decodePickedFiles(files: readonly OpenedFileDto[]): Promise<DecodedPick>` — used by Task 7.

- [ ] **Step 1: Write the failing test**

Create `test/unit/decode-picked-files.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OpenedFileDto } from "../../src/preload/api";

// vi.hoisted is required: vi.mock is hoisted above every const, so a factory
// that closed over a plain `const decodeImageBytes = vi.fn()` would hit a TDZ
// error. vi.hoisted runs the initializer at hoist time instead.
const { decodeImageBytes } = vi.hoisted(() => ({ decodeImageBytes: vi.fn() }));
vi.mock("../../src/renderer/image/decode-bytes", () => ({ decodeImageBytes }));

import { decodePickedFiles } from "../../src/renderer/image/decode-picked-files";

function file(filePath: string): OpenedFileDto {
  return { filePath, bytes: new Uint8Array([1, 2, 3]), mime: "image/png" };
}

function bitmap(w: number, h: number): ImageBitmap {
  return { width: w, height: h } as unknown as ImageBitmap;
}

beforeEach(() => {
  decodeImageBytes.mockReset();
});

describe("decodePickedFiles", () => {
  it("builds one pool item per file, in input order", async () => {
    decodeImageBytes
      .mockResolvedValueOnce({ bitmap: bitmap(10, 20), bitDepth: 8 })
      .mockResolvedValueOnce({ bitmap: bitmap(30, 40), bitDepth: 16 });

    const r = await decodePickedFiles([file("/x/a.png"), file("/y/b.png")]);

    expect(r.items).toHaveLength(2);
    expect(r.items.map((i) => i.filename)).toEqual(["a.png", "b.png"]);
    expect(r.items[0]).toMatchObject({
      filePath: "/x/a.png",
      mime: "image/png",
      width: 10,
      height: 20,
      bitDepth: 8,
    });
    expect(r.items[1]).toMatchObject({ width: 30, height: 40, bitDepth: 16 });
    expect(r.failures).toEqual([]);
  });

  it("keys the bitmap map by the generated item id", async () => {
    const bm = bitmap(10, 20);
    decodeImageBytes.mockResolvedValueOnce({ bitmap: bm, bitDepth: 8 });

    const r = await decodePickedFiles([file("/x/a.png")]);

    const id = r.items[0]!.id;
    expect(r.bitmaps.get(id)).toBe(bm);
    expect(r.bitmaps.size).toBe(1);
  });

  it("includes calibration only when the decoder returns it", async () => {
    decodeImageBytes
      .mockResolvedValueOnce({ bitmap: bitmap(1, 1), bitDepth: 8 })
      .mockResolvedValueOnce({
        bitmap: bitmap(1, 1),
        bitDepth: 8,
        calibration: { pixelsPerUnit: 4, unit: "µm" },
      });

    const r = await decodePickedFiles([file("/a.png"), file("/b.png")]);

    expect("calibration" in r.items[0]!).toBe(false);
    expect(r.items[1]!.calibration).toEqual({ pixelsPerUnit: 4, unit: "µm" });
  });

  it("reports a failing file without aborting the rest of the batch", async () => {
    decodeImageBytes
      .mockResolvedValueOnce({ bitmap: bitmap(1, 1), bitDepth: 8 })
      .mockRejectedValueOnce(new Error("corrupt"))
      .mockResolvedValueOnce({ bitmap: bitmap(2, 2), bitDepth: 8 });

    const r = await decodePickedFiles([
      file("/ok1.png"),
      file("/bad.png"),
      file("/ok2.png"),
    ]);

    expect(r.items.map((i) => i.filename)).toEqual(["ok1.png", "ok2.png"]);
    expect(r.failures).toEqual(["bad.png"]);
  });

  it("handles Windows-style paths when deriving the filename", async () => {
    decodeImageBytes.mockResolvedValueOnce({
      bitmap: bitmap(1, 1),
      bitDepth: 8,
    });
    const r = await decodePickedFiles([
      {
        filePath: "C:\\imgs\\scan.png",
        bytes: new Uint8Array(),
        mime: "image/png",
      },
    ]);
    expect(r.items[0]!.filename).toBe("scan.png");
  });

  it("returns empty results for an empty file list", async () => {
    const r = await decodePickedFiles([]);
    expect(r.items).toEqual([]);
    expect(r.failures).toEqual([]);
    expect(r.bitmaps.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/unit/decode-picked-files.test.ts`
Expected: FAIL — cannot resolve `src/renderer/image/decode-picked-files`.

- [ ] **Step 3: Create the `basename` module**

Create `src/renderer/basename.ts`:

```ts
/**
 * Last path segment, for both posix and Windows separators. Electron hands
 * back native paths, so a renderer that only split on "/" would show the
 * full path as a filename on Windows.
 */
export function basename(p: string): string {
  const ix = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return ix >= 0 ? p.slice(ix + 1) : p;
}
```

- [ ] **Step 4: Create the decode module**

Create `src/renderer/image/decode-picked-files.ts`:

```ts
import type { OpenedFileDto } from "../../preload/api";
import { newImageId, type ImagePoolItem } from "../model/pool";
import { basename } from "../basename";
import { decodeImageBytes } from "./decode-bytes";

export interface DecodedPick {
  items: ImagePoolItem[];
  /** Keyed by `ImagePoolItem.id`, ready to merge into the renderer cache. */
  bitmaps: Map<string, ImageBitmap>;
  /** Basenames that failed to decode, in input order. */
  failures: string[];
}

/**
 * Shared by both import entry points (the tray's "Add images…" button and
 * the empty-panel browse zone). Failures are collected rather than thrown so
 * one corrupt file in a batch of twenty can't abort the other nineteen; the
 * caller turns `failures` into a single toast.
 */
export async function decodePickedFiles(
  files: readonly OpenedFileDto[],
): Promise<DecodedPick> {
  const items: ImagePoolItem[] = [];
  const bitmaps = new Map<string, ImageBitmap>();
  const failures: string[] = [];

  for (const f of files) {
    let decoded;
    try {
      decoded = await decodeImageBytes(f.bytes, f.mime);
    } catch {
      failures.push(basename(f.filePath));
      continue;
    }
    const { bitmap, bitDepth, calibration } = decoded;
    const item: ImagePoolItem = {
      id: newImageId(),
      filename: basename(f.filePath),
      filePath: f.filePath,
      mime: f.mime,
      width: bitmap.width,
      height: bitmap.height,
      bitDepth,
      ...(calibration !== undefined ? { calibration } : {}),
    };
    items.push(item);
    bitmaps.set(item.id, bitmap);
  }

  return { items, bitmaps, failures };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run test/unit/decode-picked-files.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 6: Point App at the shared `basename`**

In `src/renderer/App.tsx`, delete the local `basename` function (lines 114-117) and add to the imports:

```ts
import { basename } from "./basename";
```

`App.tsx` still uses `basename` for the window-title path at line ~835; that call site is unchanged. The decode loop inside `onAddImagesClick` is rewritten in Task 7 — leave it alone for now, it still compiles against the imported `basename`.

- [ ] **Step 7: Verify nothing broke**

Run: `pnpm typecheck && pnpm test`
Expected: both exit 0, full suite green.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/basename.ts src/renderer/image/decode-picked-files.ts test/unit/decode-picked-files.test.ts src/renderer/App.tsx
git commit -m "refactor(image): extract decodePickedFiles and shared basename helper"
```

---

### Task 5: Browse-zone button in `GridCells`

**Files:**

- Modify: `src/renderer/components/Grid/GridCells.tsx` (Props interface near line 52; panel render body near line 447-468)
- Modify: `src/renderer/styles.css` (add after the `.grid-panel-crop-badge:focus-visible` rule, ~line 886)
- Test: `test/unit/grid-cells-modes.test.tsx`

**Interfaces:**

- Consumes: `browseZoneRect` from Task 1.
- Produces: a new optional `GridCells` prop `onPanelBrowseClick?: (panelId: string) => void`, and the testid `browse-zone-<row>-<col>` — both used by Task 7.

- [ ] **Step 1: Write the failing tests**

In `test/unit/grid-cells-modes.test.tsx`, extend the `renderGrid` helper to accept and forward the new prop. Change its signature and body:

```tsx
function renderGrid(opts: {
  interaction: PanelInteraction;
  onPanelClick?: (id: string) => void;
  onPanelDoubleClick?: (id: string) => void;
}): {
  state: FigureState;
  onPanelClick: ReturnType<typeof vi.fn>;
  onPanelDoubleClick: ReturnType<typeof vi.fn>;
  onPanelBrowseClick: ReturnType<typeof vi.fn>;
} {
  const state = stateWithImage();
  const onPanelClick = vi.fn(opts.onPanelClick);
  const onPanelDoubleClick = vi.fn(opts.onPanelDoubleClick);
  const onPanelBrowseClick = vi.fn();
  render(
    <GridCells
      state={state}
      figurePxW={800}
      figurePxH={600}
      cssW={800}
      cssH={600}
      onDrop={vi.fn()}
      hoverPanelId={null}
      onHoverPanelChange={vi.fn()}
      dragSource={null}
      onDragSourceChange={vi.fn()}
      selection={new Set<string>()}
      onCellShiftClick={vi.fn()}
      panelInteraction={opts.interaction}
      onPanelClick={onPanelClick}
      onPanelDoubleClick={onPanelDoubleClick}
      onHoleClick={vi.fn()}
      onPanelBrowseClick={onPanelBrowseClick}
    />,
  );
  return { state, onPanelClick, onPanelDoubleClick, onPanelBrowseClick };
}
```

Then append this `describe` block at the end of the file:

```tsx
describe("GridCells — empty-panel browse zone", () => {
  it("renders a browse zone on empty panels only", () => {
    const { state } = renderGrid({ interaction: null });
    const occupied = state.panels.find((p) => p.imageId !== undefined)!;
    const empty = state.panels.find((p) => p.imageId === undefined)!;
    expect(
      screen.queryByTestId(`browse-zone-${occupied.row}-${occupied.col}`),
    ).toBeNull();
    expect(
      screen.getByTestId(`browse-zone-${empty.row}-${empty.col}`),
    ).toBeTruthy();
  });

  it("clicking the browse zone calls onPanelBrowseClick and not onPanelClick", () => {
    const { state, onPanelBrowseClick, onPanelClick } = renderGrid({
      interaction: null,
    });
    const empty = state.panels.find((p) => p.imageId === undefined)!;
    fireEvent.click(
      screen.getByTestId(`browse-zone-${empty.row}-${empty.col}`),
    );
    expect(onPanelBrowseClick).toHaveBeenCalledWith(empty.id);
    expect(onPanelClick).not.toHaveBeenCalled();
  });

  it("stamps the browse zone data-interactive so the pan owner skips it", () => {
    const { state } = renderGrid({ interaction: null });
    const empty = state.panels.find((p) => p.imageId === undefined)!;
    const el = screen.getByTestId(`browse-zone-${empty.row}-${empty.col}`);
    expect(el.getAttribute("data-interactive")).toBe("browse");
    expect(el.tagName).toBe("BUTTON");
  });

  it("centres the zone inside its panel at 70% x 60%", () => {
    // 2x2 grid over 800x600 with the default gutter; assert the zone's box is
    // centred within the panel rather than hard-coding gutter arithmetic.
    const { state } = renderGrid({ interaction: null });
    const empty = state.panels.find((p) => p.imageId === undefined)!;
    const zone = screen.getByTestId(`browse-zone-${empty.row}-${empty.col}`);
    const panel = screen.getByTestId(`panel-${empty.row}-${empty.col}`);
    const px = (v: string): number => Number(v.replace("px", ""));
    const panelW = px(panel.style.width);
    const panelH = px(panel.style.height);
    expect(px(zone.style.width)).toBeCloseTo(Math.min(panelW * 0.7, 280), 5);
    expect(px(zone.style.height)).toBeCloseTo(Math.min(panelH * 0.6, 120), 5);
    // Offsets are panel-relative, so left == (panelW - zoneW) / 2.
    expect(px(zone.style.left)).toBeCloseTo(
      (panelW - px(zone.style.width)) / 2,
      5,
    );
    expect(px(zone.style.top)).toBeCloseTo(
      (panelH - px(zone.style.height)) / 2,
      5,
    );
  });

  it("renders no browse zone on a hidden panel", () => {
    const base = stateWithImage();
    const hiddenTarget = base.panels.find((p) => p.imageId === undefined)!;
    const state: FigureState = {
      ...base,
      panels: base.panels.map((p) =>
        p.id === hiddenTarget.id ? { ...p, hidden: true } : p,
      ),
    };
    render(
      <GridCells
        state={state}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        hoverPanelId={null}
        onHoverPanelChange={vi.fn()}
        dragSource={null}
        onDragSourceChange={vi.fn()}
        selection={new Set<string>()}
        onCellShiftClick={vi.fn()}
        panelInteraction={null}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
        onHoleClick={vi.fn()}
        onPanelBrowseClick={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId(
        `browse-zone-${hiddenTarget.row}-${hiddenTarget.col}`,
      ),
    ).toBeNull();
  });
});
```

This last test renders a second `GridCells`; `test/setup.ts` runs `cleanup()` after each test, so the extra render inside the same test is fine as long as it is the only render in that test — it is, because it does not call `renderGrid`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run test/unit/grid-cells-modes.test.tsx`
Expected: FAIL — no element with testid `browse-zone-*`.

- [ ] **Step 3: Add the prop to `GridCells`**

In `src/renderer/components/Grid/GridCells.tsx`, add to the `Props` interface after `onPanelCropBadgeClick` (line 52):

```ts
  /** Click on an empty panel's centred browse target — opens the picker. */
  onPanelBrowseClick?: (panelId: string) => void;
```

Add `onPanelBrowseClick` to the destructured parameter list of `GridCellsImpl` (alongside `onPanelCropBadgeClick`).

Add `browseZoneRect` to the existing `coords` import at the top:

```ts
import {
  computeGridLayout,
  computeCellRect,
  browseZoneRect,
} from "../../render/coords";
```

- [ ] **Step 4: Render the button**

First, inside the `state.panels.map((panel, i) => { ... })` callback, compute the zone once — next to the existing `const occupied = panel.imageId !== undefined;` (line 302):

```ts
const browseZone = browseZoneRect(r);
```

Then add this as a sibling of the existing `isHidden` badge and crop badge (i.e. inside the panel `<div>`, after the crop-badge block that ends at line 468):

```tsx
{
  !occupied && !isHidden && onPanelBrowseClick !== undefined && (
    <button
      type="button"
      className="panel-browse-zone"
      // Stamped interactive so useViewportGestures never starts a
      // background pan here; Space+drag and middle-drag still pan.
      data-interactive="browse"
      data-testid={`browse-zone-${panel.row}-${panel.col}`}
      aria-label={`Add image to panel at row ${panel.row + 1}, column ${panel.col + 1}`}
      title="Click to browse for an image"
      onClick={(e) => {
        e.stopPropagation();
        onPanelBrowseClick(panel.id);
      }}
      style={{
        position: "absolute",
        // Panel-relative: the parent div is already offset by r.
        left: (browseZone.x - r.x) * sx,
        top: (browseZone.y - r.y) * sy,
        width: browseZone.w * sx,
        height: browseZone.h * sy,
      }}
    />
  );
}
```

- [ ] **Step 5: Add the styles**

Append to `src/renderer/styles.css` after the `.grid-panel-crop-badge:focus-visible` rule:

```css
/* Invisible until hovered: the canvas-painted caption is the visible
   affordance, this is its hit target. */
.panel-browse-zone {
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  cursor: pointer;
  pointer-events: auto;
  transition:
    background 80ms ease,
    border-color 80ms ease;
}
.panel-browse-zone:hover {
  background: var(--c-accent-soft);
  border-color: var(--c-accent);
}
.panel-browse-zone:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 1px;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run test/unit/grid-cells-modes.test.tsx`
Expected: PASS — the whole file, including the 5 new browse-zone tests.

- [ ] **Step 7: Confirm drop handling still works**

Run: `pnpm vitest run test/unit/dispatch-drop.test.ts test/unit/preview-for-drop.test.ts test/unit/annotation-layer-drop-passthrough.test.tsx`
Expected: PASS. The button is a child of the panel div and does not stop drag events, so `dragover`/`drop` still bubble to the panel's handlers.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/Grid/GridCells.tsx src/renderer/styles.css test/unit/grid-cells-modes.test.tsx
git commit -m "feat(grid): centred browse-zone button on empty panels"
```

---

### Task 6: Carve browse zones out of the select-mode backdrop

Without this the button from Task 5 never receives a click: in select mode the annotation layer's backdrop covers empty panels, and clicks reach `GridCells` only through an explicit forward.

**Files:**

- Modify: `src/renderer/components/Annotations/AnnotationInteractionLayer.tsx:1728-1751` (the `holes` assembly)
- Test: `test/unit/annotation-layer-browse-zone-passthrough.test.tsx` (new)
- Fix fallout: `test/unit/annotation-layer-panel-drag-passthrough.test.tsx:164-169`, `test/unit/annotation-layer-hole-click-passthrough.test.tsx:136,159,181`

**Interfaces:**

- Consumes: `browseZoneRect` from Task 1; the existing module-local `carveBackdropStrips`, `BackdropRect`, `figToCssX`, `figToCssY`, `panelRectsById`.
- Produces: nothing consumed by later tasks.

**Known fallout — read before starting.** The `holes.length === 0` fast path renders one full-coverage `<div data-testid="annotation-backdrop">`. Today a figure of only empty panels takes that path; after this change every visible empty panel contributes a hole, so those figures render `annotation-backdrop-strip-N` divs instead. Two existing test files assert the single-backdrop testid while rendering placeholder panels and **will** fail. They are fixed in Step 5 below. `test/unit/annotation-interaction-layer.test.tsx` is unaffected — its `FIG` has `panels: []`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/annotation-layer-browse-zone-passthrough.test.tsx`. Copy the `beforeAll` pointer-event polyfill block verbatim from `test/unit/annotation-layer-click-passthrough.test.tsx:29-58` — jsdom lacks `PointerEvent` and pointer capture.

```tsx
// @vitest-environment jsdom
/**
 * The select-mode backdrop covers empty panels, so GridCells's browse-zone
 * <button> would never receive a click without a matching hole carved out
 * of the backdrop. These tests pin that hole down: it exists, it is the
 * right size, and it does NOT swallow clicks elsewhere on the same panel.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnnotationInteractionLayer } from "../../src/renderer/components/Annotations/AnnotationInteractionLayer";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import {
  browseZoneRect,
  type PanelRect,
} from "../../src/renderer/render/coords";
import { initialDefaultSymbolStyle } from "../../src/renderer/model/default-symbol-style";
import { initialDefaultTextStyle } from "../../src/renderer/model/default-text-style";
import { initialDefaultScalebarStyle } from "../../src/renderer/model/default-scalebar-style";

// PASTE the beforeAll(...) pointer-event polyfill block from
// test/unit/annotation-layer-click-passthrough.test.tsx lines 29-58 here.

const LETTERS_OFF = {
  ...DEFAULT_GLOBAL_STYLE,
  letters: { ...DEFAULT_GLOBAL_STYLE.letters, enabled: false },
};

const PANEL_ID = "p1";
const PANEL_RECT: PanelRect = { x: 0, y: 0, w: 200, h: 200 };

const FIG: Figure = {
  canvas: { widthPx: 200, heightPx: 200, background: "#FFF" },
  grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
  panels: [
    {
      panelId: PANEL_ID,
      row: 0,
      col: 0,
      kind: "placeholder",
      label: "A",
      rowSpan: 1,
      colSpan: 1,
    },
  ],
  annotations: [],
  globalStyle: LETTERS_OFF,
};

function setup(): { onPanelClick: ReturnType<typeof vi.fn> } {
  const onPanelClick = vi.fn();
  render(
    <AnnotationInteractionLayer
      activeTool="select"
      defaultSymbolStyle={initialDefaultSymbolStyle()}
      defaultTextStyle={initialDefaultTextStyle()}
      defaultScalebarStyle={initialDefaultScalebarStyle()}
      onDefaultScalebarStyleChange={vi.fn()}
      figure={FIG}
      panelRectsById={new Map([[PANEL_ID, PANEL_RECT]])}
      imagesById={new Map()}
      cssW={200}
      cssH={200}
      figurePxW={200}
      figurePxH={200}
      selectedAnnotationIds={new Set()}
      onSelectionChange={vi.fn()}
      onEditingChange={vi.fn()}
      dispatch={vi.fn()}
      onPanelClick={onPanelClick}
      onHoleClick={vi.fn()}
      onToolAutoReturn={vi.fn()}
    />,
  );
  return { onPanelClick };
}

function strips(): HTMLElement[] {
  return screen.queryAllByTestId(/^annotation-backdrop-strip-/);
}

describe("annotation backdrop — empty-panel browse zones are holes", () => {
  it("renders strips rather than one full-coverage backdrop", () => {
    setup();
    expect(screen.queryByTestId("annotation-backdrop")).toBeNull();
    expect(strips().length).toBeGreaterThan(0);
  });

  it("leaves the browse-zone rect uncovered by any strip", () => {
    setup();
    const z = browseZoneRect(PANEL_RECT);
    const cx = z.x + z.w / 2;
    const cy = z.y + z.h / 2;
    const covers = strips().some((s) => {
      const px = (v: string): number => Number(v.replace("px", ""));
      const l = px(s.style.left);
      const t = px(s.style.top);
      const w = px(s.style.width);
      const h = px(s.style.height);
      return cx >= l && cx <= l + w && cy >= t && cy <= t + h;
    });
    expect(covers).toBe(false);
  });

  it("still forwards a click on the panel OUTSIDE the browse zone", () => {
    const { onPanelClick } = setup();
    // (4, 4) is inside the panel but far outside the centred zone.
    const strip = strips()[0]!;
    fireEvent.pointerDown(strip, { button: 0, clientX: 4, clientY: 4 });
    fireEvent.pointerUp(strip, { clientX: 4, clientY: 4 });
    expect(onPanelClick).toHaveBeenCalledWith(PANEL_ID);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/unit/annotation-layer-browse-zone-passthrough.test.tsx`
Expected: FAIL — `queryByTestId("annotation-backdrop")` returns an element (the single-backdrop path is still taken) and `strips()` is empty.

- [ ] **Step 3: Write the implementation**

In `src/renderer/components/Annotations/AnnotationInteractionLayer.tsx`, add `browseZoneRect` to the existing import from `"../../render/coords"`.

Then, directly after the existing occupied-panel hole loop (the `for (const p of figure.panels) { if (p.kind !== "image") ... }` block ending at line 1746), add:

```tsx
// Empty panels keep backdrop coverage EXCEPT over their browse zone,
// whose <button> in GridCells must receive the click that opens the
// file picker. Hidden panels never reach here — deriveFigure filters
// them out of figure.panels entirely.
for (const p of figure.panels) {
  if (p.kind !== "placeholder" || p.panelId === undefined) continue;
  const rect = panelRectsById.get(p.panelId);
  if (rect === undefined) continue;
  const bz = browseZoneRect(rect);
  holes.push({
    x: bz.x * figToCssX,
    y: bz.y * figToCssY,
    w: bz.w * figToCssX,
    h: bz.h * figToCssY,
  });
}
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `pnpm vitest run test/unit/annotation-layer-browse-zone-passthrough.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Fix the two test files that assumed the single-backdrop path**

Run: `pnpm vitest run test/unit/annotation-layer-panel-drag-passthrough.test.tsx test/unit/annotation-layer-hole-click-passthrough.test.tsx`
Expected right now: FAIL — `getByTestId("annotation-backdrop")` finds nothing.

In **`test/unit/annotation-layer-hole-click-passthrough.test.tsx`**, add this helper near the top and replace each of the three `const backdrop = screen.getByTestId("annotation-backdrop");` lines (at ~136, ~159, ~181) with `const backdrop = anyBackdrop();`:

```tsx
/**
 * Empty panels now carve browse-zone holes, so the backdrop renders as
 * strips instead of one full-coverage div. Every strip carries identical
 * handlers and the click position comes from clientX/clientY, not from
 * which strip was hit — so any strip is a valid target.
 */
function anyBackdrop(): HTMLElement {
  const single = screen.queryByTestId("annotation-backdrop");
  if (single !== null) return single;
  const strips = screen.getAllByTestId(/^annotation-backdrop-strip-/);
  return strips[0]!;
}
```

In **`test/unit/annotation-layer-panel-drag-passthrough.test.tsx`**, the test at line ~164-169 asserts that a figure of two placeholder panels yields the single backdrop. That is no longer reachable. Replace its assertion:

```tsx
// Two empty panels now carve two browse-zone holes, so the backdrop is
// strips. What still matters is that coverage exists outside the zones.
expect(screen.queryByTestId("annotation-backdrop")).toBeNull();
expect(
  screen.getAllByTestId(/^annotation-backdrop-strip-/).length,
).toBeGreaterThan(0);
```

Update that test's name to match, e.g. `"empty-only figure renders backdrop strips around the browse zones"`.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: PASS — every test file green.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/Annotations/AnnotationInteractionLayer.tsx test/unit/annotation-layer-browse-zone-passthrough.test.tsx test/unit/annotation-layer-hole-click-passthrough.test.tsx test/unit/annotation-layer-panel-drag-passthrough.test.tsx
git commit -m "feat(interaction): carve empty-panel browse zones out of the select backdrop"
```

---

### Task 7: Wire `App` — open the picker, import, fill forward

**Files:**

- Modify: `src/renderer/App.tsx` — rewrite `onAddImagesClick` (lines 281-334), add `onPanelBrowseClick` after it, pass the prop to `GridCells` (~line 1211)

**Interfaces:**

- Consumes: `importImages` (Task 3), `decodePickedFiles` (Task 4), the `onPanelBrowseClick` prop (Task 5).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the imports**

In `src/renderer/App.tsx`:

```ts
import { decodePickedFiles } from "./image/decode-picked-files";
```

Add `importImages` to the existing import block from `"./model/figure-actions"` (which already brings in `placeIntoPanel`, `addToPool`, etc.).

- [ ] **Step 2: Replace `onAddImagesClick`**

Replace the whole callback at `src/renderer/App.tsx:281-334` with:

```tsx
// Shared by the tray button and the empty-panel browse zone. `startPanelId`
// is undefined for the tray button (pool-only import).
const importFromPicker = useCallback(
  async (startPanelId?: string): Promise<boolean> => {
    let result;
    try {
      result = await window.api.openImages();
    } catch (err) {
      toasts.push({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
    if (result.canceled) return false;

    const {
      items,
      bitmaps: decoded,
      failures,
    } = await decodePickedFiles(result.files);

    if (decoded.size > 0) {
      setBitmaps((prev) => {
        const next = new Map(prev);
        for (const [id, bm] of decoded) next.set(id, bm);
        return next;
      });
    }
    if (items.length > 0) {
      dispatch(importImages(items, startPanelId));
    }

    if (failures.length > 0) {
      // ONE toast for the batch — 20 corrupt files must not push 20 toasts
      // past the viewport.
      const total = result.files.length;
      const list = failures.slice(0, 3).join(", ");
      const more = failures.length > 3 ? ` +${failures.length - 3} more` : "";
      toasts.push({
        kind: "error",
        message:
          failures.length === 1
            ? `Failed to decode ${failures[0]!}`
            : `${failures.length} of ${total} images failed to decode: ${list}${more}`,
      });
    }
    return items.length > 0;
  },
  [dispatch, toasts],
);

const onAddImagesClick = useCallback(async (): Promise<void> => {
  await importFromPicker();
}, [importFromPicker]);
```

Note `importImages(items, startPanelId)` passes `startPanelId` straight through — when it is `undefined` the creator omits the key, which is exactly the pool-only path.

- [ ] **Step 3: Add `onPanelBrowseClick`**

Insert immediately after `onPanelSingleClick` (which ends at line 512):

```tsx
// Click on an empty panel's browse zone. An armed tray thumbnail wins:
// the user has already said "place THIS", so popping an OS dialog would
// contradict them.
const onPanelBrowseClick = useCallback(
  (panelId: string): void => {
    const panel = stateRef.current.panels.find((p) => p.id === panelId);
    if (panel === undefined || panel.imageId !== undefined) return;
    if (panel.hidden === true) return;

    if (selectedThumbId !== null) {
      dispatch(placeIntoPanel(selectedThumbId, panelId));
      setSelectedThumbId(null);
      setPanelInteraction({ mode: "selected", panelId });
      return;
    }

    void importFromPicker(panelId).then((placed) => {
      if (placed) setPanelInteraction({ mode: "selected", panelId });
    });
  },
  [dispatch, importFromPicker, selectedThumbId],
);
```

- [ ] **Step 4: Pass the prop to `GridCells`**

At the `GridCells` render site (~line 1211), add below `onPanelCropBadgeClick`:

```tsx
onPanelBrowseClick = { onPanelBrowseClick };
```

- [ ] **Step 5: Verify types, lint, and the suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all three exit 0.

- [ ] **Step 6: Manual smoke test**

Run: `pnpm dev`

Check each of these:

1. Empty panel shows the caption `Drag an image here or click to browse`.
2. Hovering the panel centre shows a tinted rounded target and a pointer cursor; hovering near the panel edge does not.
3. Clicking the centre opens the OS file picker. Cancelling changes nothing.
4. Picking 3 images into the top-left panel of a 2×2 grid fills the first three panels in row-major order and puts all 3 in the tray under "In figure".
5. A single `⌘Z` undoes the entire import.
6. Clicking near a panel's edge still selects it (properties panel shows Hide/Delete).
7. Dragging from a panel edge still pans the viewport; `Space`+drag pans from anywhere including the centre.
8. Dragging a tray thumbnail onto a panel centre still drops correctly, with the live preview.
9. Arming a tray thumbnail (click it) then clicking a panel centre places that image and opens no dialog.
10. With the Text tool armed, clicking a panel centre stamps text instead of opening the dialog.
11. Tab reaches the browse zone and Enter opens the picker.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(app): open the file picker from an empty panel and fill forward"
```

---

### Task 8: Hint-bar copy and final verification

**Files:**

- Modify: `src/renderer/components/StatusHints/HintBar.tsx:26-28`
- Test: `test/unit/hint-bar.test.tsx:36`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: nothing.

- [ ] **Step 1: Update the failing test**

In `test/unit/hint-bar.test.tsx`, change the `"empty panel selected"` table row's `expected` value (line ~36) to:

```ts
      expected:
        "Drag an image here from the tray · Click the centre to browse · ⇧Click cells to merge",
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/unit/hint-bar.test.tsx`
Expected: FAIL — received the old string without the middle clause.

- [ ] **Step 3: Update the hint**

In `src/renderer/components/StatusHints/HintBar.tsx`, replace the `empty-panel` branch:

```ts
if (ctx.selection === "empty-panel") {
  return "Drag an image here from the tray · Click the centre to browse · ⇧Click cells to merge";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/unit/hint-bar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full verification gate**

Run each and confirm the output before claiming completion:

```bash
pnpm format
pnpm typecheck
pnpm lint
pnpm test
```

Expected: `typecheck` and `lint` exit 0 with no output; `pnpm test` reports all files passed. If `pnpm format` changed files, include them in the commit.

- [ ] **Step 6: Confirm export byte-fidelity is untouched**

Run: `pnpm vitest run test/unit/export-theme-independence.test.ts test/unit/export-png-shape.test.ts test/unit/export-renderer.test.ts test/unit/zoom-export-invariance.test.ts`
Expected: PASS. The caption is gated behind `editorHints`, which export renderers never pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(feedback): hint bar mentions click-to-browse on empty panels"
```

---

## Self-Review Notes

Spec coverage check, section by section:

| Spec section                                                  | Task                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| §1 Geometry — `browseZoneRect`                                | Task 1                                               |
| §2 Hit routing — GridCells button, `data-interactive`, styles | Task 5                                               |
| §2 Hit routing — backdrop holes                               | Task 6                                               |
| §2 Drag-and-drop unaffected                                   | Task 5 Step 7 (regression run), Task 7 Step 6 item 8 |
| §2 Placement tools unaffected                                 | Task 7 Step 6 item 10                                |
| §3 Click behavior, armed-thumbnail precedence                 | Task 7 Step 3                                        |
| §3 Shared decode helper                                       | Task 4                                               |
| §4 `IMPORT_IMAGES` + fill-forward + undo granularity          | Task 3                                               |
| §5 Caption tiers                                              | Task 2                                               |
| §5 Hint bar copy                                              | Task 8                                               |
| §6 Testing                                                    | Every task's test steps                              |

Naming consistency across tasks: `browseZoneRect` (Tasks 1, 5, 6), `importImages` (Tasks 3, 7), `decodePickedFiles` / `DecodedPick` (Tasks 4, 7), `basename` (Task 4), `onPanelBrowseClick` (Tasks 5, 7), testid `browse-zone-<row>-<col>` (Tasks 5, 7), `data-interactive="browse"` (Task 5).
