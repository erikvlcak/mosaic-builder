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

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#666",
  marginRight: 4,
};
const fieldStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
};

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
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: "0 8px",
        borderLeft: "1px solid #DDD",
      }}
    >
      <div style={fieldStyle}>
        <span style={labelStyle}>Rows</span>
        <input
          type="number"
          min={1}
          max={10}
          value={rows}
          onChange={(e) => onChangeRows(Number(e.target.value))}
          style={{ width: 48 }}
          data-testid="grid-rows-input"
        />
      </div>
      <div style={fieldStyle}>
        <span style={labelStyle}>Cols</span>
        <input
          type="number"
          min={1}
          max={10}
          value={cols}
          onChange={(e) => onChangeCols(Number(e.target.value))}
          style={{ width: 48 }}
          data-testid="grid-cols-input"
        />
      </div>
      <div style={fieldStyle}>
        <span style={labelStyle}>Gutter</span>
        <input
          type="number"
          min={0}
          max={40}
          value={gutterPx}
          onChange={(e) => onChangeGutterPx(Number(e.target.value))}
          style={{ width: 48 }}
          data-testid="gutter-px-input"
        />
        <span style={{ fontSize: 11, color: "#999" }}>px</span>
      </div>
      <div style={fieldStyle}>
        <span style={labelStyle}>Color</span>
        <input
          type="color"
          value={gutterColor.length === 7 ? gutterColor : "#FFFFFF"}
          onChange={(e) => onChangeGutterColor(e.target.value.toUpperCase())}
          style={{ width: 32, height: 22, border: "1px solid #DDD" }}
          data-testid="gutter-color-input"
        />
      </div>
    </div>
  );
}
