import { useMemo } from "react";
import type { Annotation } from "../../model/annotations";
import {
  setSelection,
  unionSelection,
} from "../../state/anno-selection";

/**
 * Per-kind overview shown in the empty-state Properties panel. Each row
 * lists how many annotations of that kind currently exist; the "Select all"
 * button replaces the selection with every id of that kind. Shift-clicking
 * the button unions with the existing selection instead of replacing.
 *
 * The "Letters" row is intentionally omitted: letter annotations are
 * derived (not user-creatable) until spec 08 lands. We can light up that
 * row once letters become first-class edit targets.
 */
interface Props {
  annotations: readonly Annotation[];
  /** Current selection — used by shift-click "select all" to union. */
  selectedAnnotationIds: ReadonlySet<string>;
  onSelectionChange: (next: ReadonlySet<string>) => void;
}

const VISIBLE_KINDS: Annotation["kind"][] = [
  "text",
  "symbol",
  "box",
  "scalebar",
];

const KIND_LABELS: Record<Annotation["kind"], string> = {
  text: "Text",
  symbol: "Symbols",
  box: "Boxes",
  scalebar: "Scale bars",
};

export function AnnotationOverview({
  annotations,
  selectedAnnotationIds,
  onSelectionChange,
}: Props): JSX.Element | null {
  const idsByKind = useMemo(() => {
    const m = new Map<Annotation["kind"], string[]>();
    for (const k of VISIBLE_KINDS) m.set(k, []);
    for (const a of annotations) {
      const list = m.get(a.kind);
      if (list !== undefined) list.push(a.id);
    }
    return m;
  }, [annotations]);

  const totalCount = useMemo(() => {
    let n = 0;
    for (const ids of idsByKind.values()) n += ids.length;
    return n;
  }, [idsByKind]);

  // No annotations to overview yet — render nothing so we don't leave a
  // skeletal section in the empty-state panel.
  if (totalCount === 0) return null;

  return (
    <section
      data-testid="annotation-overview"
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      <h3
        className="section-heading"
        style={{ fontSize: 12, marginBottom: 2 }}
      >
        Annotations
      </h3>
      {VISIBLE_KINDS.map((kind) => {
        const ids = idsByKind.get(kind) ?? [];
        if (ids.length === 0) return null;
        return (
          <div
            key={kind}
            data-testid={`anno-overview-row-${kind}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              fontSize: 12,
            }}
          >
            <span>
              {KIND_LABELS[kind]}{" "}
              <span style={{ color: "var(--c-text-faint)" }}>
                ({ids.length})
              </span>
            </span>
            <button
              type="button"
              className="btn"
              data-testid={`anno-overview-select-${kind}`}
              onClick={(e) => {
                onSelectionChange(
                  e.shiftKey
                    ? unionSelection(selectedAnnotationIds, ids)
                    : setSelection(ids),
                );
              }}
              style={{ padding: "2px 8px", fontSize: 11 }}
              title="Click to replace selection — shift-click to add to selection"
            >
              Select all
            </button>
          </div>
        );
      })}
    </section>
  );
}
