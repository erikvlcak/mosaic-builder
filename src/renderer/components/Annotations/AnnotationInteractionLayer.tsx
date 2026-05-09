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
 *  - In any creation tool (`text`/`symbol`/`box`/`scalebar`), the layer is
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
 * captures all clicks (this is the user's expectation: switching to "Box"
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
  BoxAnnotation,
  ScaleBarAnnotation,
  SymbolAnnotation,
} from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import {
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
} from "../../model/figure-actions";
import { figureToSource, type PanelRect } from "../../render/coords";
import type { ImagePoolItem } from "../../model/pool";
import type { Tool } from "../Toolbar/AnnotationToolbar";
import { DEFAULT_SYMBOL_ID } from "../../symbols/library";
import {
  addToSelection,
  clearSelection,
  removeFromSelection,
  replaceSelection,
  setSelection,
  singleSelectedId,
  unionSelection,
} from "../../state/anno-selection";

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
}

interface DragState {
  pointerId: number;
  /**
   * - "create-box": rubber-band drag to create a new box.
   * - "move": translate whole annotation (body hit-rect drag). When the
   *   selection set has > 1 member and the dragged anno is in it, every
   *   selected anno translates by the same delta — see `bulkSnapshots`.
   * - "box-corner": drag one corner of a box (resize from that corner).
   * - "symbol-corner": drag one corner of a selected symbol (center-anchored
   *   resize — see onSymbolCornerPointerMove).
   * - "symbol-rotate": drag the rotation grip above a selected symbol.
   * - "marquee": rubber-band drag in select mode from empty space — selects
   *   every annotation whose bounds intersect the drag rect on pointerup.
   */
  kind:
    | "create-box"
    | "move"
    | "box-corner"
    | "symbol-corner"
    | "symbol-rotate"
    | "marquee";
  /** Origin in figure-px. */
  startFx: number;
  startFy: number;
  /** Current pointer in figure-px (updated as we move). */
  curFx: number;
  curFy: number;
  /** Annotation being moved/resized (for "move", "box-corner", "symbol-*"). */
  movingId?: string;
  /** Original annotation snapshot (for "move", "box-corner", "symbol-*"). */
  startAnno?: UserAnno;
  /**
   * Per-anno snapshots for a bulk "move" drag. Keyed by annotation id and
   * populated only when the user grabs a member of a > 1 selection. Each
   * pointermove patches every entry by the same dx/dy.
   */
  bulkSnapshots?: Map<string, UserAnno>;
  /** Which box corner is being dragged ("box-corner" only). */
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
}

interface PendingScalebar {
  panelId: string;
  /** CSS px relative to the layer (for popover positioning). */
  cssX: number;
  cssY: number;
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
}

const DEFAULT_TEXT_FONT = "Arial, Helvetica, sans-serif";
const DEFAULT_TEXT_SIZE_PT = 12;
const DEFAULT_TEXT_COLOR = "#000000";
const DEFAULT_BOX_STROKE = "#FF0000";
const DEFAULT_BOX_STROKE_PX = 2;
const DEFAULT_SYMBOL_SIZE = 60;
const DEFAULT_SYMBOL_COLOR = "#FF0000";
const DEFAULT_SYMBOL_STROKE = 2;

// Default z-values for new annotations: scalebar always on top so it can't be hidden;
// text mid-stack so it overlays boxes/symbols; boxes/symbols at bottom as backdrop.
const Z_TEXT = 5;
const Z_BOX = 1;
const Z_SYMBOL = 1;
const Z_SCALEBAR = 10;

// Minimum hit-rect dimension in CSS px so very small annotations remain selectable.
const MIN_HIT_PX = 8;

// Minimum box width/height (in figure-px) when resizing via corner handles.
// Prevents the box from collapsing to zero and becoming unselectable.
const MIN_BOX_DIM = 4;

// Minimum symbol side length (figure-px) when resizing via corner handles.
// Larger than MIN_BOX_DIM since symbols are center-anchored — half-extents
// any smaller render visually as a single pixel.
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
/**
 * AABB-intersection test for two rectangles (figure-px). Used by marquee
 * selection to test annotation bounds against the drag rect. Touching
 * edges count as intersecting, which matches user expectation for a
 * "drag a rectangle that crosses the annotation" gesture.
 */
function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x <= b.x + b.w &&
    a.x + a.w >= b.x &&
    a.y <= b.y + b.h &&
    a.y + a.h >= b.y
  );
}

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
    case "box":
      return { x: a.x, y: a.y, w: a.w, h: a.h };
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
}: Props): JSX.Element {
  // Single-select id (null when 0 or > 1 selected). Reused throughout
  // chrome/handles/effects so existing single-select code paths are
  // untouched when the user has exactly one annotation selected.
  const selectedAnnotationId = singleSelectedId(selectedAnnotationIds);
  const ref = useRef<HTMLDivElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  /**
   * Persisted across clicks: whichever symbol the user last picked from the
   * properties-form gallery is the one a fresh Symbol-tool click drops next.
   * Initialised to the library default so the first click after load works
   * without ever opening the gallery.
   */
  const lastSymbolIdRef = useRef<string>(DEFAULT_SYMBOL_ID);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pendingScalebar, setPendingScalebar] =
    useState<PendingScalebar | null>(null);
  const [pendingText, setPendingText] = useState<PendingText | null>(null);
  // Controlled value for the inline text input. Mirroring it in React state
  // (instead of relying on the DOM input's defaultValue) makes the commit
  // path immune to focus loss / blur racing the keydown.
  const [pendingTextValue, setPendingTextValue] = useState<string>("");
  const [scalebarLength, setScalebarLength] = useState<string>("100");
  const [scalebarUnit, setScalebarUnit] = useState<"um" | "mm">("um");
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

  const cssToFigX = figurePxW / cssW;
  const cssToFigY = figurePxH / cssH;
  const figToCssX = cssW / figurePxW;
  const figToCssY = cssH / figurePxH;

  // Notify the parent when an inline editor is open so it can suspend
  // global Delete/Backspace shortcuts.
  useEffect(() => {
    onEditingChange?.(pendingText !== null);
  }, [pendingText, onEditingChange]);

  // Reset transient state on tool change.
  useEffect(() => {
    setDrag(null);
    setPendingScalebar(null);
    setPendingText(null);
  }, [activeTool]);

  // Sync the persisted symbol-id with whatever the user has selected in the
  // properties form. Without this the gallery choice would only stick for the
  // currently-selected annotation; the next click would revert to the default.
  useEffect(() => {
    if (selectedAnnotationId === null) return;
    const a = figure.annotations.find((x) => x.id === selectedAnnotationId);
    if (a !== undefined && a.kind === "symbol") {
      lastSymbolIdRef.current = a.symbolId;
    }
  }, [selectedAnnotationId, figure.annotations]);

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
        console.warn(
          `[scalebar] Cannot add scale bar: panel ${panel?.panelId ?? "(none)"} requires a calibrated image. ` +
            `Use the "Calibrate…" button on the panel toolbar first.`,
        );
        flashScalebarError(
          "Calibrate this image first (Calibrate… button).",
          c.cssX,
          c.cssY,
        );
        return;
      }
      setPendingScalebar({ panelId, cssX: c.cssX, cssY: c.cssY });
      return;
    }

    if (activeTool === "symbol") {
      // Click-to-place: drop a symbol at this point. No drag-to-size — the
      // four corner handles + rotation handle take over after selection.
      const ann: SymbolAnnotation = {
        id: newAnnoId(),
        kind: "symbol",
        z: Z_SYMBOL,
        symbolId: lastSymbolIdRef.current,
        x: c.fx,
        y: c.fy,
        sizePx: DEFAULT_SYMBOL_SIZE,
        rotationDeg: 0,
        color: DEFAULT_SYMBOL_COLOR,
        strokeWidthPx: DEFAULT_SYMBOL_STROKE,
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
      onSelectionChange(replaceSelection(ann.id));
      return;
    }

    // box: begin a rubber-band drag.
    if (activeTool !== "box") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      pointerId: e.pointerId,
      kind: "create-box",
      startFx: c.fx,
      startFy: c.fy,
      curFx: c.fx,
      curFy: c.fy,
    });
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
    const c = clientToFigure(e);
    const endFx = c?.fx ?? drag.curFx;
    const endFy = c?.fy ?? drag.curFy;

    if (drag.kind === "create-box") {
      const x = Math.min(drag.startFx, endFx);
      const y = Math.min(drag.startFy, endFy);
      const w = Math.abs(endFx - drag.startFx);
      const h = Math.abs(endFy - drag.startFy);
      if (w < 2 || h < 2) {
        setDrag(null);
        return;
      }
      const ann: BoxAnnotation = {
        id: newAnnoId(),
        kind: "box",
        z: Z_BOX,
        x,
        y,
        w,
        h,
        stroke: DEFAULT_BOX_STROKE,
        strokeWidthPx: DEFAULT_BOX_STROKE_PX,
      };
      // Bind to the image if BOTH corners land in the same image-bearing panel.
      const tlCtx = imageContextAt(x, y, figure, panelRectsById, imagesById);
      const brCtx = imageContextAt(
        x + w,
        y + h,
        figure,
        panelRectsById,
        imagesById,
      );
      if (
        tlCtx !== null &&
        brCtx !== null &&
        tlCtx.imageId === brCtx.imageId &&
        tlCtx.panel.panelId !== undefined
      ) {
        const a1 = anchorFromFigure(x, y, tlCtx);
        const a2 = anchorFromFigure(x + w, y + h, tlCtx);
        if (a1 !== null && a2 !== null) {
          ann.imageId = tlCtx.imageId;
          ann.panelId = tlCtx.panel.panelId;
          ann.anchor1 = a1;
          ann.anchor2 = a2;
        }
      }
      dispatch(addAnnotation(ann));
      onSelectionChange(replaceSelection(ann.id));
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
    if (e.button !== 0) return;
    if (activeTool !== "select") return;
    // Hit-rects are above this div in DOM order and stopPropagation, so an
    // event arriving here means the user clicked empty space. Belt-and-
    // braces: bail out unless the event target IS the backdrop itself.
    if (e.target !== e.currentTarget) return;
    const c = clientToFigure(e);
    if (c === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      pointerId: e.pointerId,
      kind: "marquee",
      startFx: c.fx,
      startFy: c.fy,
      curFx: c.fx,
      curFy: c.fy,
      shiftKey: e.shiftKey,
    });
  }

  function onBackdropPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (drag === null || drag.kind !== "marquee" || drag.pointerId !== e.pointerId)
      return;
    const c = clientToFigure(e);
    if (c === null) return;
    setDrag({ ...drag, curFx: c.fx, curFy: c.fy });
  }

  function onBackdropPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (drag === null || drag.kind !== "marquee" || drag.pointerId !== e.pointerId)
      return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // Use the most recent pointer position from this event; falls back to
    // the last move's stored coords if the up event somehow has no client
    // coords. We compute "did the drag move enough" here (instead of in
    // onBackdropPointerMove + state) so the test harness's synchronous
    // fireEvent flow is reliable: pointermove's setDrag may not have
    // committed by the time pointerup runs.
    const c = clientToFigure(e);
    const endFx = c?.fx ?? drag.curFx;
    const endFy = c?.fy ?? drag.curFy;
    const dxCss = (endFx - drag.startFx) * figToCssX;
    const dyCss = (endFy - drag.startFy) * figToCssY;
    const moved = Math.hypot(dxCss, dyCss) >= MARQUEE_MIN_PX;
    if (!moved) {
      // Treat as a click on empty space.
      // Shift-click on empty preserves selection; plain click clears it.
      if (drag.shiftKey !== true) {
        onSelectionChange(clearSelection());
      }
      setDrag(null);
      return;
    }
    // Commit marquee: collect every user-anno whose bounds intersect the rect.
    const x = Math.min(drag.startFx, endFx);
    const y = Math.min(drag.startFy, endFy);
    const w = Math.abs(endFx - drag.startFx);
    const h = Math.abs(endFy - drag.startFy);
    const hits: string[] = [];
    for (const a of figure.annotations) {
      if (!isUserAnno(a)) continue;
      const b = annoBounds(a, panelRectsById);
      if (b === null) continue;
      if (rectsIntersect(b, { x, y, w, h })) hits.push(a.id);
    }
    onSelectionChange(
      drag.shiftKey === true
        ? unionSelection(selectedAnnotationIds, hits)
        : setSelection(hits),
    );
    setDrag(null);
  }

  // -------------------------------------------------------------------
  // SELECT MODE — per-annotation hit-rects.
  // -------------------------------------------------------------------

  function onHitPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    a: UserAnno,
  ): void {
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
    });
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
      case "box": {
        const nx = start.x + dx;
        const ny = start.y + dy;
        const patch: Partial<BoxAnnotation> = { x: nx, y: ny };
        if (start.imageId !== undefined) {
          const tlCtx = imageContextAt(
            nx,
            ny,
            figure,
            panelRectsById,
            imagesById,
          );
          const brCtx = imageContextAt(
            nx + start.w,
            ny + start.h,
            figure,
            panelRectsById,
            imagesById,
          );
          if (
            tlCtx !== null &&
            brCtx !== null &&
            tlCtx.imageId === start.imageId &&
            brCtx.imageId === start.imageId
          ) {
            const a1 = anchorFromFigure(nx, ny, tlCtx);
            const a2 = anchorFromFigure(nx + start.w, ny + start.h, tlCtx);
            if (a1 !== null && a2 !== null) {
              patch.anchor1 = a1;
              patch.anchor2 = a2;
            }
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
    const dx = c.fx - drag.startFx;
    const dy = c.fy - drag.startFy;
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

  function onBoxCornerPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    a: BoxAnnotation,
    corner: "tl" | "tr" | "bl" | "br",
  ): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelectionChange(replaceSelection(a.id));
    const c = clientToFigure(e);
    if (c === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      pointerId: e.pointerId,
      kind: "box-corner",
      startFx: c.fx,
      startFy: c.fy,
      curFx: c.fx,
      curFy: c.fy,
      movingId: a.id,
      startAnno: a,
      corner,
    });
  }

  function onBoxCornerPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (
      drag === null ||
      drag.kind !== "box-corner" ||
      drag.pointerId !== e.pointerId
    ) {
      return;
    }
    const c = clientToFigure(e);
    if (c === null) return;
    if (drag.movingId === undefined || drag.corner === undefined) return;
    const start = drag.startAnno;
    if (start === undefined || start.kind !== "box") return;
    const dx = c.fx - drag.startFx;
    const dy = c.fy - drag.startFy;

    // Compute new (x, y, w, h) per-corner. The opposite corner stays put.
    // Then clamp against MIN_BOX_DIM to prevent collapse.
    let nx = start.x;
    let ny = start.y;
    let nw = start.w;
    let nh = start.h;
    switch (drag.corner) {
      case "tl":
        // Anchor: bottom-right (start.x + start.w, start.y + start.h).
        nx = start.x + dx;
        ny = start.y + dy;
        nw = start.w - dx;
        nh = start.h - dy;
        if (nw < MIN_BOX_DIM) {
          nx = start.x + start.w - MIN_BOX_DIM;
          nw = MIN_BOX_DIM;
        }
        if (nh < MIN_BOX_DIM) {
          ny = start.y + start.h - MIN_BOX_DIM;
          nh = MIN_BOX_DIM;
        }
        break;
      case "tr":
        // Anchor: bottom-left (start.x, start.y + start.h).
        ny = start.y + dy;
        nw = start.w + dx;
        nh = start.h - dy;
        if (nw < MIN_BOX_DIM) nw = MIN_BOX_DIM;
        if (nh < MIN_BOX_DIM) {
          ny = start.y + start.h - MIN_BOX_DIM;
          nh = MIN_BOX_DIM;
        }
        break;
      case "bl":
        // Anchor: top-right (start.x + start.w, start.y).
        nx = start.x + dx;
        nw = start.w - dx;
        nh = start.h + dy;
        if (nw < MIN_BOX_DIM) {
          nx = start.x + start.w - MIN_BOX_DIM;
          nw = MIN_BOX_DIM;
        }
        if (nh < MIN_BOX_DIM) nh = MIN_BOX_DIM;
        break;
      case "br":
        // Anchor: top-left (start.x, start.y).
        nw = start.w + dx;
        nh = start.h + dy;
        if (nw < MIN_BOX_DIM) nw = MIN_BOX_DIM;
        if (nh < MIN_BOX_DIM) nh = MIN_BOX_DIM;
        break;
    }
    const patch: Partial<BoxAnnotation> = { x: nx, y: ny, w: nw, h: nh };
    // Re-anchor when image-bound: both corners re-derive from the current rect.
    if (start.imageId !== undefined) {
      const tlCtx = imageContextAt(nx, ny, figure, panelRectsById, imagesById);
      const brCtx = imageContextAt(
        nx + nw,
        ny + nh,
        figure,
        panelRectsById,
        imagesById,
      );
      if (
        tlCtx !== null &&
        brCtx !== null &&
        tlCtx.imageId === start.imageId &&
        brCtx.imageId === start.imageId
      ) {
        const a1 = anchorFromFigure(nx, ny, tlCtx);
        const a2 = anchorFromFigure(nx + nw, ny + nh, tlCtx);
        if (a1 !== null && a2 !== null) {
          patch.anchor1 = a1;
          patch.anchor2 = a2;
        }
      }
    }
    dispatch(updateAnnotation(drag.movingId, patch));
  }

  function onBoxCornerPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (
      drag === null ||
      drag.kind !== "box-corner" ||
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

  function onSymbolCornerPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
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

  function onSymbolRotatePointerUp(e: React.PointerEvent<HTMLDivElement>): void {
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
    const lengthValue = parseFloat(scalebarLength);
    if (!Number.isFinite(lengthValue) || lengthValue <= 0) return;
    const ann: ScaleBarAnnotation = {
      id: newAnnoId(),
      kind: "scalebar",
      z: Z_SCALEBAR,
      panelId: pendingScalebar.panelId,
      lengthValue,
      lengthUnit: scalebarUnit,
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
      font: DEFAULT_TEXT_FONT,
      sizePt: DEFAULT_TEXT_SIZE_PT,
      bold: false,
      italic: false,
      color: DEFAULT_TEXT_COLOR,
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
    setPendingText(null);
  }

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
      if (selectedAnnotationIds.has(a.id) && isUserAnno(a)) selectedList.push(a);
    }
  }
  const selectedBoundsList = selectedList.flatMap((a) => {
    const b = annoBounds(a, panelRectsById);
    return b !== null ? [{ id: a.id, ...b }] : [];
  });
  // Group bbox shown only when > 1 annotation is selected. Aggregates the
  // per-anno bounds into a single rectangle in figure-px.
  let groupBounds: { x: number; y: number; w: number; h: number } | null =
    null;
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
      : activeTool === "symbol" || activeTool === "box"
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

  return (
    <div
      ref={ref}
      data-testid="annotation-layer"
      data-active-tool={activeTool}
      onPointerDown={onLayerPointerDown}
      onPointerMove={onLayerPointerMove}
      onPointerUp={onLayerPointerUp}
      onPointerCancel={onLayerPointerUp}
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
          pointerup, a "click" (no movement past MARQUEE_MIN_PX) clears the
          selection (or preserves it on shift); a real drag commits the
          marquee selection. The backdrop is mounted whenever the layer is
          in select mode — it has to be live BEFORE anything is selected so
          the user can drag-select on an empty canvas. */}
      {activeTool === "select" && (
        <div
          data-testid="annotation-backdrop"
          onPointerDown={onBackdropPointerDown}
          onPointerMove={onBackdropPointerMove}
          onPointerUp={onBackdropPointerUp}
          onPointerCancel={onBackdropPointerUp}
          style={{
            position: "absolute",
            inset: 0,
            // Transparent capture surface; sits BELOW the hit-rects in DOM order.
            pointerEvents: "auto",
            background: "transparent",
            cursor: "default",
          }}
        />
      )}

      {/* Marquee preview rectangle while a drag is in flight. The threshold
          check matches onBackdropPointerUp's drag-vs-click detection — under
          MARQUEE_MIN_PX of movement we suppress the preview so a quick click
          on empty space doesn't flicker a tiny rectangle into view. */}
      {drag !== null &&
        drag.kind === "marquee" &&
        Math.hypot(
          (drag.curFx - drag.startFx) * figToCssX,
          (drag.curFy - drag.startFy) * figToCssY,
        ) >= MARQUEE_MIN_PX && (
          <div
            data-testid="anno-marquee"
            style={{
              position: "absolute",
              left: Math.min(drag.startFx, drag.curFx) * figToCssX,
              top: Math.min(drag.startFy, drag.curFy) * figToCssY,
              width: Math.abs(drag.curFx - drag.startFx) * figToCssX,
              height: Math.abs(drag.curFy - drag.startFy) * figToCssY,
              pointerEvents: "none",
              border: "1px dashed #0066FF",
              background: "rgba(0, 102, 255, 0.08)",
              boxSizing: "border-box",
              zIndex: 5,
            }}
          />
        )}

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
              border: "2px dashed #0066FF",
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
            border: "2px dashed #0066FF",
            boxSizing: "border-box",
          }}
        />
      ))}

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
            border: "1px solid rgba(0, 102, 255, 0.35)",
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
                  background: "#0066FF",
                  pointerEvents: "auto",
                  cursor: cur,
                  zIndex: 4,
                }}
              />
            ))}
            {/* Rotation handle: small disc 16 figure-px above the top edge. */}
            <div
              data-testid="anno-symbol-handle-rotate"
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
                background: "#0066FF",
                pointerEvents: "auto",
                cursor: "grab",
                zIndex: 4,
              }}
            />
          </>
        )}

      {/* Box corner handles (only when a selected box exists). */}
      {activeTool === "select" &&
        selected !== undefined &&
        selected.kind === "box" && (
          <>
            {(
              [
                ["tl", selected.x, selected.y, "nwse-resize"],
                ["tr", selected.x + selected.w, selected.y, "nesw-resize"],
                ["bl", selected.x, selected.y + selected.h, "nesw-resize"],
                [
                  "br",
                  selected.x + selected.w,
                  selected.y + selected.h,
                  "nwse-resize",
                ],
              ] as const
            ).map(([corner, fx, fy, cursor]) => (
              <div
                key={`box-handle-${corner}`}
                data-testid={`anno-box-handle-${corner}`}
                onPointerDown={(e) =>
                  onBoxCornerPointerDown(e, selected, corner)
                }
                onPointerMove={onBoxCornerPointerMove}
                onPointerUp={onBoxCornerPointerUp}
                onPointerCancel={onBoxCornerPointerUp}
                style={{
                  position: "absolute",
                  left: fx * figToCssX - HANDLE_PX / 2,
                  top: fy * figToCssY - HANDLE_PX / 2,
                  width: HANDLE_PX,
                  height: HANDLE_PX,
                  background: "#0066FF",
                  pointerEvents: "auto",
                  cursor,
                  zIndex: 4,
                }}
              />
            ))}
          </>
        )}

      {/* Transient preview during box creation. */}
      {drag !== null && drag.kind === "create-box" && (
        <div
          data-testid="anno-preview-box"
          style={{
            position: "absolute",
            left: Math.min(drag.startFx, drag.curFx) * figToCssX,
            top: Math.min(drag.startFy, drag.curFy) * figToCssY,
            width: Math.abs(drag.curFx - drag.startFx) * figToCssX,
            height: Math.abs(drag.curFy - drag.startFy) * figToCssY,
            pointerEvents: "none",
            border: `${DEFAULT_BOX_STROKE_PX}px solid ${DEFAULT_BOX_STROKE}`,
            boxSizing: "border-box",
          }}
        />
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
            font: `${DEFAULT_TEXT_SIZE_PT}px ${DEFAULT_TEXT_FONT}`,
            color: DEFAULT_TEXT_COLOR,
            background: "rgba(255,255,255,0.95)",
            border: "1px dashed #0066FF",
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
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: pendingScalebar.cssX,
            top: pendingScalebar.cssY,
            background: "#FFF",
            border: "1px solid #888",
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
            value={scalebarLength}
            onChange={(e) => setScalebarLength(e.target.value)}
            style={{ width: 60 }}
            data-testid="anno-scalebar-length"
            autoFocus
          />
          <select
            value={scalebarUnit}
            onChange={(e) => setScalebarUnit(e.target.value as "um" | "mm")}
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
            background: "#FFF",
            border: "1px solid #C00",
            color: "#C00",
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
            background: "#FFF",
            border: "1px solid #C00",
            color: "#C00",
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
