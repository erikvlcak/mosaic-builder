import { useId } from "react";

interface Option<V extends string> {
  value: V;
  label: string;
  /** Optional per-option native tooltip. */
  title?: string;
}
interface Props<V extends string> {
  label: string;
  value: V;
  options: ReadonlyArray<Option<V>>;
  onChange: (v: V) => void;
}

export function SelectField<V extends string>({
  label,
  value,
  options,
  onChange,
}: Props<V>): JSX.Element {
  const id = useId();
  return (
    <label htmlFor={id} className="field">
      <span className="field-label">{label}</span>
      <select
        id={id}
        aria-label={label}
        className="input"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value as V)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} title={o.title}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
