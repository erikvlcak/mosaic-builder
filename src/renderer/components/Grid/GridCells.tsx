import { useState } from "react";
import type { FigureState } from "../../model/figure-state";
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
}

export function GridCells({
  state,
  figurePxW,
  figurePxH,
  cssW,
  cssH,
  onDrop,
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

        return (
          <div
            key={panel.id}
            draggable={occupied}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDropEvt}
            data-testid={`panel-${panel.row}-${panel.col}`}
            data-panel-id={panel.id}
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
