import { useEffect, useRef } from "react";
import type { ImagePoolItem } from "../../model/pool";
import { DRAG_MIME, serializeDrag } from "../../dnd/drag-payload";

interface Props {
  item: ImagePoolItem;
  bitmap: ImageBitmap | undefined;
  placed: boolean;
}

const SIZE = 64;

export function Thumbnail({ item, bitmap, placed }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (c === null || bitmap === undefined) return;
    c.width = SIZE;
    c.height = SIZE;
    const ctx = c.getContext("2d");
    if (ctx === null) return;
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, SIZE, SIZE);
    const scale = Math.min(SIZE / bitmap.width, SIZE / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  }, [bitmap]);

  function onDragStart(e: React.DragEvent<HTMLDivElement>): void {
    if (placed) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(
      DRAG_MIME,
      serializeDrag({ kind: "tray", imageId: item.id }),
    );
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <div
      draggable={!placed}
      onDragStart={onDragStart}
      data-testid={`thumb-${item.id}`}
      title={item.filename}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 6,
        borderRadius: 4,
        cursor: placed ? "default" : "grab",
        opacity: placed ? 0.45 : 1,
        background: placed ? "transparent" : "#F5F5F5",
        userSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        style={{
          width: SIZE,
          height: SIZE,
          background: "#222",
          borderRadius: 2,
          flex: "0 0 auto",
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontSize: 12,
          }}
        >
          {item.filename}
        </div>
        <div style={{ fontSize: 10, color: "#888" }}>
          {placed ? "placed" : "unplaced"}
        </div>
      </div>
    </div>
  );
}
