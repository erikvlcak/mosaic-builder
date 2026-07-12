import type { ImagePoolItem } from "../../model/pool";
import { Thumbnail } from "./Thumbnail";
import type { DragPayload } from "../../dnd/drag-payload";

interface Props {
  pool: ImagePoolItem[];
  bitmaps: Map<string, ImageBitmap>;
  placedIds: Set<string>;
  onAddImagesClick: () => void;
  /** Reports tray drag start/end so the drop-ghost layer can preview. */
  onDragSourceChange?: (src: DragPayload | null) => void;
  /** Remove an unplaced image from the pool (hover × on its thumbnail). */
  onRemoveImage: (imageId: string) => void;
  /** Currently armed click-to-place image id (accent ring), if any. */
  selectedThumbId?: string | null;
  /** Arm/disarm an unplaced image for click-to-place. */
  onSelectThumb?: (imageId: string) => void;
  /** Enter on a focused unplaced thumbnail → place into the first empty panel. */
  onPlaceIntoFirstEmpty?: (imageId: string) => void;
}

export function Tray({
  pool,
  bitmaps,
  placedIds,
  onAddImagesClick,
  onDragSourceChange,
  onRemoveImage,
  selectedThumbId,
  onSelectThumb,
  onPlaceIntoFirstEmpty,
}: Props): JSX.Element {
  const unplaced = pool.filter((p) => !placedIds.has(p.id));
  const placed = pool.filter((p) => placedIds.has(p.id));

  return (
    <aside
      className="surface-sidebar"
      data-testid="tray"
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
        label="In tray"
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
            onRemove={onRemoveImage}
            selectedForPlace={selectedThumbId === it.id}
            {...(onSelectThumb !== undefined
              ? { onSelectForPlace: onSelectThumb }
              : {})}
            {...(onPlaceIntoFirstEmpty !== undefined
              ? { onPlaceIntoFirstEmpty }
              : {})}
            {...(onDragSourceChange !== undefined
              ? { onDragSourceChange }
              : {})}
          />
        ))
      )}

      <Section label="In figure" count={placed.length} />
      {placed.length === 0 ? (
        <Empty primary="—" />
      ) : (
        placed.map((it) => (
          <Thumbnail
            key={it.id}
            item={it}
            bitmap={bitmaps.get(it.id)}
            placed
            {...(onDragSourceChange !== undefined
              ? { onDragSourceChange }
              : {})}
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
        <div
          style={{ fontSize: 11, color: "var(--c-text-faint)", marginTop: 4 }}
        >
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
        <div
          style={{ fontSize: 11, color: "var(--c-text-faint)", marginTop: 2 }}
        >
          {secondary}
        </div>
      )}
    </div>
  );
}
