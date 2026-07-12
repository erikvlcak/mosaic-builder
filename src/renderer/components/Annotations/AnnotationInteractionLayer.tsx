/**
 * Pointer/keyboard layer that owns annotation creation, selection, and
 * drag-to-move. Mounted as a sibling of GridCells, sized cssW × cssH over
 * the figure canvas.
 *
 * Pointer-events policy:
 *  - In `select` mode, the layer itself is `pointer-events: none`. Each
 *    annotation has a small invisible hit-rect with `pointer-events: auto`.
 *    A trailing transparent backdrop (also auto) catches "clicked nothing"
 *    and clears the current selection.
 *  - In any creation tool (`text`/`symbol`/`scalebar`), the layer is
 *    `pointer-events: auto` so it captures every click and the underlying
 *    GridCells layer cannot steal the gesture.
 *
 * Coordinate system: input coords come in as DOM-relative CSS px; we
 * convert to figure-px via `figurePxW / cssW`. In M6 these are equal so
 * the factor is 1.0, but the math is written generally.
 *
 * NOTE: This layer coexists with `PanelInteractionLayer` (per-panel
 * pan/zoom). PanelInteractionLayer mounts over a focused image panel
 * whenever one exists — independent of the active annotation tool — so
 * wheel-zoom on the focused panel keeps working even while a creation
 * tool is selected. The two layers are z-stacked: AnnotationInteractionLayer
 * (zIndex 3) sits ABOVE PanelInteractionLayer (zIndex 2). To avoid click
 * conflicts, the annotation layer is `pointer-events: none` whenever the
 * `select` tool is active over empty space — clicks pass through to the
 * panel layer below. When a creation tool is active, the annotation layer
 * captures all clicks (this is the user's expectation: switching to "Symbol"
 * disables panel-layer click/drag until they switch back to Select), while
 * wheel events still reach the panel layer underneath naturally.
 */

import { useEffect, useRef, useState } from "react";
import type { Dispatch } from "react";
import type { Figure, ResolvedAnnotation } from "../../model/types";
import type {
  Annotation,
  ImageAnchor,
  TextAnnotation,
  ScaleBarAnnotation,
  SymbolAnnotation,
} from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import {
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
} from "../../model/figure-actions";
import {
  figureToSource,
  computeGridLayout,
  computeCellRect,
  type PanelRect,
} from "../../render/coords";
import { snapDelta, type Guideline, type SnapRect } from "../../render/snap";
import { DRAG_MIME, parseDrag } from "../../dnd/drag-payload";
import type { ImagePoolItem } from "../../model/pool";
import type { Tool } from "../Toolbar/AnnotationToolbar";
import type { DefaultSymbolStyle } from "../../model/default-symbol-style";
import type { DefaultTextStyle } from "../../model/default-text-style";
import type { DefaultScalebarStyle } from "../../model/default-scalebar-style";
import {
  addToSelection,
  clearSelection,
  removeFromSelection,
  replaceSelection,
  singleSelectedId,
} from "../../state/anno-selection";
import { useSpaceHeld } from "../../interaction/InteractionContext";

/**
 * User-facing annotation kinds in their RESOLVED shape (as carried by
 * Figure.annotations). Excludes the derived "letter" kind. Scale bars in
 * this shape carry the extra `resolvedPanelId` field — we read `panelId`
 * for hit-rect placement, which exists on both the raw and resolved shapes.
 */
type UserAnno = Exclude<ResolvedAnnotation, { kind: "letter" }>;

function isUserAnno(a: ResolvedAnnotation): a is UserAnno {
  return a.kind !== "letter";
}

interface Props {
  activeTool: Tool;
  /**
   * Picker state. The Symbol-tool click-to-place reads symbolId/fillMode/
   * strokeStyle/color/strokeWidthPx from this so the user's picker selection
   * survives canvas placement (no auto-select after placement either, so
   * the user can keep stamping more symbols of the same style).
   */
  defaultSymbolStyle: DefaultSymbolStyle;
  /**
   * Text-tool picker state. `commitPendingText` reads font/sizePt/bold/
   * italic/color/bgColor from this so the picker form actually steers
   * placement instead of being a no-op preview.
   */
  defaultTextStyle: DefaultTextStyle;
  /**
   * Scalebar-tool picker state. The click-to-place popover reads length/
   * unit from this (so the picker pre-fills the popover), and
   * `commitScalebar` reads `cornerOverride` for the new annotation.
   * Edits inside the popover write back through `onDefaultScalebarStyleChange`
   * so the sidebar picker stays in sync with the popover.
   */
  defaultScalebarStyle: DefaultScalebarStyle;
  onDefaultScalebarStyleChange: (next: DefaultScalebarStyle) => void;
  figure: Figure;
  /** Panel rects in FIGURE-PX, keyed by panel id. */
  panelRectsById: Map<string, PanelRect>;
  /** Pool items keyed by image id. Used to gate scalebar tool on calibration. */
  imagesById: Map<string, ImagePoolItem>;
  /** Wrapper CSS dimensions (used to scale figure-px → CSS-px). */
  cssW: number;
  cssH: number;
  /** Figure-canvas pixel dimensions. */
  figurePxW: number;
  figurePxH: number;
  /**
   * Current selection. A 1-element set behaves exactly like the legacy
   * single-id selection — chrome, drag, properties form all unchanged.
   * A larger set engages multi-select: per-anno chrome on every member, a
   * group bounding box, and bulk drag.
   */
  selectedAnnotationIds: ReadonlySet<string>;
  /** Replace the entire selection set. */
  onSelectionChange: (next: ReadonlySet<string>) => void;
  /** When the text-input is open we need to suppress the global Delete shortcut. */
  onEditingChange?: (editing: boolean) => void;
  dispatch: Dispatch<FigureAction>;
  /**
   * Forward HTML5 tray drops that land on this layer to the panel
   * underneath. The layer sits at zIndex 3 above the GridCells panels and
   * intercepts drag events; without this passthrough, dragging a thumbnail
   * onto the canvas is silently ignored. Hit-testing uses `panelRectsById`.
   * Same payload shape as GridCells's `DropEvent`.
   */
  onTrayDrop?: (e: {
    from:
      | { kind: "tray"; imageId: string }
      | { kind: "panel"; panelId: string };
    targetPanelId: string;
  }) => void;
  /**
   * Forward dragover hover changes to the parent so the drop-ghost layer can
   * preview the would-be placement. The annotation layer is the topmost
   * hit-target so dragover on a panel underneath never reaches GridCells —
   * hit-test panelRectsById and report.
   */
  onTrayDragHoverChange?: (panelId: string | null) => void;
  /**
   * Forward native dblclick to a panel hit-tested via panelRectsById.
   * Without this, GridCells's per-panel onDoubleClick never fires in
   * select mode because the layer's backdrop (pointerEvents: auto) is
   * the topmost hit-target and dblclick doesn't bubble between siblings.
   */
  onPanelDoubleClick?: (panelId: string) => void;
  /**
   * Forward a backdrop click (no movement past MARQUEE_MIN_PX) to a
   * panel hit-tested via panelRectsById. Mirrors `onPanelDoubleClick`.
   * Needed because the backdrop covers unselected occupied panels (so
   * marquee selection of annotations works there); without this
   * forward, single-click would never reach GridCells's per-panel
   * onClick to select the panel.
   */
  onPanelClick?: (panelId: string) => void;
  /**
   * Forward a backdrop click (no movement past MARQUEE_MIN_PX) that lands
   * on a grid *hole* (a cell no panel covers, from DELETE_PANEL) to
   * onHoleClick(row, col) so the panel can be restored. Mirrors
   * `onPanelClick` — the backdrop is the topmost hit-target, so GridCells's
   * hole onClick never fires on its own. Uses the same equal-weight
   * cell-grid math GridCells positions the hole "+" with.
   */
  onHoleClick?: (row: number, col: number) => void;
  /**
   * Placement tools are one-shot stamps: called after a placement commits
   * (unless Shift was held at the placing click) so the parent returns the
   * toolbar to Select.
   */
  onToolAutoReturn?: () => void;
  /**
   * Scale-bar guided flow: called when the scale tool clicks an image panel
   * whose image is not yet calibrated. The parent opens the calibration modal
   * for that image and, on success, places the requested bar. When provided,
   * this replaces the old dead-end error banner for the uncalibrated case.
   */
  onRequestCalibration?: (imageId: string, panelId: string) => void;
}

interface DragState {
  pointerId: number;
  /**
   * - "move": translate whole annotation (body hit-rect drag). When the
   *   selection set has > 1 member and the dragged anno is in it, every
   *   selected anno translates by the same delta — see `bulkSnapshots`.
   * - "symbol-corner": drag one corner of a selected symbol (center-anchored
   *   resize — see onSymbolCornerPointerMove).
   * - "symbol-rotate": drag the rotation grip above a selected symbol.
   * - "backdrop-press": a press on empty space in select mode. Tracks
   *   click-vs-drag: a click clears/forwards selection, a drag is a view pan
   *   (owned by useCanvasZoom) and this gesture does nothing on release.
   */
  kind: "move" | "symbol-corner" | "symbol-rotate" | "backdrop-press";
  /** Origin in figure-px. */
  startFx: number;
  startFy: number;
  /** Current pointer in figure-px (updated as we move). */
  curFx: number;
  curFy: number;
  /** Annotation being moved/resized (for "move", "symbol-*"). */
  movingId?: string;
  /** Original annotation snapshot (for "move", "symbol-*"). */
  startAnno?: UserAnno;
  /**
   * Per-anno snapshots for a bulk "move" drag. Keyed by annotation id and
   * populated only when the user grabs a member of a > 1 selection. Each
   * pointermove patches every entry by the same dx/dy.
   */
  bulkSnapshots?: Map<string, UserAnno>;
  /** Which corner is being dragged ("symbol-corner" only). */
  corner?: "tl" | "tr" | "bl" | "br";
  /** For "symbol-rotate" only: the angle (degrees) the symbol had at drag start. */
  startRotationDeg?: number;
  /**
   * For "symbol-rotate" only: the angle (radians) from the symbol center to
   * the initial pointer position. We subtract this baseline from atan2
   * readings while the rotation handle is dragged so the symbol doesn't snap
   * on grab.
   */
  startGripAngleRad?: number;
  /** Marquee gesture only: shift held when the gesture began (additive marquee). */
  shiftKey?: boolean;
  /**
   * For "move" only: the bbox (figure-px) of the moving anno (or union
   * for a bulk drag) at drag-start. Used to compute the snap-source rect
   * each pointermove without querying the live (already-translated)
   * annotation state.
   */
  startBbox?: { x: number; y: number; w: number; h: number };
  /**
   * For "move" only: ids excluded from the snap-candidate list (the
   * moving anno, plus all bulk-selected siblings). Letters are kept as
   * candidates per spec — alignment targets but never moved.
   */
  excludeIds?: ReadonlySet<string>;
}

interface PendingScalebar {
  panelId: string;
  /** CSS px relative to the layer (for popover positioning). */
  cssX: number;
  cssY: number;
  /** Shift was held at the arming click — keep the tool armed after Add. */
  keepArmed: boolean;
}

interface PendingText {
  /** Figure-px coordinates of the new text annotation. */
  fx: number;
  fy: number;
  /** New annotation id pre-allocated so the same id is used in dispatch. */
  id: string;
  /** CSS px (for input positioning). */
  cssX: number;
  cssY: number;
  /** Shift was held at the placing click — keep the tool armed after commit. */
  keepArmed: boolean;
}

const DEFAULT_SYMBOL_SIZE = 60;

// Default z-values for new annotations: scalebar always on top so it can't be hidden;
// text mid-stack so it overlays symbols; symbols at bottom as backdrop.
const Z_TEXT = 5;
const Z_SYMBOL = 1;
const Z_SCALEBAR = 10;

// Minimum hit-rect dimension in CSS px so very small annotations remain selectable.
const MIN_HIT_PX = 8;

// Minimum symbol side length (figure-px) when resizing via corner handles.
// Symbols are center-anchored — half-extents any smaller render visually
// as a single pixel.
const MIN_SYMBOL_DIM = 8;

// Endpoint/corner handle size in CSS px (square hit-rect).
const HANDLE_PX = 8;

// Marquee gesture only counts as a drag (vs a click) once the pointer has
// moved this many CSS px. Below this we treat pointerdown+pointerup as a
// click on empty space and apply the clear-or-preserve logic.
const MARQUEE_MIN_PX = 4;

// How long the scalebar error banner stays visible (ms).
const SCALEBAR_ERROR_TTL_MS = 2500;

function newAnnoId(): string {
  return crypto.randomUUID();
}

/**
 * Decompose `cssW × cssH` minus a set of axis-aligned holes into a list
 * of horizontal strips that tile the complement. Used for the select-mode
 * backdrop: holes are occupied-panel rects (so HTML5 dragstart on a
 * `<div draggable>` panel reaches GridCells underneath) plus the editing
 * panel rect (so PanelInteractionLayer's pan/resize handles aren't
 * eclipsed). Strips outside any hole keep `pointerEvents: auto` so
 * marquee selection and click-to-clear continue to work on gutters and
 * empty panels.
 *
 * Algorithm: horizontal-band sweep. The y-axis is split at every hole's
 * top/bottom edge; each band emits the x-complement of the holes that
 * overlap it. A single hole produces 4 strips (top/bottom/left/right) —
 * matches the legacy editing-rect "donut" exactly. No holes → one
 * full-coverage strip.
 */
interface BackdropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
function carveBackdropStrips(
  cssW: number,
  cssH: number,
  holes: ReadonlyArray<BackdropRect>,
): BackdropRect[] {
  if (holes.length === 0) {
    return [{ x: 0, y: 0, w: cssW, h: cssH }];
  }
  const ys = new Set<number>([0, cssH]);
  for (const h of holes) {
    ys.add(Math.max(0, Math.min(cssH, h.y)));
    ys.add(Math.max(0, Math.min(cssH, h.y + h.h)));
  }
  const sortedYs = Array.from(ys).sort((a, b) => a - b);
  const out: BackdropRect[] = [];
  for (let i = 0; i < sortedYs.length - 1; i++) {
    const yTop = sortedYs[i] as number;
    const yBot = sortedYs[i + 1] as number;
    if (yBot <= yTop) continue;
    // Holes that fully span this band on the y-axis carve x-intervals.
    const bandHoles = holes
      .filter((h) => h.y <= yTop && h.y + h.h >= yBot)
      .map((h) => ({
        x0: Math.max(0, Math.min(cssW, h.x)),
        x1: Math.max(0, Math.min(cssW, h.x + h.w)),
      }))
      .filter((iv) => iv.x1 > iv.x0)
      .sort((a, b) => a.x0 - b.x0);
    // Walk left → right, emitting strips between hole intervals.
    let cursor = 0;
    for (const iv of bandHoles) {
      if (iv.x0 > cursor) {
        out.push({ x: cursor, y: yTop, w: iv.x0 - cursor, h: yBot - yTop });
      }
      cursor = Math.max(cursor, iv.x1);
    }
    if (cursor < cssW) {
      out.push({ x: cursor, y: yTop, w: cssW - cursor, h: yBot - yTop });
    }
  }
  return out;
}

/**
 * Returns the panel id whose rect contains (fx, fy), or null. If multiple
 * rects contain the point (impossible by construction, but defensive),
 * returns the first match.
 */
function panelAt(
  panelRectsById: Map<string, PanelRect>,
  fx: number,
  fy: number,
): string | null {
  for (const [id, r] of panelRectsById) {
    if (fx >= r.x && fx <= r.x + r.w && fy >= r.y && fy <= r.y + r.h) {
      return id;
    }
  }
  return null;
}

/**
 * If `(fx, fy)` lands on a grid *hole* — a cell no panel covers — return its
 * (row, col); otherwise null. Uses the same equal-weight cell-grid layout
 * GridCells positions the hole "+" with (see GridCells: hole/selection math
 * deliberately uses `computeCellRect`, not the track-weighted rects), so a
 * click matches the visible affordance. `null` layout on a non-uniform figure
 * only shifts alignment slightly — same v1 caveat as GridCells.
 */
function holeAt(
  figure: Figure,
  figurePxW: number,
  figurePxH: number,
  fx: number,
  fy: number,
): { row: number; col: number } | null {
  const { rows, cols, gutterPx } = figure.grid;
  const covered = new Array<boolean>(rows * cols).fill(false);
  for (const p of figure.panels) {
    const rowSpan = p.rowSpan ?? 1;
    const colSpan = p.colSpan ?? 1;
    for (let r = p.row; r < p.row + rowSpan; r++) {
      for (let c = p.col; c < p.col + colSpan; c++) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          covered[r * cols + c] = true;
        }
      }
    }
  }
  const layout = computeGridLayout(
    figurePxW,
    figurePxH,
    rows,
    cols,
    gutterPx,
    figure.grid.outerGutter ?? true,
  );
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (covered[r * cols + c]) continue;
      const rect = computeCellRect(layout, r, c);
      if (
        fx >= rect.x &&
        fx <= rect.x + rect.w &&
        fy >= rect.y &&
        fy <= rect.y + rect.h
      ) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

/**
 * If `(fx, fy)` lands inside an image-bearing panel, return the image's
 * pool entry + the panel rect + the panel's transform — so creation
 * handlers can derive `imgU/imgV` anchors via `figureToSource`. Returns
 * null when the point is in the figure margin, on an empty/hidden panel,
 * or on a panel without an image.
 */
function imageContextAt(
  fx: number,
  fy: number,
  figure: Figure,
  panelRectsById: Map<string, PanelRect>,
  imagesById: Map<string, ImagePoolItem>,
): {
  imageId: string;
  panel: Extract<Figure["panels"][number], { kind: "image" }>;
  panelRect: PanelRect;
  image: ImagePoolItem;
} | null {
  const panelId = panelAt(panelRectsById, fx, fy);
  if (panelId === null) return null;
  const panel = figure.panels.find(
    (p) => p.panelId === panelId && p.kind === "image",
  );
  if (panel === undefined || panel.kind !== "image") return null;
  const panelRect = panelRectsById.get(panelId);
  if (panelRect === undefined) return null;
  const image = imagesById.get(panel.imageId);
  if (image === undefined) return null;
  return { imageId: panel.imageId, panel, panelRect, image };
}

/**
 * Given a figure-px point inside an image-bearing panel, return the
 * normalized image anchor (imgU, imgV in 0..1 source-image space). Null
 * when the point lies outside the source image (e.g. Contain-mode
 * letterbox click).
 */
function anchorFromFigure(
  fx: number,
  fy: number,
  ctx: NonNullable<ReturnType<typeof imageContextAt>>,
): ImageAnchor | null {
  const src = figureToSource(
    ctx.panelRect,
    ctx.panel.transform,
    ctx.image.width,
    ctx.image.height,
    fx,
    fy,
  );
  if (src === null) return null;
  return {
    imgU: src.sx / ctx.image.width,
    imgV: src.sy / ctx.image.height,
  };
}

/**
 * Conservative bounding-box approximation of an annotation's hit-rect, in
 * figure-px. For text, we estimate width as `text.length * sizePx * 0.6`
 * and height as `sizePx * 1.2`. For symbols, we use a `sizePx`-square
 * centered at `(x, y)`. For scalebar, we use the bar rect — but since the
 * bar position is computed at draw time from the panel rect + corner, we
 * approximate it as the bottom-right corner of the panel (close enough
 * for selection in M6).
 */
function annoBounds(
  a: UserAnno,
  panelRectsById: Map<string, PanelRect>,
): { x: number; y: number; w: number; h: number } | null {
  switch (a.kind) {
    case "text": {
      const sizePx = a.sizePt;
      const w = Math.max(MIN_HIT_PX, a.text.length * sizePx * 0.6);
      const h = sizePx * 1.2;
      return { x: a.x, y: a.y, w, h };
    }
    case "symbol": {
      const half = a.sizePx / 2;
      return { x: a.x - half, y: a.y - half, w: a.sizePx, h: a.sizePx };
    }
    case "scalebar": {
      const r = panelRectsById.get(a.panelId);
      if (r === undefined) return null;
      // Approximate the bar's hit-rect as a strip along the bottom of the panel.
      // (Real bar position depends on style.corner + length-in-figure-px; this
      // is a good-enough hit-target for M6.)
      const stripH = 24;
      const stripW = Math.min(120, r.w - 16);
      return {
        x: r.x + r.w - stripW - 8,
        y: r.y + r.h - stripH - 8,
        w: stripW,
        h: stripH,
      };
    }
    default:
      return null;
  }
}

export function AnnotationInteractionLayer({
  activeTool,
  defaultSymbolStyle,
  defaultTextStyle,
  defaultScalebarStyle,
  onDefaultScalebarStyleChange,
  figure,
  panelRectsById,
  imagesById,
  cssW,
  cssH,
  figurePxW,
  figurePxH,
  selectedAnnotationIds,
  onSelectionChange,
  onEditingChange,
  dispatch,
  onTrayDrop,
  onTrayDragHoverChange,
  onPanelDoubleClick,
  onPanelClick,
  onHoleClick,
  onToolAutoReturn,
  onRequestCalibration,
}: Props): JSX.Element {
  // Single-select id (null when 0 or > 1 selected). Reused throughout
  // chrome/handles/effects so existing single-select code paths are
  // untouched when the user has exactly one annotation selected.
  const selectedAnnotationId = singleSelectedId(selectedAnnotationIds);
  // Space = hand tool: every pointerdown below yields (returns before
  // stopPropagation/capture) so the press bubbles to the viewport pan owner.
  const spaceHeld = useSpaceHeld();
  const ref = useRef<HTMLDivElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  /**
   * Active alignment guidelines (spec 14). Set during a "move" drag and
   * cleared on pointerup. Re-rendered as faint SVG lines inside the
   * layer overlay below.
   */
  const [guidelines, setGuidelines] = useState<readonly Guideline[]>([]);
  /**
   * Last bucketed (integer figure-px) translation we recomputed snap
   * for. Pointermove can fire ~120Hz with sub-pixel deltas, so we
   * short-circuit when the rounded delta hasn't changed — same idea as
   * dirty-checking on int coordinates.
   */
  const lastSnapBucketRef = useRef<{ dx: number; dy: number } | null>(null);
  const [pendingScalebar, setPendingScalebar] =
    useState<PendingScalebar | null>(null);
  const [pendingText, setPendingText] = useState<PendingText | null>(null);
  // Controlled value for the inline text input. Mirroring it in React state
  // (instead of relying on the DOM input's defaultValue) makes the commit
  // path immune to focus loss / blur racing the keydown.
  const [pendingTextValue, setPendingTextValue] = useState<string>("");
  /**
   * Edit buffer for the popover's length input. Stored as a string so the
   * user can momentarily clear it while retyping (the picker's number value
   * stays at the last valid parse until Add). Seeded from the picker when
   * the popover opens (see the setPendingScalebar call site).
   */
  const [scalebarLengthDraft, setScalebarLengthDraft] = useState<string>("100");
  /**
   * Transient error banner shown when the scalebar tool clicks an
   * uncalibrated/empty panel. Auto-dismissed after SCALEBAR_ERROR_TTL_MS.
   * Coordinates are CSS-px relative to the layer.
   */
  const [scalebarError, setScalebarError] = useState<{
    message: string;
    cssX: number;
    cssY: number;
  } | null>(null);
  const scalebarErrorTimerRef = useRef<number | null>(null);

  /**
   * Show the transient scalebar error banner. Replaces any existing timer
   * so rapid repeated clicks reset the fade-out.
   */
  function flashScalebarError(
    message: string,
    cssX: number,
    cssY: number,
  ): void {
    if (scalebarErrorTimerRef.current !== null) {
      window.clearTimeout(scalebarErrorTimerRef.current);
    }
    setScalebarError({ message, cssX, cssY });
    scalebarErrorTimerRef.current = window.setTimeout(() => {
      setScalebarError(null);
      scalebarErrorTimerRef.current = null;
    }, SCALEBAR_ERROR_TTL_MS);
  }

  // Clean up the error timer on unmount.
  useEffect(() => {
    return () => {
      if (scalebarErrorTimerRef.current !== null) {
        window.clearTimeout(scalebarErrorTimerRef.current);
      }
    };
  }, []);

  // Esc unwind, popover level: while the scale-bar popover is open, Esc
  // closes it (even from its own inputs) and is consumed before the global
  // handlers — one level per press.
  useEffect(() => {
    if (pendingScalebar === null) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setPendingScalebar(null);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [pendingScalebar]);

  const cssToFigX = figurePxW / cssW;
  const cssToFigY = figurePxH / cssH;
  const figToCssX = cssW / figurePxW;
  const figToCssY = cssH / figurePxH;

  // Notify the parent when an inline editor is open so it can suspend
  // global Delete/Backspace shortcuts.
  useEffect(() => {
    onEditingChange?.(pendingText !== null);
  }, [pendingText, onEditingChange]);

  // Reset transient state on tool change. Commit any typed-but-uncommitted
  // caption first (mirroring the Enter/blur paths) so switching tools mid-type
  // doesn't silently lose the text. commitPendingText no-ops on empty/null, so
  // this is safe when there's nothing pending. A half-configured scalebar
  // popover is deliberately discarded (not committed): committing a
  // half-entered length would create a wrong scale bar; closing it is correct.
  useEffect(() => {
    commitPendingTextRef.current();
    setDrag(null);
    setPendingScalebar(null);
    setGuidelines([]);
    lastSnapBucketRef.current = null;
  }, [activeTool]);

  // Imperatively focus the inline text input AFTER it mounts. `autoFocus`
  // races the synthetic pointerdown that opened it — when the layer is the
  // pointerdown target, the browser keeps focus on document.body so the
  // input never receives keystrokes. A useEffect runs post-commit, after
  // the pointerdown has fully resolved.
  useEffect(() => {
    if (pendingText === null) {
      setPendingTextValue("");
      return;
    }
    // requestAnimationFrame ensures we run after the input is in the DOM
    // and after any pending focus changes from the click that opened it.
    const handle = requestAnimationFrame(() => {
      textInputRef.current?.focus();
      textInputRef.current?.select();
    });
    return () => cancelAnimationFrame(handle);
  }, [pendingText]);

  function clientToFigure(
    e: React.PointerEvent | PointerEvent,
  ): { fx: number; fy: number; cssX: number; cssY: number } | null {
    const el = ref.current;
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    const cssX = e.clientX - r.left;
    const cssY = e.clientY - r.top;
    return { fx: cssX * cssToFigX, fy: cssY * cssToFigY, cssX, cssY };
  }

  // -------------------------------------------------------------------
  // CREATION TOOLS — pointer handlers on the full layer.
  // -------------------------------------------------------------------

  function onLayerPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (spaceHeld) return;
    if (activeTool === "select") return; // handled per-hitrect
    if (e.button !== 0) return;
    const c = clientToFigure(e);
    if (c === null) return;

    if (activeTool === "text") {
      setPendingText({
        id: newAnnoId(),
        fx: c.fx,
        fy: c.fy,
        cssX: c.cssX,
        cssY: c.cssY,
        keepArmed: e.shiftKey,
      });
      return;
    }

    if (activeTool === "scalebar") {
      const panelId = panelAt(panelRectsById, c.fx, c.fy);
      if (panelId === null) return;
      // Verify the panel has an image AND the image is calibrated.
      const panel = figure.panels.find((p) => p.panelId === panelId);
      if (panel === undefined || panel.kind !== "image") {
        console.warn(
          `[scalebar] Cannot add scale bar: panel ${panel?.panelId ?? "(none)"} requires a calibrated image. ` +
            `Use the "Calibrate…" button on the panel toolbar first.`,
        );
        flashScalebarError("Place an image first.", c.cssX, c.cssY);
        return;
      }
      const img = imagesById.get(panel.imageId);
      if (img === undefined || img.calibration === undefined) {
        // Uncalibrated image: instead of dead-ending, open the calibration
        // flow for this image. The parent stashes the pending placement and
        // places the bar once calibration succeeds. Fall back to the error
        // banner only when no calibration entry point is wired.
        if (onRequestCalibration !== undefined && panel.panelId !== undefined) {
          onRequestCalibration(panel.imageId, panel.panelId);
          return;
        }
        flashScalebarError(
          "Calibrate this image first (Calibrate… button).",
          c.cssX,
          c.cssY,
        );
        return;
      }
      setScalebarLengthDraft(String(defaultScalebarStyle.lengthValue));
      setPendingScalebar({
        panelId,
        cssX: c.cssX,
        cssY: c.cssY,
        keepArmed: e.shiftKey,
      });
      return;
    }

    if (activeTool === "symbol") {
      // Click-to-place: drop a symbol at this point using the picker's
      // current style. No drag-to-size — the four corner handles + rotation
      // handle take over after selection.
      const ann: SymbolAnnotation = {
        id: newAnnoId(),
        kind: "symbol",
        z: Z_SYMBOL,
        symbolId: defaultSymbolStyle.symbolId,
        x: c.fx,
        y: c.fy,
        sizePx: DEFAULT_SYMBOL_SIZE,
        rotationDeg: 0,
        color: defaultSymbolStyle.color,
        strokeWidthPx: defaultSymbolStyle.strokeWidthPx,
        fillMode: defaultSymbolStyle.fillMode,
        strokeStyle: defaultSymbolStyle.strokeStyle,
      };
      const imgCtx = imageContextAt(
        c.fx,
        c.fy,
        figure,
        panelRectsById,
        imagesById,
      );
      if (imgCtx !== null && imgCtx.panel.panelId !== undefined) {
        const anchor = anchorFromFigure(c.fx, c.fy, imgCtx);
        if (anchor !== null) {
          ann.imageId = imgCtx.imageId;
          ann.panelId = imgCtx.panel.panelId;
          ann.anchor = anchor;
        }
      }
      dispatch(addAnnotation(ann));
      // One-shot stamp: the tool returns to Select after placing (no
      // auto-select of the new symbol). Shift+click keeps it armed for
      // stamping several in a row.
      if (!e.shiftKey) onToolAutoReturn?.();
      return;
    }
  }

  function onLayerPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (drag === null || drag.pointerId !== e.pointerId) return;
    const c = clientToFigure(e);
    if (c === null) return;
    setDrag({ ...drag, curFx: c.fx, curFy: c.fy });
  }

  function onLayerPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (drag === null || drag.pointerId !== e.pointerId) {
      return;
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDrag(null);
  }

  // -------------------------------------------------------------------
  // SELECT MODE — marquee (rubber-band selection from empty space).
  //
  // Mounted on the backdrop div (zIndex below the per-anno hit-rects), so
  // any pointerdown on a real annotation goes to onHitPointerDown instead.
  // -------------------------------------------------------------------

  function onBackdropPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (spaceHeld) return;
    if (e.button !== 0) return;
    if (activeTool !== "select") return;
    // Hit-rects are above this div in DOM order and stopPropagation, so an
    // event arriving here means the user pressed empty space. Belt-and-
    // braces: bail out unless the event target IS the backdrop itself.
    if (e.target !== e.currentTarget) return;
    const c = clientToFigure(e);
    if (c === null) return;
    // We do NOT setPointerCapture here: a drag on empty space is a view PAN
    // (owned by useCanvasZoom on the scroll container, our ancestor). Capturing
    // would steal the pointer stream and run a competing gesture. We only
    // record the press origin so pointerup can tell a click from a drag —
    // marquee area-selection was removed (drag == pan, always).
    setDrag({
      pointerId: e.pointerId,
      kind: "backdrop-press",
      startFx: c.fx,
      startFy: c.fy,
      curFx: c.fx,
      curFy: c.fy,
      shiftKey: e.shiftKey,
    });
  }

  function onBackdropPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (
      drag === null ||
      drag.kind !== "backdrop-press" ||
      drag.pointerId !== e.pointerId
    )
      return;
    const c = clientToFigure(e);
    if (c === null) return;
    setDrag({ ...drag, curFx: c.fx, curFy: c.fy });
  }

  function onBackdropPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (
      drag === null ||
      drag.kind !== "backdrop-press" ||
      drag.pointerId !== e.pointerId
    )
      return;
    // Use the most recent pointer position from this event; falls back to
    // the last move's stored coords if the up event somehow has no client
    // coords. We compute "did the pointer move" here (instead of in
    // onBackdropPointerMove + state) so the test harness's synchronous
    // fireEvent flow is reliable: pointermove's setDrag may not have
    // committed by the time pointerup runs.
    const c = clientToFigure(e);
    const endFx = c?.fx ?? drag.curFx;
    const endFy = c?.fy ?? drag.curFy;
    const dxCss = (endFx - drag.startFx) * figToCssX;
    const dyCss = (endFy - drag.startFy) * figToCssY;
    const moved = Math.hypot(dxCss, dyCss) >= MARQUEE_MIN_PX;
    // A moved press was a view pan (handled by useCanvasZoom) — do nothing,
    // and crucially DON'T clear the selection. Only a genuine click acts.
    if (moved) {
      setDrag(null);
      return;
    }
    // Click on empty space: shift-click preserves selection; plain click
    // clears it.
    if (drag.shiftKey !== true) {
      onSelectionChange(clearSelection());
    }
    // Forward the click to the panel underneath if the cursor is over one.
    // GridCells's onClick never fires here because the backdrop is the
    // topmost hit-target. The user's mental model is "click a panel to
    // select it", and the backdrop covers unselected panels by design —
    // we bridge that gap explicitly.
    const targetPanelId = panelAt(panelRectsById, endFx, endFy);
    if (targetPanelId !== null) {
      if (onPanelClick !== undefined) onPanelClick(targetPanelId);
    } else if (onHoleClick !== undefined) {
      // No panel under the cursor — the click may be on a grid hole
      // (deleted-panel gap). Forward so the restore affordance works
      // even though the backdrop eats the hole's own onClick.
      const hole = holeAt(figure, figurePxW, figurePxH, endFx, endFy);
      if (hole !== null) onHoleClick(hole.row, hole.col);
    }
    setDrag(null);
  }

  // -------------------------------------------------------------------
  // SELECT MODE — per-annotation hit-rects.
  // -------------------------------------------------------------------

  function onHitPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    a: UserAnno,
  ): void {
    if (spaceHeld) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    const c = clientToFigure(e);
    if (c === null) return;
    // Selection-set update first, before the drag bookkeeping.
    //
    // - Shift-click toggles the anno in/out of the set. If it ends up out
    //   of the set, the user can't drag it (no startAnno), so we early-exit
    //   without setting up a drag.
    // - Plain click on an anno already in the set: keep the set intact so
    //   the user can drag the whole group. (We do NOT collapse to single-
    //   select here — that would defeat the whole point of multi-select.)
    // - Plain click on an anno not in the set: replace the set with this id.
    let nextSelection: ReadonlySet<string>;
    if (e.shiftKey) {
      const inSet = selectedAnnotationIds.has(a.id);
      nextSelection = inSet
        ? removeFromSelection(selectedAnnotationIds, a.id)
        : addToSelection(selectedAnnotationIds, a.id);
      onSelectionChange(nextSelection);
      // Toggle-out: don't start a drag.
      if (inSet) return;
    } else if (selectedAnnotationIds.has(a.id)) {
      nextSelection = selectedAnnotationIds;
    } else {
      nextSelection = replaceSelection(a.id);
      onSelectionChange(nextSelection);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    // Bulk drag setup: snapshot every selected anno so each pointermove
    // can apply the same dx/dy delta to its own start coordinates.
    let bulkSnapshots: Map<string, UserAnno> | undefined;
    if (nextSelection.size > 1 && nextSelection.has(a.id)) {
      bulkSnapshots = new Map();
      for (const id of nextSelection) {
        const ann = figure.annotations.find(
          (x): x is UserAnno => x.id === id && isUserAnno(x),
        );
        if (ann !== undefined) bulkSnapshots.set(id, ann);
      }
    }
    // Snap-source bbox: union of all moving rects (single or bulk).
    // Letters never participate in drag, so excludeIds == the moving
    // anno + its bulk siblings only.
    let startBbox: { x: number; y: number; w: number; h: number } | undefined;
    let excludeIds: ReadonlySet<string> | undefined;
    if (bulkSnapshots !== undefined) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      const ids = new Set<string>();
      for (const [id, snap] of bulkSnapshots) {
        ids.add(id);
        const b = annoBounds(snap, panelRectsById);
        if (b === null) continue;
        if (b.x < minX) minX = b.x;
        if (b.y < minY) minY = b.y;
        if (b.x + b.w > maxX) maxX = b.x + b.w;
        if (b.y + b.h > maxY) maxY = b.y + b.h;
      }
      if (Number.isFinite(minX)) {
        startBbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      }
      excludeIds = ids;
    } else {
      const b = annoBounds(a, panelRectsById);
      if (b !== null) startBbox = b;
      excludeIds = new Set([a.id]);
    }
    lastSnapBucketRef.current = null;
    setGuidelines([]);
    setDrag({
      pointerId: e.pointerId,
      kind: "move",
      startFx: c.fx,
      startFy: c.fy,
      curFx: c.fx,
      curFy: c.fy,
      movingId: a.id,
      startAnno: a,
      ...(bulkSnapshots !== undefined ? { bulkSnapshots } : {}),
      ...(startBbox !== undefined ? { startBbox } : {}),
      ...(excludeIds !== undefined ? { excludeIds } : {}),
    });
  }

  /**
   * Build a SnapRect list from the figure for spec-14 alignment
   * guidelines. Includes user-annos AND derived letters (letters are
   * valid alignment targets — see spec 14 "What snaps to what"), but
   * excludes any id in `excludeIds` (the moving anno + its
   * bulk-selection siblings).
   */
  function buildSnapCandidates(excludeIds: ReadonlySet<string>): SnapRect[] {
    const out: SnapRect[] = [];
    for (const a of figure.annotations) {
      if (excludeIds.has(a.id)) continue;
      if (isUserAnno(a)) {
        const b = annoBounds(a, panelRectsById);
        if (b !== null) out.push({ id: a.id, ...b });
        continue;
      }
      // Letters: derived; mirror the corner-anchor math from `letterHits` below.
      if (a.kind !== "letter") continue;
      if (!figure.globalStyle.letters.enabled) continue;
      const rect = panelRectsById.get(a.panelId);
      if (rect === undefined) continue;
      const styleOverride = figure.letterOverrides?.[a.panelId]?.style;
      const sizePt = styleOverride?.sizePt ?? figure.globalStyle.letters.sizePt;
      const padding = figure.globalStyle.letters.paddingPx;
      const corner = figure.globalStyle.letters.corner;
      const w = Math.max(MIN_HIT_PX, a.text.length * sizePt * 0.6);
      const h = sizePt * 1.2;
      let x: number;
      let y: number;
      switch (corner) {
        case "tl":
          x = rect.x + padding;
          y = rect.y + padding;
          break;
        case "tr":
          x = rect.x + rect.w - padding - w;
          y = rect.y + padding;
          break;
        case "bl":
          x = rect.x + padding;
          y = rect.y + rect.h - padding - h;
          break;
        case "br":
          x = rect.x + rect.w - padding - w;
          y = rect.y + rect.h - padding - h;
          break;
      }
      out.push({ id: a.id, x, y, w, h });
    }
    return out;
  }

  /**
   * Compute a (kind-specific) move patch for a single anno snapshot, given
   * a translation `(dx, dy)` from the snapshot's drag-time origin. Returns
   * `null` for kinds that don't translate via x/y (scalebar). Re-anchors
   * image-bound annos against `figure` so a later image swap doesn't
   * teleport the anno back to its pre-drag position.
   */
  function computeMovePatch(
    start: UserAnno,
    dx: number,
    dy: number,
  ): Partial<Annotation> | null {
    switch (start.kind) {
      case "text": {
        const nx = start.x + dx;
        const ny = start.y + dy;
        const patch: Partial<TextAnnotation> = { x: nx, y: ny };
        if (start.imageId !== undefined) {
          const ctx = imageContextAt(
            nx,
            ny,
            figure,
            panelRectsById,
            imagesById,
          );
          if (ctx !== null && ctx.imageId === start.imageId) {
            const a = anchorFromFigure(nx, ny, ctx);
            if (a !== null) patch.anchor = a;
          }
        }
        return patch;
      }
      case "symbol": {
        const nx = start.x + dx;
        const ny = start.y + dy;
        const patch: Partial<SymbolAnnotation> = { x: nx, y: ny };
        if (start.imageId !== undefined) {
          const ctx = imageContextAt(
            nx,
            ny,
            figure,
            panelRectsById,
            imagesById,
          );
          if (ctx !== null && ctx.imageId === start.imageId) {
            const anchor = anchorFromFigure(nx, ny, ctx);
            if (anchor !== null) patch.anchor = anchor;
          }
        }
        return patch;
      }
      case "scalebar":
        // Scale bars are positioned via panel + corner; drag is a no-op.
        return null;
    }
  }

  function onHitPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (drag === null || drag.kind !== "move" || drag.pointerId !== e.pointerId)
      return;
    const c = clientToFigure(e);
    if (c === null) return;
    const rawDx = c.fx - drag.startFx;
    const rawDy = c.fy - drag.startFy;
    // Spec 14: alignment guidelines + soft snap. We always compute the
    // snap correction (cheap pure math); Shift-held disables the
    // correction but still surfaces alignment lines so the user sees
    // what's near.
    let dx = rawDx;
    let dy = rawDy;
    if (drag.startBbox !== undefined && drag.excludeIds !== undefined) {
      const movingRect: SnapRect = {
        id: drag.movingId ?? "__moving__",
        x: drag.startBbox.x + rawDx,
        y: drag.startBbox.y + rawDy,
        w: drag.startBbox.w,
        h: drag.startBbox.h,
      };
      const candidates = buildSnapCandidates(drag.excludeIds);
      const result = snapDelta(movingRect, candidates, {
        disabled: e.shiftKey,
      });
      dx = rawDx + result.dx;
      dy = rawDy + result.dy;
      // Spec 14 perf hint: only push guideline state through React when
      // the bucketed (integer figure-px) translation changes. The snap
      // math itself runs on every pointermove (cheap pure arithmetic);
      // this gate just spares React a re-render of the SVG overlay on
      // sub-pixel cursor jitter.
      const bucketDx = Math.round(rawDx);
      const bucketDy = Math.round(rawDy);
      const last = lastSnapBucketRef.current;
      if (last === null || last.dx !== bucketDx || last.dy !== bucketDy) {
        lastSnapBucketRef.current = { dx: bucketDx, dy: bucketDy };
        setGuidelines(result.guidelines);
      }
    }
    if (drag.bulkSnapshots !== undefined) {
      // Bulk drag: dispatch one UPDATE_ANNOTATION per selected anno using
      // its own snapshot. Per-anno re-anchoring still happens inside
      // computeMovePatch — each anno may sit on a different image/panel.
      for (const [id, snapshot] of drag.bulkSnapshots) {
        const patch = computeMovePatch(snapshot, dx, dy);
        if (patch !== null) dispatch(updateAnnotation(id, patch));
      }
      return;
    }
    const start = drag.startAnno;
    if (start === undefined || drag.movingId === undefined) return;
    const patch = computeMovePatch(start, dx, dy);
    if (patch !== null) {
      dispatch(updateAnnotation(drag.movingId, patch));
    }
  }

  function onHitPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (drag === null || drag.kind !== "move" || drag.pointerId !== e.pointerId)
      return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDrag(null);
    setGuidelines([]);
    lastSnapBucketRef.current = null;
  }

  // -------------------------------------------------------------------
  // SELECT MODE — corner / rotation / endpoint handles.
  //
  // Corner / rotation / endpoint handles render when the matching
  // annotation kind is selected. Whole-annotation drag remains active on
  // the body hit-rect for select-mode. Handles are rendered ABOVE the
  // body hit-rect in DOM order so clicks on a handle take precedence
  // over body drag (stopPropagation also prevents the body's pointerdown
  // from firing).
  // -------------------------------------------------------------------

  // -------------------------------------------------------------------
  // SELECT MODE — symbol corner + rotation handles.
  //
  // Symbols are center-anchored: dragging any corner grows/shrinks the
  // square symmetrically about (x, y). The rotation handle floats above
  // the top edge; we capture the initial grip angle on pointerdown so the
  // symbol doesn't jump on grab.
  // -------------------------------------------------------------------

  function onSymbolCornerPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    a: SymbolAnnotation,
    _corner: "tl" | "tr" | "bl" | "br",
  ): void {
    if (spaceHeld) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelectionChange(replaceSelection(a.id));
    const c = clientToFigure(e);
    if (c === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      pointerId: e.pointerId,
      kind: "symbol-corner",
      startFx: c.fx,
      startFy: c.fy,
      curFx: c.fx,
      curFy: c.fy,
      movingId: a.id,
      startAnno: a,
    });
  }

  function onSymbolCornerPointerMove(
    e: React.PointerEvent<HTMLDivElement>,
  ): void {
    if (
      drag === null ||
      drag.kind !== "symbol-corner" ||
      drag.pointerId !== e.pointerId
    ) {
      return;
    }
    const c = clientToFigure(e);
    if (c === null) return;
    const start = drag.startAnno;
    if (
      start === undefined ||
      start.kind !== "symbol" ||
      drag.movingId === undefined
    ) {
      return;
    }
    // Center-anchored resize: the new half-extent is the larger of the two
    // pointer-to-center distances. Symmetric grow from the center matches the
    // model's per-symbol center anchor (unlike box, which anchors at a corner).
    const half = Math.max(
      MIN_SYMBOL_DIM / 2,
      Math.max(Math.abs(c.fx - start.x), Math.abs(c.fy - start.y)),
    );
    const patch: Partial<SymbolAnnotation> = { sizePx: half * 2 };
    dispatch(updateAnnotation(drag.movingId, patch));
  }

  function onSymbolCornerPointerUp(
    e: React.PointerEvent<HTMLDivElement>,
  ): void {
    if (
      drag === null ||
      drag.kind !== "symbol-corner" ||
      drag.pointerId !== e.pointerId
    ) {
      return;
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDrag(null);
  }

  function onSymbolRotatePointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    a: SymbolAnnotation,
  ): void {
    if (spaceHeld) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelectionChange(replaceSelection(a.id));
    const c = clientToFigure(e);
    if (c === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // The handle sits above the top edge, so the initial pointer-to-center
    // angle is roughly -90°. Capture that baseline so the symbol's existing
    // rotationDeg is preserved on grab — only pointer movement after the
    // grab feeds rotation deltas.
    const startGripAngleRad = Math.atan2(c.fy - a.y, c.fx - a.x);
    setDrag({
      pointerId: e.pointerId,
      kind: "symbol-rotate",
      startFx: c.fx,
      startFy: c.fy,
      curFx: c.fx,
      curFy: c.fy,
      movingId: a.id,
      startAnno: a,
      startRotationDeg: a.rotationDeg,
      startGripAngleRad,
    });
  }

  function onSymbolRotatePointerMove(
    e: React.PointerEvent<HTMLDivElement>,
  ): void {
    if (
      drag === null ||
      drag.kind !== "symbol-rotate" ||
      drag.pointerId !== e.pointerId
    ) {
      return;
    }
    const c = clientToFigure(e);
    if (c === null) return;
    const start = drag.startAnno;
    if (
      start === undefined ||
      start.kind !== "symbol" ||
      drag.movingId === undefined
    ) {
      return;
    }
    if (
      drag.startRotationDeg === undefined ||
      drag.startGripAngleRad === undefined
    ) {
      return;
    }
    const currentAngleRad = Math.atan2(c.fy - start.y, c.fx - start.x);
    const deltaRad = currentAngleRad - drag.startGripAngleRad;
    const rotationDeg = drag.startRotationDeg + (deltaRad * 180) / Math.PI;
    const patch: Partial<SymbolAnnotation> = { rotationDeg };
    dispatch(updateAnnotation(drag.movingId, patch));
  }

  function onSymbolRotatePointerUp(
    e: React.PointerEvent<HTMLDivElement>,
  ): void {
    if (
      drag === null ||
      drag.kind !== "symbol-rotate" ||
      drag.pointerId !== e.pointerId
    ) {
      return;
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDrag(null);
  }

  // -------------------------------------------------------------------
  // SCALEBAR POPOVER COMMIT
  // -------------------------------------------------------------------

  function commitScalebar(): void {
    if (pendingScalebar === null) return;
    const lengthValue = parseFloat(scalebarLengthDraft);
    if (!Number.isFinite(lengthValue) || lengthValue <= 0) return;
    // Sync the picker so subsequent placements remember this length.
    if (lengthValue !== defaultScalebarStyle.lengthValue) {
      onDefaultScalebarStyleChange({ ...defaultScalebarStyle, lengthValue });
    }
    const ann: ScaleBarAnnotation = {
      id: newAnnoId(),
      kind: "scalebar",
      z: Z_SCALEBAR,
      panelId: pendingScalebar.panelId,
      lengthValue,
      lengthUnit: defaultScalebarStyle.lengthUnit,
      cornerOverride: defaultScalebarStyle.cornerOverride,
    };
    // Bind to the image on this panel: scale bars are conceptually
    // anchored to the calibration on the image, so when that image moves
    // to another panel the scale bar follows it.
    const panel = figure.panels.find(
      (p) => p.panelId === pendingScalebar.panelId,
    );
    if (panel?.kind === "image") {
      ann.imageId = panel.imageId;
    }
    dispatch(addAnnotation(ann));
    if (!pendingScalebar.keepArmed) onToolAutoReturn?.();
    setPendingScalebar(null);
  }

  // -------------------------------------------------------------------
  // PENDING TEXT — inline input
  // -------------------------------------------------------------------

  function commitPendingText(value: string): void {
    if (pendingText === null) return;
    const trimmed = value.trim();
    if (trimmed === "") {
      setPendingText(null);
      return;
    }
    const ann: TextAnnotation = {
      id: pendingText.id,
      kind: "text",
      z: Z_TEXT,
      x: pendingText.fx,
      y: pendingText.fy,
      text: trimmed,
      font: defaultTextStyle.font,
      sizePt: defaultTextStyle.sizePt,
      bold: defaultTextStyle.bold,
      italic: defaultTextStyle.italic,
      color: defaultTextStyle.color,
      ...(defaultTextStyle.bgColor !== undefined
        ? { bgColor: defaultTextStyle.bgColor }
        : {}),
      ...(defaultTextStyle.halo === true ? { halo: true } : {}),
    };
    // If the click landed on an image-bearing panel, bind the annotation
    // to that image so it follows the image when swapped to another panel.
    const imgCtx = imageContextAt(
      pendingText.fx,
      pendingText.fy,
      figure,
      panelRectsById,
      imagesById,
    );
    if (imgCtx !== null && imgCtx.panel.panelId !== undefined) {
      const anchor = anchorFromFigure(pendingText.fx, pendingText.fy, imgCtx);
      if (anchor !== null) {
        ann.imageId = imgCtx.imageId;
        ann.panelId = imgCtx.panel.panelId;
        ann.anchor = anchor;
      }
    }
    dispatch(addAnnotation(ann));
    onSelectionChange(replaceSelection(ann.id));
    if (!pendingText.keepArmed) onToolAutoReturn?.();
    setPendingText(null);
  }

  // Keep the latest commit closure + typed value in a ref so the tool-change
  // effect can flush pending text WITHOUT depending on pendingText/-Value
  // (which would re-run the reset on every keystroke and wipe the text).
  const commitPendingTextRef = useRef<() => void>(() => undefined);
  commitPendingTextRef.current = () => commitPendingText(pendingTextValue);

  // -------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------

  // Find the selected annotations. `selected` is the legacy "exactly one"
  // value used by kind-specific handles + the delete chip; `selectedList`
  // is every annotation in the set, used for per-anno chrome and the
  // group bbox.
  const selected: UserAnno | undefined =
    selectedAnnotationId !== null
      ? figure.annotations.find(
          (a): a is UserAnno => a.id === selectedAnnotationId && isUserAnno(a),
        )
      : undefined;
  const selectedBounds =
    selected !== undefined ? annoBounds(selected, panelRectsById) : null;
  const selectedList: UserAnno[] = [];
  if (selectedAnnotationIds.size > 0) {
    for (const a of figure.annotations) {
      if (selectedAnnotationIds.has(a.id) && isUserAnno(a))
        selectedList.push(a);
    }
  }
  const selectedBoundsList = selectedList.flatMap((a) => {
    const b = annoBounds(a, panelRectsById);
    return b !== null ? [{ id: a.id, ...b }] : [];
  });
  // Group bbox shown only when > 1 annotation is selected. Aggregates the
  // per-anno bounds into a single rectangle in figure-px.
  let groupBounds: { x: number; y: number; w: number; h: number } | null = null;
  if (selectedBoundsList.length > 1) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of selectedBoundsList) {
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    groupBounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  // Layer-level pointer-events: auto when in a creation tool, none otherwise.
  // In select mode, the per-annotation hit-rects re-enable pointer-events.
  const layerPE: React.CSSProperties["pointerEvents"] =
    activeTool === "select" ? "none" : "auto";

  // Cursor hint per tool.
  const cursor =
    activeTool === "text"
      ? "text"
      : activeTool === "symbol"
        ? "crosshair"
        : activeTool === "scalebar"
          ? "cell"
          : "default";

  // Build hit-rects for select mode.
  const userAnnos = figure.annotations.filter(isUserAnno);
  // Letters (derived) get their own hit-rects so users can click a letter
  // to select it (spec 08). We compute an approximate rect from the panel
  // corner + padding + glyph metrics; exact positioning matches drawLetter
  // (alphabetic baseline + corner anchor). Letters cannot be dragged or
  // resized, so the gesture is select-only.
  const letterHits = (() => {
    const out: {
      id: string;
      panelId: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }[] = [];
    if (!figure.globalStyle.letters.enabled) return out;
    for (const a of figure.annotations) {
      if (a.kind !== "letter") continue;
      const rect = panelRectsById.get(a.panelId);
      if (rect === undefined) continue;
      const styleOverride = figure.letterOverrides?.[a.panelId]?.style;
      const sizePt = styleOverride?.sizePt ?? figure.globalStyle.letters.sizePt;
      const padding = figure.globalStyle.letters.paddingPx;
      const corner = figure.globalStyle.letters.corner;
      // Same heuristic as TextAnnotation: 0.6 × sizePt × char count.
      const w = Math.max(MIN_HIT_PX, a.text.length * sizePt * 0.6);
      const h = sizePt * 1.2;
      let x: number;
      let y: number;
      switch (corner) {
        case "tl":
          x = rect.x + padding;
          y = rect.y + padding;
          break;
        case "tr":
          x = rect.x + rect.w - padding - w;
          y = rect.y + padding;
          break;
        case "bl":
          x = rect.x + padding;
          y = rect.y + rect.h - padding - h;
          break;
        case "br":
          x = rect.x + rect.w - padding - w;
          y = rect.y + rect.h - padding - h;
          break;
      }
      out.push({ id: a.id, panelId: a.panelId, x, y, w, h });
    }
    return out;
  })();

  function onLetterHitPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    letterId: string,
  ): void {
    if (spaceHeld) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    // Letters use the same selection set as user-annos but never engage the
    // drag/move state machine. Plain click replaces the selection; shift-click
    // toggles membership.
    if (e.shiftKey) {
      const inSet = selectedAnnotationIds.has(letterId);
      onSelectionChange(
        inSet
          ? removeFromSelection(selectedAnnotationIds, letterId)
          : addToSelection(selectedAnnotationIds, letterId),
      );
    } else {
      onSelectionChange(replaceSelection(letterId));
    }
  }

  // -------------------------------------------------------------------
  // TRAY-DROP PASSTHROUGH
  // -------------------------------------------------------------------
  // The layer sits on top of GridCells (zIndex: 3) and is the topmost
  // hit-target across the canvas. Without explicit drag handlers the
  // browser rejects drops here (no preventDefault on dragover) and the
  // panel underneath never sees them. Forward by hit-testing
  // panelRectsById against the cursor in figure-px.
  function clientToFigurePoint(
    e: React.DragEvent<HTMLDivElement>,
  ): { fx: number; fy: number } | null {
    const el = ref.current;
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return {
      fx: (e.clientX - r.left) * cssToFigX,
      fy: (e.clientY - r.top) * cssToFigY,
    };
  }
  function panelAtFigurePoint(fx: number, fy: number): string | null {
    for (const [id, rect] of panelRectsById) {
      if (
        fx >= rect.x &&
        fx <= rect.x + rect.w &&
        fy >= rect.y &&
        fy <= rect.y + rect.h
      ) {
        return id;
      }
    }
    return null;
  }
  function onLayerDragOver(e: React.DragEvent<HTMLDivElement>): void {
    if (onTrayDrop === undefined) return;
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (onTrayDragHoverChange !== undefined) {
      const pt = clientToFigurePoint(e);
      const hit = pt === null ? null : panelAtFigurePoint(pt.fx, pt.fy);
      onTrayDragHoverChange(hit);
    }
  }
  function onLayerDragLeave(e: React.DragEvent<HTMLDivElement>): void {
    // Only clear when the cursor leaves the layer rect itself, not when
    // crossing internal children (same idea as Tray's onDragLeave).
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    onTrayDragHoverChange?.(null);
  }
  function onLayerDrop(e: React.DragEvent<HTMLDivElement>): void {
    if (onTrayDrop === undefined) return;
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    const from = parseDrag(e.dataTransfer.getData(DRAG_MIME));
    if (from === null) return;
    const pt = clientToFigurePoint(e);
    if (pt === null) return;
    const targetPanelId = panelAtFigurePoint(pt.fx, pt.fy);
    if (targetPanelId === null) return;
    onTrayDrop({ from, targetPanelId });
  }

  // Same passthrough idea, for native dblclick: GridCells's per-panel
  // onDoubleClick is bypassed because this layer (or its select-mode
  // backdrop) is the topmost hit-target. Hit-test against panelRectsById
  // and forward to the parent.
  function onLayerDoubleClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (onPanelDoubleClick === undefined) return;
    const el = ref.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    const fx = (e.clientX - r.left) * cssToFigX;
    const fy = (e.clientY - r.top) * cssToFigY;
    const targetPanelId = panelAtFigurePoint(fx, fy);
    if (targetPanelId === null) return;
    onPanelDoubleClick(targetPanelId);
  }

  return (
    <div
      ref={ref}
      data-testid="annotation-layer"
      data-active-tool={activeTool}
      onPointerDown={onLayerPointerDown}
      onPointerMove={onLayerPointerMove}
      onPointerUp={onLayerPointerUp}
      onPointerCancel={onLayerPointerUp}
      onDragOver={onLayerDragOver}
      onDragLeave={onLayerDragLeave}
      onDrop={onLayerDrop}
      onDoubleClick={onLayerDoubleClick}
      style={{
        position: "absolute",
        inset: 0,
        width: cssW,
        height: cssH,
        pointerEvents: layerPE,
        cursor,
        // Above the GridCells overlay (which uses pointerEvents: none on its
        // wrapper) and above PanelInteractionLayer (zIndex: 2). When the tool
        // is "select", we remain pointer-transparent so PanelInteractionLayer
        // still receives wheel/drag for pan/zoom.
        zIndex: 3,
        touchAction: activeTool === "select" ? "auto" : "none",
      }}
    >
      {/* Backdrop in select mode: pointerdown starts a marquee. On
          pointerup, a "click" (no movement past MARQUEE_MIN_PX) clears
          the annotation selection (or preserves it on shift) and
          forwards the click to onPanelClick when over a panel; a real
          drag commits the marquee selection. The backdrop is mounted
          whenever the layer is in select mode — it has to be live
          BEFORE anything is selected so the user can drag-select on an
          empty canvas.

          The backdrop carves holes over EVERY occupied panel, so
          GridCells's `<div draggable>` receives the mousedown that
          starts a native HTML5 image move/swap. Empty panels and
          gutters keep backdrop coverage (click forwards through
          onPanelClick / onHoleClick). SelectedPanelHandles sits at a
          higher zIndex, so corner handles win hits regardless.

          When no panel is occupied the backdrop is one full-coverage
          div with the legacy testid. */}
      {(() => {
        if (activeTool !== "select") return null;
        const stripStyle = {
          position: "absolute" as const,
          pointerEvents: "auto" as const,
          background: "transparent",
          // The backdrop covers pannable background (gutters, empty panels).
          cursor: "grab",
        };
        const handlers = {
          onPointerDown: onBackdropPointerDown,
          onPointerMove: onBackdropPointerMove,
          onPointerUp: onBackdropPointerUp,
          onPointerCancel: onBackdropPointerUp,
        };
        const holes: BackdropRect[] = [];
        // Carve a hole over EVERY occupied panel so HTML5 dragstart on
        // GridCells's `<div draggable>` fires directly — dragging a
        // placed image is a first-class gesture, no pre-selection
        // required. Annotations over those panels stay reachable via
        // their own hit-rect divs (rendered above with pointer-events:
        // auto); empty panels, holes, and gutters keep backdrop coverage
        // for click-to-clear and click-forwarding.
        for (const p of figure.panels) {
          if (p.kind !== "image" || p.panelId === undefined) continue;
          const rect = panelRectsById.get(p.panelId);
          if (rect === undefined) continue;
          holes.push({
            x: rect.x * figToCssX,
            y: rect.y * figToCssY,
            w: rect.w * figToCssX,
            h: rect.h * figToCssY,
          });
        }
        if (holes.length === 0) {
          return (
            <div
              data-testid="annotation-backdrop"
              {...handlers}
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "auto",
                background: "transparent",
                cursor: "grab",
              }}
            />
          );
        }
        const strips = carveBackdropStrips(cssW, cssH, holes);
        return (
          <>
            {strips.map((s, i) => (
              <div
                key={i}
                data-testid={`annotation-backdrop-strip-${i}`}
                {...handlers}
                style={{
                  ...stripStyle,
                  left: s.x,
                  top: s.y,
                  width: s.w,
                  height: s.h,
                }}
              />
            ))}
          </>
        );
      })()}

      {/* Per-annotation hit-rects. Rendered in every tool so that clicks on an
          existing annotation always select (and never create a new one nearby).
          The hit-rect's onPointerDown stops propagation, so the layer's
          creation-tool pointerdown never fires for these clicks. */}
      {userAnnos.map((a) => {
        const b = annoBounds(a, panelRectsById);
        if (b === null) return null;
        return (
          <div
            key={`hit-${a.id}`}
            data-testid={`anno-hit-${a.id}`}
            data-interactive="true"
            onPointerDown={(e) => onHitPointerDown(e, a)}
            onPointerMove={onHitPointerMove}
            onPointerUp={onHitPointerUp}
            onPointerCancel={onHitPointerUp}
            style={{
              position: "absolute",
              left: b.x * figToCssX,
              top: b.y * figToCssY,
              width: Math.max(MIN_HIT_PX, b.w * figToCssX),
              height: Math.max(MIN_HIT_PX, b.h * figToCssY),
              pointerEvents: "auto",
              cursor: "move",
              background: "transparent",
            }}
          />
        );
      })}

      {/* Letter hit-rects (spec 08). Click selects; no drag/move. */}
      {letterHits.map((b) => (
        <div
          key={`hit-${b.id}`}
          data-testid={`anno-hit-${b.id}`}
          data-interactive="true"
          onPointerDown={(e) => onLetterHitPointerDown(e, b.id)}
          style={{
            position: "absolute",
            left: b.x * figToCssX,
            top: b.y * figToCssY,
            width: Math.max(MIN_HIT_PX, b.w * figToCssX),
            height: Math.max(MIN_HIT_PX, b.h * figToCssY),
            pointerEvents: "auto",
            cursor: "pointer",
            background: "transparent",
          }}
        />
      ))}

      {/* Letter selection chrome — dashed outline around the letter when
          selected. Letters appear in `selectedAnnotationIds` alongside user
          annotations; we paint chrome here separately because letter rects
          aren't computed via `annoBounds`. */}
      {letterHits
        .filter((b) => selectedAnnotationIds.has(b.id))
        .map((b) => (
          <div
            key={`chrome-${b.id}`}
            data-testid={`anno-selection-chrome-${b.id}`}
            style={{
              position: "absolute",
              left: b.x * figToCssX - 2,
              top: b.y * figToCssY - 2,
              width: Math.max(MIN_HIT_PX, b.w * figToCssX) + 4,
              height: Math.max(MIN_HIT_PX, b.h * figToCssY) + 4,
              pointerEvents: "none",
              border: "2px dashed var(--c-select-stroke)",
              boxSizing: "border-box",
            }}
          />
        ))}

      {/* Selection chrome — dashed outline per selected annotation. Loops
          across the full selection set so multi-select shows every member. */}
      {selectedBoundsList.map((b) => (
        <div
          key={`chrome-${b.id}`}
          data-testid={`anno-selection-chrome-${b.id}`}
          style={{
            position: "absolute",
            left: b.x * figToCssX - 2,
            top: b.y * figToCssY - 2,
            width: Math.max(MIN_HIT_PX, b.w * figToCssX) + 4,
            height: Math.max(MIN_HIT_PX, b.h * figToCssY) + 4,
            pointerEvents: "none",
            border: "2px dashed var(--c-select-stroke)",
            boxSizing: "border-box",
          }}
        />
      ))}

      {/* Alignment guidelines (spec 14). Rendered as a single SVG that
          sits above all annotation chrome but never captures pointer
          events. Lines disappear at pointerup (state cleared in
          onHitPointerUp). Coordinates are figure-px translated to CSS
          via figToCssX/Y. */}
      {guidelines.length > 0 && (
        <svg
          data-testid="anno-guidelines"
          width={cssW}
          height={cssH}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 7,
            overflow: "visible",
          }}
        >
          {guidelines.map((g, i) => {
            if (g.axis === "x") {
              const x = g.pos * figToCssX;
              return (
                <line
                  key={`gl-x-${g.otherId}-${String(g.pos)}-${String(i)}`}
                  className="anno-guideline"
                  data-testid="anno-guideline"
                  data-axis="x"
                  x1={x}
                  x2={x}
                  y1={g.start * figToCssY}
                  y2={g.end * figToCssY}
                />
              );
            }
            const y = g.pos * figToCssY;
            return (
              <line
                key={`gl-y-${g.otherId}-${String(g.pos)}-${String(i)}`}
                className="anno-guideline"
                data-testid="anno-guideline"
                data-axis="y"
                x1={g.start * figToCssX}
                x2={g.end * figToCssX}
                y1={y}
                y2={y}
              />
            );
          })}
        </svg>
      )}

      {/* Group bbox — shown only when more than one annotation is selected.
          A faint accent stroke around the union of all selected anno bounds.
          Helps the user see "what set is currently selected" at a glance. */}
      {groupBounds !== null && (
        <div
          data-testid="anno-group-bbox"
          style={{
            position: "absolute",
            left: groupBounds.x * figToCssX - 6,
            top: groupBounds.y * figToCssY - 6,
            width: groupBounds.w * figToCssX + 12,
            height: groupBounds.h * figToCssY + 12,
            pointerEvents: "none",
            border: "1px solid var(--c-select-stroke)",
            boxSizing: "border-box",
          }}
        />
      )}

      {/* Symbol corner + rotation handles (only when a selected symbol exists). */}
      {activeTool === "select" &&
        selected !== undefined &&
        selected.kind === "symbol" && (
          <>
            {(
              [
                [
                  "tl",
                  selected.x - selected.sizePx / 2,
                  selected.y - selected.sizePx / 2,
                  "nwse-resize",
                ],
                [
                  "tr",
                  selected.x + selected.sizePx / 2,
                  selected.y - selected.sizePx / 2,
                  "nesw-resize",
                ],
                [
                  "bl",
                  selected.x - selected.sizePx / 2,
                  selected.y + selected.sizePx / 2,
                  "nesw-resize",
                ],
                [
                  "br",
                  selected.x + selected.sizePx / 2,
                  selected.y + selected.sizePx / 2,
                  "nwse-resize",
                ],
              ] as const
            ).map(([corner, fx, fy, cur]) => (
              <div
                key={`symbol-handle-${corner}`}
                data-testid={`anno-symbol-handle-${corner}`}
                data-interactive="true"
                onPointerDown={(e) =>
                  onSymbolCornerPointerDown(e, selected, corner)
                }
                onPointerMove={onSymbolCornerPointerMove}
                onPointerUp={onSymbolCornerPointerUp}
                onPointerCancel={onSymbolCornerPointerUp}
                style={{
                  position: "absolute",
                  left: fx * figToCssX - HANDLE_PX / 2,
                  top: fy * figToCssY - HANDLE_PX / 2,
                  width: HANDLE_PX,
                  height: HANDLE_PX,
                  background: "var(--c-accent)",
                  pointerEvents: "auto",
                  cursor: cur,
                  zIndex: 4,
                }}
              />
            ))}
            {/* Rotation handle: small disc 16 figure-px above the top edge. */}
            <div
              data-testid="anno-symbol-handle-rotate"
              data-interactive="true"
              onPointerDown={(e) => onSymbolRotatePointerDown(e, selected)}
              onPointerMove={onSymbolRotatePointerMove}
              onPointerUp={onSymbolRotatePointerUp}
              onPointerCancel={onSymbolRotatePointerUp}
              style={{
                position: "absolute",
                left: selected.x * figToCssX - HANDLE_PX / 2,
                top:
                  (selected.y - selected.sizePx / 2 - 16) * figToCssY -
                  HANDLE_PX / 2,
                width: HANDLE_PX,
                height: HANDLE_PX,
                borderRadius: HANDLE_PX,
                background: "var(--c-accent)",
                pointerEvents: "auto",
                cursor: "grab",
                zIndex: 4,
              }}
            />
          </>
        )}

      {/* Inline text-input for the "text" tool. The pointerdown handlers
          stop propagation so a click inside the input (to focus it, place
          the cursor, or select text) doesn't bubble up to onLayerPointerDown
          and reset pendingText — which would unmount the input mid-typing.
          Focus is set imperatively in a useEffect (autoFocus races the
          opening click and silently fails). */}
      {pendingText !== null && (
        <input
          ref={textInputRef}
          data-testid="anno-text-input"
          data-interactive="true"
          value={pendingTextValue}
          onChange={(e) => setPendingTextValue(e.currentTarget.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => commitPendingText(pendingTextValue)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitPendingText(pendingTextValue);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setPendingText(null);
            }
          }}
          placeholder="Type, then Enter"
          style={{
            position: "absolute",
            left: pendingText.cssX,
            top: pendingText.cssY,
            // Match the eventual annotation's font/size so the user sees
            // the result roughly in place as they type.
            font: `${defaultTextStyle.italic ? "italic " : ""}${
              defaultTextStyle.bold ? "700 " : ""
            }${defaultTextStyle.sizePt}px ${defaultTextStyle.font}`,
            color: defaultTextStyle.color,
            background: "rgba(255,255,255,0.95)",
            border: "1px dashed var(--c-select-stroke)",
            padding: "1px 3px",
            outline: "none",
            minWidth: 80,
            zIndex: 5,
          }}
        />
      )}

      {/* Scale-bar popover: length + unit + Add. */}
      {pendingScalebar !== null && (
        <div
          data-testid="anno-scalebar-popover"
          data-interactive="true"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: pendingScalebar.cssX,
            top: pendingScalebar.cssY,
            background: "var(--c-surface)",
            border: "1px solid var(--c-border-strong)",
            borderRadius: 4,
            padding: 6,
            display: "flex",
            gap: 4,
            alignItems: "center",
            fontSize: 12,
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            zIndex: 5,
          }}
        >
          <input
            type="number"
            min={0}
            step="any"
            value={scalebarLengthDraft}
            onChange={(e) => setScalebarLengthDraft(e.target.value)}
            style={{ width: 60 }}
            data-testid="anno-scalebar-length"
            autoFocus
          />
          <select
            value={defaultScalebarStyle.lengthUnit}
            onChange={(e) =>
              onDefaultScalebarStyleChange({
                ...defaultScalebarStyle,
                lengthUnit: e.target.value as "um" | "mm",
              })
            }
            data-testid="anno-scalebar-unit"
          >
            <option value="um">µm</option>
            <option value="mm">mm</option>
          </select>
          <button
            type="button"
            onClick={commitScalebar}
            data-testid="anno-scalebar-add"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setPendingScalebar(null)}
            data-testid="anno-scalebar-cancel"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Scalebar error banner: transient cue near the click for the no-op
          scalebar paths (no image / no calibration). Auto-dismissed after
          SCALEBAR_ERROR_TTL_MS. The console.warn above stays for devs. */}
      {scalebarError !== null && (
        <div
          data-testid="anno-scalebar-error"
          style={{
            position: "absolute",
            left: scalebarError.cssX,
            top: scalebarError.cssY,
            background: "var(--c-surface)",
            border: "1px solid var(--c-danger)",
            color: "var(--c-danger)",
            padding: "4px 8px",
            borderRadius: 3,
            fontSize: 11,
            pointerEvents: "none",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            zIndex: 6,
            whiteSpace: "nowrap",
          }}
        >
          {scalebarError.message}
        </div>
      )}

      {/* Selected annotation: small "Delete" chip for discoverability. */}
      {selected !== undefined && (
        <button
          type="button"
          data-testid="anno-delete-chip"
          data-interactive="true"
          onClick={() => {
            dispatch(removeAnnotation(selected.id));
            onSelectionChange(clearSelection());
          }}
          style={{
            position: "absolute",
            left:
              (selectedBounds !== null
                ? (selectedBounds.x + selectedBounds.w) * figToCssX
                : 0) - 24,
            top:
              (selectedBounds !== null ? selectedBounds.y * figToCssY : 0) - 22,
            pointerEvents: "auto",
            fontSize: 11,
            padding: "1px 4px",
            background: "var(--c-surface)",
            border: "1px solid var(--c-danger)",
            color: "var(--c-danger)",
            cursor: "pointer",
            zIndex: 4,
          }}
          title="Delete annotation (Del / Backspace)"
        >
          ×
        </button>
      )}
    </div>
  );
}
