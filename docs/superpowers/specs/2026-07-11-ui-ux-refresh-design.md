# UI/UX refresh — design (2026-07-11)

Design document for the next implementation session. Produced from a full
design critique of the running app (built from `main` @ `fbe33e6`, driven
via Playwright with fluorescence-micrograph-style fixtures, all major UI
states screenshotted) plus a source read of every renderer UI component.

## Who this is for (design context)

Researchers, scientists, students, lab technicians composing multi-panel
figures for journal submissions. Domain users, not designers. The bar:
**usable without a manual** — every control obvious to a first-time user;
restraint over novelty; output at home next to ImageJ/GraphPad, not Vercel.

## Critique summary

Nielsen heuristic score: **26/40 (Acceptable — significant improvements
needed)**. Weakest: _Match with real world_ (CSS jargon), _Consistency_
(duplicated panel controls, mixed selection colors), _Recognition over
recall_ (shift-click merge, double-click edit, drag-to-unplace all
invisible), _Help_ (tooltips only). Cognitive-load checklist: 5/8 failures
(chunking, minimal choices, working memory, progressive disclosure, flat
ribbon hierarchy) — high.

What already works and must not regress:

- Live drag preview (real post-drop rendering, not a ghost) — best-in-class.
- Contextual properties panel routing (picker-before-place pattern).
- Visual restraint: light neutral surface, one accent, no AI-aesthetic tells.
- Relink flow, dirty-close guard, batch decode-failure toasts.
- Keyboard shortcuts (M/U/R/H/V/0, space-hold select, undo/redo).

## The findings, ranked

| #   | Sev | Finding                                                                                                                                                           |
| --- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | P0  | Default black letters/text are invisible on dark micrographs — the core content type                                                                              |
| 2   | P1  | Merge is a dead end: two permanently-disabled buttons, shift-click convention communicated nowhere                                                                |
| 3   | P1  | Toolbar PANEL group (8 controls, disabled ~95% of the time) duplicates the properties panel                                                                       |
| 4   | P1  | First run dumps ~15 global-style controls into the properties panel; no guidance on canvas; drag is the only placement path                                       |
| 5   | P2  | Scale-bar tool dead-ends on uncalibrated panels ("click a calibrated panel" — nothing is)                                                                         |
| 6   | P2  | Selected (green solid) vs editing (orange dashed) modes use colors unrelated to the app's accent; double-click-to-edit is undiscoverable                          |
| 7   | P2  | Export UX: results shown as cramped inline text, menu-bar export items are stubs that tell you to use the toolbar, no output dimensions, cryptic "transparent OK" |
| 8   | P2  | App bar: no filename, no unsaved indicator, no New / Undo / Redo buttons                                                                                          |
| 9   | P3  | Microcopy: "Contain/Cover/Stretch", "No selection — editing global style", "Saved → /very/long/path"                                                              |
| 10  | P3  | Placed thumbnails at 55 % opacity read as _disabled_, not _done_                                                                                                  |

Verified during the live run: a text annotation placed with defaults on a
dark panel disappears entirely once committed (black on black); panel
letters A–C were unreadable on all three micrograph panels while D was
legible on the white plot panel. Also: driving the app programmatically,
merge could not be armed without reading the source — the only hint is a
tooltip that presumes you already know cells must be shift-click selected.

---

## Phase 1 — Annotation legibility on dark images (P0)

**Problem.** `initialFigureState` defaults letters to `#000000`; the text
tool defaults to black on transparent. Fluorescence/gel images are mostly
black. Letters and committed text vanish (verified). Journals conventionally
use white letters, often with a thin dark keyline.

**Change.**

1. Add an optional `halo` (outline) capability to letter and text rendering:
   a ~1.5 px (at figure scale, scaling with `exportScale`) contrasting
   stroke behind the glyphs — `ctx.strokeText` with `lineJoin: "round"`
   before `fillText`. Halo color = black for light fills, white for dark
   fills (pick by fill luminance; no user knob needed).
2. New-figure defaults: letters `#FFFFFF` **with halo on**; text tool
   default stays black but **halo on**. White-with-dark-halo and
   black-with-white-halo are both legible on any background, so no
   auto-contrast sampling machinery is needed.
3. Schema: extend `LetterStyle` / text style with optional `halo?: boolean`.
   Absent ⇒ `false`, so existing `.mosaic` files render exactly as before
   (validator: optional boolean; serialize round-trips it). Bump nothing —
   optional field, `MosaicFileV1` validator just gains one optional check.
4. Expose "Halo" as a checkbox in `CanvasAndGlobalStyleForm` (letters
   section), `TextStylePickerPanel`, and the text/letter edit forms.

**Files.** `model/figure-state.ts`, `model/global-style.ts`,
`model/default-text-style.ts`, `render/letters.ts`,
`render/draw-annotations.ts`, `model/schema.ts`, `model/serialize.ts`,
the three style forms. Export path picks it up for free via `drawFigure`.

**Accept.** New figure, dark image placed: letter "A" and a default text
annotation clearly legible on both a pure-black and a pure-white panel, in
editor and in PNG export. Old project files unchanged pixel-for-pixel.
DrawCtx recorder tests assert stroke-before-fill for halo'd annotations
(`DrawCtx` may need `strokeText`/`lineJoin` added — deliberate, minimal).

## Phase 2 — One home for panel controls; explain merge (P1)

**Problem.** The ribbon's PANEL group (Contain/Cover/Stretch/90°/Flip H/
Flip V/Reset/Calibrate…) duplicates `PanelPropertiesForm` with different
labels ("⇄ Flip H" vs "⇄ H"). Sixteen of the ribbon's ~20 controls are
irrelevant until specific selection states exist; eight sit disabled almost
always. Merge/Unmerge are disabled with no path to enabling them.

**Change.**

1. **Delete the PANEL ribbon group** (`PanelControls.tsx` and its `App.tsx`
   wiring). The properties panel is the single home for per-panel ops; all
   keyboard shortcuts stay. Add Cover/Stretch etc. nothing — `Fit` select
   already covers fit modes. Add a compact transform summary line if any
   gap emerges.
2. **Merge affordance.** In the SELECTION group, when `canMerge === false`
   and `canUnmerge === false`, render a muted inline hint next to the
   buttons: `⇧-click cells to select` (11 px, `--c-text-faint`). When ≥1
   cell is shift-selected but not mergeable, hint becomes `select adjacent
cells forming a rectangle`. Selected-cell count badge on the Merge
   button when ≥2 (`Merge (3)`) so progress is visible.
3. Rename group label `SELECTION` → `MERGE` (that is what it does).
4. Move the `Letters` checkbox out of ANNOTATE into the GRID group end or
   properties "Figure defaults" — it is a figure-wide visibility toggle,
   not a tool. Relabel `Panel letters`.

**Files.** `App.tsx`, `components/Toolbar/PanelControls.tsx` (delete),
`MergeControls.tsx`, `AnnotationToolbar.tsx`.

**Accept.** Ribbon shows ≤ 12 always-visible controls; a first-time user
reading only on-screen text can arm and execute Merge. No keyboard
shortcut regressions (`useKeyboardShortcuts` untouched).

## Phase 3 — First-run guidance and placement without drag (P1)

**Problem.** First launch shows the full Subpanel-letters + Scale-bar
global style stack (~15 controls) in the properties panel before a single
image exists; empty panels are blank gray boxes; placement works _only_
by drag (no keyboard path, no click path).

**Change.**

1. **Getting-started card.** In `PropertiesPanel`'s no-selection branch,
   when `state.pool.length === 0 && state.annotations.length === 0`,
   replace the body with a short card: three numbered steps (Add images →
   drag into panels → Export), one line each, plus an "Add images…" button
   mirroring the tray CTA. Global style forms return as soon as the pool
   is non-empty (or a selection exists).
2. **Retitle the no-selection state** `Figure` / "No selection — editing
   global style" → `Figure defaults` / "Applies to letters and scale bars".
3. **Empty-panel invitation.** Placeholder panels (image-less, pool
   non-empty) render a faint centered `Drag an image here` caption via the
   existing placeholder draw path in `draw-figure.ts` (editor-only: skip
   when rendering for export — placeholders already differ there? verify;
   if not, gate on an `opts` flag threaded from the editor renderer only).
4. **Click-to-place.** Single-click an _unplaced_ tray thumbnail selects it
   (visible ring); clicking an empty panel then places it (same
   `placeIntoPanel` action as drop). Escape or clicking elsewhere clears.
   Also: Enter on a focused thumbnail places into the first empty panel.
   This gives keyboard users a complete build path for the first time and
   is faster than drag for everyone. Drag remains primary; the live drag
   preview is untouched.
5. **Placed thumbnails**: drop the 0.55 opacity; instead show a small
   corner check badge + keep normal contrast. "Placed" should read as
   _done_, not _disabled_.

**Files.** `PropertiesPanel.tsx`, `Tray.tsx`, `Thumbnail.tsx`,
`GridCells.tsx`, `draw-figure.ts`, `App.tsx` (selected-thumb state, place
handler), `styles.css`.

**Accept.** Fresh launch: properties panel shows 3 steps, zero style
inputs. An image can be placed using only the keyboard (tab to thumbnail,
Enter). Export output contains no placeholder captions.

## Phase 4 — Dead ends become guided paths (P2)

1. **Scale bar ↔ calibration.** In `ScalebarPickerPanel`, show calibration
   status: "N of M placed images calibrated". Clicking an uncalibrated
   panel with the scale tool currently no-ops/toasts — instead open
   `CalibrationModal` for that panel's image directly, and on successful
   calibration place the scale bar as originally requested (stash the
   pending placement in App state). The dead end becomes a two-step flow.
2. **Menu-bar exports.** `useMenuEvents` handlers for Export PNG/JPEG/TIFF/
   PDF currently toast "Use Export → PNG in the toolbar". Wire them to the
   real export runs (lift the `runPng`/`runJpeg`/`runTiff`/`runPdf` logic
   out of `ExportMenu` into a hook `useFigureExport` shared by menu events
   and the menu UI). JPEG from the app menu uses the current stored quality.
3. **Export feedback → toasts.** Success/error currently render as inline
   12 px text beside the Export button (cramped, pushes layout). Route
   through the existing toast system: success toast shows basename, not
   the full path. Remove the inline `<span>`s.
4. **Export menu content.** Each format row shows computed output size:
   e.g. `PNG · 3200 × 2400 px` (from `computeExportScale` — already
   available), TIFF keeps `300 dpi`, PDF shows physical size at
   `PDF_DPI = 160` (e.g. `12.7 × 9.5 cm`). Replace "transparent OK" with
   "keeps transparency". These numbers answer the researcher's real
   question: "is this big enough for the journal?"

**Files.** `ScalebarPickerPanel.tsx`, `AnnotationInteractionLayer.tsx`
(uncalibrated-click path), `App.tsx`, new `hooks/useFigureExport.ts`,
`ExportMenu.tsx`, `hooks/useMenuEvents.ts` wiring.

**Accept.** Scale tool on a fresh uncalibrated figure produces a placed
scale bar in ≤ 3 interactions with no dead end. App-menu "Export as PNG"
saves a file. Export success appears as a toast; toolbar layout no longer
shifts on export.

## Phase 5 — Mode legibility and app-bar completeness (P2)

1. **Unify selection colors on the accent.** Today: merge cells = blue,
   selected panel = green solid (`--c-focus-stroke`), editing = orange
   dashed + green corner handles — three unrelated signals. New scheme:
   _selected_ = 2 px solid `--c-accent`; _editing_ = 2 px dashed
   `--c-accent` + accent corner handles; merge cells keep accent fill.
   Retire green/orange from panel chrome (green stays for success toasts).
2. **Teach double-click.** _Superseded (2026-07-12): the interaction-model
   redesign's always-on hint bar (`components/StatusHints/HintBar.tsx`,
   under the canvas pane) covers this — see
   `2026-07-12-interaction-model-redesign.md` Part 3._ Original idea:
   while a panel is _selected_, properties subtitle appends " —
   double-click panel to pan & zoom"; the same hint renders as the
   existing chip pattern near the canvas the first time a panel is
   selected per session.
3. **App bar.** Add: `New` button (wired to existing `onNew`); document
   name + bullet when dirty (`untitled.mosaic •`) centered or next to
   Save; Undo/Redo icon-buttons with labels and disabled states (wired to
   `history`, tooltips "Undo (⌘Z)"/"Redo (⇧⌘Z)"). Raise `MAX_HISTORY`
   10 → 50 (`state/history.ts`) — entries share structure; memory cost is
   trivial next to bitmaps.

**Files.** `GridCells.tsx`/`PanelInteractionLayer.tsx` chrome colors,
`styles.css` tokens (`--c-select-stroke` usage audit), `App.tsx`,
`PropertiesPanel.tsx`, `state/history.ts`.

**Accept.** One accent hue signals all selection states; a colorblind user
distinguishes selected vs editing by solid vs dashed, not hue. Dirty state
visible without attempting to close. Undo discoverable without knowing ⌘Z.

## Phase 6 — Microcopy pass (P3)

- Fit modes: labels `Contain/Cover/Stretch` → `Fit / Fill / Stretch`
  (values in state unchanged; labels only, everywhere incl. tooltips:
  "Fit — whole image visible", "Fill — panel fully covered, image may be
  cropped", "Stretch — ignore aspect ratio").
- `Rows`/`Cols` → keep; add tooltip "1–10".
- Tray sections: `Unplaced` → `In tray`, `Placed` → `In figure` (matches
  the researcher's mental model of tray vs figure).
- `Reset all letter overrides` and its explanatory paragraph: collapse the
  paragraph into a tooltip on the button; the always-visible three-line
  explanation is the properties panel's single largest text block and only
  matters after an override exists — render it (or the button) only when
  `letterOverrides` is non-empty.
- Toast for load: "Project loaded" → include basename.

**Accept.** `pnpm test` label assertions updated; no state/schema changes.

---

## Non-goals (explicitly out of scope)

- No visual reskin: palette, radii, typography scale, spacing stay.
- No canvas zoom/fit-to-window (fixed 800×600 editor is a settled
  architecture decision — see full-resolution-canvas spec annotation).
- No dark mode, no theming.
- No new export formats or DPI options.
- No promotion of UI selection state into `FigureState` (PanelInteraction
  stays UI-only).

## Suggested implementation order & sizing

Phases are independent unless noted; each lands green
(`typecheck`/`test`/`lint`) on its own.

1. Phase 1 (P0, ~M — touches schema/render/tests; do first, highest value)
2. Phase 2 (P1, ~S — mostly deletion; quick win)
3. Phase 3 (P1, ~M/L — largest; click-to-place is the meaty part)
4. Phase 4 (P2, ~M — export hook refactor is mechanical)
5. Phase 5 (P2, ~S)
6. Phase 6 (P3, ~S)

Testing conventions apply throughout: reducer/render changes get recorder-
based unit tests; component behavior via @testing-library where it exists.
After each phase, verify visually in the running app (the critique was
driven via a Playwright script against the built app — reuse that approach:
build, launch Electron with `playwright-core`, stub `dialog.showOpenDialog`
for fixture import, screenshot).
