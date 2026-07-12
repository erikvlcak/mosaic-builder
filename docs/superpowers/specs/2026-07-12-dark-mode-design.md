# Dark Mode — Design

**Status:** Approved design, pre-implementation
**Date:** 2026-07-12

## Summary

Add a dark theme to Mosaic Builder. This **lifts** the "no dark mode, no
theming" non-goal from the UI/UX refresh spec
(`2026-07-11-ui-ux-refresh-design.md`) as an explicit, approved decision. The
related constraint — **no visual reskin (palette identity, radii, type scale,
spacing stay)** — remains in force. Dark mode is a *second token set of the
same design system*, not a redesign. It keeps the "next to ImageJ/GraphPad,
not Vercel" restraint.

### Why (domain justification, not aesthetics)

Users edit fluorescence micrographs and gels — dark-dominant images often
viewed in dark rooms. A bright-white UI while grading a dim GFP channel fights
the researcher's eyes and biases perception of the image itself. Dark mode
here is a **legibility feature** in the same category as the annotation halo
that recently shipped — domain-appropriate, not decoration.

## The core invariant: content vs chrome

Every color in the app resolves to exactly one of two buckets. This boundary
is load-bearing; the whole design depends on it.

- **Chrome** — editor UI that is **never exported**: app bar, tool ribbon,
  tray, properties panel, toasts, menus, modals, selection/drag overlays,
  empty-panel placeholders, the sunken surround around the figure, thumbnail
  canvas backgrounds. **Chrome re-themes** with the active theme.

- **Figure content** — user data that **lands in an export**: the figure
  canvas background, gutter color, letters, scale bars, annotation colors and
  their auto-derived halos. **Content is theme-independent** — identical bytes
  in light and dark.

Consequence: a white-gutter figure must render on white *in the editor* even
in dark mode, and exports must be byte-identical regardless of the user's
theme. Exports are already content-only by construction (the export renderer
never receives editor rendering opts); the byte-identical test (below) locks
that in against regression.

## Layer A — CSS tokens (~90%)

`src/renderer/styles.css` defines ~29 colors as `:root` custom properties.
Add a dark token set wired for three-state override:

```css
:root { /* light tokens — unchanged; stays the default */ }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* dark tokens */ }
}

:root[data-theme="dark"] { /* dark tokens — explicit override, beats OS */ }
```

**Mechanism.** The renderer stamps `data-theme="light"` or `data-theme="dark"`
on `<html>` for an explicit pin, or stamps **nothing** for "System" (letting
the media query drive). The `:not([data-theme="light"])` guard is what lets an
explicit *light* pin win even when the OS is dark. This is the pair required to
"win over the OS setting in both directions."

**Dark token values** stay within the same design system:

- **Backgrounds** invert the elevation ramp: `--c-bg` becomes the darkest
  (near-black surround), `--c-surface` a lifted panel, muted/sunken between.
- **Text** inverts: `--c-text` near-white; `--c-text-muted`/`--c-text-faint`
  step *down* in contrast from there.
- **Accent** keeps the **same hue** (`#2e5bff`). Solid accent fills already
  carry white text and read fine on dark. `--c-accent-soft` (a pale tint in
  light) becomes a **dark-transparent accent wash** so "selected/active" chips
  don't glare.
- **Semantic colors** (success/warn/danger) keep their hues; the soft-tint
  backgrounds become dark-transparent versions. The toast **text** colors —
  currently hardcoded `#1a327f` / `#134b30` / `#6e1f1f` — become tokens so they
  invert (see Layer C, bucket A).
- **Shadows** deepen (dark UIs need heavier shadows to read as elevation).

Everything already using `var(--c-*)` re-themes for free — the 90%.

## Layer B — Canvas chrome (~10%, the real design question)

The `<canvas>` does not see CSS variables. Chrome colors baked into the draw
path get the theme threaded in via the **existing** `DrawFigureOpts` struct —
the same mechanism `editorHints` already uses:

```ts
export interface DrawFigureOpts {
  editorHints?: boolean;
  poolHasImages?: boolean;
  theme?: "light" | "dark"; // NEW — chrome only; default "light"
}
```

**Only `drawPlaceholder` reads `opts.theme`.** It selects between two chrome
palettes:

- **light** (today): fill `#EEEEEE`, stroke `#CCCCCC`, label `#666666`,
  caption `#9AA0A8`.
- **dark**: a lifted-charcoal fill that reads as an empty slot against the
  dark surround without glaring, with light-gray label/caption. Exact values
  chosen during implementation against the WCAG gate (Section: Testing).

`drawFigure`'s **content path** — `figure.canvas.background`,
`figure.grid.gutterColor`, and all annotation drawing — **never reads
`opts.theme`.** The editor renderer passes the current theme; export renderers
never pass it (default `"light"`, and chrome never appears in exports anyway).
The type makes it structurally impossible for figure content to depend on the
theme.

**Two component-local canvases** outside the shared `drawFigure` path also
carry chrome backgrounds:

- `Thumbnail.tsx` — thumb canvas background (`#1E232B`).
- `CropImageModal.tsx` — crop-preview background (`#F1F5F9`).

These re-theme by reading their resolved token via `getComputedStyle` at draw
time, or by receiving the effective theme as a prop. They are isolated
component canvases, not the shared draw routine; the exact approach is settled
in the implementation plan.

## Layer C — The toggle

**State model.** `ThemeChoice = "system" | "light" | "dark"`, default
`"system"`. Resolved to an effective `"light" | "dark"` by combining the choice
with the live OS preference.

**Control.** A three-way segmented control reusing the existing `.seg`
component (System / Light / Dark), placed in the app bar's right cluster
(`.app-bar-right`). It matches the ribbon's visual language; no new component
vocabulary. On narrow widths it may collapse to a single icon-button that
cycles; the segmented control is the default.

**Persistence — localStorage (renderer-only).** There is currently **no**
settings/persistence machinery in the app (no electron-store, no settings IPC
channel, no `nativeTheme` wiring). The preference lives in `localStorage` under
key `mosaic-theme`. This adds zero new IPC and zero main-process code, survives
restarts, and reads **synchronously** on boot — which is what makes a no-flash
boot possible.

**No-flash boot sequence** (order matters):

1. The app's Content-Security-Policy is `script-src 'self'` — it forbids
   inline `<script>` in `index.html` (only `style-src` allows `'unsafe-inline'`;
   scripts do not). So the classic "inline script in `<head>`" trick is out,
   and we will **not** weaken the CSP. Instead, a synchronous
   `applyStoredTheme()` call runs at the **very top of the renderer entry
   module (`main.tsx`), before `createRoot`**, reading
   `localStorage.getItem("mosaic-theme")`, resolving it against
   `matchMedia("(prefers-color-scheme: dark)")`, and stamping `data-theme` on
   `<html>`. This is CSP-safe (the bundle is `'self'`) and still beats first
   meaningful paint: `index.html`'s `<body>` is just an empty
   `<div id="root">`, so nothing user-visible paints until React renders, which
   happens *after* the stamp. The only pre-React paintable surface is the
   `body` background, and the module import order stamps `<html>` before that
   matters.
2. A `useTheme` hook owns the runtime: reads the same key, exposes `choice` +
   `setChoice`, writes `localStorage` on change, and re-stamps `<html>`.
3. When `choice === "system"`, the hook subscribes to `matchMedia` `change`
   events so flipping the OS theme while the app is open re-themes live. When
   pinned to light/dark, that listener is inert.

**Threading to the canvas.** The resolved effective theme flows from
`useTheme` → `App.tsx` → the `EditorCanvas` render call as
`DrawFigureOpts.theme`. One value, one path.

```
main.tsx applyStoredTheme() ──stamps──► <html data-theme>  (CSS re-themes)

useTheme() ──► choice / setChoice ──► localStorage + re-stamp <html>
     │
     └──► effectiveTheme ──► App ──► EditorCanvas ──► drawFigure(opts.theme)
```

## Inline-hex remediation

Full audit of hardcoded hex in `src/renderer` `.ts`/`.tsx`. Every site sorts
into one of three actions. This is the "no inline-hex regressions" acceptance
criterion made concrete.

### Bucket A — chrome → CSS token (DOM)

| Site | Current | Action |
|---|---|---|
| `styles.css` `.toast--info/success/error` text | `#1a327f`, `#134b30`, `#6e1f1f` | new `--c-*-strong` text tokens that invert |
| `styles.css` `.thumb-badge` | `#fff` | `--c-on-accent` token (white in both — consistency/auditability, not a value change) |
| `styles.css` shadows / hover overlays | `rgba(0,0,0,…)`, `rgba(15,23,42,…)` | token-ize backdrop + hover overlays for dark |
| `EditorCanvas.tsx:51` surround border | `#DDD` | `var(--c-border)` |
| `PanelInteractionLayer.tsx:379` | `#fff` | token |
| `AnnotationInteractionLayer.tsx` | `#0066FF`, `#FFF`, `#888`, `#C00` | `--c-accent`, surface/border/danger tokens |
| `CropImageModal.tsx` | `#F1F5F9`, `#FFF` (DOM styles) | surface tokens |
| `CalibrationModal.tsx:177` | `#FFF` | token |

Note on `--c-on-accent`: the accent fill keeps its hue in both themes and
always carries white text, so this token is white in both. It becomes a token
so "no raw hex" is a clean, auditable invariant — not because the value
changes.

### Bucket B — chrome → theme flag / component canvas (canvas)

- `draw-figure.ts:62-65` placeholder fill/stroke/label/caption → dark variant
  selected via `opts.theme`.
- `Thumbnail.tsx:50` `#1E232B` → resolved token / passed theme.
- `CropImageModal.tsx` canvas-fill `#F1F5F9` → resolved token / passed theme.

### Bucket C — figure content → LEAVE ALONE (theme-independent by design)

Touching any of these would corrupt exported user data.

- `App.tsx:88` `CANVAS_BG = "#FFFFFF"`
- `figure-state.ts:141` `gutterColor: "#FFFFFF"`
- `export-renderer.ts:26` export background `#FFFFFF`
- `draw-annotations.ts:138` luminance-derived halo (`#000000`/`#FFFFFF` chosen
  from fill contrast — content-derived)
- `global-style.ts`, `default-text-style.ts`, `default-symbol-style.ts`,
  `symbols/library.ts` — default annotation / letter / scalebar colors
- **Fallback hexes** in `GridControls.tsx:84` (`#FFFFFF`), `ColorField.tsx:34`
  (`#000000`), `LetterAnnoForm.tsx:354` (`#000000`), `MultiAnnoForm.tsx:228`
  (`#000000`). These seed a **content** color the user is about to edit into
  the figure — tokenizing them would corrupt exported data. Explicitly
  do-not-touch; a well-meaning "tokenize all hex" sweep must skip these.

## Testing strategy

TDD throughout; recorder-based where the draw path is involved. Each
implementation step ends green on `pnpm typecheck && pnpm test && pnpm lint`
(zero-warning policy).

### 1. Draw-path theme flag (recorder-based, `node` env)

Extend `draw-figure.test.ts` against the `DrawCtx` recorder fake:

- **Chrome re-themes:** `drawFigure` with an empty panel and
  `opts.theme === "dark"` records the *dark* placeholder fill/stroke/label;
  with `"light"` (or omitted) records today's `#EEEEEE`/`#CCCCCC`/etc. Assert
  on the recorded `fillStyle`/`strokeStyle` sequence.
- **Content is theme-invariant:** render a figure with an image panel, a gutter
  color, and annotations under *both* `theme: "light"` and `theme: "dark"`;
  assert the recorded **content** ops (canvas background fill, gutter fill,
  annotation fills/halos) are **identical** across the flip. This is the
  unit-level guarantee that `opts.theme` never leaks into content.

### 2. Byte-identical export across a theme flip (headline acceptance test)

The export path (`export-renderer` → `drawFigure`) never receives
`opts.theme`, so it is theme-independent by construction — this test proves it
and guards regression. Build a representative `Figure` (image panel + gutter +
letters + a scale bar), render it through the export renderer's
`OffscreenCanvas` pipeline **twice** — once with `<html data-theme="light">`,
once with `"dark"` — and assert the produced bytes are **equal**. The render is
deterministic; comparison is on the encoded PNG buffer. Any future change that
couples export to theme turns this test red.

### 3. Contrast / WCAG AA gate (design-time, recorded in the plan)

Every re-themed text-on-background token pair in the dark set is checked to
≥ 4.5:1 (normal text) / ≥ 3:1 (large text + UI component boundaries) as the
dark tokens are chosen. Ratios are recorded in the implementation plan so "no
unreadable contrast" is auditable, not asserted by vibe. Covers: body text,
muted/faint text, accent-on-surface, toast text-on-soft, placeholder
label/caption on the dark empty-panel fill, and selection chrome on the dark
surround.

### 4. Manual visual verification in the running Electron app

Screenshot first-run and a placed dark image (a dim GFP-like frame) in **both**
light and dark mode; confirm the figure pixels match across themes (chrome
differs, figure does not). Run last, after typecheck/test/lint are green.

## Scope boundaries

**In scope:** OS-preference default via `prefers-color-scheme`; a three-state
in-app toggle persisted via `localStorage`; theme-aware treatment of the
selection-chrome tokens the refresh unified onto `--c-accent`; dark values for
all chrome tokens; the `DrawFigureOpts.theme` chrome flag; inline-hex
remediation per buckets A/B/C.

**Out of scope / unchanged:** radii, type scale, spacing, the accent hue's
identity; any figure-content color; any new main-process settings subsystem or
IPC channel (localStorage only); OS-native menu integration for the toggle.
