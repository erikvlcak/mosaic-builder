import type { Dispatch } from "react";
import type { SymbolAnnotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import { updateAnnotation, removeAnnotation } from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { SYMBOL_LIBRARY_BY_ID } from "../../symbols/library";
import { NumberField } from "./inputs/NumberField";
import { SymbolGrid } from "./SymbolGrid";
import { SymbolStyleControls } from "./SymbolStyleControls";

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
  const def = SYMBOL_LIBRARY_BY_ID.get(anno.symbolId);
  const canFill = def?.geometry === "closed";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
          Symbol
        </div>
        <SymbolGrid
          value={anno.symbolId}
          currentColor={anno.color}
          currentStrokeWidthPx={anno.strokeWidthPx}
          currentFillMode={anno.fillMode}
          currentStrokeStyle={anno.strokeStyle}
          onChange={(symbolId) => patch({ symbolId }, true)}
        />
      </div>

      <SymbolStyleControls
        value={{
          fillMode: anno.fillMode,
          strokeStyle: anno.strokeStyle,
          strokeWidthPx: anno.strokeWidthPx,
          color: anno.color,
        }}
        canFill={canFill}
        onChange={(p) => patch(p)}
        onCommit={commit.flush}
      />

      <NumberField
        label="Size (px)"
        value={anno.sizePx}
        min={4}
        max={2000}
        onChange={(sizePx) => patch({ sizePx })}
        onBlur={commit.flush}
      />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
        <div style={{ flex: 1 }}>
          <NumberField
            label="Rotation (deg)"
            value={Math.round(anno.rotationDeg)}
            min={-360}
            max={720}
            onChange={(rotationDeg) => patch({ rotationDeg })}
            onBlur={commit.flush}
          />
        </div>
        <button
          type="button"
          className="btn"
          data-testid="symbol-rotate-reset"
          onClick={() => patch({ rotationDeg: 0 }, true)}
        >
          Reset
        </button>
      </div>
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
