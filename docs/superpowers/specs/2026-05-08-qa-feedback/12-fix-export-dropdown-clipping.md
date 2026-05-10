# 12 — Fix Export dropdown clipping

## Problem

The Export button is in the app bar, anchored to the right of the
window. Its dropdown menu opens with `top: calc(100% + 4px); left: 0`
(see `ExportMenu.tsx:140`). When the button sits near the right edge
of the window, the dropdown extends past the window's right edge and
its content (especially the "Quality" slider in the JPEG sub-panel)
gets clipped.

## Goal

The export dropdown is always fully visible inside the viewport. No
content is clipped at any window width.

## Design

Three small fixes, in increasing order of effort. Pick option 2; the
others are alternatives for context.

### Option 1 — Anchor right instead of left

Change `left: 0` to `right: 0`. The dropdown opens flush with the
button's right edge instead of its left, so it extends leftward into
the viewport. Done.

This is a one-line change and works because the button is already at
the far right of the app bar. The risk is if the menu moves elsewhere
later, but that's a future-day problem. **Recommended.**

### Option 2 — Smart positioning

Compute on open whether `button.getBoundingClientRect().right + menuW

> window.innerWidth`. If yes, use right-anchor; else use left-anchor.

Slightly more code; survives a future repositioning of the button.

### Option 3 — Portal to document body

Render the menu via a portal at `document.body`, with `position:
fixed` and absolute coordinates derived from the button's
bounding-rect. Bulletproof against any parent-overflow clipping.
Overkill for this one menu.

### Recommended: Option 1, with a small CSS hardening

```tsx
{open && (
  <div
    className="menu"
    role="menu"
    style={{
      position: "absolute",
      top: "calc(100% + 4px)",
      right: 0,           // was: left: 0
      maxHeight: "calc(100vh - 80px)",
      overflowY: "auto",
    }}
  >
```

The `maxHeight` keeps the menu in-viewport even on short windows.

The same fix to the JPEG sub-panel (`menu-section`) is unnecessary —
once the parent menu is right-anchored, the sub-panel inherits a
sensible position.

### Test impact

There's no automated test today for menu positioning. Manual: open
the export menu at narrow window widths and verify nothing clips.
Add a small Vitest case asserting the rendered menu element has
`right: 0` (verifying the change took effect, not the layout).

## Files touched

- `src/renderer/components/Toolbar/ExportMenu.tsx` — anchor change +
  `maxHeight`.

## Acceptance

- At any window width down to 800px, opening the Export menu shows
  the full menu inside the viewport.
- The JPEG sub-panel (Quality slider) is fully visible and
  interactive.
- TIFF and PDF rows fit.
- Saved-state messaging below the button still renders without
  layout shift.

## Out of scope

- Repositioning other menus / popovers in the app. Only Export
  reported as broken in QA; defer the rest.

## Depends on

Nothing.
