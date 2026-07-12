/**
 * Toolbar exposing the annotation tool selector. The figure-wide "panel
 * letters" visibility toggle lives in the Grid group (it's a figure-wide
 * visibility control, not a placement tool).
 */

export type Tool = "select" | "text" | "symbol" | "scalebar";

interface Props {
  active: Tool;
  onChange: (t: Tool) => void;
}

const TOOLS: ReadonlyArray<{ id: Tool; label: string; title: string }> = [
  { id: "select", label: "Select", title: "Select and move annotations" },
  { id: "text", label: "Text", title: "Add text — click to place" },
  {
    id: "symbol",
    label: "Symbol",
    title: "Pick a symbol — click canvas to place",
  },
  { id: "scalebar", label: "Scale", title: "Add scale bar — click a panel" },
];

export function AnnotationToolbar({ active, onChange }: Props): JSX.Element {
  return (
    <div
      data-testid="annotation-toolbar"
      style={{ display: "flex", gap: 8, alignItems: "center" }}
    >
      <div className="seg" role="group" aria-label="Annotation tool">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="btn"
            onClick={() => onChange(t.id)}
            aria-pressed={active === t.id}
            data-testid={`anno-tool-${t.id}`}
            title={t.title}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
