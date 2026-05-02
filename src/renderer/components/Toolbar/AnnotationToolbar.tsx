/**
 * Toolbar exposing the annotation tool selector + the global "letters"
 * visibility toggle. Active-tool state lives in App.tsx; this component
 * is purely presentational.
 *
 * Styling mirrors PanelControls: a leading vertical separator, then a
 * 5-button segmented control (active = blue), then the checkbox.
 */

export type Tool = "select" | "text" | "arrow" | "box" | "scalebar";

interface Props {
  active: Tool;
  onChange: (t: Tool) => void;
  lettersEnabled: boolean;
  onToggleLetters: () => void;
}

const groupStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  paddingLeft: 8,
  borderLeft: "1px solid #DDD",
};

const segStyle = (active: boolean): React.CSSProperties => ({
  padding: "4px 8px",
  borderRadius: 0,
  border: "1px solid #BBB",
  background: active ? "#0066FF" : "#FFF",
  color: active ? "#FFF" : "#222",
  cursor: "pointer",
  fontSize: 12,
});

const TOOLS: ReadonlyArray<{ id: Tool; label: string; title: string }> = [
  { id: "select", label: "Select", title: "Select / move annotations" },
  { id: "text", label: "Text", title: "Add text" },
  { id: "arrow", label: "Arrow", title: "Add arrow (drag)" },
  { id: "box", label: "Box", title: "Add box (drag)" },
  { id: "scalebar", label: "Scale", title: "Add scale bar (click panel)" },
];

export function AnnotationToolbar({
  active,
  onChange,
  lettersEnabled,
  onToggleLetters,
}: Props): JSX.Element {
  return (
    <div data-testid="annotation-toolbar" style={groupStyle}>
      <div role="group" aria-label="Annotation tool" style={{ display: "flex" }}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={segStyle(active === t.id)}
            data-testid={`anno-tool-${t.id}`}
            title={t.title}
          >
            {t.label}
          </button>
        ))}
      </div>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 12,
          cursor: "pointer",
          userSelect: "none",
        }}
        title="Show / hide derived per-panel letter labels"
      >
        <input
          type="checkbox"
          checked={lettersEnabled}
          onChange={onToggleLetters}
          data-testid="anno-letters-toggle"
        />
        Letters
      </label>
    </div>
  );
}
