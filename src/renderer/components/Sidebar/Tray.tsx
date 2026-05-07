import type { ImagePoolItem } from "../../model/pool";
import { Thumbnail } from "./Thumbnail";

interface Props {
  pool: ImagePoolItem[];
  bitmaps: Map<string, ImageBitmap>;
  placedIds: Set<string>;
  onAddImagesClick: () => void;
}

export function Tray({
  pool,
  bitmaps,
  placedIds,
  onAddImagesClick,
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
        style={{ width: "100%", padding: "7px 10px" }}
      >
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
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <h2 className="section-heading">{label}</h2>
        <span style={{ fontSize: 11, color: "var(--c-text-faint)", fontVariantNumeric: "tabular-nums" }}>
          {count}
        </span>
      </div>
      {hint !== undefined && count > 0 && (
        <div style={{ fontSize: 11, color: "var(--c-text-faint)", marginTop: 2 }}>
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
