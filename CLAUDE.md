# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Mosaic Builder is a fully-offline Electron desktop app for assembling
publication-quality multi-panel scientific image figures. PNG/JPEG/TIFF
in, PNG/JPEG/TIFF/PDF out — pixel-WYSIWYG between the editor and exports.

Status: M8 (polish + packaging). Milestone plans live in
`docs/superpowers/plans/`. Design specs for in-flight work live in
`docs/superpowers/specs/`.

## Commands

Toolchain is pinned: **Node 22** (`.nvmrc`), **pnpm 10**.

```sh
pnpm install
pnpm dev         # Vite + Electron with HMR (vite-plugin-electron)
pnpm typecheck   # tsc -b across the 4 project refs
pnpm test        # vitest run (single pass)
pnpm test:watch
pnpm lint        # eslint --max-warnings 0  (zero-warning policy)
pnpm format      # prettier --write .
pnpm build       # tsc -b && vite build (preps dist/ + dist-electron/)
```

Run a single test file or filter: `pnpm vitest run test/unit/figure-actions.test.ts`
or `pnpm vitest run -t "merge"`.

Packaging (electron-builder, output → `release/`):

```sh
pnpm gen:icons       # regenerate icns/ico/png from resources/icon.png (one-off)
pnpm package         # current OS only
pnpm package:mac | :win | :linux | :all
```

For signed/notarized macOS builds, set `CSC_LINK`, `CSC_KEY_PASSWORD`,
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` before
`pnpm package:mac`. Without them the `.dmg` is unsigned (Gatekeeper warns).

## Architecture

Three TS project refs, one root `tsconfig.json` that aggregates them:
`tsconfig.main.json`, `tsconfig.preload.json`, `tsconfig.renderer.json`.
Tests have their own `tsconfig.test.json`. ESLint runs **type-checked**
recommended rules — keep all four `tsbuildinfo` paths green or lint fails.

### Process layout (Electron)

```
src/main/      Node-side: window, menu, IPC handlers, fs writes, dialogs,
               project-io, sha256. Entry: src/main/index.ts.
src/preload/   Bridges main↔renderer. preload.ts exposes `window.api`
               (typed `MosaicApi`) via contextBridge.
src/renderer/  React 18 UI. No Node access; all OS work goes through `window.api`.
               Entry: src/renderer/main.tsx → App.tsx.
```

**`src/preload/api.ts` is the single source of truth for the IPC contract.**
Both main and renderer import it as types only — channel strings live in the
exported `API_CHANNELS` / `MENU_EVENTS` constants. Add a feature touching
IPC? Update `api.ts` first, then both sides.

### Renderer architecture

The renderer is built around a **single immutable `FigureState` reducer**
plus **derived figure → canvas rendering**.

```
state ──► dispatch(FigureAction) ──► figureReducer ──► new FigureState
                                                           │
                                                           ▼
                                              deriveFigure(state) → Figure
                                                           │
                                                           ▼
                                              drawFigure(ctx, Figure, …)
```

Key modules (all under `src/renderer/`):

- **`model/figure-state.ts`** — `FigureState`: pool (insertion-ordered images),
  panels (non-overlapping rectangles partitioning a `rows × cols` grid;
  merged panels carry `rowSpan`/`colSpan` > 1), gutter, annotations,
  globalStyle, letterOverrides. Invariant: panels exactly partition the grid.

- **`model/figure-actions.ts`** — `FigureAction` discriminated union + the
  `figureReducer` switch (with an exhaustiveness guard at the bottom). Action
  creators are colocated; UI never builds raw action objects. The reducer
  is pure and rejects invalid transitions by returning the same state
  reference (so `===` short-circuits propagate).

- **`model/figure-derivations.ts`** — `deriveFigure(state, opts)` produces
  the immutable `Figure` shape consumed by render code: turns panels into
  `HardCodedPanel` (image | placeholder), synthesises auto letter
  annotations in row-major order, filters dangling annotations.

- **`render/coords.ts`** — `computePanelRects(figure)` is the canonical
  layout math (gutter, remainders absorbed by the right/bottom edge,
  merged panels span). All transform math lives here too: `rotatedImageDims`,
  `baseScale`, `clampCoverPan`, `clampZoom`, `snapTransform`,
  `panForCursorZoom`, `figureToSource` (inverse of the draw pipeline).

- **`render/draw-figure.ts`** — paints background → gutter → each panel
  (with clipped pan/zoom/rotation/flip) → annotations. Targets a
  **`DrawCtx` interface** (a structural subset of CanvasRenderingContext2D),
  so it works against the editor's HTMLCanvas, the export OffscreenCanvas,
  AND a recorder fake in tests. Don't add to `DrawCtx` casually; the
  surface area is intentional.

- **`render/editor-renderer.ts` vs `render/export-renderer.ts`** — the
  editor renderer paints into the on-screen canvas at DPR scale; the
  export renderer paints into an `OffscreenCanvas` with optional
  `exportScale` to enlarge output. Both call the same `drawFigure`.

- **`state/use-history-reducer.ts`** — wraps `figureReducer` with undo/redo.
  **Transient actions (`SET_PANEL_TRANSFORM`, `UPDATE_ANNOTATION`,
  `SET_GLOBAL_STYLE`) mutate state without pushing history.** Call
  `history.commit()` on `pointerup`/blur to seal a drag/edit into one undo
  step. `RESET_TO_STATE` (project load) clears history wholesale.
  Capped at `MAX_HISTORY = 10` entries (`state/history.ts`).

- **`hooks/useFieldCommit.ts`** — debounced commit helper for property-form
  inputs; pairs with the transient-action pattern above.

- **`dnd/`** — HTML5 drag/drop payloads (`drag-payload.ts`) and the
  reducer-action mapper (`dispatch-drop.ts`). Drops dispatch one of
  `placeIntoPanel`, `swapPanels`, `replaceIntoPanel`.

- **`image/`** — image decode pipeline. PNG/JPEG go through
  `createImageBitmap`. **TIFF is decoded in a Web Worker via UTIF**
  (`tiff-worker.ts`, hosted by `tiff-worker-host.ts`) — keep heavy work
  off the UI thread. Calibration is read from TIFF tags `t282/t283/t296`
  when present; otherwise the user supplies it via the Calibrate modal.

- **`export/{png,jpeg,tiff,pdf}.ts`** — all four route through one
  OffscreenCanvas pipeline. PNG/TIFF/PDF are byte-faithful to the figure
  canvas; JPEG is opt-in lossy. PDF pages are sized to physical dimensions
  at `PDF_DPI = 160` (`pdf-lib`; see
  `docs/superpowers/specs/2026-05-08-qa-feedback/04-fix-pdf-export.md`).

### Interaction model (the One Rule)

> **Verbs are fixed; modes change only the subject.** Scroll pans;
> `⌘`/`Ctrl`+scroll and pinch zoom; drag moves the thing under the
> cursor; `Space`+drag and middle-drag always pan the viewport; `Esc`
> unwinds one level.

All gesture-routing precedence lives in **`interaction/resolve.ts`**
(pure functions, table-driven tests): `resolveWheel`,
`resolvePointerDown`, `resolveEscape`. One DOM owner per global gesture:

- **`interaction/useViewportGestures.ts`** — THE wheel listener and the
  background-pan pointer sequence on the canvas pane. Pans start only on
  targets without a `data-interactive` attribute — stamp it on anything
  clickable you add over the canvas (occupied panels use the value
  `"panel"`, which routes to native HTML5 drag).
- **`interaction/useFrameGestures.ts`** — Frame mode (`PanelInteraction`
  `"editing"`; entered by double-click / Enter on a placed panel):
  drag/wheel/keys retarget onto the framed image position-independently
  within the pane. 4 px click/drag threshold; wheel/key bursts commit
  after a 250 ms settle → one undo step.
- **`interaction/InteractionContext.tsx`** — `useSpaceHeld()`.
  Object-local `pointerdown` handlers early-return when Space is held so
  the hand tool always wins.

Object-local handlers (annotation move/resize/rotate, track and corner
handles, HTML5 dnd, popovers) stay local, using pointer capture +
`stopPropagation`. **Never** reintroduce cursor-position-dependent wheel
behavior or `e.defaultPrevented` handshakes between listeners. Chrome
components own no gestures: `FrameChrome` (scrim + chip + zoom readout),
`SelectedPanelHandles` (corner resize on selected panels), `HintBar`
(`hintFor` is a pure projection of the interaction state). `⌘+`/`⌘−`/
`⌘0`/`⌘1` are single-bound to the View menu (MENU_EVENTS → canvas zoom;
no Electron zoom roles, no in-page keydown binding). Placement tools are
one-shot stamps (auto-return to Select; `Shift`+place keeps them armed).

### UI vs domain state

`PanelInteraction` (`model/panel-interaction.ts`) is **UI-only** — it
controls "selected vs editing (Frame mode)" on a panel and lives outside
`FigureState` (not undo-able, not serialized). Single-click → `selected`
(corner handles, drag moves the image, Delete unplaces); double-click or
Enter → `editing` = Frame mode. Don't promote ephemeral UI selections
into `FigureState`.

### Persistence (`.mosaic` files)

- `model/schema.ts` defines `MosaicFileV1` and a hand-rolled validator
  returning `Result<T>`. **Do not add `zod`** — schema is small and tightly
  coupled to error messages.
- `model/serialize.ts` translates between runtime `FigureState` (+ canvas)
  and on-disk `MosaicFileV1`. Computes posix `relPath` for pool images
  when the .mosaic file shares a root with the image; otherwise stores
  absolute `filePath`.
- `main/project-io.ts` owns disk I/O + sha256 hashing. Loader returns
  `images` (resolved with bytes) and `missing` (paths to relink); the
  renderer's `RelinkModal` resolves stragglers.

## Testing conventions

- Vitest, `environment: "node"` (NOT jsdom by default — render code is
  tested against fake `DrawCtx` recorders, not real canvas). Component
  tests use `@testing-library/react`; jsdom is pulled in per-test.
- Tests live in `test/unit/*.test.ts(x)`. One test file per module is the
  pattern (e.g. `figure-actions.test.ts` ↔ `model/figure-actions.ts`).
- `test/setup.ts` runs `cleanup()` after each test.
- Reducer tests reset the panel-id counter via `__resetPanelIdsForTests()`
  so panel ids in assertions stay stable. Don't call this in production.

## Conventions worth knowing

- **No comments stating WHAT code does.** Existing comments explain WHY
  (invariants, hidden constraints, derivations). Match that bar — see
  `coords.ts` `figureToSource` for an example of useful prose.
- **Reducers return `===` same state on no-op.** Many call sites depend
  on this for memoization and effect skipping.
- **Keep `Set`/`Map`/`Record` discipline immutable.** Helpers like
  `filterOverrides`/`deleteOverride` always allocate. Don't mutate state
  fields in place.
- **Prettier + ESLint must both pass.** ESLint is type-checked
  (`tseslint.configs.recommendedTypeChecked`) and `--max-warnings 0`.
- **TS strictness**: `@typescript-eslint/no-unused-vars` errors unless
  the var starts with `_`. The reducer's `default` branch uses a
  `const _exhaustive: never = a` guard — preserve this when adding
  `FigureAction` variants.
- **Editor canvas is fixed-size; export-time scaling preserves source pixels.**
  See `docs/superpowers/specs/2026-05-04-full-resolution-canvas-design.md` for
  the rationale.
