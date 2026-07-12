import * as React from "react";
import { useRef } from "react";
import type { FigureState } from "../../model/figure-state";
import { cellKey } from "../../model/figure-state";
import { computeGridLayout, computeCellRect } from "../../render/coords";
import { rectsFromUniform } from "../../model/grid-layout";
import { cellsWithoutPanel } from "../../model/panels";
import {
  type PanelInteraction,
  selectedIdOf,
  editingIdOf,
} from "../../model/panel-interaction";
import { DRAG_MIME, parseDrag, type DragPayload } from "../../dnd/drag-payload";
import { previewForDrop } from "../../dnd/preview-for-drop";
import { useSpaceHeld } from "../../interaction/InteractionContext";

export interface DropEvent {
  from: DragPayload;
  targetPanelId: string;
}

interface Props {
  state: FigureState;
  /** Figure pixel dimensions (used to compute panel rects). */
  figurePxW: number;
  figurePxH: number;
  /** Wrapper's actual rendered CSS width/height in px. */
  cssW: number;
  cssH: number;
  onDrop: (e: DropEvent) => void;
  /** Hover panel during drag (lifted to App so the ghost layer can read it). */
  hoverPanelId: string | null;
  onHoverPanelChange: (panelId: string | null) => void;
  /** Drag source (lifted to App for the same reason). */
  dragSource: DragPayload | null;
  onDragSourceChange: (src: DragPayload | null) => void;
  /** Per-cell merge selection. Shift-click toggles. */
  selection: ReadonlySet<string>;
  onCellShiftClick: (row: number, col: number) => void;
  /** Tristate: which panel (if any) is selected or editing. */
  panelInteraction: PanelInteraction;
  onPanelClick: (panelId: string) => void;
  onPanelDoubleClick: (panelId: string) => void;
  /** Click on a hole cell — restores a 1x1 panel there. */
  onHoleClick: (row: number, col: number) => void;
  /** Click on the crop badge of a panel that has a non-default crop. */
  onPanelCropBadgeClick?: (panelId: string) => void;
  /**
   * Spec 11: dispatched when the user drags a track gutter handle. weight is
   * the new value of `colWeights[index]` (or rowWeights). Only emitted in
   * uniform layout mode; the parent should ignore it otherwise. The reducer
   * clamps to MIN_TRACK_WEIGHT, so callers don't need to.
   */
  onTrackWeightChange?: (
    axis: "row" | "col",
    index: number,
    weight: number,
  ) => void;
}

export function GridCells({
  state,
  figurePxW,
  figurePxH,
  cssW,
  cssH,
  onDrop,
  hoverPanelId,
  onHoverPanelChange,
  dragSource,
  onDragSourceChange,
  selection,
  onCellShiftClick,
  panelInteraction,
  onPanelClick,
  onPanelDoubleClick,
  onHoleClick,
  onPanelCropBadgeClick,
  onTrackWeightChange,
}: Props): JSX.Element {
  // Drag source for the panel currently being dragged (visual dim only).
  const draggingPanelId =
    dragSource !== null && dragSource.kind === "panel"
      ? dragSource.panelId
      : null;

  const selectedId = selectedIdOf(panelInteraction);
  const editingId = editingIdOf(panelInteraction);

  // Single source of layout truth. `computeGridLayout` matches the
  // production renderer exactly (including the `outerGutter` toggle from
  // spec 10) so panel chrome here lines up with what the canvas paints.
  const layout = computeGridLayout(
    figurePxW,
    figurePxH,
    state.rows,
    state.cols,
    state.gutterPx,
    state.outerGutter,
  );
  // Spec 11: when layout.kind === "free", panel rects come from the layout's
  // rect map. When uniform, route through rectsFromUniform so non-equal
  // track weights are honored. The legacy cell-grid `layout` still drives
  // selection/hole math (equal weights) — a deliberate v1 simplification;
  // non-equal-weight uniform produces minor misalignment for hole chrome only.
  const panelRectMap: Record<
    string,
    { x: number; y: number; w: number; h: number }
  > =
    state.layout.kind === "free"
      ? state.layout.rects
      : rectsFromUniform({
          widthPx: figurePxW,
          heightPx: figurePxH,
          rows: state.rows,
          cols: state.cols,
          gutterPx: state.gutterPx,
          outerGutter: state.outerGutter,
          colWeights: state.layout.colWeights,
          rowWeights: state.layout.rowWeights,
          panels: state.panels,
        });
  const rects = state.panels.map(
    (p) => panelRectMap[p.id] ?? { x: 0, y: 0, w: 0, h: 0 },
  );
  const holes = cellsWithoutPanel(state.panels, state.rows, state.cols);

  const sx = cssW / figurePxW;
  const sy = cssH / figurePxH;

  return (
    <div
      data-testid="grid-overlay"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {/* Selection layer (per-cell, ignores merging — shift-click drives merge). */}
      {Array.from({ length: state.rows * state.cols }).map((_, idx) => {
        const row = Math.floor(idx / state.cols);
        const col = idx % state.cols;
        const k = cellKey(row, col);
        const sel = selection.has(k);
        const r = computeCellRect(layout, row, col);

        return (
          <div
            key={`sel-${k}`}
            data-testid={`cell-sel-${row}-${col}`}
            style={{
              position: "absolute",
              left: r.x * sx,
              top: r.y * sy,
              width: r.w * sx,
              height: r.h * sy,
              pointerEvents: "none",
              boxSizing: "border-box",
              outline: sel
                ? "2px solid var(--c-select-stroke)"
                : "1px dashed transparent",
              outlineOffset: -2,
              background: sel ? "var(--c-select-fill)" : "transparent",
              transition: "outline-color 80ms ease, background 80ms ease",
            }}
          />
        );
      })}

      {/* Hole cells: dashed outline + click to restore. Painted *under* the
          panel layer so a same-coord overlap (impossible by invariant, but
          safe defense) leaves the panel's chrome on top. */}
      {holes.map((hole) => {
        const r = computeCellRect(layout, hole.row, hole.col);
        return (
          <div
            key={`hole-${hole.row}-${hole.col}`}
            className="grid-hole"
            data-testid={`hole-${hole.row}-${hole.col}`}
            onClick={() => {
              onHoleClick(hole.row, hole.col);
            }}
            title="Click to restore this panel"
            style={{
              position: "absolute",
              left: r.x * sx,
              top: r.y * sy,
              width: r.w * sx,
              height: r.h * sy,
              pointerEvents: "auto",
              boxSizing: "border-box",
              cursor: "pointer",
            }}
          >
            <span className="grid-hole-glyph" aria-hidden>
              +
            </span>
          </div>
        );
      })}

      {/* Spec 11: track-resize handles. Only rendered for uniform layouts —
          free-form mode disables track redistribution since track weights
          no longer drive rect math. */}
      {state.layout.kind === "uniform" &&
        onTrackWeightChange !== undefined &&
        state.cols > 1 &&
        Array.from({ length: state.cols - 1 }).map((_, i) => {
          // The pair spans col i + col i+1. Compute their figure-px geometry
          // from the layout-aware rect map.
          const colWeights =
            state.layout.kind === "uniform" ? state.layout.colWeights : [];
          const leftCellSample = panelRectMap[firstPanelIdInCol(state, i)];
          const rightCellSample = panelRectMap[firstPanelIdInCol(state, i + 1)];
          if (leftCellSample === undefined || rightCellSample === undefined) {
            return null;
          }
          const pairLeftFigPx = leftCellSample.x;
          const pairWidthFigPx =
            rightCellSample.x + rightCellSample.w - leftCellSample.x;
          const pairTotalWeight = colWeights[i]! + colWeights[i + 1]!;
          // Hairline center: between left cell's right edge and right cell's
          // left edge.
          const hairlineCenter =
            (leftCellSample.x + leftCellSample.w + rightCellSample.x) / 2;
          // Span the full grid height.
          const top = computeCellRect(layout, 0, 0).y;
          const bot = computeCellRect(layout, state.rows - 1, 0);
          const fullH = bot.y + bot.h - top;
          return (
            <TrackHandle
              key={`track-handle-col-${i}`}
              testId={`track-handle-col-${i}`}
              axis="col"
              hairlineCenter={hairlineCenter}
              crossSize={fullH}
              crossStart={top}
              sx={sx}
              sy={sy}
              cssW={cssW}
              cssH={cssH}
              figurePxW={figurePxW}
              figurePxH={figurePxH}
              pairLeftFigPx={pairLeftFigPx}
              pairWidthFigPx={pairWidthFigPx}
              pairTotalWeight={pairTotalWeight}
              onChange={(weight) => onTrackWeightChange("col", i, weight)}
            />
          );
        })}
      {state.layout.kind === "uniform" &&
        onTrackWeightChange !== undefined &&
        state.rows > 1 &&
        Array.from({ length: state.rows - 1 }).map((_, i) => {
          const rowWeights =
            state.layout.kind === "uniform" ? state.layout.rowWeights : [];
          const topCellSample = panelRectMap[firstPanelIdInRow(state, i)];
          const botCellSample = panelRectMap[firstPanelIdInRow(state, i + 1)];
          if (topCellSample === undefined || botCellSample === undefined) {
            return null;
          }
          const pairLeftFigPx = topCellSample.y;
          const pairWidthFigPx =
            botCellSample.y + botCellSample.h - topCellSample.y;
          const pairTotalWeight = rowWeights[i]! + rowWeights[i + 1]!;
          const hairlineCenter =
            (topCellSample.y + topCellSample.h + botCellSample.y) / 2;
          const left = computeCellRect(layout, 0, 0).x;
          const right = computeCellRect(layout, 0, state.cols - 1);
          const fullW = right.x + right.w - left;
          return (
            <TrackHandle
              key={`track-handle-row-${i}`}
              testId={`track-handle-row-${i}`}
              axis="row"
              hairlineCenter={hairlineCenter}
              crossSize={fullW}
              crossStart={left}
              sx={sx}
              sy={sy}
              cssW={cssW}
              cssH={cssH}
              figurePxW={figurePxW}
              figurePxH={figurePxH}
              pairLeftFigPx={pairLeftFigPx}
              pairWidthFigPx={pairWidthFigPx}
              pairTotalWeight={pairTotalWeight}
              onChange={(weight) => onTrackWeightChange("row", i, weight)}
            />
          );
        })}

      {state.panels.map((panel, i) => {
        const r = rects[i];
        if (r === undefined) return null;
        const occupied = panel.imageId !== undefined;
        const isHidden = panel.hidden === true;

        function onDragOver(e: React.DragEvent<HTMLDivElement>): void {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          // dragSource is the local truth during a drag; on first-cross-window
          // edge cases it may be null until the next dragstart — fall back to
          // "move" so the OS cursor doesn't lock to "no-drop" spuriously.
          const preview =
            dragSource === null
              ? null
              : previewForDrop(state, dragSource, panel.id);
          e.dataTransfer.dropEffect =
            preview !== null && !preview.valid ? "none" : "move";
          if (hoverPanelId !== panel.id) onHoverPanelChange(panel.id);
        }
        function onDragLeave(): void {
          if (hoverPanelId === panel.id) onHoverPanelChange(null);
        }
        function onDropEvt(e: React.DragEvent<HTMLDivElement>): void {
          e.preventDefault();
          onHoverPanelChange(null);
          onDragSourceChange(null);
          const raw = e.dataTransfer.getData(DRAG_MIME);
          const from = parseDrag(raw);
          if (from === null) return;
          onDrop({ from, targetPanelId: panel.id });
        }
        // Panels are draggable={false}; this never fires from a panel, but
        // guard defensively so no panel drag can start.
        function onDragStart(e: React.DragEvent<HTMLDivElement>): void {
          e.preventDefault();
        }
        function onDragEnd(): void {
          onDragSourceChange(null);
          onHoverPanelChange(null);
        }

        function onClick(e: React.MouseEvent<HTMLDivElement>): void {
          if (e.shiftKey) {
            if (panel.rowSpan === 1 && panel.colSpan === 1) {
              onCellShiftClick(panel.row, panel.col);
            }
            return;
          }
          // Fires for empty panels too — they can't be dragged but still
          // need "selected" focus for Unmerge / properties panel.
          onPanelClick(panel.id);
        }

        function onDoubleClick(): void {
          if (!occupied) return;
          onPanelDoubleClick(panel.id);
        }

        const isSelected = selectedId === panel.id;
        const isEditing = editingId === panel.id;

        // Panels are never HTML5-draggable: a plain left-drag on the canvas
        // always pans the view (useCanvasZoom), so a native dragstart here
        // would collide with panning. Moving/swapping an image is done from
        // the tray (drag a placed thumbnail onto a panel → SWAP_PANELS).
        const draggable = false;

        // editing: no outline here — PanelInteractionLayer owns editing-mode chrome.
        // Hover outline switches to a "not allowed" treatment for invalid drops
        // (e.g., dropping a tray image whose source is already placed).
        const hoverInvalid =
          hoverPanelId === panel.id &&
          dragSource !== null &&
          !previewForDrop(state, dragSource, panel.id).valid;
        const outline =
          hoverPanelId === panel.id
            ? hoverInvalid
              ? "2px dashed var(--c-danger)"
              : "3px solid var(--c-hover-stroke)"
            : isEditing
              ? "1px dashed transparent"
              : isSelected && (occupied || isHidden)
                ? "2px solid var(--c-accent)"
                : isHidden
                  ? "1px dashed var(--c-text-faint)"
                  : "1px dashed transparent";

        // Cursor is always default now — panels aren't grabbable (drag pans).
        const cursor = "default";

        return (
          <div
            key={panel.id}
            // Occupied panels are interactive objects (drag = pick up the
            // image, Phase 2); empty and hidden panels are pannable
            // background — drag there pans the viewport, click selects.
            data-interactive={occupied && !isHidden ? "panel" : undefined}
            draggable={draggable}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDropEvt}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            data-testid={`panel-${panel.row}-${panel.col}`}
            data-panel-id={panel.id}
            data-mode={
              isEditing ? "editing" : isSelected ? "selected" : undefined
            }
            data-hidden={isHidden ? "true" : undefined}
            style={{
              position: "absolute",
              left: r.x * sx,
              top: r.y * sy,
              width: r.w * sx,
              height: r.h * sy,
              pointerEvents: "auto",
              cursor,
              outline,
              outlineOffset: -2,
              opacity: draggingPanelId === panel.id ? 0.5 : 1,
              transition: "outline-color 80ms ease, opacity 80ms ease",
              boxSizing: "border-box",
            }}
          >
            {isHidden && (
              <span className="grid-panel-hidden-badge">hidden</span>
            )}
            {panel.transform?.crop !== undefined && (
              <button
                type="button"
                className="grid-panel-crop-badge"
                data-testid={`crop-badge-${panel.row}-${panel.col}`}
                title="Adjust crop"
                aria-label="Adjust crop"
                onClick={(e) => {
                  // Stop the click from bubbling up to the panel's
                  // selection click handler — the badge is a discrete
                  // control with its own action.
                  e.stopPropagation();
                  onPanelCropBadgeClick?.(panel.id);
                }}
              >
                ✂
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function firstPanelIdInCol(state: FigureState, col: number): string {
  const p = state.panels.find((q) => q.col === col);
  return p?.id ?? "";
}

function firstPanelIdInRow(state: FigureState, row: number): string {
  const p = state.panels.find((q) => q.row === row);
  return p?.id ?? "";
}

interface TrackHandleProps {
  testId: string;
  axis: "row" | "col";
  hairlineCenter: number;
  crossSize: number;
  crossStart: number;
  sx: number;
  sy: number;
  cssW: number;
  cssH: number;
  figurePxW: number;
  figurePxH: number;
  pairLeftFigPx: number;
  pairWidthFigPx: number;
  pairTotalWeight: number;
  onChange: (weight: number) => void;
}

function TrackHandle({
  testId,
  axis,
  hairlineCenter,
  crossSize,
  crossStart,
  sx,
  sy,
  cssW,
  cssH,
  figurePxW,
  figurePxH,
  pairLeftFigPx,
  pairWidthFigPx,
  pairTotalWeight,
  onChange,
}: TrackHandleProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const spaceHeld = useSpaceHeld();
  const dragRef = useRef<{ pointerId: number } | null>(null);
  // Hit-strip width in figure-px. Wider than the gutter so the user can grab.
  const STRIP = 12;

  function handleMove(e: React.PointerEvent<HTMLDivElement>): void {
    const wrapper = ref.current?.parentElement?.getBoundingClientRect();
    if (wrapper === undefined) return;
    if (axis === "col") {
      const figX = ((e.clientX - wrapper.left) / cssW) * figurePxW;
      const fraction = (figX - pairLeftFigPx) / pairWidthFigPx;
      onChange(fraction * pairTotalWeight);
    } else {
      const figY = ((e.clientY - wrapper.top) / cssH) * figurePxH;
      const fraction = (figY - pairLeftFigPx) / pairWidthFigPx;
      onChange(fraction * pairTotalWeight);
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    // Space = hand tool: yield to the viewport pan owner.
    if (spaceHeld) return;
    if (e.button !== 0 || ref.current === null) return;
    e.stopPropagation();
    // jsdom (used in tests) doesn't implement pointer capture; guard so unit
    // tests don't throw when synthesizing pointer events.
    if (typeof ref.current.setPointerCapture === "function") {
      ref.current.setPointerCapture(e.pointerId);
    }
    dragRef.current = { pointerId: e.pointerId };
    handleMove(e);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    handleMove(e);
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    if (
      ref.current !== null &&
      typeof ref.current.hasPointerCapture === "function" &&
      ref.current.hasPointerCapture(e.pointerId)
    ) {
      ref.current.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  }

  return (
    <div
      ref={ref}
      data-testid={testId}
      data-interactive="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={
        axis === "col"
          ? "track-handle track-handle-col"
          : "track-handle track-handle-row"
      }
      style={{
        position: "absolute",
        left:
          axis === "col" ? (hairlineCenter - STRIP / 2) * sx : crossStart * sx,
        top:
          axis === "col" ? crossStart * sy : (hairlineCenter - STRIP / 2) * sy,
        width: axis === "col" ? STRIP * sx : crossSize * sx,
        height: axis === "col" ? crossSize * sy : STRIP * sy,
        cursor: axis === "col" ? "col-resize" : "row-resize",
        pointerEvents: "auto",
        touchAction: "none",
        zIndex: 4,
      }}
    />
  );
}
