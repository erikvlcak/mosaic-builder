import type { DefaultScalebarStyle } from "../../model/default-scalebar-style";
import { NumberField } from "./inputs/NumberField";
import { SelectField } from "./inputs/SelectField";
import { CornerField } from "./inputs/CornerField";

interface Props {
  value: DefaultScalebarStyle;
  onChange: (next: DefaultScalebarStyle) => void;
}

export function ScalebarPickerPanel({ value, onChange }: Props): JSX.Element {
  function patch(p: Partial<DefaultScalebarStyle>): void {
    onChange({ ...value, ...p });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
