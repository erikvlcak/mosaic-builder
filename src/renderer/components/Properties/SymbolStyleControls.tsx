import type { FillMode, StrokeStyle } from "../../model/annotations";
import { ColorField } from "./inputs/ColorField";
import { NumberField } from "./inputs/NumberField";

export interface SymbolStyleValue {
  fillMode: FillMode;
  strokeStyle: StrokeStyle;
  strokeWidthPx: number;
  color: string;
}

interface Props {
  value: SymbolStyleValue;
  /** Whether the active shape supports filling. False → Filled toggle is disabled. */
  canFill: boolean;
  onChange: (patch: Partial<SymbolStyleValue>) => void;
  /** Optional blur handler for committing transient inputs (color, stroke width). */
  onCommit?: () => void;
}

const STROKE_STYLES: { id: StrokeStyle; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "dashed", label: "Dashed" },
  { id: "dotted", label: "Dotted" },
];

export function SymbolStyleControls({
  value,
  canFill,
  onChange,
  onCommit,
}: Props): JSX.Element {
  const isOutlined = value.fillMode === "outlined" || !canFill;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
          Fill
        </div>
        <div className="seg" role="group" aria-label="Fill mode">
          <button
            type="button"
            className="btn"
            aria-pressed={!isOutlined}
            disabled={!canFill}
            data-testid="symbol-fill-mode-filled"
            onClick={() => {
              onChange({ fillMode: "filled" });
              onCommit?.();
            }}
          >
            Filled
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={isOutlined}
            data-testid="symbol-fill-mode-outlined"
            onClick={() => {
              onChange({ fillMode: "outlined" });
              onCommit?.();
            }}
          >
            Outlined
          </button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
          Stroke style
        </div>
        <select
          data-testid="symbol-stroke-style"
          value={value.strokeStyle}
          disabled={!isOutlined}
          onChange={(e) => {
            onChange({ strokeStyle: e.target.value as StrokeStyle });
            onCommit?.();
          }}
        >
          {STROKE_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <NumberField
        label="Stroke width (px)"
        value={value.strokeWidthPx}
        min={0}
        max={32}
        disabled={!isOutlined}
        data-testid="symbol-stroke-width"
        onChange={(strokeWidthPx) => onChange({ strokeWidthPx })}
        onBlur={onCommit}
      />

      <ColorField
        label="Color"
        value={value.color}
        onChange={(color) => onChange({ color })}
        onBlur={onCommit}
      />
    </div>
  );
}
