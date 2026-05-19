import type { Dispatch } from "react";
import type { ScaleBarAnnotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import { updateAnnotation, removeAnnotation } from "../../model/figure-actions";
import type { Corner } from "../../model/global-style";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { NumberField } from "./inputs/NumberField";
import { SelectField } from "./inputs/SelectField";
import { CornerField } from "./inputs/CornerField";

interface Props {
  anno: ScaleBarAnnotation;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

export function ScalebarAnnoForm({
  anno,
  dispatch,
  commit,
}: Props): JSX.Element {
  function patch(p: Partial<ScaleBarAnnotation>, immediate = false): void {
    dispatch(updateAnnotation(anno.id, p));
    if (immediate) commit.flush();
    else commit.markDirty();
  }
  const corner: Corner = anno.cornerOverride ?? "br";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <NumberField
        label="Length"
        value={anno.lengthValue}
        min={0.001}
        step={1}
        onChange={(lengthValue) => patch({ lengthValue })}
        onBlur={commit.flush}
      />
      <SelectField
        label="Unit"
        value={anno.lengthUnit}
        options={
          [
            { value: "um", label: "µm" },
            { value: "mm", label: "mm" },
            { value: "px", label: "px" },
          ] as const
        }
        onChange={(lengthUnit) => patch({ lengthUnit }, true)}
      />
      <CornerField
        label="Corner"
        value={corner}
        onChange={(c) => patch({ cornerOverride: c }, true)}
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
