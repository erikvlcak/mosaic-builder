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

const toggleBtn = (active: boolean): React.CSSProperties => ({
  padding: "4px 8px",
  border: "1px solid #BBB",
  background: active ? "#0066FF" : "#FFF",
  color: active ? "#FFF" : "#222",
  cursor: "pointer",
  fontSize: 12,
});

export function TextAnnoForm({ anno, dispatch, commit }: Props): JSX.Element {
  function patch(p: Partial<TextAnnotation>, immediate = false): void {
    dispatch(updateAnnotation(anno.id, p));
    if (immediate) commit.flush();
    else commit.markDirty();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <TextField
        label="Text"
        value={anno.text}
        multiline
        onChange={(text) => patch({ text })}
        onBlur={commit.flush}
      />
      <label
        style={{ display: "flex", flexDirection: "column", fontSize: 11, gap: 2 }}
      >
        <span style={{ color: "#555" }}>Font</span>
        <select
          aria-label="Font"
          value={anno.font}
          onChange={(e) => patch({ font: e.currentTarget.value }, true)}
          style={{ padding: 4, border: "1px solid #BBB", fontSize: 12 }}
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
      <div style={{ display: "flex", gap: 4 }}>
        <button
          type="button"
          aria-label="Bold"
          aria-pressed={anno.bold}
          title="Bold"
          onClick={() => patch({ bold: !anno.bold }, true)}
          style={toggleBtn(anno.bold)}
        >
          B
        </button>
        <button
          type="button"
          aria-label="Italic"
          aria-pressed={anno.italic}
          title="Italic"
          onClick={() => patch({ italic: !anno.italic }, true)}
          style={{ ...toggleBtn(anno.italic), fontStyle: "italic" }}
        >
          I
        </button>
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
          if (bgColor.toLowerCase() === "#ffffff00") {
            // Skip dispatching transparent — keeps bgColor undefined in the model
            // so we don't bloat saves with redundant data.
            return;
          }
          patch({ bgColor });
        }}
        onBlur={commit.flush}
        allowAlpha
      />
      <button
        type="button"
        onClick={() => {
          dispatch(removeAnnotation(anno.id));
          commit.flush();
        }}
        style={{
          padding: "4px 8px",
          border: "1px solid #BBB",
          background: "#FFF",
          cursor: "pointer",
          fontSize: 12,
          color: "#A00",
        }}
      >
        Delete annotation
      </button>
    </div>
  );
}
