import { useMemo, useRef, useState } from "react";
import type { Dispatch } from "react";
import type {
  Annotation,
  TextAnnotation,
  SymbolAnnotation,
} from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import {
  bulkRemoveAnnos,
  bulkUpdateAnnos,
  updateAnnotation,
} from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { ColorField } from "./inputs/ColorField";
import { NumberField } from "./inputs/NumberField";

interface Props {
  /** The annotations represented by the current selection (size > 1 case). */
  selectedAnnos: Annotation[];
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
  /** Called after a destructive bulk action (e.g. Delete all) so the parent can
   *  clear its selection set — the reducer alone can't reach the UI state. */
  onBulkRemove: () => void;
}

/**
 * Pretty per-kind label used in the header summary.
 *  e.g. ["text", "symbol"] → "Text, Symbols"
 */
const KIND_LABELS: Record<
  Annotation["kind"],
  { singular: string; plural: string }
> = {
  text: { singular: "Text", plural: "Text" },
  symbol: { singular: "Symbol", plural: "Symbols" },
  scalebar: { singular: "Scale bar", plural: "Scale bars" },
};

/**
 * Read each anno's "size-ish" knob for the multiplicative size-scale field.
 * Mapping (per spec): text → sizePt, symbol → sizePx, scalebar → none
 * (semantic length, not a style scalar). Returns null when a kind has no
 * size-scale knob, so callers know to skip the dispatch.
 */
function readSize(a: Annotation): number | null {
  switch (a.kind) {
    case "text":
      return a.sizePt;
    case "symbol":
      return a.sizePx;
    case "scalebar":
      return null;
  }
}

/** Inverse of readSize — produce a single-anno UPDATE patch for the new size. */
function sizePatch(a: Annotation, next: number): Partial<Annotation> | null {
  switch (a.kind) {
    case "text":
      return { sizePt: next } satisfies Partial<TextAnnotation>;
    case "symbol":
      return { sizePx: next } satisfies Partial<SymbolAnnotation>;
    case "scalebar":
      return null;
  }
}

export function MultiAnnoForm({
  selectedAnnos,
  dispatch,
  commit,
  onBulkRemove,
}: Props): JSX.Element {
  // Distinct kinds, in declaration order, used for the header summary AND
  // for deciding which kind-specific controls to render.
  const kinds = useMemo(() => {
    const seen = new Set<Annotation["kind"]>();
    const out: Annotation["kind"][] = [];
    for (const a of selectedAnnos) {
      if (!seen.has(a.kind)) {
        seen.add(a.kind);
        out.push(a.kind);
      }
    }
    return out;
  }, [selectedAnnos]);
  const homogeneousKind = kinds.length === 1 ? kinds[0] : null;

  const ids = useMemo(() => selectedAnnos.map((a) => a.id), [selectedAnnos]);

  // Size-scale snapshot: capture each anno's starting size on mount. Also
  // refresh when the SET of selected ids changes (via the dep on `ids`).
  // The percentage applies multiplicatively against THIS snapshot, so the
  // user can drag back down to 100% to undo the visual change.
  const sizeSnapshotRef = useRef<Map<string, number>>(new Map());
  const lastIdsKeyRef = useRef<string>("");
  const idsKey = ids.join("|");
  if (idsKey !== lastIdsKeyRef.current) {
    const fresh = new Map<string, number>();
    for (const a of selectedAnnos) {
      const s = readSize(a);
      if (s !== null) fresh.set(a.id, s);
    }
    sizeSnapshotRef.current = fresh;
    lastIdsKeyRef.current = idsKey;
  }
  const [scalePercent, setScalePercent] = useState<number>(100);
  // When the selection set changes, reset the percent indicator. Keeping
  // useState's value through a selection change would mislead the user
  // since the snapshot just moved.
  const lastIdsKeyForPercentRef = useRef<string>(idsKey);
  if (lastIdsKeyForPercentRef.current !== idsKey) {
    lastIdsKeyForPercentRef.current = idsKey;
    if (scalePercent !== 100) setScalePercent(100);
  }

  function onColorChange(hex: string): void {
    // text and symbol both use `color`; scalebar uses globalStyle, so the
    // reducer drops the patch for scalebar annos.
    dispatch(
      bulkUpdateAnnos(ids, {
        color: hex,
      } as Partial<Annotation>),
    );
    commit.markDirty();
  }

  function onScaleChange(percent: number): void {
    setScalePercent(percent);
    const factor = percent / 100;
    // Per-anno UPDATE_ANNOTATION: each anno scales against ITS OWN snapshot.
    // BULK_UPDATE_ANNOS doesn't fit (it'd send the same size to every anno).
    for (const a of selectedAnnos) {
      const start = sizeSnapshotRef.current.get(a.id);
      if (start === undefined) continue;
      const next = Math.max(1, Math.round(start * factor));
      const patch = sizePatch(a, next);
      if (patch !== null) dispatch(updateAnnotation(a.id, patch));
    }
    commit.markDirty();
  }

  function onDeleteAll(): void {
    dispatch(bulkRemoveAnnos(ids));
    commit.flush();
    onBulkRemove();
  }

  // Kind-specific control values come from the FIRST homogeneous anno —
  // they're equally "the value" for any anno in the group, since changing
  // one bulk-updates all of them.
  const first = selectedAnnos[0];
  const kindLabel = (k: Annotation["kind"]): string => KIND_LABELS[k].plural;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        data-testid="multi-anno-summary"
        style={{
          fontSize: 12,
          color: "var(--c-text-muted)",
          background: "var(--c-surface-muted)",
          border: "1px solid var(--c-border)",
          borderRadius: "var(--r-md)",
          padding: "6px 8px",
        }}
      >
        {selectedAnnos.length} annotations selected — kinds:{" "}
        {kinds.map(kindLabel).join(", ")}
      </div>

      <ColorField
        label="Color"
        value={firstColor(selectedAnnos)}
        onChange={onColorChange}
        onBlur={commit.flush}
      />

      <NumberField
        label="Size scale (%)"
        value={scalePercent}
        min={10}
        max={400}
        step={5}
        onChange={onScaleChange}
        onBlur={commit.flush}
      />

      {/* Kind-specific section: only shown when every selected anno shares one kind. */}
      {homogeneousKind === "text" && first?.kind === "text" && (
        <TextOnlyControls
          anno={first}
          ids={ids}
          dispatch={dispatch}
          commit={commit}
        />
      )}
      {homogeneousKind === "symbol" && first?.kind === "symbol" && (
        <SymbolOnlyControls
          anno={first}
          ids={ids}
          dispatch={dispatch}
          commit={commit}
        />
      )}

      <button
        type="button"
        className="btn btn-danger"
        data-testid="multi-anno-delete-all"
        onClick={onDeleteAll}
        style={{ marginTop: 4 }}
      >
        Delete {ids.length} annotations
      </button>
    </div>
  );
}

/**
 * Pull the first defined color across the selection so the swatch isn't
 * stuck on black for a heterogeneous group. Falls back to "#000000" only
 * when no anno has a color at all (e.g. a scalebar-only selection, which
 * would already have hidden Color in a future iteration).
 */
function firstColor(annos: Annotation[]): string {
  for (const a of annos) {
    if (a.kind === "text" && a.color !== undefined) return a.color;
    if (a.kind === "symbol" && a.color !== undefined) return a.color;
  }
  return "#000000";
}

interface KindOnlyProps<A extends Annotation> {
  anno: A;
  ids: string[];
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

function TextOnlyControls({
  anno,
  ids,
  dispatch,
  commit,
}: KindOnlyProps<TextAnnotation>): JSX.Element {
  function patchAll(p: Partial<TextAnnotation>): void {
    dispatch(bulkUpdateAnnos(ids, p as Partial<Annotation>));
    commit.markDirty();
  }
  return (
    <>
      <label className="field">
        <span className="field-label">Font</span>
        <input
          type="text"
          className="input"
          aria-label="Font"
          value={anno.font}
          onChange={(e) => patchAll({ font: e.currentTarget.value })}
          onBlur={commit.flush}
        />
      </label>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className={`btn ${anno.bold ? "btn-primary" : ""}`}
          onClick={() => patchAll({ bold: !anno.bold })}
        >
          Bold
        </button>
        <button
          type="button"
          className={`btn ${anno.italic ? "btn-primary" : ""}`}
          onClick={() => patchAll({ italic: !anno.italic })}
        >
          Italic
        </button>
      </div>
    </>
  );
}

function SymbolOnlyControls({
  anno: _anno,
  ids: _ids,
  dispatch: _dispatch,
  commit: _commit,
}: KindOnlyProps<SymbolAnnotation>): JSX.Element {
  // The full symbol gallery lives in SymbolAnnoForm. Reusing it requires a
  // single-anno target; for multi-select we keep the section as a hint
  // pointing the user at the homogeneous case. (Future iteration could
  // hoist the gallery into a kind-aware control.)
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--c-text-faint)",
        padding: "4px 0",
      }}
    >
      All selected symbols share the same kind. Use the gallery (single-select a
      symbol) to change the icon.
    </div>
  );
}
