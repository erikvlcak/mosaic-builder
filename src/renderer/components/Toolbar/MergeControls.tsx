interface Props {
  canMerge: boolean;
  canUnmerge: boolean;
  onMerge: () => void;
  onUnmerge: () => void;
}

export function MergeControls({
  canMerge,
  canUnmerge,
  onMerge,
  onUnmerge,
}: Props): JSX.Element {
  return (
    <div
      data-testid="merge-controls"
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        paddingLeft: 8,
        borderLeft: "1px solid #DDD",
      }}
    >
      <button
        type="button"
        onClick={onMerge}
        disabled={!canMerge}
        title="Merge selected cells (M)"
        data-testid="merge-button"
        style={{ padding: "4px 8px" }}
      >
        Merge
      </button>
      <button
        type="button"
        onClick={onUnmerge}
        disabled={!canUnmerge}
        title="Unmerge focused panel (U)"
        data-testid="unmerge-button"
        style={{ padding: "4px 8px" }}
      >
        Unmerge
      </button>
    </div>
  );
}
