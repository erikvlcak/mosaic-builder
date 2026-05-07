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

export function PanelPropertiesForm({
  panel, letterOverride, dispatch, onCalibrate, commit,
}: Props): JSX.Element {
  const t = panel.transform;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SelectField label="Fit"
        value={t.fit}
        options={[
          { value: "contain", label: "Contain" },
          { value: "cover",   label: "Cover" },
          { value: "stretch", label: "Stretch" },
        ] as const}
        onChange={(fit) => { dispatch(setPanelFit(panel.id, fit)); commit.flush(); }} />

      <div className="field">
        <span className="field-label">Transform</span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button type="button" className="btn"
            onClick={() => { dispatch(rotatePanel90(panel.id)); commit.flush(); }}
            title="Rotate 90° clockwise (R)">
            ↻ 90°
          </button>
          <button type="button" className="btn" aria-pressed={t.flipH}
            onClick={() => { dispatch(flipPanelH(panel.id)); commit.flush(); }}
            title="Flip horizontally (H)">
            ⇄ H
          </button>
          <button type="button" className="btn" aria-pressed={t.flipV}
            onClick={() => { dispatch(flipPanelV(panel.id)); commit.flush(); }}
            title="Flip vertically (V)">
            ⇅ V
          </button>
          <button type="button" className="btn"
            onClick={() => { dispatch(resetPanelTransform(panel.id)); commit.flush(); }}
            title="Reset pan, zoom, and rotation (0)">
            Reset
          </button>
        </div>
      </div>

      <dl
        style={{
          margin: 0,
          padding: "8px 10px",
          background: "var(--c-surface-muted)",
          borderRadius: "var(--r-md)",
          fontSize: 11,
          color: "var(--c-text-muted)",
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          rowGap: 3,
          columnGap: 10,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <dt>Pan</dt>
        <dd style={{ margin: 0 }}>
          {t.panX.toFixed(0)}, {t.panY.toFixed(0)} px
        </dd>
        <dt>Zoom</dt>
        <dd style={{ margin: 0 }}>{t.zoom.toFixed(2)}×</dd>
        <dt>Rotation</dt>
        <dd style={{ margin: 0 }}>{t.rotation}°</dd>
      </dl>

      <TextField label="Subpanel letter"
        value={letterOverride ?? ""}
        placeholder="(auto)"
        onChange={(s) => {
          dispatch(setLetterOverride(panel.id, s === "" ? null : s));
          commit.markDirty();
        }}
        onBlur={commit.flush} />

      <button type="button" className="btn" onClick={onCalibrate}>
        Calibrate scale…
      </button>
    </div>
  );
}
