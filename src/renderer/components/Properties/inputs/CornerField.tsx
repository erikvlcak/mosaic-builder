import type { Corner } from "../../../model/global-style";

interface Props {
  label: string;
  value: Corner;
  onChange: (c: Corner) => void;
}

const CORNERS: ReadonlyArray<{ id: Corner; symbol: string; title: string }> = [
  { id: "tl", symbol: "↖", title: "Top-left" },
  { id: "tr", symbol: "↗", title: "Top-right" },
  { id: "bl", symbol: "↙", title: "Bottom-left" },
  { id: "br", symbol: "↘", title: "Bottom-right" },
];

export function CornerField({ label, value, onChange }: Props): JSX.Element {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {CORNERS.map((c) => (
          <button
            key={c.id}
            type="button"
            className="btn btn-icon"
            aria-label={c.title}
            aria-pressed={value === c.id}
            title={c.title}
            onClick={() => onChange(c.id)}
            style={{ minWidth: 36, justifyContent: "center" }}
          >
            {c.symbol}
          </button>
        ))}
      </div>
    </div>
  );
}
