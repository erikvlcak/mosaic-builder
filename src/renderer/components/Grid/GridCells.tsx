import { useState } from "react";
import {
  cellKey,
  type CellCoord,
  type FigureState,
} from "../../model/figure-state";
import { computePanelRects } from "../../render/coords";
import {
  DRAG_MIME,
  parseDrag,
  serializeDrag,
  type DragPayload,
} from "../../dnd/drag-payload";

export interface DropEvent {
  from: DragPayload;
  target: CellCoord;
}

interface Props {
  state: FigureState;
  /** Figure pixel dimensions (used to compute panel rects). */
  figurePxW: number;
  figurePxH: number;
  /** Wrapper's actual rendered CSS width/height in px. */
  cssW: number;
  cssH: number;
  gutterPx: number;
  onDrop: (e: DropEvent) => void;
}

export function GridCells({
  state,
  figurePxW,
  figurePxH,
  cssW,
  cssH,
  gutterPx,
  onDrop,
}: Props): JSX.Element {
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const rects = computePanelRects({
    canvas: { widthPx: figurePxW, heightPx: figurePxH, background: "#000" },
    grid: { rows: state.rows, cols: state.cols, gutterPx, gutterColor: "#000" },
    panels: Array.from({ length: state.rows * state.cols }, (_, i) => ({
      row: Math.floor(i / state.cols),
      col: i % state.cols,
      kind: "placeholder" as const,
      label: "",
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
      {rects.map((r, i) => {
        const row = Math.floor(i / state.cols);
        const col = i % state.cols;
        const k = cellKey(row, col);
        const occupied = state.placements.has(k);

        function onDragOver(e: React.DragEvent<HTMLDivElement>): void {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (hoverKey !== k) setHoverKey(k);
        }
        function onDragLeave(): void {
          if (hoverKey === k) setHoverKey(null);
        }
        function onDropEvt(e: React.DragEvent<HTMLDivElement>): void {
          e.preventDefault();
          setHoverKey(null);
          const raw = e.dataTransfer.getData(DRAG_MIME);
          const from = parseDrag(raw);
          if (from === null) return;
          onDrop({ from, target: { row, col } });
        }
        function onDragStart(e: React.DragEvent<HTMLDivElement>): void {
          if (!occupied) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData(
            DRAG_MIME,
            serializeDrag({ kind: "cell", row, col }),
          );
          e.dataTransfer.effectAllowed = "move";
        }

        return (
          <div
            key={k}
            draggable={occupied}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDropEvt}
            data-testid={`cell-${row}-${col}`}
            style={{
              position: "absolute",
              left: r.x * sx,
              top: r.y * sy,
              width: r.w * sx,
              height: r.h * sy,
              pointerEvents: "auto",
              cursor: occupied ? "grab" : "default",
              outline:
                hoverKey === k ? "3px solid #4C9AFF" : "1px dashed transparent",
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
