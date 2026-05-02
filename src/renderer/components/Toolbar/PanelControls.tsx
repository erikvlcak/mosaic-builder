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

const groupStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  paddingLeft: 8,
  borderLeft: "1px solid #DDD",
};

const segStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
  padding: "4px 8px",
  borderRadius: 0,
  border: "1px solid #BBB",
  background: active ? "#0066FF" : "#FFF",
  color: active ? "#FFF" : disabled ? "#AAA" : "#222",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 12,
});

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
    <div data-testid="panel-controls" style={groupStyle}>
      <div role="group" aria-label="Panel fit" style={{ display: "flex" }}>
        {(["contain", "cover", "stretch"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onSetFit(m)}
            disabled={disabled}
            style={segStyle(fit === m, disabled)}
            data-testid={`panel-fit-${m}`}
            title={`Fit: ${m}`}
          >
            {m[0]?.toUpperCase()}
            {m.slice(1)}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onRotate90}
        disabled={disabled}
        title="Rotate 90° CW (R)"
        data-testid="panel-rotate"
        style={{ padding: "4px 8px" }}
      >
        ↻ 90°
      </button>
      <button
        type="button"
        onClick={onFlipH}
        disabled={disabled}
        title="Flip horizontally (H)"
        data-testid="panel-flip-h"
        style={{ padding: "4px 8px" }}
      >
        ⇄ Flip H
      </button>
      <button
        type="button"
        onClick={onFlipV}
        disabled={disabled}
        title="Flip vertically (V)"
        data-testid="panel-flip-v"
        style={{ padding: "4px 8px" }}
      >
        ⇅ Flip V
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={disabled}
        title="Reset transform (0)"
        data-testid="panel-reset"
        style={{ padding: "4px 8px" }}
      >
        Reset
      </button>
      <button
        type="button"
        onClick={onCalibrate}
        disabled={disabled || onCalibrate === undefined}
        title="Calibrate scale (µm/px)"
        data-testid="panel-calibrate"
        style={{ padding: "4px 8px" }}
      >
        Calibrate…
      </button>
    </div>
  );
}
