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
    <>
      <span className="toolbar-divider" aria-hidden="true" />
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
          Merge
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
      </div>
    </>
  );
}
