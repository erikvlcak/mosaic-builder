import type { Dispatch } from "react";
import type { BoxAnnotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import { updateAnnotation, removeAnnotation } from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { ColorField } from "./inputs/ColorField";
import { NumberField } from "./inputs/NumberField";

interface Props {
  anno: BoxAnnotation;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

export function BoxAnnoForm({ anno, dispatch, commit }: Props): JSX.Element {
  function patch(p: Partial<BoxAnnotation>, immediate = false): void {
    dispatch(updateAnnotation(anno.id, p));
    if (immediate) commit.flush();
    else commit.markDirty();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <ColorField label="Stroke" value={anno.stroke}
        onChange={(stroke) => patch({ stroke })} onBlur={commit.flush} />
      <NumberField label="Stroke width (px)"
        value={anno.strokeWidthPx} min={0} max={32}
        onChange={(strokeWidthPx) => patch({ strokeWidthPx })}
        onBlur={commit.flush} />
      <ColorField label="Fill" value={anno.fill ?? "#00000000"}
        onChange={(fill) => {
          const isTransparent = fill.toLowerCase() === "#00000000";
          if (isTransparent && anno.fill === undefined) {
            // No-op: field is already unset; don't pollute the model.
            return;
          }
          if (isTransparent) {
            // Explicit clear: user wants to remove a previously-set fill.
            // EOPT prevents { fill: undefined } from typing as
            // Partial<BoxAnnotation>; cast at the dispatch boundary
            // since the reducer just spreads the patch.
            const p = { fill: undefined } as unknown as Partial<BoxAnnotation>;
            dispatch(updateAnnotation(anno.id, p));
            commit.markDirty();
            return;
          }
          patch({ fill });
        }}
        onBlur={commit.flush}
        allowAlpha />
      <button type="button"
        onClick={() => { dispatch(removeAnnotation(anno.id)); commit.flush(); }}
        style={{ padding: "4px 8px", border: "1px solid #BBB",
                 background: "#FFF", cursor: "pointer",
                 fontSize: 12, color: "#A00" }}>
        Delete annotation
      </button>
    </div>
  );
}
