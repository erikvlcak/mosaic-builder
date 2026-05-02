/**
 * Two-click calibration modal. Shows a fit-to-modal still of the panel's
 * source image; the user clicks twice to mark a known distance, types
 * the physical length + unit, and presses Save.
 *
 * COORDINATE NOTE: M6 calibrates against the RAW source image (no panel
 * transform applied). This is the simplest, most predictable mapping —
 * modal-canvas px → source-px is a straight proportional scale by
 * `imgW / modalCanvasW`. The `figureToSource` helper in coords.ts is
 * intended for a future "calibrate from panel view" mode (M7+).
 */

import { useEffect, useRef, useState } from "react";
import type { Dispatch } from "react";
import type { FigureAction } from "../../model/figure-actions";
import { setImageCalibration } from "../../model/figure-actions";

interface Props {
  bitmap: ImageBitmap;
  imageId: string;
  onClose: () => void;
  dispatch: Dispatch<FigureAction>;
}

const MAX_W = 480;
const MAX_H = 480;

interface ClickPt {
  /** Modal-canvas px (top-left origin). */
  cx: number;
  cy: number;
}

export function CalibrationModal({
  bitmap,
  imageId,
  onClose,
  dispatch,
}: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pts, setPts] = useState<ClickPt[]>([]);
  const [length, setLength] = useState<string>("100");
  const [unit, setUnit] = useState<"um" | "mm">("um");
  const [error, setError] = useState<string | null>(null);

  // Fit-to-modal scale (preserve aspect).
  const fitScale = Math.min(MAX_W / bitmap.width, MAX_H / bitmap.height, 1);
  const canvasW = Math.max(1, Math.round(bitmap.width * fitScale));
  const canvasH = Math.max(1, Math.round(bitmap.height * fitScale));

  // Draw bitmap when the canvas mounts or bitmap changes.
  useEffect(() => {
    const c = canvasRef.current;
    if (c === null) return;
    const ctx = c.getContext("2d");
    if (ctx === null) return;
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.drawImage(bitmap, 0, 0, canvasW, canvasH);
  }, [bitmap, canvasW, canvasH]);

  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>): void {
    const c = canvasRef.current;
    if (c === null) return;
    const rect = c.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setPts((prev) => {
      // A 3rd click resets the picker.
      if (prev.length >= 2) return [{ cx, cy }];
      return [...prev, { cx, cy }];
    });
  }

  function onSave(): void {
    setError(null);
    if (pts.length < 2) {
      setError("Click two points on the image first.");
      return;
    }
    const lenVal = parseFloat(length);
    if (!Number.isFinite(lenVal) || lenVal <= 0) {
      setError("Length must be a positive number.");
      return;
    }
    // Convert canvas-px to source-px (proportional).
    const srcScale = bitmap.width / canvasW;
    const sx1 = pts[0]!.cx * srcScale;
    const sy1 = pts[0]!.cy * srcScale;
    const sx2 = pts[1]!.cx * srcScale;
    const sy2 = pts[1]!.cy * srcScale;
    const srcDist = Math.hypot(sx2 - sx1, sy2 - sy1);
    if (srcDist <= 0.5) {
      setError("Pick two points farther apart.");
      return;
    }
    // Calibration is stored in source-px-per-µm. If the user typed mm,
    // convert (1 mm = 1000 µm).
    const lenInUm = unit === "mm" ? lenVal * 1000 : lenVal;
    const pixelsPerUnit = srcDist / lenInUm;
    dispatch(
      setImageCalibration(imageId, {
        unit: "um",
        pixelsPerUnit,
        source: "manual",
      }),
    );
    onClose();
  }

  // Keyboard: Escape closes; Enter saves.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter") {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        // Only intercept Enter when focus is on the modal's number input,
        // to avoid stealing it from arbitrary background controls.
        if (tag === "INPUT" || tag === "SELECT" || tag === "BUTTON") {
          e.preventDefault();
          onSave();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, length, unit]);

  return (
    <div
      data-testid="calibration-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        data-testid="calibration-modal"
        style={{
          background: "#FFF",
          borderRadius: 6,
          padding: 16,
          minWidth: canvasW + 32,
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 14 }}>
          Calibrate scale (µm/px)
        </h2>
        <p style={{ margin: "0 0 8px", color: "#555" }}>
          Click two points on a known-length feature (e.g. a printed scale
          bar in the image), then enter that length below.
        </p>
        <div style={{ position: "relative", display: "inline-block" }}>
          <canvas
            ref={canvasRef}
            width={canvasW}
            height={canvasH}
            onClick={onCanvasClick}
            data-testid="calibration-canvas"
            style={{
              display: "block",
              cursor: "crosshair",
              border: "1px solid #888",
            }}
          />
          {/* Overlaid dots + connecting line */}
          {pts.map((p, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: p.cx - 5,
                top: p.cy - 5,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#FF3B30",
                border: "2px solid #FFF",
                boxShadow: "0 0 0 1px #000",
                pointerEvents: "none",
              }}
            />
          ))}
          {pts.length === 2 && (
            <svg
              width={canvasW}
              height={canvasH}
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
              }}
            >
              <line
                x1={pts[0]!.cx}
                y1={pts[0]!.cy}
                x2={pts[1]!.cx}
                y2={pts[1]!.cy}
                stroke="#FF3B30"
                strokeWidth={2}
                strokeDasharray="4 3"
              />
            </svg>
          )}
        </div>
        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span>Length:</span>
          <input
            type="number"
            min={0}
            step="any"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            style={{ width: 80 }}
            data-testid="calibration-length"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as "um" | "mm")}
            data-testid="calibration-unit"
          >
            <option value="um">µm</option>
            <option value="mm">mm</option>
          </select>
          <span style={{ color: "#666", marginLeft: 8 }}>
            Points picked: {pts.length}/2
          </span>
        </div>
        {error !== null && (
          <p style={{ margin: "8px 0 0", color: "#B00" }}>{error}</p>
        )}
        <div
          style={{
            marginTop: 12,
            display: "flex",
            justifyContent: "flex-end",
            gap: 6,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            data-testid="calibration-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={pts.length < 2}
            data-testid="calibration-save"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
