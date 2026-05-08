interface Props {
  rows: number;
  cols: number;
  gutterPx: number;
  gutterColor: string;
  onChangeRows: (rows: number) => void;
  onChangeCols: (cols: number) => void;
  onChangeGutterPx: (px: number) => void;
  onChangeGutterColor: (color: string) => void;
}

export function GridControls({
  rows,
  cols,
  gutterPx,
  gutterColor,
  onChangeRows,
  onChangeCols,
  onChangeGutterPx,
  onChangeGutterColor,
}: Props): JSX.Element {
  return (
    <div
      data-testid="grid-controls"
      style={{ display: "flex", gap: 10, alignItems: "center" }}
    >
        <Field label="Rows">
          <input
            type="number"
            className="input input-num"
            min={1}
            max={10}
            value={rows}
            onChange={(e) => onChangeRows(Number(e.target.value))}
            data-testid="grid-rows-input"
            aria-label="Rows"
          />
        </Field>
        <Field label="Cols">
          <input
            type="number"
            className="input input-num"
            min={1}
            max={10}
            value={cols}
            onChange={(e) => onChangeCols(Number(e.target.value))}
            data-testid="grid-cols-input"
            aria-label="Columns"
          />
        </Field>
        <Field label="Gutter">
          <input
            type="number"
            className="input input-num"
            min={0}
            max={40}
            value={gutterPx}
            onChange={(e) => onChangeGutterPx(Number(e.target.value))}
            data-testid="gutter-px-input"
            aria-label="Gutter (pixels)"
          />
          <span style={{ fontSize: 11, color: "var(--c-text-faint)" }}>px</span>
        </Field>
        <Field label="Color">
          <input
            type="color"
            className="input-color"
            value={gutterColor.length === 7 ? gutterColor : "#FFFFFF"}
            onChange={(e) => onChangeGutterColor(e.target.value.toUpperCase())}
            data-testid="gutter-color-input"
            aria-label="Gutter color"
          />
        </Field>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--c-text-muted)",
          letterSpacing: "0.01em",
        }}
      >
        {label}
      </span>
      {children}
    </span>
  );
}
