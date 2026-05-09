import type { Dispatch } from "react";
import type { SymbolAnnotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import { updateAnnotation, removeAnnotation } from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import {
  SYMBOL_LIBRARY,
  SYMBOL_LIBRARY_BY_ID,
  SYMBOL_CATEGORIES,
} from "../../symbols/library";
import { ColorField } from "./inputs/ColorField";
import { NumberField } from "./inputs/NumberField";

interface Props {
  anno: SymbolAnnotation;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

export function SymbolAnnoForm({ anno, dispatch, commit }: Props): JSX.Element {
  function patch(p: Partial<SymbolAnnotation>, immediate = false): void {
    dispatch(updateAnnotation(anno.id, p));
    if (immediate) commit.flush();
    else commit.markDirty();
  }
  // The library distinguishes fill vs stroke symbols; stroke width only
  // affects the latter so we disable the field for filled ones to surface
  // that constraint in the UI.
  const def = SYMBOL_LIBRARY_BY_ID.get(anno.symbolId);
  const isFilled = def?.fill === true;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Symbol</div>
        <div className="symbol-gallery" role="group" aria-label="Symbol">
          {SYMBOL_CATEGORIES.map((cat) => (
            <div
              key={cat}
              className="symbol-gallery-group"
              data-testid={`symbol-gallery-group-${cat}`}
            >
              <div className="symbol-gallery-label">{cat}</div>
              <div className="symbol-gallery-row">
                {SYMBOL_LIBRARY.filter((s) => s.category === cat).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title={s.label}
                    aria-label={s.label}
                    data-testid={`symbol-gallery-cell-${s.id}`}
                    aria-pressed={s.id === anno.symbolId}
                    className={
                      "symbol-gallery-cell" +
                      (s.id === anno.symbolId ? " is-active" : "")
                    }
                    onClick={() => { patch({ symbolId: s.id }, true); }}
                  >
                    <svg viewBox="0 0 100 100" width={24} height={24}>
                      <path
                        d={s.pathD}
                        fill={s.fill ? "currentColor" : "none"}
                        {...(s.fill
                          ? ({ stroke: "none" } as const)
                          : ({
                              stroke: "currentColor",
                              strokeWidth: 6,
                              strokeLinecap: "round",
                              strokeLinejoin: "round",
                            } as const))}
                      />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ColorField
        label="Color"
        value={anno.color}
        onChange={(color) => { patch({ color }); }}
        onBlur={commit.flush}
      />
      <NumberField
        label="Size (px)"
        value={anno.sizePx}
        min={4}
        max={2000}
        onChange={(sizePx) => { patch({ sizePx }); }}
        onBlur={commit.flush}
      />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
        <div style={{ flex: 1 }}>
          <NumberField
            label="Rotation (deg)"
            value={Math.round(anno.rotationDeg)}
            min={-360}
            max={720}
            onChange={(rotationDeg) => { patch({ rotationDeg }); }}
            onBlur={commit.flush}
          />
        </div>
        <button
          type="button"
          className="btn"
          data-testid="symbol-rotate-reset"
          onClick={() => { patch({ rotationDeg: 0 }, true); }}
        >
          Reset
        </button>
      </div>
      <NumberField
        label="Stroke width (px)"
        value={anno.strokeWidthPx}
        min={0}
        max={32}
        disabled={isFilled}
        data-testid="symbol-stroke-width"
        onChange={(strokeWidthPx) => { patch({ strokeWidthPx }); }}
        onBlur={commit.flush}
      />
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => {
          dispatch(removeAnnotation(anno.id));
          commit.flush();
        }}
        style={{ marginTop: 4 }}
      >
        Delete annotation
      </button>
    </div>
  );
}
