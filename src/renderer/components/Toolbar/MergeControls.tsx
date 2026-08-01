interface Props {
  canMerge: boolean;
  canUnmerge: boolean;
  /** Number of shift-selected cells; drives the count badge + inline hint. */
  selectedCount: number;
  onMerge: () => void;
  onUnmerge: () => void;
}

export function MergeControls({
  canMerge,
  canUnmerge,
  selectedCount,
  onMerge,
  onUnmerge,
}: Props): JSX.Element {
  // Only the CORRECTIVE hint lives here. Teaching the shift-click convention
  // is the hint bar's job ("Shift-click cells to merge" whenever a panel is
  // selected), and duplicating it inline reserved ~150px of ribbon on every
  // frame for advice that applies before the first merge only. What the hint
  // bar cannot know is why a specific selection is rejected, so that stays.
  const hint =
    selectedCount > 0 && !canMerge
      ? "select adjacent cells forming a rectangle"
      : null;

  const mergeLabel = selectedCount >= 2 ? `Merge (${selectedCount})` : "Merge";

  return (
    <div
      data-testid="merge-controls"
      style={{ display: "flex", gap: 6, alignItems: "center" }}
    >
      <button
        type="button"
        className="btn"
        onClick={onMerge}
        disabled={!canMerge}
        title="Merge selected cells (M)"
        data-testid="merge-button"
      >
        {mergeLabel}
      </button>
      <button
        type="button"
        className="btn"
        onClick={onUnmerge}
        disabled={!canUnmerge}
        title="Unmerge focused panel (U)"
        data-testid="unmerge-button"
      >
        Unmerge
      </button>
      {hint !== null && (
        <span
          data-testid="merge-hint"
          style={{
            fontSize: 11,
            color: "var(--c-text-faint)",
            whiteSpace: "nowrap",
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}
