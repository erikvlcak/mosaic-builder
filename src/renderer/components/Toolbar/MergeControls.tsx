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
  // The merge convention (shift-click cells, then Merge) is invisible without
  // a prompt. Show a muted inline hint that adapts to how far along the user
  // is: no selection → how to start; a partial/invalid selection → what makes
  // it mergeable. Once mergeable, the enabled button speaks for itself.
  const hint =
    selectedCount === 0
      ? "⇧-click cells to select"
      : !canMerge
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
