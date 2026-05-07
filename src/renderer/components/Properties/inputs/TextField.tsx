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
    className: "input",
    style: { width: "100%", resize: "vertical" as const },
  };
  return (
    <label htmlFor={id} className="field">
      <span className="field-label">{label}</span>
      {multiline === true
        ? <textarea {...common} rows={3} />
        : <input type="text" {...common} />}
    </label>
  );
}
