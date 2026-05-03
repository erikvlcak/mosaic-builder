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
    <div style={{ display: "flex", flexDirection: "column", fontSize: 11, gap: 2 }}>
      <span style={{ color: "#555" }}>{label}</span>
      <div role="group" aria-label={label} style={{ display: "flex" }}>
        {CORNERS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-label={c.title}
            aria-pressed={value === c.id}
            title={c.title}
            onClick={() => onChange(c.id)}
            style={{
              padding: "4px 8px",
              border: "1px solid #BBB",
              background: value === c.id ? "#0066FF" : "#FFF",
              color: value === c.id ? "#FFF" : "#222",
              cursor: "pointer", fontSize: 12,
            }}
          >
            {c.symbol}
          </button>
        ))}
      </div>
    </div>
  );
}
