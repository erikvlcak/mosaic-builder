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
  /**
   * Fires on a successful calibration (not on cancel). Used by the guided
   * scale-bar flow to place the bar the user originally requested once the
   * image becomes calibrated.
   */
  onCalibrated?: (imageId: string) => void;
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
  onCalibrated,
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
    const lenInUm = unit === "mm" ? lenVal * 1000 : lenVal;
    const pixelsPerUnit = srcDist / lenInUm;
    dispatch(
      setImageCalibration(imageId, {
        unit: "um",
        pixelsPerUnit,
        source: "manual",
      }),
    );
    onCalibrated?.(imageId);
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
      className="dialog-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="calibration-modal"
        className="dialog"
        style={{ padding: 20, minWidth: canvasW + 40 }}
      >
        <h2 className="dialog-title">Calibrate scale</h2>
        <p className="dialog-body">
          Click two points on a feature of known length (e.g. an existing scale
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
              border: "1px solid var(--c-border-strong)",
              borderRadius: "var(--r-sm)",
            }}
          />
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
                background: "var(--c-accent)",
                border: "2px solid var(--c-surface)",
                boxShadow: "0 0 0 1px rgba(15,23,42,0.5)",
                pointerEvents: "none",
              }}
            />
          ))}
          {pts.length === 2 && (
            <svg
              width={canvasW}
              height={canvasH}
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            >
              <line
                x1={pts[0]!.cx}
                y1={pts[0]!.cy}
                x2={pts[1]!.cx}
                y2={pts[1]!.cy}
                stroke="var(--c-accent)"
                strokeWidth={2}
                strokeDasharray="4 3"
              />
            </svg>
          )}
        </div>
        <div
          style={{
            marginTop: 14,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <label
            htmlFor="cal-len"
            className="field-row"
            style={{ marginRight: 4 }}
          >
            Length
          </label>
          <input
            id="cal-len"
            type="number"
            className="input input-num"
            min={0}
            step="any"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            data-testid="calibration-length"
            style={{ width: 96 }}
          />
          <select
            value={unit}
            className="input"
            onChange={(e) => setUnit(e.target.value as "um" | "mm")}
            data-testid="calibration-unit"
            aria-label="Unit"
          >
            <option value="um">µm</option>
            <option value="mm">mm</option>
          </select>
          <span
            style={{
              color: "var(--c-text-muted)",
              fontSize: 12,
              marginLeft: "auto",
            }}
          >
            Points: {pts.length}/2
          </span>
        </div>
        {error !== null && (
          <p
            role="alert"
            style={{
              margin: "10px 0 0",
              color: "var(--c-danger)",
              fontSize: 12,
            }}
          >
            {error}
          </p>
        )}
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "flex-end",
            gap: 6,
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={onClose}
            data-testid="calibration-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSave}
            disabled={pts.length < 2}
            data-testid="calibration-save"
          >
            Save calibration
          </button>
        </div>
      </div>
    </div>
  );
}
