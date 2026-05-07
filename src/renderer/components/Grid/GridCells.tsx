import { useState } from "react";
import type { FigureState } from "../../model/figure-state";
import { cellKey } from "../../model/figure-state";
import { computePanelRects } from "../../render/coords";
import { DEFAULT_GLOBAL_STYLE } from "../../model/global-style";
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
}: Props): JSX.Element {
  const [hoverPanelId, setHoverPanelId] = useState<string | null>(null);

  const selectedId = selectedIdOf(panelInteraction);
  const editingId = editingIdOf(panelInteraction);

  // Build a Figure-shaped object purely for layout. We map state.panels
  // (which already carry rowSpan/colSpan) directly so rect computation
  // matches the rendered figure exactly.
  const rects = computePanelRects({
    canvas: { widthPx: figurePxW, heightPx: figurePxH, background: "#000" },
    grid: {
      rows: state.rows,
      cols: state.cols,
      gutterPx: state.gutterPx,
      gutterColor: state.gutterColor,
    },
    panels: state.panels.map((p) => ({
      row: p.row,
      col: p.col,
      kind: "placeholder" as const,
      label: "",
      rowSpan: p.rowSpan,
      colSpan: p.colSpan,
    })),
    annotations: [],
    globalStyle: DEFAULT_GLOBAL_STYLE,
  });

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
      {/* Selection layer (unchanged) */}
      {Array.from({ length: state.rows * state.cols }).map((_, idx) => {
        const row = Math.floor(idx / state.cols);
        const col = idx % state.cols;
        const k = cellKey(row, col);
        const sel = selection.has(k);

        const availW = figurePxW - state.gutterPx * (state.cols + 1);
        const availH = figurePxH - state.gutterPx * (state.rows + 1);
        const cellW = Math.floor(availW / state.cols);
        const cellH = Math.floor(availH / state.rows);
        const x = state.gutterPx + col * (cellW + state.gutterPx);
        const y = state.gutterPx + row * (cellH + state.gutterPx);

        return (
          <div
            key={`sel-${k}`}
            data-testid={`cell-sel-${row}-${col}`}
            style={{
              position: "absolute",
              left: x * sx,
              top: y * sy,
              width: cellW * sx,
              height: cellH * sy,
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

      {state.panels.map((panel, i) => {
        const r = rects[i];
        if (r === undefined) return null;
        const occupied = panel.imageId !== undefined;

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
              : isSelected && occupied
                ? "2px solid var(--c-focus-stroke)"
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
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDropEvt}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            data-testid={`panel-${panel.row}-${panel.col}`}
            data-panel-id={panel.id}
            data-mode={isEditing ? "editing" : isSelected ? "selected" : undefined}
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
              transition: "outline-color 80ms ease",
              boxSizing: "border-box",
            }}
          />
        );
      })}
    </div>
  );
}
