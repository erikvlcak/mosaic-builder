import { useId } from "react";

interface Props {
  label: string;
  value: string; // "#RRGGBB" or "#RRGGBBAA"
  onChange: (hex: string) => void;
  onBlur?: () => void;
  allowAlpha?: boolean;
}

const HEX6 = /^#[0-9A-Fa-f]{6}$/;
const HEX8 = /^#[0-9A-Fa-f]{8}$/;

function isValidHex(s: string, allowAlpha: boolean): boolean {
  return HEX6.test(s) || (allowAlpha && HEX8.test(s));
}

/**
 * Native color picker swatch + hex text input. The text input ONLY emits
 * `onChange` when the value is a complete valid `#RRGGBB` (or `#RRGGBBAA`
 * if `allowAlpha`). Partial / invalid intermediate strings are silently
 * dropped — the swatch is the primary picker; the text field is a
 * "paste a hex" affordance, not a free-form editor.
 */
export function ColorField({
  label,
  value,
  onChange,
  onBlur,
  allowAlpha = false,
}: Props): JSX.Element {
  const id = useId();
  // The native picker only emits 6-digit hex; the text input handles 8-digit if allowed.
  const swatch = value.length >= 7 ? value.slice(0, 7) : "#000000";
  return (
    <label htmlFor={id} className="field">
      <span className="field-label">{label}</span>
      <span style={{ display: "flex", gap: 6 }}>
        <input
          id={id}
          aria-label={label}
          type="color"
          className="input-color"
          value={swatch}
          onChange={(e) => onChange(e.currentTarget.value)}
          onBlur={onBlur}
        />
        <input
          type="text"
          aria-label={`${label} hex`}
          className="input"
          value={value}
          spellCheck={false}
          onChange={(e) => {
            const v = e.currentTarget.value;
            if (isValidHex(v, allowAlpha)) onChange(v);
          }}
          onBlur={onBlur}
          style={{ flex: 1, fontVariantNumeric: "tabular-nums" }}
        />
      </span>
    </label>
  );
}
