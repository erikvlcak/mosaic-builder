# Interaction model redesign — design (2026-07-12)

Design document for the next implementation session. Produced from an
exhaustive audit of every input handler in the renderer (all pointer,
wheel, keyboard, and drag/drop listeners, their modifier gates, and
their `preventDefault`/`stopPropagation` coupling), the four concurrent
interaction states in `App.tsx`, and a comparison against the control
conventions of Figma, Adobe InDesign/Photoshop, Canva, PowerPoint,
Excalidraw, and macOS Preview.

**Status: ready to execute.** Phases are ordered, independently
shippable, and each names its files and tests.

## Who this is for (design context)

Same audience as the 2026-07-11 UX refresh: researchers composing
journal figures — domain users, not designers, arriving with muscle
memory from PowerPoint, ImageJ, and photo croppers, sometimes Figma.
The bar: **a gesture must mean the same thing every time**. A control
scheme they cannot predict is worse than one they must look up.

## The complaint (verbatim summary)

Inputs interfere with each other. Scroll acts on the image only while
the cursor is over the panel — drift outside mid-scroll and the whole
canvas zooms instead. Direct drag-to-move between panels was removed
(regression), yet left-drag still can't be trusted to pan. Whether
shift / cmd / spacebar / drag / scroll does anything — and what —
depends on invisible state. Unreliable, hard to learn.

The audit confirms every one of these and finds the common root cause.

---

## Part 1 — Audit findings

### The current gesture matrix (as shipped on `main` @ 3a2b7ae)

What a gesture does today, by context. Every cell that differs across a
row is a learnability failure; every cell that depends on _cursor
position_ rather than _visible state_ is a predictability failure.

| Gesture                    | Over background | Over selected panel | Over editing panel | Over editing panel + Space |
| -------------------------- | --------------- | ------------------- | ------------------ | -------------------------- |
| Wheel                      | Zoom viewport   | Zoom viewport       | Zoom viewport      | **Zoom image**             |
| Left-drag                  | Pan viewport    | Pan viewport        | Pan viewport       | **Pan image**              |
| Left-drag on corner handle | —               | —                   | Resize panel       | Resize panel               |
| Click                      | Deselect        | (no-op)             | (no-op)            | (no-op)                    |
| Double-click               | —               | Enter editing       | (no-op)            | (no-op)                    |

Plus: `Cmd`-hold forces the annotation tool to "select"
(`effectiveTool`, `App.tsx:603`), `Shift`+click toggles merge cells,
`Shift`+click toggles annotation multi-select, and `Shift` during an
annotation drag disables snapping. Five modifiers, each with a
different, unrelated meaning.

### Root cause

The app **inverts the industry convention**. In every major canvas
tool (Figma, Photoshop, Illustrator, InDesign, Excalidraw, Canva),
bare gestures act on **content** and `Space` is the **temporary
navigation override**. Here, bare gestures navigate the viewport and
`Space` redirects them to content (`PanelInteractionLayer.tsx:114,181`,
`useCanvasZoom.ts:190`). Users' instincts from every other tool
produce the opposite of what they intend, in both directions.

### Enumerated conflicts

- **C1 — Wheel meaning is position-dependent.** The editing panel's
  wheel listener and the viewport's wheel listener are both live;
  which one fires depends on the hover point, with no visual boundary.
  (This is the user's "scroll suddenly zooms the canvas" report.)
- **C2 — Implicit cross-layer arbitration.** `useCanvasZoom.ts:153`
  infers "the panel consumed this wheel" from `e.defaultPrevented`.
  Correctness depends on listener registration order and bubbling
  accidents. There is no single place where precedence is written down.
- **C3 — `Space` semantics inverted** vs. all reference tools (above).
- **C4 — Left-drag was given wholesale to viewport panning**
  (920a1e4), which removed direct image moving. Users lost the most
  natural gesture in the app (drag a picture to another slot — the
  PowerPoint/Canva instinct) to fix a conflict that should have been
  resolved by _hit-testing_, not by _removing the feature_.
- **C5 — Image moving exiled to the tray.** Moving a placed image now
  requires finding its thumbnail in the tray and dragging that — an
  invisible indirection nothing in the UI teaches.
- **C6 — `Cmd`-hold-as-temporary-select** is a hidden mode with a
  bespoke chip, needed only because placement tools stay armed forever.
- **C7 — `⌘0` / `⌘+` / `⌘−` are double-bound.** The Electron View menu
  registers `resetZoom`/`zoomIn`/`zoomOut` roles (`menu.ts:77-79`) on
  the same accelerators the renderer binds for canvas zoom
  (`useKeyboardShortcuts.ts:59-82`). Webpage zoom races canvas zoom.
- **C8 — Corner resize handles live in _editing_ mode**
  (`PanelInteractionLayer.tsx:260`), conflating layout (panel
  geometry) with content (image framing) in one mode.
- **C9 — Four independent selection states** (panel interaction,
  annotation set, merge-cell set, armed thumbnail) with no hierarchy;
  `Escape` nukes all of them at once (`App.tsx:504-510`) instead of
  unwinding one level.
- **C10 — Zero discoverability layer.** No hint surface exists; the
  only mode indicator is the SELECT MODE chip for the least important
  mode. (Confirmed by the 2026-07-11 critique: "Help: tooltips only.")

### What already works and must not regress

- The dnd pipeline: payload → `dispatchDrop`/`previewForDrop` lockstep,
  live real-render drop preview, `SWAP_PANELS` move-or-swap semantics.
- Transient-action + `history.commit()` on gesture end (single undo
  step per drag / wheel burst, 250 ms wheel-settle debounce).
- Click-to-place from the tray; Enter places into first empty panel.
- `Shift`+click merge-cell selection; M/U/R/H/V/0 shortcuts.
- Annotation move/resize/rotate with snapping; inline text editing
  with Enter/Esc; modal Esc/Enter handling.
- Viewport zoom math: cursor-anchored, `fitZoomFloor`, clamps.

---

## Part 2 — The target model

### One rule

> **Verbs are fixed. Modes change only the subject.**
>
> - **Scroll pans. `⌘`/`Ctrl`+scroll and pinch zoom.** Always.
> - **Drag moves the thing under the cursor** (image → another panel,
>   annotation → new position, handle → resize, background → pan view).
> - **`Space`+drag and middle-drag pan the viewport.** Always, from
>   anywhere, overriding everything. (`Space` = the hand tool, as in
>   every design tool.)
> - **Double-click enters Frame mode** — the one true mode — which
>   retargets scroll/zoom/drag from the viewport onto the framed
>   image, **regardless of cursor position** inside the canvas pane.
> - **`Esc` backs out one level.** Always.

Nothing a user does with scroll or `⌘`scroll ever depends on which
pixel the cursor happens to be over — only on the one loudly visible
mode. This kills conflict class C1/C2/C3 outright.

### States

There is exactly **one mode** (Frame) plus ordinary selection:

1. **Base** — the default. No mode. Click to select panels,
   annotations, cells; drag to move things; navigate freely.
2. **Frame mode** (rename of "editing"; the code literal
   `"editing"` in `PanelInteraction` may stay to limit churn) —
   entered per image-panel, exists to _frame the image inside its
   panel_ (pan/zoom the content). Loud chrome, obvious exits.
3. **Placement tool armed** (text / symbol / scale bar) — a one-shot
   stamp that auto-returns to Select after placing. Not a persistent
   mode anymore (kills C6).
4. Modals (crop, calibrate, relink) — unchanged, own their keys.

### Complete input reference — Base

Pointer, over the canvas pane:

| Input         | Target under cursor                                              | Result                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Click         | Panel (any)                                                      | Select panel (solid accent outline + corner handles if resizable)                                                                                         |
| Click         | Annotation / letter                                              | Select it (panel selection untouched)                                                                                                                     |
| `Shift`+click | 1×1 panel cell                                                   | Toggle merge-cell selection (existing)                                                                                                                    |
| `Shift`+click | Annotation                                                       | Toggle in multi-selection (existing)                                                                                                                      |
| Click         | Hole (hidden cell)                                               | Restore panel (existing)                                                                                                                                  |
| Click         | Background / gutter                                              | Clear selections                                                                                                                                          |
| Double-click  | Placed panel                                                     | **Enter Frame mode**                                                                                                                                      |
| Double-click  | Empty panel                                                      | Open "Add images…" dialog (P2, optional)                                                                                                                  |
| Drag          | **Placed panel**                                                 | **Pick up the image** — HTML5 drag, live preview, drop on another panel = move (empty) / swap (occupied). Restores the direct gesture removed in 920a1e4. |
| Drag          | Empty panel / background / gutter                                | Pan viewport (grab cursor while panning)                                                                                                                  |
| Drag          | Annotation / symbol handles / track gutter / panel corner handle | Move / resize / rotate that object (existing handlers)                                                                                                    |
| Middle-drag   | anywhere                                                         | Pan viewport                                                                                                                                              |
| `Space`+drag  | anywhere                                                         | Pan viewport (overrides everything, including annotation drags)                                                                                           |

Wheel, over the canvas pane:

| Input                    | Result                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Scroll                   | Pan viewport (trackpads pan 2-D via deltaX/deltaY; `Shift`+wheel = horizontal for mice) |
| `⌘`/`Ctrl`+scroll, pinch | Zoom viewport, cursor-anchored (existing math, `scrollForCursorZoom`)                   |

Wheel outside the canvas pane (tray, properties): native scrolling,
never hijacked.

### Complete input reference — Frame mode

Entered by double-click on a placed panel, or `Enter` while one is
selected. Chrome: dashed accent outline (existing) **plus a scrim
dimming everything else** (DOM overlay — never touches the export
pipeline) and a corner chip: `Framing — Esc when done`.

| Input                                 | Result                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Drag (anywhere in canvas pane)        | Pan the image inside the panel                                              |
| Scroll                                | Pan the image (2-D trackpad; `Shift`+wheel horizontal)                      |
| `⌘`/`Ctrl`+scroll, pinch              | Zoom the image, cursor-anchored when over the panel, panel-center otherwise |
| `+` / `−`                             | Zoom image by 1.25× steps                                                   |
| `0`                                   | Reset framing (existing `RESET_PANEL_TRANSFORM`)                            |
| Arrow keys                            | Nudge image 1 px (`Shift` = 10 px)                                          |
| `R` / `H` / `V`                       | Rotate / flip the framed panel (existing actions)                           |
| `Delete` / `Backspace`                | Unplace image to tray (`UNPLACE_PANEL`) + exit                              |
| `Esc` / `Enter`                       | Exit Frame mode (panel stays selected)                                      |
| Click outside the panel (no movement) | Exit + forward the click (selects what was clicked)                         |
| Double-click another placed panel     | Switch frame target directly                                                |
| `Space`+drag / middle-drag            | Pan viewport (global override still wins)                                   |
| `⌘+` `⌘−` `⌘0` `⌘1`                   | Viewport zoom (keyboard zoom stays navigational)                            |

Position-independence is the point: once framing, scroll works the
same over the panel, over the gutter, over a neighboring panel.
Drag-vs-click discrimination uses a 4 px threshold (same pattern as
the existing backdrop-press logic, `AnnotationInteractionLayer.tsx:858`).

Stretch-fit panels have no framing degrees of freedom: double-click
on one selects it and shows a properties hint ("Stretch fit has no
framing — switch to Fit or Fill"); Frame mode is not entered.

### Complete input reference — keyboard (global)

Unchanged: `⌘Z`/`⌘⇧Z` undo/redo, `⌘N/O/S/⇧S` file ops, `M` merge,
`U` unmerge, `R`/`H`/`V`/`0` on the focused panel, `Delete` on
selected annotations, typing-target guards.

Changed / new:

| Key                         | Context                                | Result                                                                                                                                        |
| --------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Space` (hold)              | anywhere                               | Hand tool: viewport pan override. **Repurposed** — was "redirect gestures to image" (C3).                                                     |
| `Enter`                     | placed panel selected                  | Enter Frame mode                                                                                                                              |
| `Delete`/`Backspace`        | panel selected, no annotation selected | Unplace image to tray (annotations keep priority)                                                                                             |
| `Esc`                       | everywhere                             | **Unwind one level**, in order: modal → inline text editor → pending popover → armed placement tool → Frame mode → selections (all) → nothing |
| `⌘+` `⌘−` `⌘0` `⌘1`         | everywhere                             | Viewport zoom — **single-bound**: View-menu roles are replaced by menu events routed to canvas zoom (fixes C7)                                |
| `Cmd`-hold temporary select | —                                      | **Deleted** (C6; tools auto-return instead)                                                                                                   |

### Placement tools (text / symbol / scale bar)

Click the tool, click the canvas: places the annotation, then
**auto-returns to Select**. `Shift`+click places and keeps the tool
armed for another. `Esc` cancels an armed tool. Everything else about
placement (calibration guard, popover, inline text input) is unchanged.
This removes the need for `Cmd`-hold and its chip entirely.

### Tray

Unchanged in behavior; it becomes an _alternative_ path instead of the
only one: drag thumbnail → place/move/swap; click to arm + click empty
panel to place; `Enter` places into first empty; `Space` arms; `×`
removes from pool. Placed thumbnails stay draggable.

---

## Part 3 — Visual feedback spec

### Cursors

| Surface / state                  | Cursor                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Background, gutter, empty panel  | `grab`; `grabbing` while panning                                                                                    |
| `Space` held / middle-button pan | `grab` / `grabbing`, everywhere                                                                                     |
| Placed panel                     | `default` (objects use arrow, as in Figma/PPT; drag affordance comes from selection + hint bar + native drag ghost) |
| Frame mode, inside canvas pane   | `grab` / `grabbing` (avatar-cropper instinct)                                                                       |
| Corner handles                   | `nwse-resize` / `nesw-resize` (existing)                                                                            |
| Track gutters                    | `col-resize` / `row-resize` (existing)                                                                              |
| Annotations                      | `move`; letters `pointer` (existing)                                                                                |
| Armed tool                       | `text` / `crosshair` / `cell` (existing)                                                                            |

### Mode chrome

- **Selected panel:** solid accent outline + corner resize handles
  (handles move here from editing mode — layout ops belong to
  selection, C8). Merge cells: accent fill per the 2026-07-11 spec.
- **Frame mode:** dashed accent outline (existing) + **scrim** at
  ~35 % over everything except the framed panel + corner chip
  `Framing — Esc when done` + zoom % readout. The scrim is what makes
  "what will my scroll affect?" answerable at a glance from across the
  room.

### Hint bar (the discoverability fix, C10)

A one-line, muted, non-interactive strip under the canvas pane
(Blender-style status hints). Pure function of
`(frameMode, selection, armedTool, spaceHeld)`:

| State                 | Hint text                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| Nothing selected      | `Click a panel to select · Double-click to frame · Scroll to pan · ⌘Scroll to zoom`                      |
| Placed panel selected | `Drag image to another panel to move or swap · Double-click to frame · ⌫ remove · ⇧Click cells to merge` |
| Empty panel selected  | `Drag an image here from the tray · ⇧Click cells to merge`                                               |
| Frame mode            | `Drag to position · ⌘Scroll to zoom · Arrows nudge · 0 reset · Esc done`                                 |
| Tool armed            | `Click to place · ⇧Click to place several · Esc cancel`                                                  |
| `Space` held          | `Panning — release Space to return`                                                                      |

---

## Part 4 — Event-routing architecture

### The problem being fixed

Today, precedence between competing listeners is _emergent_: a wheel
handler bails without `preventDefault`, another checks
`e.defaultPrevented`, a drag handler checks `spacebarHeld` that App
threads down as a prop. Nobody can read the routing rules because they
are not written anywhere — they are the accidental sum of listener
order (C2).

### The fix: one owner per global gesture, pure resolvers

New module `src/renderer/interaction/`:

- **`intents.ts`** — discriminated unions:
  `WheelIntent = pan-view | zoom-view | pan-image | zoom-image | native`
  `PointerIntent = pan-view | frame-drag | object-drag-passthrough | native-dnd | click-through`
- **`resolve.ts`** — two pure functions, the ONLY place precedence
  lives, exhaustively unit-tested with table-driven cases:

  ```
  resolveWheel({ frameMode, zoomModifier, overCanvasPane }) → WheelIntent
  resolvePointerDown({ frameMode, spaceHeld, button, hit }) → PointerIntent
  ```

  Precedence, written once: (1) outside canvas pane → native;
  (2) `Space`/middle → viewport pan; (3) Frame mode → image gestures;
  (4) hit-test top-down: overlay controls → handles → annotations →
  placed panel (native dnd) → hole/empty/background (click / pan).

- **`useViewportGestures.ts`** — owns the single wheel listener
  (`{passive:false}`) and the single background-pan pointer sequence
  on the scroll section; consumes the resolvers; calls into
  `useCanvasZoom`'s state setters (which keeps its zoom math and fit
  machinery but **loses all DOM listeners**).
- **`useFrameGestures.ts`** — owns Frame-mode drag/wheel/keys;
  dispatches `SET_PANEL_TRANSFORM` via the existing `snapTransform` /
  `panForCursorZoom` math; keeps the transient + 250 ms wheel-settle
  commit pattern verbatim.
- **`InteractionProvider`** (context) — exposes `spaceHeld` (and the
  hit-test helper) so object-local handlers can yield to the global
  override without prop-threading.

Object-local handlers **stay local** (annotation move/rotate/resize,
track resize, corner handles, HTML5 dnd, popovers): they are
self-contained, use pointer capture + `stopPropagation`, and don't
conflict — with one addition: their `pointerdown` early-returns when
`spaceHeld` so the hand tool always wins.

Hit-testing for the pan-vs-object decision uses a `data-interactive`
attribute on every interactive element (panels, annotations, handles,
chips); the pan owner starts a pan only when
`target.closest('[data-interactive]')` is null, or Space/middle is
held. No more guessing from bubbling.

### What gets deleted

- `PanelInteractionLayer`'s wheel + pointer handlers (b1–b4 in the
  audit) — the component shrinks to pure Frame chrome
  (`FrameChrome.tsx`): outline, scrim, chips. Its corner handles move
  to a `SelectedPanelHandles` component mounted on _selected_ panels.
- `spacebarHeld` prop threading (`App.tsx:1090`,
  `useCanvasZoom.ts:190`, `PanelInteractionLayer.tsx:114,181`) —
  replaced by `InteractionProvider` with the new (inverted) meaning.
- The `e.defaultPrevented` wheel handshake (`useCanvasZoom.ts:153`).
- `cmdHeld`, `nextCmdHeld`, `useTemporarySelect.ts`, the SELECT MODE
  chip (`App.tsx:583-603, 1139-1148`), `effectiveTool`.
- `GridCells`' defensive `draggable={false}` + `preventDefault`
  dragstart (b12) — replaced by a real dragstart.
- View-menu `resetZoom`/`zoomIn`/`zoomOut` roles (`menu.ts:77-79`).

### Reducer impact

**None.** Every change is UI-layer. `FigureAction`, `figureReducer`,
serialization, and exports are untouched; `UNPLACE_PANEL`,
`SWAP_PANELS`, `SET_PANEL_TRANSFORM`, `RESET_PANEL_TRANSFORM` already
exist. `PanelInteraction` stays UI-only (per the standing non-goal).

---

## Part 5 — Execution plan

Phases are ordered by user pain and are independently shippable. Run
`pnpm typecheck && pnpm lint && pnpm test` at each phase end.

### Phase 1 — One wheel owner, one pan owner, Space = hand

The core complaint. After this phase, scroll/⌘scroll/Space are 100 %
predictable (image framing temporarily loses wheel support until
Phase 3 — acceptable for one phase; drag-framing still works via
Space? No: Space is repurposed _here_, so framing is properties-panel
only for the life of Phase 1–2. Keep the phases short.)

1. Create `interaction/intents.ts`, `interaction/resolve.ts` + tests
   (`test/unit/interaction-resolve.test.ts`, table-driven, every row
   of the reference tables above).
2. Create `InteractionProvider` owning `spaceHeld` (move the
   `App.tsx:547-579` effect; keep form-field and `e.repeat` guards,
   blur-clears).
3. Create `useViewportGestures`; strip listeners from `useCanvasZoom`
   (keep state/math/callbacks). Wheel: bare → `scrollLeft/Top +=`
   normalized deltas (`deltaMode` line → ×16), `Shift` swaps axes for
   mice; `⌘`/`Ctrl` or `ctrlKey`-pinch → existing cursor-anchored zoom.
   Pointer: pan only on `[data-interactive]`-free targets, or
   Space/middle anywhere; middle-button `preventDefault` (suppresses
   Windows autoscroll).
4. Stamp `data-interactive` on panels, holes, annotations hit-rects,
   letters, handles, chips, popovers.
5. Fix C7: replace View-menu zoom roles with `MENU_EVENTS` items
   (Zoom In `⌘+`, Zoom Out `⌘−`, Fit `⌘0`, Actual Size `⌘1`) —
   update `src/preload/api.ts` FIRST, then `menu.ts`, then
   `useMenuEvents.ts` (per the IPC-contract rule).
6. Annotation/track/corner `pointerdown`s early-return when
   `spaceHeld`.
7. Update tests: `use-canvas-zoom.test.ts` (listeners moved),
   `App`-level Space semantics.

### Phase 2 — Direct image moving returns (drag panel → panel)

1. `GridCells.tsx`: occupied panels get `draggable`, real
   `onDragStart` setting the existing tray payload
   `{kind:"tray", imageId}` (dispatchDrop already resolves placed
   images to `SWAP_PANELS` — zero dnd-pipeline changes; the unused
   `"panel"` payload variant stays retired) + `onDragSourceChange`
   for the live preview, which already works for this payload.
2. `Delete`/`Backspace` with a placed panel selected (and no
   annotation selected — annotations keep priority): dispatch
   `unplacePanel(panelId)` + `history.commit()`. Wire through
   `useKeyboardShortcuts` (`onUnplacePanel`).
3. Tests: GridCells dragstart payload + preview state; keyboard
   unplace priority (annotation selected wins).

### Phase 3 — Frame mode

1. `useFrameGestures.ts`: mode-scoped drag (4 px click/drag
   threshold; click-outside exits and forwards), wheel
   (bare → image pan, `⌘`/pinch → image zoom via `panForCursorZoom`),
   keys (`+`/`−` steps, `0` reset, arrows nudge 1/10 px,
   `Delete` unplace+exit, `Esc`/`Enter` exit), commit-on-settle.
2. `PanelInteractionLayer.tsx` → `FrameChrome.tsx`: delete all
   handlers; render dashed outline + scrim (4 absolutely-positioned
   strips or `box-shadow: 0 0 0 9999px` overlay, theme token, DOM
   only) + `Framing — Esc when done` chip + zoom % readout.
3. `SelectedPanelHandles.tsx`: move the four `CornerHandle`s to
   selected state; `RESIZE_PANEL_FREEFORM` wiring unchanged.
4. Entry/exit: `Enter` on selected placed panel enters; double-click
   other placed panel switches; stretch-fit panels select-only with
   properties hint.
5. Tests: frame resolver rows; FrameChrome render (no handlers);
   nudge/zoom/reset keys; handles-on-selected.

### Phase 4 — Tools auto-return, Esc unwind

1. Placement tools auto-return to Select after commit
   (`ADD_ANNOTATION` paths in `AnnotationInteractionLayer.tsx`);
   `Shift`+place keeps the tool.
2. Delete `cmdHeld` machinery (list in Part 4) and the chip + its CSS.
3. `Esc` becomes an ordered unwind (Part 2 table) — replace the
   clear-everything `onEscape` (`App.tsx:504-510`).
4. Tests: unwind order; auto-return; shift-keeps-tool.

### Phase 5 — Feedback layer

1. `components/StatusHints/HintBar.tsx` + pure `hintFor(state)` +
   unit test. Mount under the canvas pane in `App.tsx`.
2. Cursor spec (Part 3 table): background/gutter `grab`; Frame-mode
   pane-wide `grab`/`grabbing`; `Space` override cursor on the pane.
3. Optional P2s: double-click empty panel → Add Images; arrow keys
   move panel selection across the grid.
4. Tests: `hintFor` table; cursor smoke via styles.

### Phase 6 — Cleanup and docs

1. Delete dead code (`useTemporarySelect.ts`, chip CSS, stale
   comments); fix the stale doc comment in `panel-interaction.ts`
   ("drag-to-swap" note predates 920a1e4).
2. Update `CLAUDE.md` (interaction section: the One Rule, the
   interaction/ module); note in the 2026-07-11 UX spec that Phase 5's
   "teach double-click" chip is superseded by the hint bar.
3. Full suite + manual QA script below.

---

## Part 6 — Edge cases and rules

- **Modifiers are sampled at gesture start.** Pressing/releasing
  `Space` mid-drag never changes an in-flight gesture; the next
  pointerdown re-resolves. (Predictability beats cleverness.)
- **Pinch detection:** `wheel` with `ctrlKey` is pinch on macOS
  trackpads and `Ctrl`+scroll on Windows — both mean zoom; also accept
  `metaKey` on macOS. Normalize `deltaMode === 1` (lines) by ×16.
- **Wheel-settle commits:** image zoom/pan via wheel keeps the 250 ms
  debounce → one undo step. Viewport zoom/pan is not undoable
  (navigation), unchanged.
- **HTML5 drag cancel (Esc during drag):** native `dragend` fires;
  existing d2/b13 cleanup clears preview state. Dropping an image on
  its own panel stays a no-op (`dispatchDrop`).
- **Typing guards:** every global key (including new `+`/`−`/arrows/
  `Enter`) respects `isTypingTarget`; inline text editor keeps
  suspending `Delete`.
- **Window blur:** clears `spaceHeld` and any in-flight pan (existing
  defensive pattern, kept). Frame mode survives blur (harmless).
- **Clamps:** viewport `ZOOM_MIN 0.1 / ZOOM_MAX 8 × sourceScale` with
  fit floor; image transforms through `snapTransform` — all existing,
  unchanged.
- **Scrollbars stay.** The pane remains `overflow: auto`; scroll-pan
  and scrollbars are two views of the same state.
- **Touch/pen:** out of scope (desktop app); `touchAction` values kept
  as-is on object handlers.

## Part 7 — Manual QA script (acceptance)

1. Scroll over background, over a selected panel, over a framed
   panel's neighbor while framing: same verb every time (pan view /
   pan view / pan image).
2. `⌘`scroll in the same three spots: zoom view / zoom view / zoom
   image. Pinch likewise.
3. Drag a placed image onto an empty panel (moves), onto an occupied
   one (swaps, live preview shows both), onto itself (nothing).
4. Drag from background: view pans; from an empty panel: view pans;
   from an annotation: annotation moves; with `Space` held over an
   annotation: view pans.
5. Double-click image → scrim + chip appear; scroll ANYWHERE in the
   pane pans the image; `⌘`scroll zooms it; `0` resets; arrows nudge;
   `Esc` exits to selected; one undo step per gesture.
6. Click outside the framed panel: exits and selects what you clicked.
7. `Enter` on a selected placed panel enters framing; `Delete`
   unplaces to tray (thumbnail becomes draggable-bright again).
8. Place a text annotation: tool returns to Select; `Shift`+click
   places two in a row; `Esc` disarms.
9. `Esc` chain: inline text editor → armed tool → frame → selections →
   nothing, one level per press.
10. `⌘+`/`⌘−`/`⌘0`/`⌘1` zoom the canvas only — webpage zoom never
    changes (check via devtools zoom factor).
11. Wheel over the tray and properties panel scrolls those panes.
12. Corner handles appear on _selected_ panels and resize; track
    gutters still drag; merge via `Shift`+click still works; `M`/`U`.
13. Undo/redo across a framing session and an image move behaves as
    single steps; export before/after a Frame session is byte-identical
    when no framing changed.
14. Hint bar tracks every state in the Part 3 table; no hint mentions
    a gesture that doesn't work.

## Non-goals

- No reducer / schema / export changes; `.mosaic` files unaffected.
- No marquee selection (deliberately removed in fb7d003; hit-testing
  and `Shift`+click cover current needs).
- No touch/gesture support beyond trackpad wheel events.
- No user-configurable keybindings.
- No promotion of UI selection state into `FigureState`.
