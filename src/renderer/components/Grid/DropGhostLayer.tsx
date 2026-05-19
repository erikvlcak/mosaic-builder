import * as React from "react";
import { useEffect, useRef } from "react";
import type { FigureState } from "../../model/figure-state";
import { rectsFromUniform } from "../../model/grid-layout";
import type { DragPayload } from "../../dnd/drag-payload";
import { previewForDrop } from "../../dnd/preview-for-drop";

interface Props {
  state: FigureState;
  bitmaps: Map<string, ImageBitmap>;
  dragSource: DragPayload | null;
  hoverPanelId: string | null;
  figurePxW: number;
  figurePxH: number;
  cssW: number;
  cssH: number;
}

const GHOST_OPACITY = 0.45;

// Overlay that paints translucent previews of the dragged image(s) at their
// would-be destinations during an in-flight drag. Sits above GridCells but
// pointer-events: none — never intercepts dragover/drop.
export function DropGhostLayer({
  state,
  bitmaps,
  dragSource,
  hoverPanelId,
  figurePxW,
  figurePxH,
  cssW,
  cssH,
}: Props): JSX.Element | null {
  if (dragSource === null || hoverPanelId === null) return null;

  const preview = previewForDrop(state, dragSource, hoverPanelId);
  if (!preview.valid) return null;

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

  const sx = cssW / figurePxW;
  const sy = cssH / figurePxH;

  const targetRect = panelRectMap[hoverPanelId];
  const targetBitmap = bitmaps.get(preview.targetImageId);
  const sourceRect =
    preview.sourceGhost !== undefined
      ? panelRectMap[preview.sourceGhost.panelId]
      : undefined;
  const sourceBitmap =
    preview.sourceGhost !== undefined
      ? bitmaps.get(preview.sourceGhost.imageId)
      : undefined;

  return (
    <div
      data-testid="drop-ghost-layer"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {targetRect !== undefined && targetBitmap !== undefined && (
        <Ghost
          testId="drop-ghost-target"
          bitmap={targetBitmap}
          left={targetRect.x * sx}
          top={targetRect.y * sy}
          width={targetRect.w * sx}
          height={targetRect.h * sy}
        />
      )}
      {sourceRect !== undefined && sourceBitmap !== undefined && (
        <Ghost
          testId="drop-ghost-source"
          bitmap={sourceBitmap}
          left={sourceRect.x * sx}
          top={sourceRect.y * sy}
          width={sourceRect.w * sx}
          height={sourceRect.h * sy}
        />
      )}
    </div>
  );
}

interface GhostProps {
  testId: string;
  bitmap: ImageBitmap;
  left: number;
  top: number;
  width: number;
  height: number;
}

function Ghost({
  testId,
  bitmap,
  left,
  top,
  width,
  height,
}: GhostProps): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (c === null) return;
    // Backing-store size matches CSS px; ghost is a soft preview, no DPR
    // sharpening needed.
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext("2d");
    if (ctx === null) return;
    ctx.clearRect(0, 0, w, h);
    // object-fit: cover — same intent as a fresh place/replace.
    const scale = Math.max(w / bitmap.width, h / bitmap.height);
    const drawW = bitmap.width * scale;
    const drawH = bitmap.height * scale;
    ctx.drawImage(bitmap, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);
  }, [bitmap, width, height]);

  return (
    <canvas
      ref={ref}
      data-testid={testId}
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        opacity: GHOST_OPACITY,
      }}
    />
  );
}
