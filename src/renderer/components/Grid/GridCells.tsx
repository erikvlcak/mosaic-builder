import { useState } from "react";
import type { FigureState } from "../../model/figure-state";
import { cellKey } from "../../model/figure-state";
import { computePanelRects } from "../../render/coords";
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
  /** Tracks "focused panel" for the Unmerge action. */
  focusedPanelId: string | null;
  onPanelClick: (panelId: string) => void;
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
  focusedPanelId,
  onPanelClick,
}: Props): JSX.Element {
  const [hoverPanelId, setHoverPanelId] = useState<string | null>(null);

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
      {/* Selection layer — one box per cell, shift-click to toggle.
          Sits underneath the per-panel drop layer; only handles shift-click. */}
      {Array.from({ length: state.rows * state.cols }).map((_, idx) => {
        const row = Math.floor(idx / state.cols);
        const col = idx % state.cols;
        const k = cellKey(row, col);
        const sel = selection.has(k);

        // Compute single-cell rect inline, so this layer doesn't need the panels.
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
              // Visual-only layer; clicks pass through to the panel layer
              // above, which dispatches shift-clicks back to onCellShiftClick.
              pointerEvents: "none",
              boxSizing: "border-box",
              outline: sel
                ? "2px solid #FFC400"
                : "1px dashed transparent",
              outlineOffset: -2,
              background: sel ? "rgba(255,196,0,0.10)" : "transparent",
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
            // Shift-click on a 1x1 panel toggles its cell in the merge
            // selection. Merged panels can't participate in a merge selection
            // (canMergeSelection rejects them), so shift-click on a merged
            // panel is a no-op.
            if (panel.rowSpan === 1 && panel.colSpan === 1) {
              onCellShiftClick(panel.row, panel.col);
            }
            return;
          }
          onPanelClick(panel.id);
        }

        const isFocused = focusedPanelId === panel.id;
        // When an image panel is focused, the PanelInteractionLayer renders
        // its own selection chrome on top — so we drop our outline here to
        // avoid double-borders. We also disable HTML5 drag on focused image
        // panels so the user can pan/zoom without accidentally starting a
        // drag; deselect (Escape, or click another panel) to move it again.
        const showSelectionOutline = isFocused && !occupied;
        const draggable = occupied && !isFocused;

        return (
          <div
            key={panel.id}
            draggable={draggable}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDropEvt}
            onClick={onClick}
            data-testid={`panel-${panel.row}-${panel.col}`}
            data-panel-id={panel.id}
            data-focused={isFocused ? "true" : undefined}
            style={{
              position: "absolute",
              left: r.x * sx,
              top: r.y * sy,
              width: r.w * sx,
              height: r.h * sy,
              pointerEvents: "auto",
              cursor: occupied ? "grab" : "default",
              outline:
                hoverPanelId === panel.id
                  ? "3px solid #4C9AFF"
                  : showSelectionOutline
                    ? "2px solid #00875A"
                    : "1px dashed transparent",
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
