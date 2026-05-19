import { useState } from "react";
import type { ImagePoolItem } from "../../model/pool";
import { Thumbnail } from "./Thumbnail";
import { DRAG_MIME, parseDrag, type DragPayload } from "../../dnd/drag-payload";

interface Props {
  pool: ImagePoolItem[];
  bitmaps: Map<string, ImageBitmap>;
  placedIds: Set<string>;
  onAddImagesClick: () => void;
  /** Called with the panelId when a placed-panel drag is dropped on the tray. */
  onUnplacePanel: (panelId: string) => void;
  /** Reports tray drag start/end so the drop-ghost layer can preview. */
  onDragSourceChange?: (src: DragPayload | null) => void;
}

export function Tray({
  pool,
  bitmaps,
  placedIds,
  onAddImagesClick,
  onUnplacePanel,
  onDragSourceChange,
}: Props): JSX.Element {
  const unplaced = pool.filter((p) => !placedIds.has(p.id));
  const placed = pool.filter((p) => placedIds.has(p.id));
  const [dropActive, setDropActive] = useState(false);

  function isPanelDrag(e: React.DragEvent<HTMLElement>): boolean {
    return e.dataTransfer.types.includes(DRAG_MIME);
  }

  function onDragOver(e: React.DragEvent<HTMLElement>): void {
    if (!isPanelDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dropActive) setDropActive(true);
  }
  function onDragLeave(e: React.DragEvent<HTMLElement>): void {
    // Only clear when leaving the aside itself, not when crossing children.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDropActive(false);
  }
  function onDrop(e: React.DragEvent<HTMLElement>): void {
    setDropActive(false);
    const raw = e.dataTransfer.getData(DRAG_MIME);
    const from = parseDrag(raw);
    if (from === null) return;
    if (from.kind !== "panel") return;
    e.preventDefault();
    onUnplacePanel(from.panelId);
  }

  return (
    <aside
      className="surface-sidebar"
      data-testid="tray"
      data-drop-active={dropActive ? "true" : undefined}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        width: 232,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflowY: "auto",
      }}
    >
      <button
        type="button"
        className="btn btn-primary"
        onClick={onAddImagesClick}
        data-testid="add-images"
        style={{
          width: "100%",
          padding: "7px 10px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          className="tray-add-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <path d="M2 11l3.5-3.5 3 3 2-2L14 11" />
          <circle cx="10.5" cy="6" r="1" fill="currentColor" stroke="none" />
        </svg>
        Add images…
      </button>

      <Section
        label="Unplaced"
        count={unplaced.length}
        hint="Drag onto a panel to place."
      />
      {unplaced.length === 0 ? (
        <Empty
          primary="No images yet"
          secondary="Click Add images… to import."
        />
      ) : (
        unplaced.map((it) => (
          <Thumbnail
            key={it.id}
            item={it}
            bitmap={bitmaps.get(it.id)}
            placed={false}
            {...(onDragSourceChange !== undefined
              ? { onDragSourceChange }
              : {})}
          />
        ))
      )}

      <Section label="Placed" count={placed.length} />
      {placed.length === 0 ? (
        <Empty primary="—" />
      ) : (
        placed.map((it) => (
          <Thumbnail
            key={it.id}
            item={it}
            bitmap={bitmaps.get(it.id)}
            placed
          />
        ))
      )}
    </aside>
  );
}

function Section({
  label,
  count,
  hint,
}: {
  label: string;
  count: number;
  hint?: string;
}): JSX.Element {
  return (
    <div style={{ marginTop: 4 }}>
      <div className="tray-section-row">
        <h2 className="section-heading">{label}</h2>
        <span className="tray-section-count">{count}</span>
      </div>
      {hint !== undefined && count > 0 && (
        <div style={{ fontSize: 11, color: "var(--c-text-faint)", marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function Empty({
  primary,
  secondary,
}: {
  primary: string;
  secondary?: string;
}): JSX.Element {
  return (
    <div
      style={{
        padding: "10px 8px",
        fontSize: 12,
        color: "var(--c-text-muted)",
        background: "var(--c-surface-muted)",
        border: "1px dashed var(--c-border)",
        borderRadius: "var(--r-md)",
        textAlign: "center",
      }}
    >
      <div>{primary}</div>
      {secondary !== undefined && (
        <div style={{ fontSize: 11, color: "var(--c-text-faint)", marginTop: 2 }}>
          {secondary}
        </div>
      )}
    </div>
  );
}
