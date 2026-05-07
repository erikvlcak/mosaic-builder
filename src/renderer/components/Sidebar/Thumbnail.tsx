import { useEffect, useRef } from "react";
import type { ImagePoolItem } from "../../model/pool";
import { DRAG_MIME, serializeDrag } from "../../dnd/drag-payload";

interface Props {
  item: ImagePoolItem;
  bitmap: ImageBitmap | undefined;
  placed: boolean;
}

const SIZE = 56;

function formatSize(item: ImagePoolItem): string {
  return `${item.width}×${item.height}`;
}

export function Thumbnail({ item, bitmap, placed }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (c === null || bitmap === undefined) return;
    c.width = SIZE;
    c.height = SIZE;
    const ctx = c.getContext("2d");
    if (ctx === null) return;
    ctx.fillStyle = "#1E232B";
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
      title={`${item.filename} — ${formatSize(item)}${placed ? " (placed)" : ""}`}
      className={`thumb ${placed ? "thumb--placed" : "thumb--draggable"}`}
    >
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="thumb-canvas"
        style={{ width: SIZE, height: SIZE }}
      />
      <div className="thumb-meta">
        <div className="thumb-name">{item.filename}</div>
        <div className="thumb-sub">{formatSize(item)}</div>
      </div>
    </div>
  );
}
