# Quality Audit Remediation Plan

**Date:** 2026-07-11
**Source:** Whole-application audit (7 parallel subsystem reviews: state model,
render/export pipeline, Electron main/IPC/persistence, image pipeline, canvas
interaction UI, forms/modals UI, project health). Every finding below was
verified against the actual code before inclusion; the four highest-severity
findings were independently re-verified by hand.

**Baseline at audit time:** `main` @ e73fb80, clean tree.
`pnpm typecheck` PASS · `pnpm lint` PASS · `pnpm test` PASS
(70 files passed | 4 skipped; 642 tests passed | 8 skipped — the skips are the
entire export test suite, see B1).

---

## How to execute this plan

- Work phase by phase. Phases are ordered by user impact; tasks within a phase
  are independent unless noted. Each task lists the defect, exact locations,
  fix direction, and the regression test that must accompany the fix.
- After every task: `pnpm typecheck && pnpm lint && pnpm test` must stay green.
- One commit per task (or per tightly-coupled task pair), conventional-commit
  style matching the existing history (`fix(history): …`, `feat(io): …`).
- Do NOT re-investigate anything in Appendix A ("verified non-issues") — those
  were suspected and explicitly ruled out during the audit.
- When a fix touches the IPC surface, update `src/preload/api.ts` first
  (project convention). When adding `FigureAction` variants, preserve the
  `const _exhaustive: never` guard.

---

## Phase 1 — Undo/redo integrity (critical)

The undo system has three independent bugs that combine badly. Fix and test
them together; they all live in `src/renderer/state/use-history-reducer.ts`
and its callers.

### 1.1 Resize drags flood and evict the undo history

- **Defect:** `SET_TRACK_WEIGHT` and `RESIZE_PANEL_FREEFORM` are dispatched on
  every `pointermove` during track-handle and corner-handle drags, but neither
  is in `TRANSIENT_ACTIONS` (`use-history-reducer.ts:18-22`). Every move
  pushes a history snapshot; with `MAX_HISTORY = 10` (`state/history.ts:10`),
  a single drag evicts the user's entire prior undo history, and undo
  afterwards steps through intermediate drag positions.
- **Where:** `src/renderer/state/use-history-reducer.ts:18-22`;
  dispatch sites `src/renderer/components/Grid/GridCells.tsx` (`TrackHandle`),
  `src/renderer/components/Grid/PanelInteractionLayer.tsx` (`CornerHandle`),
  `src/renderer/App.tsx` (`onTrackWeightChange`).
- **Fix:** Add `"SET_TRACK_WEIGHT"` and `"RESIZE_PANEL_FREEFORM"` to
  `TRANSIENT_ACTIONS`. The `history.commit()` calls at pointerup are already
  wired for both gestures (currently redundant no-ops), so this is a two-line
  change that makes each gesture one undo step.
- **Test:** Drive a multi-`pointermove` drag through the real
  `combinedReducer` (not `vi.fn()` mocks) and assert exactly one undo step and
  no eviction of a pre-existing history entry.

### 1.2 Redo bakes uncommitted transient state into history

- **Defect:** The `"redo"` branch (`use-history-reducer.ts:89-93`) lacks the
  flush-if-uncommitted guard that the `"undo"` branch has (lines 76-84).
  `redoHistory` pushes `current` — which may be a mid-drag transient state —
  onto `past` as if committed. Sequence: commit B → undo → A → start drag
  (transient, uncommitted, state T) → Cmd+Shift+Z → `past` now contains T;
  the next undo restores a mid-drag state.
- **Fix:** Mirror the undo branch: if `c.state !== c.lastCommitted`, flush
  (push `lastCommitted`, set `lastCommitted = c.state`) before applying
  `redoHistory`. Note the flush clears `future` (via `pushHistory`), which
  makes redo a no-op in that situation — that is the correct, standard
  behavior: new edits after an undo fork the timeline and invalidate redo.
- **Test:** Extend `test/unit/use-history-reducer.test.ts` with the
  redo-with-pending-transient scenario (the undo flush path is already
  tested; the redo path is not).

### 1.3 Shared debounced field-commit coalesces edits to different targets

- **Defect:** A single `useFieldCommit(history.commit, 400)` instance
  (`src/renderer/App.tsx:253`) is shared by every property form via
  `PropertiesPanel`. Editing annotation A, then annotation B within the 400 ms
  window, resets one shared timer and produces one `commit()` — one undo step
  spanning two logically separate edits.
- **Fix:** Flush the pending commit whenever the selection/edit target changes
  — i.e. call `fieldCommit.flush()` (add it to the hook if absent) in
  `App.tsx` on transitions of the selected annotation ids and panel
  interaction target. Keying the hook to the selection id alone is NOT
  sufficient: the unmount cleanup only clears the timer, which would silently
  drop the first edit's commit.
- **Test:** Cross-selection scenario in `test/unit/use-field-commit.test.ts`:
  edit target 1, switch selection, edit target 2 → two distinct undo steps.

### 1.4 Guard the transient-action list by construction

- **Defect class:** 1.1 happened because a later feature (spec 11) added
  drag-driven actions without updating `TRANSIENT_ACTIONS`. Nothing enforces
  the categorization.
- **Fix:** Add a table-driven test that enumerates **every** member of the
  `FigureAction["type"]` union and asserts its transient/non-transient
  categorization against an explicit expected list with a comment explaining
  the rationale per drag-driven action. Adding a new action type then forces a
  conscious decision (the test fails until the new type is categorized).

---

## Phase 2 — Persistence & data safety (critical/major)

### 2.1 `relPath` is never computed on Windows

- **Defect:** `isPosixAbsolute` in `src/renderer/model/serialize.ts:160-162`
  checks `p.startsWith("/")`. Windows-native paths (`C:\…`) from the save
  dialog and `path.resolve` never match, so `posixRelative` returns `null`
  and `relPath` is silently omitted from every `.mosaic` saved on Windows.
  Moving a project folder there breaks every image link — the documented
  portability feature is dead on the platform we just shipped an installer
  for (`ae674ad`).
- **Fix:** Make the relative-path computation platform-aware: recognize both
  POSIX and Windows absolute forms (`/^[A-Za-z]:[\\/]/`, UNC `\\server\…`),
  normalize separators to `/` before splitting, compare drive letters
  case-insensitively to detect "different volume" (return `null`), and keep
  storing forward-slash `relPath` on disk. The loader side
  (`src/main/project-io.ts`) resolves `relPath` with Node `path` in main, so
  verify the load direction accepts the stored form on both platforms too.
- **Test:** Extend `test/unit/serialize.test.ts` with a genuinely
  Windows-style `mosaicPath` (drive letter + backslashes) — the existing
  "different volume" test keeps `mosaicPath` POSIX and so never caught this.
  Cover: same volume (relPath produced), different drive (null), UNC.

### 2.2 Relinked images are never persisted into `FigureState`

- **Defect:** `RelinkModal.onLocate` decodes the newly-located file and calls
  `onRelinked`, but the App handler (`src/renderer/App.tsx:865-873`) only
  updates the transient `bitmaps` cache and `missingImages` list. No action
  patches `state.pool[i].filePath`, so the next save writes the old broken
  path and the image is "missing" again on every open. The modal's `dispatch`
  prop is passed but never used ("Reserved for future actions").
- **Fix:** Add a `RELINK_POOL_IMAGE` (or similar) `FigureAction` that patches
  a pool entry's `filePath` (and refreshed dims/mime if changed) by `imageId`;
  dispatch it per resolved image from `onRelinked` or inside `RelinkModal`.
  Non-transient (a relink is a real, undoable document change) — or
  deliberately exclude it from history and document why.
- **Test:** End-to-end: load project with missing image → relink → serialize
  via `toMosaicFile` → assert the new path round-trips.

### 2.3 No unsaved-changes guard anywhere

- **Defect:** No dirty flag, no `beforeunload`, no main-process `close`
  interception. `onNew` (`App.tsx:526-533`) and `onOpenProject` discard all
  state unconditionally; closing the window loses everything since the last
  save with zero warning.
- **Fix:** Track `dirty` (set on any history-committing change — derivable
  from `lastCommitted` transitions or a wrapper around `combinedReducer`;
  cleared on successful save/load/new). Gate New/Open behind a native confirm
  dialog when dirty. For window close: intercept `close` in
  `src/main/index.ts`, IPC round-trip to the renderer to check dirty and show
  the save/discard/cancel dialog. New IPC surface → update
  `src/preload/api.ts` first per convention.
- **Test:** Unit-test the dirty derivation; component-test that New-when-dirty
  asks before discarding.

### 2.4 Non-atomic project save can corrupt the previous good file

- **Defect:** `saveProjectToPath` (`src/main/project-io.ts:33-45`) writes JSON
  directly onto the target. A crash/power loss mid-write truncates the user's
  only copy; there is no backup and `JSON.parse` on load then fails.
- **Fix:** Write to `target + ".tmp"` then `fs.rename` over the target
  (atomic on the same filesystem on POSIX and NTFS). Clean up stray `.tmp` on
  failure.
- **Test:** Extend `test/unit/project-io.test.ts`: simulate a write failure
  and assert the original file is untouched.

### 2.5 Grid operations leak dangling annotations into saved files

- **Defect:** `RESIZE_GRID`, `MERGE_CELLS`, `UNMERGE_PANEL`
  (`src/renderer/model/figure-actions.ts:497-516, 535-570, 572-584`) drop or
  re-mint panel ids but never prune `state.annotations` bound to the dead ids
  — only `DELETE_PANEL` (lines 935-955) does. `deriveFigure` filters them at
  render time so they're invisible, but they serialize into `.mosaic` files
  and accumulate forever.
- **Fix:** Factor DELETE_PANEL's annotation-pruning into a shared helper
  ("drop annotations whose `panelId` is not in the live panel set") and apply
  it in all three actions alongside the existing `letterOverrides` cleanup.
- **Test:** Per action: anchor a scalebar/text annotation to a panel, apply
  the action that removes that panel, assert `state.annotations` is pruned.

### 2.6 `UPDATE_ANNOTATION` accepts an explicit `panelId: undefined` unvalidated

- **Defect:** The guard `typeof rest.panelId === "string"`
  (`figure-actions.ts:773-787`) skips validation when the patch carries an
  explicit `panelId: undefined`, yet the spread still unbinds the field —
  a scalebar with `panelId: undefined` violates its type invariant. Not
  reachable from current call sites; a latent trap for the next feature.
- **Fix:** Use `"panelId" in rest` and validate both cases per annotation
  kind (reject unbinding outright for `scalebar`).
- **Test:** Reducer test dispatching a patch with explicit
  `panelId: undefined` for each kind.

### 2.7 Minor: unhandled rejection at app launch

- `void app.whenReady().then(...)` in `src/main/index.ts` has no `.catch()`;
  a synchronous throw in setup would fail silently. Add a `.catch` that logs
  and shows a native error dialog before quitting.

---

## Phase 3 — Image & export correctness (critical/major)

### 3.1 Unsupported TIFF variants silently decode to black

- **Defect:** UTIF signals unknown compression / photometric interpretation /
  unsupported bit depths via internal `log(...)` calls, not exceptions
  (UTIF.js:174, 1041). `tiff-worker.ts:39-43`'s try/catch never fires, so the
  worker returns `ok: true` with an all-zero RGBA buffer: the user gets a
  solid-black panel with no error, and may ship a broken figure.
- **Fix:** In `src/renderer/image/tiff-worker.ts`, detect the failure and
  reject so the existing toast paths (App import, load-project, RelinkModal —
  all verified to surface errors) report it. Robust approach: temporarily
  intercept `console.log`/`console.warn` around the UTIF decode call inside
  the worker and treat any "Unknown compression/Photometric" emission as a
  decode error; optionally also sanity-check for an all-zero output buffer on
  a non-trivial image as a backstop.
- **Test:** Feed a TIFF with an unsupported compression code through
  `decodeImageBytes` and assert it rejects with a user-meaningful message.

### 3.2 32-bit (float) TIFFs decode blank AND are mislabeled 16-bit

- **Defect:** `tiff-worker.ts:46-47` maps `bps >= 16` → `bitDepth: 16`;
  UTIF's `toRGBA8` has no `bps === 32` branch for grayscale/RGB, so such
  files also hit 3.1's blank-decode path while the UI claims "16-bit".
- **Fix:** Couple with 3.1: reject `bps > 16` with an explicit "unsupported
  bit depth" error (preferred over widening the type, since the RGBA
  conversion genuinely can't represent it).
- **Test:** IFD with `t258 = [32]` → decode rejects with the bit-depth message.

### 3.3 JPEG EXIF orientation is ignored

- **Defect:** `decode-bytes.ts:41-42` calls `createImageBitmap(blob)` without
  `imageOrientation: "from-image"`; Chromium's default ignores EXIF rotation,
  so camera/microscope JPEGs with orientation tags display sideways —
  contradicting pixel-WYSIWYG.
- **Fix:** Pass `{ imageOrientation: "from-image" }` (no-op for PNG).
- **Test:** Assert the option is passed (mock `createImageBitmap` in the
  existing `decode-bytes.test.ts` pattern).

### 3.4 PDF export misses the opaque-background flatten JPEG/TIFF received

- **Defect:** `export/pdf.ts:47` routes through `renderFigureToPngBlob`
  (alpha-preserving) instead of `renderFigureToOffscreen` (white-flattened).
  Spec `docs/superpowers/specs/2026-05-08-qa-feedback/03-fix-jpeg-export.md`
  states TIFF **and PDF** should share the flatten fix, but PDF doesn't. An
  alpha-bearing `canvas.background` (`#RRGGBBAA` is legal per
  `schema.ts:478-479`) composites against black in many PDF viewers
  (pdf-lib #483).
- **Fix:** Route PDF through `renderFigureToOffscreen`, then encode that
  canvas to PNG bytes for embedding.
- **Test:** PDF export with an alpha background → embedded image has no alpha
  (blocked on B1 for execution; write it anyway so it runs once B1 lands).

### 3.5 Minor: friendlier zero-dimension error

- A zero-dimension image throws via the `ImageData` constructor and surfaces
  as a raw exception message. Add an explicit dimension guard with a
  human-readable error in the worker/decode path.

---

## Phase 4 — UX defects (major/minor)

### 4.1 Switching annotation tools discards typed-but-uncommitted text

- **Defect:** The `[activeTool]` effect in
  `AnnotationInteractionLayer.tsx:664-671` unconditionally
  `setPendingText(null)` without committing, unlike the Enter/Escape/blur
  paths. Typing a caption then clicking another tool button silently loses
  the text. The same effect drops an open `pendingScalebar` popover.
- **Fix:** In the tool-change effect, commit pending text first
  (`commitPendingText(pendingTextValue)` when `pendingText !== null`),
  mirroring blur. Decide scalebar behavior deliberately (committing a
  half-configured scalebar is arguably wrong; closing it is fine — document
  the choice in the code).
- **Test:** Tool-switch-with-unsaved-text case alongside the existing
  `annotation-layer-*` passthrough tests.

### 4.2 Scale-bar picker omits the `px` unit the edit form offers

- **Defect:** `ScalebarPickerPanel.tsx:28-33` offers only `um`/`mm`;
  `ScalebarAnnoForm.tsx:41-49` and the type
  (`default-scalebar-style.ts:17`) support `px`, the only
  calibration-independent mode. On an uncalibrated panel the user cannot pick
  `px` up front.
- **Fix:** Add `px` to the picker's options; add a unit-parity test between
  picker and form so they can't drift again.

### 4.3 Toasts stack unbounded on bulk import failures

- **Defect:** `useToasts.ts:36-46` never caps the list; App's import loop
  pushes one error toast per failed file — 20 corrupt files → 20 toasts
  growing past the viewport with no scroll.
- **Fix:** Cap the tray (keep last N ≈ 5) and/or collapse same-kind bursts
  into one summary toast ("12 of 15 images failed to decode"). Batch import
  errors in `App.tsx`'s loop into a single toast rather than per-file pushes.
- **Test:** Bulk-push behavior in a new `use-toasts` test.

### 4.4 Decide the fate of `REMOVE_FROM_POOL`

- **Defect:** The `removeFromPool` action creator exists but is dispatched
  nowhere — users cannot remove an image from the tray (UX dead end), and the
  action is dead code. Note: `App.tsx`'s `bitmaps` Map is never pruned, which
  becomes a real leak the moment this action is wired up.
- **Fix (pick one, explicitly):** (a) add a remove affordance in
  `Tray.tsx`/`Thumbnail.tsx` (context menu or hover ×), dispatching
  `removeFromPool`, AND prune the corresponding `bitmaps` entry
  (+ `ImageBitmap.close()`); or (b) delete the action creator and reducer
  branch. (a) is recommended — a pool you can add to but never remove from is
  a genuine UX gap for a shipping app.

---

## Phase 5 — Test & CI infrastructure (major)

### 5.1 CI runs no tests, lint, or typecheck

- The only workflow (`.github/workflows/build-windows.yml`) builds the
  installer on tags/dispatch. Add `ci.yml` on push/PR:
  install (pnpm cache) → `pnpm typecheck` → `pnpm lint` → `pnpm test` on
  `ubuntu-latest`; make the Windows build depend on it. Add a `concurrency`
  group to the release workflow (two quick tag pushes can currently
  double-attach assets).

### 5.2 The export pipeline has zero executed test coverage

- All of `test/unit/export-{jpeg,tiff,png-shape,renderer,pdf}.test.ts` are
  `describe.skipIf(!HAS_OFFSCREEN)` and Node 22 has no `OffscreenCanvas` —
  they skip on every machine, including CI. The app's core deliverable is
  untested.
- **Fix:** Two-pronged: (a) split the pure drawing logic so it's asserted via
  the existing `DrawCtx` recorder pattern (no canvas needed); (b) run the
  encode-level tests for real, either via vitest browser mode or a
  `@napi-rs/canvas`-backed `OffscreenCanvas` polyfill wired in
  `test/setup.ts` for the export files only. Un-skip in CI.

### 5.3 Test files are never typechecked

- `tsconfig.test.json` is referenced by no script; vitest strips types
  unchecked. Change `typecheck` to
  `tsc -b --pretty && tsc -p tsconfig.test.json --noEmit`.

### 5.4 Regression-test backlog (beyond the per-fix tests above)

Ranked by risk; add opportunistically as the phases above touch each area:

1. `App.tsx` orchestration (893 lines, zero tests) — at minimum: menu-event
   → dispatch wiring, import-loop error handling, relink flow (2.2).
2. `CropImageModal.tsx` (645 lines) — `resizeCrop` + aspect-lock re-solve
   math; currently manual-QA only.
3. `tiff-worker-host.ts` — `onerror` rejects all pending + singleton respawn
   - concurrent `reqId` matching.
4. `main/index.ts` IPC registration — smoke-test handlers with mocked
   `ipcMain`.
5. `CalibrationModal.tsx` — two-click calibration math regression test.
6. `load-project.ts` + `RelinkModal` glue (partly covered by 2.2's test).
7. Editor-vs-export parity: render the same figure via editor renderer
   (DPR=1) and export renderer (scale=1) into recorders and diff draw calls.
8. Zero-area panel → `drawPanelImage`/`clampCoverPan` end-to-end NaN guard.
9. Drop the tautological typeof assertion in `preload-api-shape.test.ts`
   (keep the channel-freeze test).

---

## Phase 6 — Dependencies, build & docs hygiene (major/minor)

### 6.1 Electron 32 is end-of-life

- `package.json` pins Electron 32.1.2 (EOL early 2025; current major is 43) —
  over a year of missing Chromium/Node security patches in a shipped desktop
  app. Upgrade Electron + electron-builder together first (watch for
  breaking changes in `webPreferences` defaults and builder config), verify
  `window-config.test.ts` still enforces the security flags, and do a full
  manual smoke of dev + packaged builds.

### 6.2 Tooling upgrades (separate batch, after 6.1)

- `eslint-plugin-react-hooks` is pinned to a 2024 RC snapshot
  (`5.1.0-rc-fb9a90fa48-20240614`) — move to stable; it currently blocks
  eslint 10. Then batch: vite 5→8, vitest 2→4, eslint 9→10,
  TS 5.6→current, jsdom. Keep the zero-warning policy green throughout.

### 6.3 Packaging hygiene

- `vite.config.ts` `publicDir: "resources"` ships `resources/fixtures/`
  (188 KB of test images) inside the production asar, and icons are packed
  twice (publicDir + `extraResources`). Exclude fixtures from publicDir and
  drop the duplicate icon copy.
- Add `packageManager` field (corepack pinning) and `author`/`license`
  (electron-builder warns on some Linux targets).
- Extend packaging CI to a macOS/Linux matrix at least on manual dispatch
  (configs exist in `electron-builder.yml` but have never run in CI).

### 6.4 Dead code removal (all grep-verified unused)

- `src/renderer/image/load-image.ts` (imported nowhere).
- `src/renderer/components/Toolbar/ExportButton.tsx` (superseded by
  `ExportMenu`).
- `src/renderer/model/hardcoded.ts` (only referenced by the always-skipped
  export tests — fold whatever 5.2 still needs into a `test/` helper).
- `scripts/make-fixture-png.mjs`, `scripts/make-m3-fixtures.mjs`
  (referenced only by historical plan docs).
- `removeFromPool` is handled in 4.4 (wire it up or delete it).
- Un-ignore `scripts/**` in `eslint.config.mjs` for whatever scripts remain.

### 6.5 Docs corrections

- CLAUDE.md says PDF pages are "300 dpi" — actual is an intentional
  `PDF_DPI = 160` (per spec `2026-05-08-qa-feedback/04-fix-pdf-export.md`).
  Fix the number.
- Consolidate duplicate/stale plan docs: `docs/plans/{m5,m6,m7}.md` and loose
  `docs/m5.md`/`docs/m6.md` duplicate `docs/superpowers/plans/*`; rename the
  stray `i-want-to-build-playful-kahan.md` to a descriptive name.
- Verify `docs/superpowers/specs/2026-05-04-full-resolution-canvas-design.md`
  matches what shipped (the render review noted `App.tsx` hardcodes
  `FIGURE_PX_W/H = 800×600` and questioned whether the spec was fully
  implemented); annotate the spec with actual status.

---

## Appendix A — Verified non-issues (do NOT re-fix)

Explicitly investigated and ruled out during the audit:

- **Electron security posture**: `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true` verified and pinned by
  `window-config.test.ts`. IPC never accepts renderer-supplied filesystem
  paths (all paths originate from main-owned dialogs).
- **Transform math**: `figureToSource`/`sourceToFigure` inverses,
  `clampCoverPan`, `clampZoom`, `panForCursorZoom`, `computePanelRects`
  remainder absorption — all hand-verified correct.
- **Canvas state discipline**: all `save()`/`restore()` pairs in
  `draw-figure.ts`/`draw-annotations.ts` balanced; no clip leaks.
- **TIFF calibration math** (`t282/t283/t296`, rational parsing,
  zero-denominator guard, unit codes) correct and tested; CalibrationModal's
  two-click math consistent with the `pixelsPerUnit` convention.
- **TIFF worker plumbing**: `reqId`-keyed response matching correct;
  transferred buffers freshly allocated (no aliasing); no `terminate()` is
  fine (worker scoped to window lifetime).
- **Export UX**: double-export prevented (`disabled={exporting}` set
  synchronously); JPEG quality slider safe; menu dismiss during export
  harmless.
- **Hit-testing on rotated content**: panel rects stay axis-aligned; rotation
  is a content transform — AABB `panelAt` is correct.
- **`PDF_DPI = 160`** is intentional (spec-documented), not a bug — only the
  CLAUDE.md text is stale (6.5).
- **Decode error surfacing**: all three decode call sites (import,
  load-project, relink) surface failures via toasts/inline errors.
- **`test/unit/dialogs.test.ts` and `m7-roundtrip.test.ts` exist** (one
  reviewer claimed otherwise; disregard that claim — verified present and
  passing).

## Appendix B — Finding-to-phase index

| #   | Finding                                                     | Severity | Phase   |
| --- | ----------------------------------------------------------- | -------- | ------- |
| 1   | Resize drags evict undo history (missing transient actions) | Critical | 1.1     |
| 2   | Redo bakes uncommitted transient state into history         | Critical | 1.2     |
| 3   | Unsupported TIFFs silently decode to black                  | Critical | 3.1     |
| 4   | `relPath` never written on Windows                          | Critical | 2.1     |
| 5   | Relinks not persisted into state                            | Critical | 2.2     |
| 6   | No unsaved-changes guard (New/Open/close)                   | Major    | 2.3     |
| 7   | Shared field-commit merges unrelated undo steps             | Major    | 1.3     |
| 8   | Tool switch discards typed annotation text                  | Major    | 4.1     |
| 9   | Export tests never execute; CI runs no tests                | Major    | 5.1/5.2 |
| 10  | Electron EOL                                                | Major    | 6.1     |
| 11  | PDF alpha flatten missing                                   | Major    | 3.4     |
| 12  | Grid ops leak dangling annotations into saves               | Major    | 2.5     |
| 13  | Non-atomic project save                                     | Major    | 2.4     |
| 14  | EXIF orientation ignored                                    | Major    | 3.3     |
| 15  | 32-bit TIFF blank + mislabeled                              | Major    | 3.2     |
| 16  | `UPDATE_ANNOTATION` panelId:undefined gap                   | Minor    | 2.6     |
| 17  | Scalebar picker missing `px` unit                           | Minor    | 4.2     |
| 18  | Unbounded toast stacking                                    | Minor    | 4.3     |
| 19  | `REMOVE_FROM_POOL` dead / no pool removal UX                | Minor    | 4.4     |
| 20  | Tests not typechecked                                       | Minor    | 5.3     |
| 21  | Fixtures shipped in asar / dup icons                        | Minor    | 6.3     |
| 22  | Dead code (load-image, ExportButton, hardcoded, scripts)    | Minor    | 6.4     |
| 23  | Stale/duplicated docs                                       | Minor    | 6.5     |
| 24  | `whenReady` unhandled rejection                             | Minor    | 2.7     |
