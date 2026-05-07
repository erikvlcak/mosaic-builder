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
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
            return;
          }
          if (isTransparent) {
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
      <button type="button" className="btn btn-danger"
        onClick={() => { dispatch(removeAnnotation(anno.id)); commit.flush(); }}
        style={{ marginTop: 4 }}>
        Delete annotation
      </button>
    </div>
  );
}
