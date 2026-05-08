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
 *  - In any creation tool (`text`/`arrow`/`box`/`scalebar`), the layer is
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
import type { Annotation, TextAnnotation, BoxAnnotation, ArrowAnnotation, ScaleBarAnnotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import { addAnnotation, updateAnnotation, removeAnnotation } from "../../model/figure-actions";
import type { PanelRect } from "../../render/coords";
import type { ImagePoolItem } from "../../model/pool";
import type { Tool } from "../Toolbar/AnnotationToolbar";

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
  selectedAnnotationId: string | null;
  onSelectAnnotation: (id: string | null) => void;
  /** When the text-input is open we need to suppress the global Delete shortcut. */
  onEditingChange?: (editing: boolean) => void;
  dispatch: Dispatch<FigureAction>;
}

interface DragState {
  pointerId: number;
  /**
   * "create-arrow" | "create-box" | "move" | "arrow-endpoint" | "box-corner"
   *
   * - "move": translate whole annotation (body hit-rect drag).
   * - "arrow-endpoint": drag one endpoint of an arrow (other endpoint stays put).
   * - "box-corner": drag one corner of a box (resize from that corner).
   */
  kind:
    | "create-arrow"
    | "create-box"
    | "move"
    | "arrow-endpoint"
    | "box-corner";
  /** Origin in figure-px. */
  startFx: number;
  startFy: number;
  /** Current pointer in figure-px (updated as we move). */
  curFx: number;
  curFy: number;
  /** Annotation being moved/resized (for "move", "arrow-endpoint", "box-corner"). */
  movingId?: string;
  /** Original annotation snapshot (for "move", "arrow-endpoint", "box-corner"). */
  startAnno?: UserAnno;
  /** Which arrow endpoint is being dragged ("arrow-endpoint" only). */
  endpoint?: "start" | "end";
  /** Which box corner is being dragged ("box-corner" only). */
  corner?: "tl" | "tr" | "bl" | "br";
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
const DEFAULT_ARROW_COLOR = "#FF0000";
const DEFAULT_ARROW_THICKNESS = 2;

// Default z-values for new annotations: scalebar always on top so it can't be hidden;
// text mid-stack so it overlays boxes/arrows; boxes/arrows at bottom as backdrop.
const Z_TEXT = 5;
const Z_ARROW = 1;
const Z_BOX = 1;
const Z_SCALEBAR = 10;

// Minimum hit-rect dimension in CSS px so very small annotations remain selectable.
const MIN_HIT_PX = 8;

// Minimum box width/height (in figure-px) when resizing via corner handles.
// Prevents the box from collapsing to zero and becoming unselectable.
const MIN_BOX_DIM = 4;

// Endpoint/corner handle size in CSS px (square hit-rect).
const HANDLE_PX = 8;

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
 * Conservative bounding-box approximation of an annotation's hit-rect, in
 * figure-px. For text, we estimate width as `text.length * sizePx * 0.6`
 * and height as `sizePx * 1.2`. For arrows, we use the segment's bbox
 * (with a small stroke margin). For scalebar, we use the bar rect — but
 * since the bar position is computed at draw time from the panel rect +
 * corner, we approximate it as the bottom-right corner of the panel
 * (close enough for selection in M6).
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
    case "box":
      return { x: a.x, y: a.y, w: a.w, h: a.h };
    case "arrow": {
      const x = Math.min(a.x1, a.x2) - a.thicknessPx;
      const y = Math.min(a.y1, a.y2) - a.thicknessPx;
      const w = Math.abs(a.x2 - a.x1) + a.thicknessPx * 2;
      const h = Math.abs(a.y2 - a.y1) + a.thicknessPx * 2;
      return { x, y, w, h };
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
  selectedAnnotationId,
  onSelectAnnotation,
  onEditingChange,
  dispatch,
}: Props): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pendingScalebar, setPendingScalebar] = useState<PendingScalebar | null>(null);
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
  const [scalebarError, setScalebarError] = useState<
    { message: string; cssX: number; cssY: number } | null
  >(null);
  const scalebarErrorTimerRef = useRef<number | null>(null);

  /**
   * Show the transient scalebar error banner. Replaces any existing timer
   * so rapid repeated clicks reset the fade-out.
   */
  function flashScalebarError(message: string, cssX: number, cssY: number): void {
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

  function clientToFigure(e: React.PointerEvent | PointerEvent): { fx: number; fy: number; cssX: number; cssY: number } | null {
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
      setPendingText({ id: newAnnoId(), fx: c.fx, fy: c.fy, cssX: c.cssX, cssY: c.cssY });
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

    // arrow, box: begin a drag.
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      pointerId: e.pointerId,
      kind: activeTool === "arrow" ? "create-arrow" : "create-box",
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

    if (drag.kind === "create-arrow") {
      // Reject zero-length arrows.
      if (endFx === drag.startFx && endFy === drag.startFy) {
        setDrag(null);
        return;
      }
      const ann: ArrowAnnotation = {
        id: newAnnoId(),
        kind: "arrow",
        z: Z_ARROW,
        x1: drag.startFx,
        y1: drag.startFy,
        x2: endFx,
        y2: endFy,
        color: DEFAULT_ARROW_COLOR,
        thicknessPx: DEFAULT_ARROW_THICKNESS,
        head: "filled",
      };
      dispatch(addAnnotation(ann));
      onSelectAnnotation(ann.id);
    } else if (drag.kind === "create-box") {
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
      dispatch(addAnnotation(ann));
      onSelectAnnotation(ann.id);
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
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelectAnnotation(a.id);
    const c = clientToFigure(e);
    if (c === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      pointerId: e.pointerId,
      kind: "move",
      startFx: c.fx,
      startFy: c.fy,
      curFx: c.fx,
      curFy: c.fy,
      movingId: a.id,
      startAnno: a,
    });
  }

  function onHitPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (drag === null || drag.kind !== "move" || drag.pointerId !== e.pointerId) return;
    const c = clientToFigure(e);
    if (c === null) return;
    const dx = c.fx - drag.startFx;
    const dy = c.fy - drag.startFy;
    const start = drag.startAnno;
    if (start === undefined || drag.movingId === undefined) return;
    // Dispatch a patch with the annotation's new (x, y) (or arrow endpoints).
    let patch: Partial<Annotation> | null = null;
    switch (start.kind) {
      case "text":
        patch = { x: start.x + dx, y: start.y + dy };
        break;
      case "box":
        patch = { x: start.x + dx, y: start.y + dy };
        break;
      case "arrow":
        patch = {
          x1: start.x1 + dx,
          y1: start.y1 + dy,
          x2: start.x2 + dx,
          y2: start.y2 + dy,
        };
        break;
      case "scalebar":
        // Scale bars are positioned via panel + corner; dragging is a no-op.
        break;
    }
    if (patch !== null) {
      dispatch(updateAnnotation(drag.movingId, patch));
    }
  }

  function onHitPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (drag === null || drag.kind !== "move" || drag.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDrag(null);
  }

  // -------------------------------------------------------------------
  // SELECT MODE — endpoint/corner handles (per-endpoint resize).
  //
  // Endpoint handles only render when the arrow is selected; whole-arrow
  // drag remains active on the body hit-rect. Same for box corners.
  // Handles are rendered ABOVE the body hit-rect in DOM order so clicks
  // on a handle take precedence over body drag (stopPropagation also
  // prevents the body's pointerdown from firing).
  // -------------------------------------------------------------------

  function onArrowEndpointPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    a: ArrowAnnotation,
    endpoint: "start" | "end",
  ): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelectAnnotation(a.id);
    const c = clientToFigure(e);
    if (c === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      pointerId: e.pointerId,
      kind: "arrow-endpoint",
      startFx: c.fx,
      startFy: c.fy,
      curFx: c.fx,
      curFy: c.fy,
      movingId: a.id,
      startAnno: a,
      endpoint,
    });
  }

  function onArrowEndpointPointerMove(
    e: React.PointerEvent<HTMLDivElement>,
  ): void {
    if (drag === null || drag.kind !== "arrow-endpoint" || drag.pointerId !== e.pointerId) {
      return;
    }
    const c = clientToFigure(e);
    if (c === null) return;
    if (drag.movingId === undefined || drag.endpoint === undefined) return;
    const start = drag.startAnno;
    if (start === undefined || start.kind !== "arrow") return;
    const dx = c.fx - drag.startFx;
    const dy = c.fy - drag.startFy;
    const patch =
      drag.endpoint === "start"
        ? { x1: start.x1 + dx, y1: start.y1 + dy }
        : { x2: start.x2 + dx, y2: start.y2 + dy };
    dispatch(updateAnnotation(drag.movingId, patch));
  }

  function onArrowEndpointPointerUp(
    e: React.PointerEvent<HTMLDivElement>,
  ): void {
    if (drag === null || drag.kind !== "arrow-endpoint" || drag.pointerId !== e.pointerId) {
      return;
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDrag(null);
  }

  function onBoxCornerPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    a: BoxAnnotation,
    corner: "tl" | "tr" | "bl" | "br",
  ): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelectAnnotation(a.id);
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
    if (drag === null || drag.kind !== "box-corner" || drag.pointerId !== e.pointerId) {
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
    dispatch(updateAnnotation(drag.movingId, { x: nx, y: ny, w: nw, h: nh }));
  }

  function onBoxCornerPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (drag === null || drag.kind !== "box-corner" || drag.pointerId !== e.pointerId) {
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
    dispatch(addAnnotation(ann));
    onSelectAnnotation(ann.id);
    setPendingText(null);
  }

  // -------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------

  // Find the selected annotation (for chrome).
  const selected: UserAnno | undefined =
    selectedAnnotationId !== null
      ? figure.annotations.find(
          (a): a is UserAnno => a.id === selectedAnnotationId && isUserAnno(a),
        )
      : undefined;
  const selectedBounds =
    selected !== undefined ? annoBounds(selected, panelRectsById) : null;

  // Layer-level pointer-events: auto when in a creation tool, none otherwise.
  // In select mode, the per-annotation hit-rects re-enable pointer-events.
  const layerPE: React.CSSProperties["pointerEvents"] =
    activeTool === "select" ? "none" : "auto";

  // Cursor hint per tool.
  const cursor =
    activeTool === "text"
      ? "text"
      : activeTool === "arrow" || activeTool === "box"
        ? "crosshair"
        : activeTool === "scalebar"
          ? "cell"
          : "default";

  // Build hit-rects for select mode.
  const userAnnos = figure.annotations.filter(isUserAnno);

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
      {/* Backdrop in select mode: catches "clicked nothing" to clear selection. */}
      {activeTool === "select" && selectedAnnotationId !== null && (
        <div
          data-testid="annotation-backdrop"
          onPointerDown={(e) => {
            // Only clear when the click did NOT bubble from a hit-rect.
            if (e.target === e.currentTarget) {
              onSelectAnnotation(null);
            }
          }}
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

      {/* Selection chrome — dashed outline around the selected annotation. */}
      {selectedBounds !== null && (
        <div
          data-testid="anno-selection-chrome"
          style={{
            position: "absolute",
            left: selectedBounds.x * figToCssX - 2,
            top: selectedBounds.y * figToCssY - 2,
            width: Math.max(MIN_HIT_PX, selectedBounds.w * figToCssX) + 4,
            height: Math.max(MIN_HIT_PX, selectedBounds.h * figToCssY) + 4,
            pointerEvents: "none",
            border: "2px dashed #0066FF",
            boxSizing: "border-box",
          }}
        />
      )}

      {/* Arrow endpoint handles (only when a selected arrow exists). */}
      {activeTool === "select" && selected !== undefined && selected.kind === "arrow" && (
        <>
          {(["start", "end"] as const).map((endpoint) => {
            const fx = endpoint === "start" ? selected.x1 : selected.x2;
            const fy = endpoint === "start" ? selected.y1 : selected.y2;
            return (
              <div
                key={`arrow-handle-${endpoint}`}
                data-testid={`anno-arrow-handle-${endpoint}`}
                onPointerDown={(e) => onArrowEndpointPointerDown(e, selected, endpoint)}
                onPointerMove={onArrowEndpointPointerMove}
                onPointerUp={onArrowEndpointPointerUp}
                onPointerCancel={onArrowEndpointPointerUp}
                style={{
                  position: "absolute",
                  left: fx * figToCssX - HANDLE_PX / 2,
                  top: fy * figToCssY - HANDLE_PX / 2,
                  width: HANDLE_PX,
                  height: HANDLE_PX,
                  background: "#0066FF",
                  pointerEvents: "auto",
                  cursor: "crosshair",
                  zIndex: 4,
                }}
              />
            );
          })}
        </>
      )}

      {/* Box corner handles (only when a selected box exists). */}
      {activeTool === "select" && selected !== undefined && selected.kind === "box" && (
        <>
          {(
            [
              ["tl", selected.x, selected.y, "nwse-resize"],
              ["tr", selected.x + selected.w, selected.y, "nesw-resize"],
              ["bl", selected.x, selected.y + selected.h, "nesw-resize"],
              ["br", selected.x + selected.w, selected.y + selected.h, "nwse-resize"],
            ] as const
          ).map(([corner, fx, fy, cursor]) => (
            <div
              key={`box-handle-${corner}`}
              data-testid={`anno-box-handle-${corner}`}
              onPointerDown={(e) => onBoxCornerPointerDown(e, selected, corner)}
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

      {/* Transient preview during arrow/box creation. */}
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
      {drag !== null && drag.kind === "create-arrow" && (
        <svg
          data-testid="anno-preview-arrow"
          width={cssW}
          height={cssH}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
          }}
        >
          <line
            x1={drag.startFx * figToCssX}
            y1={drag.startFy * figToCssY}
            x2={drag.curFx * figToCssX}
            y2={drag.curFy * figToCssY}
            stroke={DEFAULT_ARROW_COLOR}
            strokeWidth={DEFAULT_ARROW_THICKNESS}
            strokeLinecap="round"
          />
        </svg>
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
            onSelectAnnotation(null);
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
