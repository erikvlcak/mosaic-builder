import * as React from "react";
import { useRef, useState } from "react";
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
import {
  DRAG_MIME,
  parseDrag,
  serializeDrag,
  type DragPayload,
} from "../../dnd/drag-payload";

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
  selection,
  onCellShiftClick,
  panelInteraction,
  onPanelClick,
  onPanelDoubleClick,
  onHoleClick,
  onPanelCropBadgeClick,
  onTrackWeightChange,
}: Props): JSX.Element {
  const [hoverPanelId, setHoverPanelId] = useState<string | null>(null);
  const [draggingPanelId, setDraggingPanelId] = useState<string | null>(null);

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
  const panelRectMap: Record<string, { x: number; y: number; w: number; h: number }> =
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
          e.dataTransfer.dropEffect = "move";
          if (hoverPanelId !== panel.id) setHoverPanelId(panel.id);
        }
        function onDragLeave(): void {
          if (hoverPanelId === panel.id) setHoverPanelId(null);
        }
        function onDropEvt(e: React.DragEvent<HTMLDivElement>): void {
          e.preventDefault();
          setHoverPanelId(null);
          const raw = e.dataTransfer.getData(DRAG_MIME);
          const from = parseDrag(raw);
          if (from === null) return;
          onDrop({ from, targetPanelId: panel.id });
        }
        function onDragStart(e: React.DragEvent<HTMLDivElement>): void {
          if (!occupied) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData(
            DRAG_MIME,
            serializeDrag({ kind: "panel", panelId: panel.id }),
          );
          e.dataTransfer.effectAllowed = "move";
          setDraggingPanelId(panel.id);
        }
        function onDragEnd(): void {
          setDraggingPanelId(null);
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

        // Drag rules:
        //   editing → never draggable (PanelInteractionLayer owns gestures)
        //   selected → draggable iff occupied (drag-to-swap)
        //   no-mode → never draggable; the annotation backdrop owns
        //     pointerdown here so the user can rubber-band a marquee over
        //     the panel's annotations. To move the image the user must
        //     first single-click to select (green border + grab cursor),
        //     which arms drag-to-swap on the next gesture.
        const draggable = occupied && isSelected;

        // editing: no outline here — PanelInteractionLayer owns editing-mode chrome.
        const outline =
          hoverPanelId === panel.id
            ? "3px solid var(--c-hover-stroke)"
            : isEditing
              ? "1px dashed transparent"
              : isSelected && (occupied || isHidden)
                ? "2px solid var(--c-focus-stroke)"
                : isHidden
                  ? "1px dashed var(--c-text-faint)"
                  : "1px dashed transparent";

        // Cursor rules:
        //   editing → default (PanelInteractionLayer sits on top with its own)
        //   selected + occupied → grab (drag-to-swap is armed)
        //   occupied unselected → default (annotation backdrop owns pointer)
        //   empty → default
        const cursor =
          isEditing ? "default" : isSelected && occupied ? "grab" : "default";

        return (
          <div
            key={panel.id}
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
          axis === "col"
            ? (hairlineCenter - STRIP / 2) * sx
            : crossStart * sx,
        top:
          axis === "col"
            ? crossStart * sy
            : (hairlineCenter - STRIP / 2) * sy,
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
