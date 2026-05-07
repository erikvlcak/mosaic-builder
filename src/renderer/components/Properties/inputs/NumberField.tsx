import { useId } from "react";

interface Props {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (n: number) => void;
  onBlur?: () => void;
}

export function NumberField({
  label, value, min, max, step = 1, onChange, onBlur,
}: Props): JSX.Element {
  const id = useId();
  return (
    <label htmlFor={id} className="field">
      <span className="field-label">{label}</span>
      <input
        id={id}
        aria-label={label}
        type="number"
        className="input"
        value={value}
        step={step}
        // EOPT (exactOptionalPropertyTypes) requires conditional spread for optional DOM attrs;
        // passing min={undefined} is a type error even though the DOM accepts it.
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        onChange={(e) => {
          const raw = e.currentTarget.value;
          if (raw === "") return;
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          let clamped = n;
          if (min !== undefined && clamped < min) clamped = min;
          if (max !== undefined && clamped > max) clamped = max;
          onChange(clamped);
        }}
        onBlur={onBlur}
      />
    </label>
  );
}
