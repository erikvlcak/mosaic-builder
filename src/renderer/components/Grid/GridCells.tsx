import { useState } from "react";
import type { FigureState } from "../../model/figure-state";
import { cellKey } from "../../model/figure-state";
import { computeGridLayout, computeCellRect } from "../../render/coords";
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
  const rects = state.panels.map((p) =>
    computeCellRect(layout, p.row, p.col, p.rowSpan, p.colSpan),
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
        //   selected or no-mode → draggable iff occupied
        // The selected-stays-draggable case is the bug fix: today, any focus
        // disables drag, so single-click eats the drag-to-swap gesture.
        const draggable = occupied && !isEditing;

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
        //   occupied → grab (selectable / draggable)
        //   empty → default
        const cursor = isEditing ? "default" : occupied ? "grab" : "default";

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
            data-mode={isEditing ? "editing" : isSelected ? "selected" : undefined}
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
            {isHidden && <span className="grid-panel-hidden-badge">hidden</span>}
          </div>
        );
      })}
    </div>
  );
}
