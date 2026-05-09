/**
 * Non-destructive crop dialog (spec 09).
 *
 * Shows the full source bitmap fit-to-modal with a draggable / resizable
 * crop rectangle overlay. All math is done in normalized 0..1 coords —
 * the modal-canvas px are only a presentation layer. On Apply the crop is
 * dispatched as `SET_PANEL_CROP`.
 *
 * The pool item carries a calibration in pixels-per-unit on the original
 * image, so cropping does not affect it (covered by the spec § "Interaction
 * with calibration"). Image-bound annotations stay anchored in full-image
 * normalized coords; their re-projection (relocate-anno) is crop-aware.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import type { Dispatch } from "react";
import type { FigureAction } from "../../model/figure-actions";
import { setPanelCrop } from "../../model/figure-actions";
import type { PanelCrop, PanelTransform } from "../../model/panels";
import { isValidCrop } from "../../model/panels";

interface Props {
  panelId: string;
  bitmap: ImageBitmap;
  /** Existing crop on the panel (or undefined for "no crop"). */
  initialCrop: PanelCrop | undefined;
  /** Aspect of the host panel (panel rect w/h). Used by "Match panel" mode. */
  panelAspect: number;
  /** Panel transform — used to render the live preview. */
  transform: PanelTransform;
  onClose: () => void;
  dispatch: Dispatch<FigureAction>;
}

const MAX_W = 480;
const MAX_H = 480;
const PREVIEW_W = 160;
const PREVIEW_H = 120;
const HANDLE_PX = 10;

type AspectMode = "free" | "1:1" | "4:3" | "16:9" | "match";

type DragKind =
  | { kind: "move"; startCrop: PanelCrop; startX: number; startY: number }
  | {
      kind: "resize";
      handle: HandleId;
      startCrop: PanelCrop;
      startX: number;
      startY: number;
    };

type HandleId = "nw" | "n" | "ne" | "w" | "e" | "sw" | "s" | "se";

const HANDLES: HandleId[] = ["nw", "n", "ne", "w", "e", "sw", "s", "se"];

export function CropImageModal({
  panelId,
  bitmap,
  initialCrop,
  panelAspect,
  transform,
  onClose,
  dispatch,
}: Props): JSX.Element {
  const fitScale = Math.min(MAX_W / bitmap.width, MAX_H / bitmap.height, 1);
  const canvasW = Math.max(1, Math.round(bitmap.width * fitScale));
  const canvasH = Math.max(1, Math.round(bitmap.height * fitScale));

  const [crop, setCrop] = useState<PanelCrop>(
    initialCrop ?? { x: 0, y: 0, w: 1, h: 1 },
  );
  const [aspect, setAspect] = useState<AspectMode>("free");
  const [drag, setDrag] = useState<DragKind | null>(null);

  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Paint the source image once.
  useEffect(() => {
    const c = imageCanvasRef.current;
    if (c === null) return;
    const ctx = c.getContext("2d");
    if (ctx === null) return;
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.drawImage(bitmap, 0, 0, canvasW, canvasH);
  }, [bitmap, canvasW, canvasH]);

  // Repaint preview whenever crop or transform changes.
  useEffect(() => {
    const c = previewCanvasRef.current;
    if (c === null) return;
    const ctx = c.getContext("2d");
    if (ctx === null) return;
    ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
    // Background to indicate the panel rect.
    ctx.fillStyle = "#F1F5F9";
    ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
    const sx = crop.x * bitmap.width;
    const sy = crop.y * bitmap.height;
    const cw = crop.w * bitmap.width;
    const ch = crop.h * bitmap.height;
    const fit = transform.fit;
    let dx = 0,
      dy = 0,
      dw = PREVIEW_W,
      dh = PREVIEW_H;
    if (fit !== "stretch") {
      const sScale =
        fit === "cover"
          ? Math.max(PREVIEW_W / cw, PREVIEW_H / ch)
          : Math.min(PREVIEW_W / cw, PREVIEW_H / ch);
      dw = cw * sScale;
      dh = ch * sScale;
      dx = (PREVIEW_W - dw) / 2;
      dy = (PREVIEW_H - dh) / 2;
    }
    if (cw > 0 && ch > 0) {
      ctx.drawImage(bitmap, sx, sy, cw, ch, dx, dy, dw, dh);
    }
  }, [bitmap, crop, transform.fit]);

  // Keyboard: Escape cancels; Enter applies.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter") {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "BUTTON") {
          e.preventDefault();
          onApply();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop]);

  const aspectRatio: number | null = useMemo(() => {
    switch (aspect) {
      case "free":
        return null;
      case "1:1":
        return 1;
      case "4:3":
        return 4 / 3;
      case "16:9":
        return 16 / 9;
      case "match": {
        if (!Number.isFinite(panelAspect) || panelAspect <= 0) return null;
        // panelAspect is panel-w / panel-h; we want crop (in source-px) to
        // match that ratio. Source-px aspect of the crop = (cw_px) / (ch_px)
        // = (crop.w * imgW) / (crop.h * imgH). Equating to panelAspect:
        // crop.h = (crop.w * imgW) / (panelAspect * imgH).
        return (panelAspect * bitmap.height) / bitmap.width;
      }
    }
  }, [aspect, panelAspect, bitmap.width, bitmap.height]);

  // Wherever aspectRatio is set, w/h must satisfy w === h * aspectRatio
  // (in normalized coords). We re-solve when the user picks a new ratio.
  useEffect(() => {
    if (aspectRatio === null) return;
    setCrop((prev) => {
      const cx = prev.x + prev.w / 2;
      const cy = prev.y + prev.h / 2;
      // Maintain center; pick the largest rect that fits 0..1 with the ratio.
      // Start from the smaller of the current dims; then constrain.
      const maxW = Math.min(2 * cx, 2 * (1 - cx));
      const maxH = Math.min(2 * cy, 2 * (1 - cy));
      let w = prev.w;
      let h = w / aspectRatio;
      if (h > maxH) {
        h = maxH;
        w = h * aspectRatio;
      }
      if (w > maxW) {
        w = maxW;
        h = w / aspectRatio;
      }
      const next = {
        x: clamp01(cx - w / 2),
        y: clamp01(cy - h / 2),
        w: Math.max(MIN_NORM, w),
        h: Math.max(MIN_NORM, h),
      };
      return clampToUnit(next);
    });
  }, [aspectRatio]);

  function onCanvasPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    handle: HandleId | "move",
  ): void {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    if (handle === "move") {
      setDrag({ kind: "move", startCrop: { ...crop }, startX, startY });
    } else {
      setDrag({
        kind: "resize",
        handle,
        startCrop: { ...crop },
        startX,
        startY,
      });
    }
  }

  function onCanvasPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (drag === null) return;
    e.preventDefault();
    const dxPx = e.clientX - drag.startX;
    const dyPx = e.clientY - drag.startY;
    // px → normalized: divide by canvasW/H.
    const dxN = dxPx / canvasW;
    const dyN = dyPx / canvasH;
    if (drag.kind === "move") {
      const start = drag.startCrop;
      const next: PanelCrop = {
        x: clamp01(start.x + dxN, 1 - start.w),
        y: clamp01(start.y + dyN, 1 - start.h),
        w: start.w,
        h: start.h,
      };
      setCrop(next);
      return;
    }
    setCrop(resizeCrop(drag.startCrop, drag.handle, dxN, dyN, aspectRatio));
  }

  function onCanvasPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (drag === null) return;
    e.preventDefault();
    setDrag(null);
  }

  function onApply(): void {
    if (!isValidCrop(crop)) return;
    // If the crop is the full image, treat Apply as "no crop".
    if (crop.x === 0 && crop.y === 0 && crop.w === 1 && crop.h === 1) {
      dispatch(setPanelCrop(panelId, null));
    } else {
      dispatch(setPanelCrop(panelId, crop));
    }
    onClose();
  }

  function onResetCrop(): void {
    setCrop({ x: 0, y: 0, w: 1, h: 1 });
    setAspect("free");
  }

  // Crop rect in modal-canvas px.
  const rectPx = {
    x: crop.x * canvasW,
    y: crop.y * canvasH,
    w: crop.w * canvasW,
    h: crop.h * canvasH,
  };

  return (
    <div
      data-testid="crop-backdrop"
      className="dialog-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="crop-modal"
        className="dialog"
        style={{ padding: 20, minWidth: canvasW + PREVIEW_W + 80 }}
      >
        <h2 className="dialog-title">Crop image</h2>
        <p className="dialog-body">
          Drag the rectangle or its edges to choose a sub-region of the source
          image. The original image is preserved — only this panel&apos;s view
          changes.
        </p>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <div
            data-testid="crop-canvas-wrapper"
            style={{
              position: "relative",
              width: canvasW,
              height: canvasH,
              userSelect: "none",
              touchAction: "none",
            }}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
          >
            <canvas
              ref={imageCanvasRef}
              width={canvasW}
              height={canvasH}
              style={{
                display: "block",
                border: "1px solid var(--c-border-strong)",
                borderRadius: "var(--r-sm)",
              }}
            />
            {/* Dimmed overlay outside the crop rect. */}
            <svg
              width={canvasW}
              height={canvasH}
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
              }}
            >
              <defs>
                <mask id="crop-hole">
                  <rect
                    x={0}
                    y={0}
                    width={canvasW}
                    height={canvasH}
                    fill="white"
                  />
                  <rect
                    x={rectPx.x}
                    y={rectPx.y}
                    width={rectPx.w}
                    height={rectPx.h}
                    fill="black"
                  />
                </mask>
              </defs>
              <rect
                x={0}
                y={0}
                width={canvasW}
                height={canvasH}
                fill="rgba(15,23,42,0.45)"
                mask="url(#crop-hole)"
              />
              <rect
                x={rectPx.x}
                y={rectPx.y}
                width={rectPx.w}
                height={rectPx.h}
                fill="none"
                stroke="var(--c-accent)"
                strokeWidth={2}
              />
            </svg>
            {/* Move surface — the crop rect interior. */}
            <div
              data-testid="crop-rect"
              role="presentation"
              onPointerDown={(e) => onCanvasPointerDown(e, "move")}
              style={{
                position: "absolute",
                left: rectPx.x,
                top: rectPx.y,
                width: rectPx.w,
                height: rectPx.h,
                cursor: "move",
              }}
            />
            {HANDLES.map((h) => {
              const pos = handlePos(h, rectPx);
              return (
                <div
                  key={h}
                  data-testid={`crop-handle-${h}`}
                  role="presentation"
                  onPointerDown={(e) => onCanvasPointerDown(e, h)}
                  style={{
                    position: "absolute",
                    left: pos.x - HANDLE_PX / 2,
                    top: pos.y - HANDLE_PX / 2,
                    width: HANDLE_PX,
                    height: HANDLE_PX,
                    background: "#FFF",
                    border: "1px solid var(--c-accent)",
                    borderRadius: 2,
                    cursor: handleCursor(h),
                  }}
                />
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "var(--c-text-muted)",
                  marginBottom: 4,
                }}
              >
                Preview
              </div>
              <canvas
                ref={previewCanvasRef}
                width={PREVIEW_W}
                height={PREVIEW_H}
                data-testid="crop-preview"
                style={{
                  display: "block",
                  border: "1px solid var(--c-border-strong)",
                  borderRadius: "var(--r-sm)",
                  background: "#F1F5F9",
                }}
              />
            </div>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: 12,
              }}
            >
              <span style={{ color: "var(--c-text-muted)" }}>Aspect</span>
              <select
                className="input"
                data-testid="crop-aspect"
                value={aspect}
                onChange={(e) => setAspect(e.target.value as AspectMode)}
              >
                <option value="free">Free</option>
                <option value="1:1">1 : 1</option>
                <option value="4:3">4 : 3</option>
                <option value="16:9">16 : 9</option>
                <option value="match">Match panel</option>
              </select>
            </label>
            <div
              style={{
                fontSize: 11,
                color: "var(--c-text-muted)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <div>x: {(crop.x * 100).toFixed(1)}%</div>
              <div>y: {(crop.y * 100).toFixed(1)}%</div>
              <div>w: {(crop.w * 100).toFixed(1)}%</div>
              <div>h: {(crop.h * 100).toFixed(1)}%</div>
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            type="button"
            className="btn"
            data-testid="crop-reset"
            onClick={onResetCrop}
          >
            Reset
          </button>
          <button
            type="button"
            className="btn"
            data-testid="crop-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="crop-apply"
            onClick={onApply}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

const MIN_NORM = 0.02;

function clamp01(v: number, hi: number = 1): number {
  if (v < 0) return 0;
  if (v > hi) return hi;
  return v;
}

function clampToUnit(c: PanelCrop): PanelCrop {
  const x = Math.max(0, Math.min(1 - MIN_NORM, c.x));
  const y = Math.max(0, Math.min(1 - MIN_NORM, c.y));
  const w = Math.max(MIN_NORM, Math.min(1 - x, c.w));
  const h = Math.max(MIN_NORM, Math.min(1 - y, c.h));
  return { x, y, w, h };
}

function handlePos(
  h: HandleId,
  r: { x: number; y: number; w: number; h: number },
): { x: number; y: number } {
  const xs = { w: r.x, e: r.x + r.w, c: r.x + r.w / 2 };
  const ys = { n: r.y, s: r.y + r.h, c: r.y + r.h / 2 };
  switch (h) {
    case "nw":
      return { x: xs.w, y: ys.n };
    case "n":
      return { x: xs.c, y: ys.n };
    case "ne":
      return { x: xs.e, y: ys.n };
    case "w":
      return { x: xs.w, y: ys.c };
    case "e":
      return { x: xs.e, y: ys.c };
    case "sw":
      return { x: xs.w, y: ys.s };
    case "s":
      return { x: xs.c, y: ys.s };
    case "se":
      return { x: xs.e, y: ys.s };
  }
}

function handleCursor(h: HandleId): string {
  switch (h) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "w":
    case "e":
      return "ew-resize";
  }
}

/**
 * Apply a resize delta from a handle drag, in normalized coords. Honors an
 * optional aspect-ratio constraint (w / h). The opposite corner stays fixed
 * for diagonal handles; the opposite edge stays fixed for orthogonal handles
 * (matching every other crop UI). Result is clamped to the unit square.
 */
function resizeCrop(
  start: PanelCrop,
  handle: HandleId,
  dx: number,
  dy: number,
  aspect: number | null,
): PanelCrop {
  let { x, y, w, h } = start;
  const right = start.x + start.w;
  const bottom = start.y + start.h;
  switch (handle) {
    case "nw": {
      x = clamp01(start.x + dx, right - MIN_NORM);
      y = clamp01(start.y + dy, bottom - MIN_NORM);
      w = right - x;
      h = bottom - y;
      break;
    }
    case "n": {
      y = clamp01(start.y + dy, bottom - MIN_NORM);
      h = bottom - y;
      break;
    }
    case "ne": {
      y = clamp01(start.y + dy, bottom - MIN_NORM);
      h = bottom - y;
      w = clamp01(start.w + dx, 1 - x);
      break;
    }
    case "w": {
      x = clamp01(start.x + dx, right - MIN_NORM);
      w = right - x;
      break;
    }
    case "e": {
      w = clamp01(start.w + dx, 1 - x);
      break;
    }
    case "sw": {
      x = clamp01(start.x + dx, right - MIN_NORM);
      w = right - x;
      h = clamp01(start.h + dy, 1 - y);
      break;
    }
    case "s": {
      h = clamp01(start.h + dy, 1 - y);
      break;
    }
    case "se": {
      w = clamp01(start.w + dx, 1 - x);
      h = clamp01(start.h + dy, 1 - y);
      break;
    }
  }
  if (aspect !== null && aspect > 0) {
    // Constrain the crop to the chosen aspect ratio. For orthogonal handles,
    // only one dim moves directly — recompute the other and re-anchor along
    // the perpendicular axis around the centerline of the moving edge so the
    // rect grows symmetrically (matches Photoshop / Affinity behavior).
    // For diagonal handles, the user's larger delta picks which dim leads.
    if (handle === "n" || handle === "s") {
      w = h * aspect;
      const cx = start.x + start.w / 2;
      x = clamp01(cx - w / 2, 1 - w);
    } else if (handle === "w" || handle === "e") {
      h = w / aspect;
      const cy = start.y + start.h / 2;
      y = clamp01(cy - h / 2, 1 - h);
    } else {
      // Diagonal: pick whichever axis the user pulled harder, drive the other.
      const usedW = Math.abs(dx) >= Math.abs(dy);
      if (usedW) {
        h = w / aspect;
        if (handle === "nw" || handle === "ne") {
          y = bottom - h;
        }
      } else {
        w = h * aspect;
        if (handle === "nw" || handle === "sw") {
          x = right - w;
        }
      }
    }
  }
  return clampToUnit({ x, y, w, h });
}
