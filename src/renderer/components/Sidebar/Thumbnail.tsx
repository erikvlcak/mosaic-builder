import { useEffect, useRef } from "react";
import type { ImagePoolItem } from "../../model/pool";
import {
  DRAG_MIME,
  serializeDrag,
  type DragPayload,
} from "../../dnd/drag-payload";

interface Props {
  item: ImagePoolItem;
  bitmap: ImageBitmap | undefined;
  placed: boolean;
  /** Reports tray drag start/end so the drop-ghost layer can preview. */
  onDragSourceChange?: (src: DragPayload | null) => void;
  /** Remove this image from the pool. Shown as a hover × on unplaced thumbs. */
  onRemove?: (imageId: string) => void;
  /** True when this thumbnail is the click-to-place candidate (accent ring). */
  selectedForPlace?: boolean;
  /** Click an unplaced thumbnail to arm it for click-to-place. */
  onSelectForPlace?: (imageId: string) => void;
  /** Enter on a focused unplaced thumbnail places it into the first empty panel. */
  onPlaceIntoFirstEmpty?: (imageId: string) => void;
}

const SIZE = 56;

function formatSize(item: ImagePoolItem): string {
  return `${item.width}×${item.height}`;
}

export function Thumbnail({
  item,
  bitmap,
  placed,
  onDragSourceChange,
  onRemove,
  selectedForPlace = false,
  onSelectForPlace,
  onPlaceIntoFirstEmpty,
}: Props): JSX.Element {
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
    onDragSourceChange?.({ kind: "tray", imageId: item.id });
  }
  function onDragEnd(): void {
    onDragSourceChange?.(null);
  }

  // Unplaced thumbnails double as click-to-place candidates AND keyboard
  // entry points: click arms placement, Enter places into the first empty
  // panel. Placed thumbnails are inert (they can't be re-dragged or placed).
  const clickable = !placed && onSelectForPlace !== undefined;

  return (
    <div
      draggable={!placed}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-testid={`thumb-${item.id}`}
      title={`${item.filename} — ${formatSize(item)}${placed ? " (placed)" : ""}`}
      className={`thumb ${placed ? "thumb--placed" : "thumb--draggable"}${
        selectedForPlace ? " thumb--armed" : ""
      }`}
      {...(clickable
        ? {
            role: "button",
            tabIndex: 0,
            "aria-pressed": selectedForPlace,
            onClick: () => onSelectForPlace?.(item.id),
            onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onPlaceIntoFirstEmpty?.(item.id);
              } else if (e.key === " ") {
                e.preventDefault();
                onSelectForPlace?.(item.id);
              }
            },
          }
        : {})}
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
      {placed && (
        <span
          className="thumb-badge"
          data-testid={`thumb-badge-${item.id}`}
          title="Placed in the figure"
          aria-label="Placed"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3.5 8.5l3 3 6-6.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
      {onRemove !== undefined && !placed && (
        <button
          type="button"
          className="thumb-remove"
          aria-label={`Remove ${item.filename}`}
          title="Remove from tray"
          data-testid={`thumb-remove-${item.id}`}
          // Don't let the click start a drag or bubble to the thumbnail.
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.id);
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
