import type { FitMode, PanelTransform } from "../../model/panels";

interface Props {
  /** The current per-panel transform of the selected image-bearing panel. `null` when no image panel is selected. */
  transform: PanelTransform | null;
  onSetFit: (fit: FitMode) => void;
  onRotate90: () => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onReset: () => void;
  /** Optional: open the calibration modal for the focused panel's image. */
  onCalibrate?: () => void;
}

const FIT_LABELS: Record<FitMode, string> = {
  contain: "Contain",
  cover: "Cover",
  stretch: "Stretch",
};

export function PanelControls({
  transform,
  onSetFit,
  onRotate90,
  onFlipH,
  onFlipV,
  onReset,
  onCalibrate,
}: Props): JSX.Element {
  const disabled = transform === null;
  const fit: FitMode | null = transform?.fit ?? null;
  return (
    <div
      data-testid="panel-controls"
      style={{ display: "flex", gap: 6, alignItems: "center" }}
    >
      <div className="seg" role="group" aria-label="Panel fit">
        {(["contain", "cover", "stretch"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className="btn"
            onClick={() => onSetFit(m)}
            disabled={disabled}
            aria-pressed={fit === m}
            data-testid={`panel-fit-${m}`}
            title={`Fit: ${FIT_LABELS[m]}`}
          >
            {FIT_LABELS[m]}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-icon"
        onClick={onRotate90}
        disabled={disabled}
        title="Rotate 90° clockwise (R)"
        data-testid="panel-rotate"
        aria-label="Rotate 90 degrees clockwise"
      >
        ↻ 90°
      </button>
      <button
        type="button"
        className="btn btn-icon"
        onClick={onFlipH}
        disabled={disabled}
        title="Flip horizontally (H)"
        data-testid="panel-flip-h"
        aria-label="Flip horizontally"
      >
        ⇄ Flip H
      </button>
      <button
        type="button"
        className="btn btn-icon"
        onClick={onFlipV}
        disabled={disabled}
        title="Flip vertically (V)"
        data-testid="panel-flip-v"
        aria-label="Flip vertically"
      >
        ⇅ Flip V
      </button>
      <button
        type="button"
        className="btn"
        onClick={onReset}
        disabled={disabled}
        title="Reset transform (0)"
        data-testid="panel-reset"
      >
        Reset
      </button>
      <button
        type="button"
        className="btn"
        onClick={onCalibrate}
        disabled={disabled || onCalibrate === undefined}
        title="Calibrate scale (µm/px)"
        data-testid="panel-calibrate"
      >
        Calibrate…
      </button>
    </div>
  );
}
