# Toolbar visual refresh — design

## Problem

The header is a single `flex-wrap` row holding seven control groups (Open, Save, Export, Grid, Merge, Panel, Annotate) separated only by 1px dividers. On any moderately narrow window, groups wrap into multiple rows of equal-weight buttons with no clear hierarchy. The result reads as "buttons everywhere, no styling," even though the underlying CSS token system in `styles.css` is already considered.

The styling foundation is fine. The information architecture is the problem.

## Goal

Reorganise the header into a conventional two-row layout that is instantly legible to a first-time researcher — at home next to Excel, ImageJ, GraphPad. No new flashy visual language; reuse existing tokens.

## Design

### Row 1 — App bar (~40px, `--c-surface`)

- Left: `Mosaic Builder` title • thin divider • `Open…` and `Save` buttons.
- Right: `Export ▾` button (existing primary).
- Spacer pushes Export to the far right so file actions read as the small fixed cluster they are.

### Row 2 — Tool ribbon (~64px, `--c-surface-muted`, bottom border)

Four groups, each a labelled "card" with a small uppercase header:

1. **GRID** — Rows / Cols / Gutter px / Gutter color
2. **SELECTION** — Merge / Unmerge
3. **PANEL** — Fit (segmented) + Rotate / Flip H / Flip V / Reset / Calibrate
4. **ANNOTATE** — Tool selector (segmented) + Letters checkbox

Group cards use `--c-surface`, `1px var(--c-border)`, `var(--r-md)` radius, soft `--sh-sm`. They are always visible (we never hide a group); when a group's actions are not applicable to the current selection they remain visible but their buttons go to the existing `:disabled` state.

### Sidebar tray (left) — moderate refresh

- "Add images…" button keeps `btn-primary` style, gains a small inline file-icon (SVG, monochrome).
- Section row: header label + count rendered as a small pill (`--c-surface-muted`, tabular-nums, rounded).
- Empty-state cards keep dashed border, slightly more breathing room.

### Properties panel (right) — moderate refresh

- Title block gains a thin bottom rule (`--c-divider`) to separate from the form.
- Form sub-sections (when the form has them) get a `section-heading`-style label, matching the ribbon's visual language for consistency.

### CSS additions (in `styles.css`)

- `.app-bar` — row 1 layout
- `.tool-ribbon` — row 2 background and bottom border
- `.tool-group` — labelled card container
- `.tool-group-label` — small uppercase header above each card
- `.tray-section-count` — pill-style count badge in sidebar
- `.props-title-block` — title + subtitle + bottom rule

No new color tokens. No new radii. No new shadows. Everything composes from existing variables.

## What we are not changing

- `.btn`, `.btn-primary`, `.seg`, `.input` styles — already restrained and appropriate.
- Color palette and shadow scale.
- Component logic, props, or test IDs. Purely presentational.
- Modals, toast tray, canvas itself.

## Out of scope

- Icons inside ribbon buttons (decided: keep text-only, more discoverable for first-time users).
- Drag-handle / docking behaviour for the ribbon.
- Theming / dark mode.

## Files touched

- `src/renderer/App.tsx` — header JSX restructured into `.app-bar` + `.tool-ribbon` with `.tool-group` wrappers around each existing toolbar component. Each toolbar component continues to render its own controls; App.tsx provides the group label + container.
- `src/renderer/styles.css` — add the classes listed above.
- `src/renderer/components/Sidebar/Tray.tsx` — count pill + Add-images icon.
- `src/renderer/components/Properties/PropertiesPanel.tsx` — title block bottom rule.
- Each `Toolbar/*.tsx` component — remove its own leading `toolbar-divider` (the ribbon now provides grouping); confirm internal layout still works.

## Acceptance

- Header reads as two rows on every reasonable window width; no wrap chaos.
- All `data-testid` attributes preserved; existing tests still pass.
- Looks at home next to Excel/ImageJ/GraphPad; nothing reads as Vercel-marketing.
