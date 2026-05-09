interface Props {
  rows: number;
  cols: number;
  gutterPx: number;
  gutterColor: string;
  outerGutter: boolean;
  onChangeRows: (rows: number) => void;
  onChangeCols: (cols: number) => void;
  onChangeGutterPx: (px: number) => void;
  onChangeGutterColor: (color: string) => void;
  onChangeOuterGutter: (outerGutter: boolean) => void;
  /**
   * Spec 11: which layout regime is active. The "Reset grid" button only
   * shows when free, since uniform layout already renders equal cells once
   * weights are equal.
   */
  layoutKind?: "uniform" | "free";
  /** Dispatched when the user clicks "Reset grid". */
  onResetUniform?: () => void;
}

export function GridControls({
  rows,
  cols,
  gutterPx,
  gutterColor,
  outerGutter,
  onChangeRows,
  onChangeCols,
  onChangeGutterPx,
  onChangeGutterColor,
  onChangeOuterGutter,
  layoutKind,
  onResetUniform,
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
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            color: "var(--c-text-muted)",
          }}
          title="When off, panels reach the canvas edge and the gutter only appears between them."
        >
          <input
            type="checkbox"
            checked={outerGutter}
            onChange={(e) => onChangeOuterGutter(e.target.checked)}
            data-testid="outer-gutter-toggle"
            aria-label="Outer gutter"
          />
          Outer gutter
        </label>
        {layoutKind === "free" && onResetUniform !== undefined && (
          <button
            type="button"
            className="btn-secondary"
            data-testid="reset-uniform-grid"
            onClick={onResetUniform}
            title="Restore equal-width columns and equal-height rows"
          >
            Reset grid
          </button>
        )}
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
