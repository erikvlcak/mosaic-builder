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
      data-testid="tray"
      style={{
        width: 220,
        borderRight: "1px solid #DDD",
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        overflowY: "auto",
      }}
    >
      <button
        type="button"
        onClick={onAddImagesClick}
        data-testid="add-images"
        style={{ padding: "6px 10px" }}
      >
        Add images…
      </button>
      <SectionLabel text="Unplaced" />
      {unplaced.length === 0 ? (
        <Empty text="No images yet. Click Add images…" />
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
      <SectionLabel text="Placed" />
      {placed.length === 0 ? (
        <Empty text="—" />
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

function SectionLabel({ text }: { text: string }): JSX.Element {
  return (
    <div
      style={{
        fontSize: 11,
        textTransform: "uppercase",
        color: "#888",
        marginTop: 6,
      }}
    >
      {text}
    </div>
  );
}

function Empty({ text }: { text: string }): JSX.Element {
  return <div style={{ fontSize: 12, color: "#AAA" }}>{text}</div>;
}
