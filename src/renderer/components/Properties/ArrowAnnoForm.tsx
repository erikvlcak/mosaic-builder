import type { Dispatch } from "react";
import type { ArrowAnnotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import { updateAnnotation, removeAnnotation } from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { ColorField } from "./inputs/ColorField";
import { NumberField } from "./inputs/NumberField";
import { SelectField } from "./inputs/SelectField";

interface Props {
  anno: ArrowAnnotation;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

export function ArrowAnnoForm({ anno, dispatch, commit }: Props): JSX.Element {
  function patch(p: Partial<ArrowAnnotation>, immediate = false): void {
    dispatch(updateAnnotation(anno.id, p));
    if (immediate) commit.flush();
    else commit.markDirty();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ColorField label="Color" value={anno.color}
        onChange={(color) => patch({ color })} onBlur={commit.flush} />
      <NumberField label="Thickness (px)" value={anno.thicknessPx} min={1} max={32}
        onChange={(thicknessPx) => patch({ thicknessPx })}
        onBlur={commit.flush} />
      <SelectField label="Arrowhead"
        value={anno.head}
        options={[
          { value: "none",   label: "None" },
          { value: "open",   label: "Open" },
          { value: "filled", label: "Filled" },
        ] as const}
        onChange={(head) => patch({ head }, true)} />
      <button type="button" className="btn btn-danger"
        onClick={() => { dispatch(removeAnnotation(anno.id)); commit.flush(); }}
        style={{ marginTop: 4 }}>
        Delete annotation
      </button>
    </div>
  );
}
