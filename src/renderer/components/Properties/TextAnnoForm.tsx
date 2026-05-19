import type { Dispatch } from "react";
import type { TextAnnotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import { updateAnnotation, removeAnnotation } from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { TextField } from "./inputs/TextField";
import { NumberField } from "./inputs/NumberField";
import { ColorField } from "./inputs/ColorField";

interface Props {
  anno: TextAnnotation;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

const FONT_OPTIONS = [
  "Arial, Helvetica, sans-serif",
  "Helvetica, Arial, sans-serif",
  "Times New Roman, serif",
  "Georgia, serif",
  "Courier New, monospace",
];

export function TextAnnoForm({ anno, dispatch, commit }: Props): JSX.Element {
  function patch(p: Partial<TextAnnotation>, immediate = false): void {
    dispatch(updateAnnotation(anno.id, p));
    if (immediate) commit.flush();
    else commit.markDirty();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <TextField
        label="Text"
        value={anno.text}
        multiline
        onChange={(text) => patch({ text })}
        onBlur={commit.flush}
      />
      <label htmlFor="text-anno-font" className="field">
        <span className="field-label">Font</span>
        <select
          id="text-anno-font"
          aria-label="Font"
          className="input"
          value={anno.font}
          onChange={(e) => patch({ font: e.currentTarget.value }, true)}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f.split(",")[0]}
            </option>
          ))}
        </select>
      </label>
      <NumberField
        label="Size (pt)"
        value={anno.sizePt}
        min={4}
        max={144}
        onChange={(sizePt) => patch({ sizePt })}
        onBlur={commit.flush}
      />
      <div className="field">
        <span className="field-label">Style</span>
        <div className="seg" role="group" aria-label="Text style">
          <button
            type="button"
            className="btn"
            aria-label="Bold"
            aria-pressed={anno.bold}
            title="Bold"
            onClick={() => patch({ bold: !anno.bold }, true)}
            style={{ fontWeight: 700, minWidth: 32 }}
          >
            B
          </button>
          <button
            type="button"
            className="btn"
            aria-label="Italic"
            aria-pressed={anno.italic}
            title="Italic"
            onClick={() => patch({ italic: !anno.italic }, true)}
            style={{ fontStyle: "italic", minWidth: 32 }}
          >
            I
          </button>
        </div>
      </div>
      <ColorField
        label="Color"
        value={anno.color}
        onChange={(color) => patch({ color })}
        onBlur={commit.flush}
      />
      <ColorField
        label="Background"
        value={anno.bgColor ?? "#FFFFFF00"}
        onChange={(bgColor) => {
          const isTransparent = bgColor.toLowerCase() === "#ffffff00";
          if (isTransparent && anno.bgColor === undefined) {
            return;
          }
          if (isTransparent) {
            // EOPT prevents { bgColor: undefined } from typing as
            // Partial<TextAnnotation>; cast at the dispatch boundary
            // since the reducer just spreads the patch.
            const p = {
              bgColor: undefined,
            } as unknown as Partial<TextAnnotation>;
            dispatch(updateAnnotation(anno.id, p));
            commit.markDirty();
            return;
          }
          patch({ bgColor });
        }}
        onBlur={commit.flush}
        allowAlpha
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
