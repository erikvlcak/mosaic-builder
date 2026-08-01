# Toolbar + properties panel refresh

Date: 2026-08-01
Status: approved, ready to implement

## Problem

Three issues visible in the M8 UI:

1. **Chrome eats vertical space.** Three stacked toolbar rows (app bar,
   tool ribbon, zoom row) consume ~130px before the canvas begins. The
   zoom row holds one control group and leaves ~70% of its width empty.
2. **Flat hierarchy in the ribbon.** `GRID`, `MERGE`, `ANNOTATE` render
   at the same visual weight as the controls they label, so the labels
   compete with their own content instead of orienting the eye.
3. **The properties panel is an undifferentiated stack.** Fit,
   Transform, the pan/zoom/rotation readout, Subpanel letter, Calibrate,
   Crop and Remove sit in one flat column with inconsistent spacing and
   no grouping. The destructive action looks identical to the rest.

A fourth issue surfaced while verifying the Windows hint work: shortcut
prose prints raw glyphs (`⇧click cells to select`, `⌦ removes`). `⌦` is
forward-delete — not the key the app binds — and symbols read as noise
inside a sentence on any platform.

## Non-goals

No token changes, no palette changes, no new dependencies. Gesture
routing (`interaction/resolve.ts`), the reducer, and all render code are
untouched. This is layout, hierarchy, and copy only.

## Design

### 1. Toolbar: three rows collapse to two

Row 1 (app bar, 42px) is unchanged: title, New/Open/Save, Undo/Redo,
document name, theme toggle, Export.

Row 2 (tool ribbon) absorbs the former zoom row. Grid / Merge / Annotate
stay left; **Zoom moves to the far right** via `margin-left: auto`.

Rationale: zoom is a _view_ control, not a figure control. Everything
else in the ribbon mutates `FigureState`; zoom does not (see
`zoom-no-dirty.test.ts`). Separating it spatially matches that boundary
and fills otherwise-dead width.

Net: ~130px → ~88px of chrome; ~44px returned to the canvas.

**Amendment (found by measuring the running app).** `margin-left: auto`
alone does not reclaim the row. The ribbon is a single wrapping flex
line, so when its contents exceed the width, Zoom wraps first and the
auto-margin merely right-aligns it _on the second line_ — cosmetically
correct, no space saved. Measured at a 1470px ribbon: 1519px needed.

Two compressions close the 49px gap, both verified by re-measuring:

1. **`Rows [2] Cols [2]` → `[2] × [2]`** (−112px). The words are
   redundant beside two number fields joined by a multiplication sign;
   `aria-label` retains the naming for assistive tech.
2. **The gutter `Color` label and `px` suffix are dropped** — a swatch
   next to a gutter size needs no word.
3. **Merge's always-on starter hint is removed** (−135px). See §3.

Result: 1370px needed vs 1470px available — one line, 100px headroom.

Group labels already matched the intended treatment
(`10px / 600 / uppercase / --c-text-faint`) and dividers already used
`--c-divider`, so neither needed changing; divider margins were widened
instead so adjacent groups stop reading as one run.

### 2. Properties panel: three labelled sections

Sections separated by a hairline rule, each with a small-caps header:

- **Placement** — Fit, Transform buttons, pan/zoom/rotation readout.
  These are one concept: where the image sits inside its panel.
- **Appearance** — Subpanel letter, Calibrate scale.
- **Actions** (rule only, no header) — Crop…, then Remove from panel.

The pan/zoom/rotation readout becomes a two-column definition list on a
consistent 8px rhythm rather than a loose stack.

`Remove from panel` takes `.btn-danger` (it is currently styled as a
neutral button) and sits after a deliberate gap so it is not adjacent to
the controls above it.

### 3. Shortcut copy: words in prose, glyphs in chrome

Two distinct registers:

- **Prose** (hint bar, merge hint) uses spelled-out words on _both_
  platforms: `Shift-click cells to merge`, `Delete removes`. Identical
  on Mac and Windows.
- **Chrome** (tooltips, menus) keeps native glyphs, where they are
  conventional and unambiguous: `Undo (⌘Z)` / `Undo (Ctrl+Z)`.

`ShortcutGlyphs` is retained for the chrome register. Prose stops
consuming `shift`/`del` glyphs entirely, which also removes the `⌦`
wrong-key bug.

**Merge hint, amended.** `MergeControls` showed
"Shift-click cells to select" whenever nothing was selected, reserving
~135px of ribbon permanently to teach a convention the hint bar already
teaches ("Shift-click cells to merge" on any panel selection). That
starter hint is removed; the _corrective_ hint ("select adjacent cells
forming a rectangle") stays, because only MergeControls knows why a
particular selection is rejected. `merge-controls.test.tsx` is updated
accordingly — this is a deliberate behavior change, approved during
design.

## Testing

- `hint-bar.test.tsx` asserts the word-based prose, with Mac and PC
  glyph sets producing _identical_ strings for those hints.
- `shortcuts.test.ts` keeps the `detectMac` regression cases (the
  `"macOS"` lowercase-m bug) and the chord/glyph assertions.
- `zoom-controls.test.tsx` and `merge-controls.test.tsx` should pass
  unchanged: no `data-testid` moves and no behavior changes.
- Manual: run the app, screenshot light and dark, confirm the ribbon is
  one row shorter and the properties panel reads as three groups.

## Risks

- Moving zoom to the right edge is the only control that changes
  location. Accepted by the user during design.
- Section rules in the properties panel must use `--c-divider` so dark
  mode inherits correctly; no hardcoded colors.
