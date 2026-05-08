interface Props {
  hidden: boolean;
  onToggleHidden: () => void;
  onDelete: () => void;
}

export function EmptyPanelForm({
  hidden,
  onToggleHidden,
  onDelete,
}: Props): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="field">
        <span className="field-label">Empty panel</span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            aria-pressed={hidden}
            onClick={onToggleHidden}
            title="Render this cell empty in exports"
          >
            {hidden ? "Show" : "Hide"}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onDelete}
            title="Remove this panel; click the gap to add it back"
          >
            Delete
          </button>
        </div>
      </div>
      <p
        style={{
          margin: 0,
          padding: "8px 10px",
          background: "var(--c-surface-muted)",
          borderRadius: "var(--r-md)",
          fontSize: 11,
          color: "var(--c-text-muted)",
          lineHeight: 1.4,
        }}
      >
        Hidden panels render as empty in exports. Delete removes the
        panel; click the gap to add it back.
      </p>
    </div>
  );
}
