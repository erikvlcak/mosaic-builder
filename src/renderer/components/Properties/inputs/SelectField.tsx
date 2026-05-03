import { useId } from "react";

interface Option<V extends string> { value: V; label: string; }
interface Props<V extends string> {
  label: string;
  value: V;
  options: ReadonlyArray<Option<V>>;
  onChange: (v: V) => void;
}

export function SelectField<V extends string>({
  label, value, options, onChange,
}: Props<V>): JSX.Element {
  const id = useId();
  return (
    <label
      htmlFor={id}
      style={{ display: "flex", flexDirection: "column", fontSize: 11, gap: 2 }}
    >
      <span style={{ color: "#555" }}>{label}</span>
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value as V)}
        style={{ padding: 4, border: "1px solid #BBB", fontSize: 12 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
