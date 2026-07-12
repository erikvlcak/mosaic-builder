import type { DefaultScalebarStyle } from "../../model/default-scalebar-style";
import { NumberField } from "./inputs/NumberField";
import { SelectField } from "./inputs/SelectField";
import { CornerField } from "./inputs/CornerField";

interface Props {
  value: DefaultScalebarStyle;
  onChange: (next: DefaultScalebarStyle) => void;
  /** Placed images whose image carries a calibration. */
  calibratedCount?: number;
  /** Placed (image-bearing) panels. When both counts are present, a status
   *  line tells the user how many are ready for a scale bar. */
  placedCount?: number;
}

export function ScalebarPickerPanel({
  value,
  onChange,
  calibratedCount,
  placedCount,
}: Props): JSX.Element {
  function patch(p: Partial<DefaultScalebarStyle>): void {
    onChange({ ...value, ...p });
  }

  const showStatus = calibratedCount !== undefined && placedCount !== undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {showStatus && (
        <div
          data-testid="scalebar-cal-status"
          style={{
            fontSize: 11,
            color: "var(--c-text-muted)",
            lineHeight: 1.4,
          }}
        >
          {calibratedCount} of {placedCount} placed image
          {placedCount === 1 ? "" : "s"} calibrated. Click an uncalibrated panel
          to calibrate it, then place the bar.
        </div>
      )}
      <NumberField
        label="Length"
        value={value.lengthValue}
        min={0.001}
        step={1}
        onChange={(lengthValue) => patch({ lengthValue })}
      />
      <SelectField
        label="Unit"
        value={value.lengthUnit}
        options={
          [
            { value: "um", label: "µm" },
            { value: "mm", label: "mm" },
            // px is the only calibration-independent mode — the user must be
            // able to pick it up front for an uncalibrated panel, matching
            // ScalebarAnnoForm's options (kept in sync by a parity test).
            { value: "px", label: "px" },
          ] as const
        }
        onChange={(lengthUnit) => patch({ lengthUnit })}
      />
      <CornerField
        label="Corner"
        value={value.cornerOverride}
        onChange={(cornerOverride) => patch({ cornerOverride })}
      />
    </div>
  );
}
