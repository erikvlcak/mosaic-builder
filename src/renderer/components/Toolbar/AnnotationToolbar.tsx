/**
 * Toolbar exposing the annotation tool selector + the global "letters"
 * visibility toggle.
 */

export type Tool = "select" | "text" | "arrow" | "box" | "scalebar";

interface Props {
  active: Tool;
  onChange: (t: Tool) => void;
  lettersEnabled: boolean;
  onToggleLetters: () => void;
}

const TOOLS: ReadonlyArray<{ id: Tool; label: string; title: string }> = [
  { id: "select", label: "Select", title: "Select and move annotations" },
  { id: "text", label: "Text", title: "Add text — click to place" },
  { id: "arrow", label: "Arrow", title: "Add arrow — drag to draw" },
  { id: "box", label: "Box", title: "Add box — drag to draw" },
  { id: "scalebar", label: "Scale", title: "Add scale bar — click a panel" },
];

export function AnnotationToolbar({
  active,
  onChange,
  lettersEnabled,
  onToggleLetters,
}: Props): JSX.Element {
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
        <label
          className="checkbox-row"
          title="Show or hide auto-generated per-panel letter labels (A, B, C…)"
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
