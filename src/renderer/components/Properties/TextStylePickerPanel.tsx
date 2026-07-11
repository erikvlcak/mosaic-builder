import type { DefaultTextStyle } from "../../model/default-text-style";
import { NumberField } from "./inputs/NumberField";
import { ColorField } from "./inputs/ColorField";

interface Props {
  value: DefaultTextStyle;
  onChange: (next: DefaultTextStyle) => void;
}

const FONT_OPTIONS = [
  "Arial, Helvetica, sans-serif",
  "Helvetica, Arial, sans-serif",
  "Times New Roman, serif",
  "Georgia, serif",
  "Courier New, monospace",
];

export function TextStylePickerPanel({ value, onChange }: Props): JSX.Element {
  function patch(p: Partial<DefaultTextStyle>): void {
    onChange({ ...value, ...p });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label htmlFor="text-picker-font" className="field">
        <span className="field-label">Font</span>
        <select
          id="text-picker-font"
          aria-label="Font"
          className="input"
          value={value.font}
          onChange={(e) => patch({ font: e.currentTarget.value })}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f.split(",")[0]}
            </option>
          ))}
        </select>
      </label>
      <NumberField
        label="Size (pt)"
        value={value.sizePt}
        min={4}
        max={144}
        onChange={(sizePt) => patch({ sizePt })}
      />
      <div className="field">
        <span className="field-label">Style</span>
        <div className="seg" role="group" aria-label="Text style">
          <button
            type="button"
            className="btn"
            aria-label="Bold"
            aria-pressed={value.bold}
            title="Bold"
            onClick={() => patch({ bold: !value.bold })}
            style={{ fontWeight: 700, minWidth: 32 }}
          >
            B
          </button>
          <button
            type="button"
            className="btn"
            aria-label="Italic"
            aria-pressed={value.italic}
            title="Italic"
            onClick={() => patch({ italic: !value.italic })}
            style={{ fontStyle: "italic", minWidth: 32 }}
          >
            I
          </button>
        </div>
      </div>
      <ColorField
        label="Color"
        value={value.color}
        onChange={(color) => patch({ color })}
      />
      <ColorField
        label="Background"
        value={value.bgColor ?? "#FFFFFF00"}
        onChange={(bgColor) => {
          const isTransparent = bgColor.toLowerCase() === "#ffffff00";
          if (isTransparent && value.bgColor === undefined) return;
          if (isTransparent) {
            const { bgColor: _drop, ...rest } = value;
            onChange(rest);
            return;
          }
          patch({ bgColor });
        }}
        allowAlpha
      />
      <label className="checkbox-row">
        <input
          type="checkbox"
          aria-label="Halo"
          checked={value.halo === true}
          onChange={(e) => patch({ halo: e.currentTarget.checked })}
        />
        Halo (outline for contrast)
      </label>
    </div>
  );
}
