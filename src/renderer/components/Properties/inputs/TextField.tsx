import { useId } from "react";

interface Props {
  label: string;
  value: string;
  onChange: (s: string) => void;
  onBlur?: () => void;
  multiline?: boolean;
  placeholder?: string;
}

export function TextField({
  label, value, onChange, onBlur, multiline, placeholder,
}: Props): JSX.Element {
  const id = useId();
  const common = {
    id,
    "aria-label": label,
    value,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(e.currentTarget.value),
    onBlur,
    placeholder,
    style: { padding: 4, border: "1px solid #BBB", fontSize: 12, width: "100%" },
  };
  return (
    <label
      htmlFor={id}
      style={{ display: "flex", flexDirection: "column", fontSize: 11, gap: 2 }}
    >
      <span style={{ color: "#555" }}>{label}</span>
      {multiline === true
        ? <textarea {...common} rows={3} />
        : <input type="text" {...common} />}
    </label>
  );
}
