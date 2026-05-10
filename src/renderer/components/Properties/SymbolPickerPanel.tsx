import type { DefaultSymbolStyle } from "../../model/default-symbol-style";
import { SYMBOL_LIBRARY_BY_ID } from "../../symbols/library";
import { SymbolGrid } from "./SymbolGrid";
import { SymbolStyleControls } from "./SymbolStyleControls";

interface Props {
  value: DefaultSymbolStyle;
  onChange: (next: DefaultSymbolStyle) => void;
}

export function SymbolPickerPanel({ value, onChange }: Props): JSX.Element {
  const def = SYMBOL_LIBRARY_BY_ID.get(value.symbolId);
  const canFill = def?.geometry === "closed";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
          Symbol
        </div>
        <SymbolGrid
          value={value.symbolId}
          currentColor={value.color}
          currentStrokeWidthPx={value.strokeWidthPx}
          currentFillMode={value.fillMode}
          currentStrokeStyle={value.strokeStyle}
          onChange={(symbolId) => onChange({ ...value, symbolId })}
        />
      </div>
      <SymbolStyleControls
        value={value}
        canFill={canFill}
        onChange={(patch) => onChange({ ...value, ...patch })}
      />
    </div>
  );
}
