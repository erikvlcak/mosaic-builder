import type { Dispatch } from "react";
import type { Panel, PanelTransform } from "../../model/panels";
import type { FigureAction } from "../../model/figure-actions";
import {
  setPanelFit, rotatePanel90, flipPanelH, flipPanelV,
  resetPanelTransform, setLetterOverride,
} from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { SelectField } from "./inputs/SelectField";
import { TextField } from "./inputs/TextField";

interface Props {
  /** Only image-bearing panels are accepted; transform must be present. */
  panel: Panel & { transform: PanelTransform };
  letterOverride: string | undefined;
  dispatch: Dispatch<FigureAction>;
  onCalibrate: () => void;
  commit: FieldCommit;
}

const btn: React.CSSProperties = {
  padding: "4px 8px", border: "1px solid #BBB", background: "#FFF",
  cursor: "pointer", fontSize: 12,
};

export function PanelPropertiesForm({
  panel, letterOverride, dispatch, onCalibrate, commit,
}: Props): JSX.Element {
  const t = panel.transform;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <SelectField label="Fit"
        value={t.fit}
        options={[
          { value: "contain", label: "Contain" },
          { value: "cover",   label: "Cover" },
          { value: "stretch", label: "Stretch" },
        ] as const}
        onChange={(fit) => { dispatch(setPanelFit(panel.id, fit)); commit.flush(); }} />

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button type="button" style={btn}
          onClick={() => { dispatch(rotatePanel90(panel.id)); commit.flush(); }}>
          Rotate 90°
        </button>
        <button type="button" style={btn} aria-pressed={t.flipH}
          onClick={() => { dispatch(flipPanelH(panel.id)); commit.flush(); }}>
          Flip H
        </button>
        <button type="button" style={btn} aria-pressed={t.flipV}
          onClick={() => { dispatch(flipPanelV(panel.id)); commit.flush(); }}>
          Flip V
        </button>
        <button type="button" style={btn}
          onClick={() => { dispatch(resetPanelTransform(panel.id)); commit.flush(); }}>
          Reset transform
        </button>
      </div>

      <div style={{ fontSize: 11, color: "#777", lineHeight: 1.5 }}>
        Pan: ({t.panX.toFixed(0)}, {t.panY.toFixed(0)}) px<br />
        Zoom: {t.zoom.toFixed(2)}× &middot; Rotation: {t.rotation}°
      </div>

      <TextField label="Subpanel letter"
        value={letterOverride ?? ""}
        placeholder="(auto)"
        onChange={(s) => {
          dispatch(setLetterOverride(panel.id, s === "" ? null : s));
          commit.markDirty();
        }}
        onBlur={commit.flush} />

      <button type="button" style={btn} onClick={onCalibrate}>
        Calibrate scale…
      </button>
    </div>
  );
}
