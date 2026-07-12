import type { Dispatch } from "react";
import type { Panel, PanelTransform } from "../../model/panels";
import type { LetterOverride } from "../../model/figure-state";
import type { FigureAction } from "../../model/figure-actions";
import {
  setPanelFit,
  rotatePanel90,
  flipPanelH,
  flipPanelV,
  resetPanelTransform,
  setLetterOverride,
  resetPanelCrop,
  unplacePanel,
} from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { SelectField } from "./inputs/SelectField";
import { TextField } from "./inputs/TextField";

interface Props {
  /** Only image-bearing panels are accepted; transform must be present. */
  panel: Panel & { transform: PanelTransform };
  /**
   * Current text override for this panel's letter (if any). Style overrides
   * live in `LetterOverride.style` and are edited from the letter's own
   * properties form (LetterAnnoForm), not here.
   */
  letterOverrideText: string | undefined;
  /**
   * Full override object for this panel, used to preserve `style` when the
   * user only edits the text from this form (text-only edit must NOT clear
   * a separately-set color/font override).
   */
  letterOverride: LetterOverride | undefined;
  dispatch: Dispatch<FigureAction>;
  onCalibrate: () => void;
  onCrop: () => void;
  commit: FieldCommit;
}

export function PanelPropertiesForm({
  panel,
  letterOverrideText,
  letterOverride,
  dispatch,
  onCalibrate,
  onCrop,
  commit,
}: Props): JSX.Element {
  const t = panel.transform;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SelectField
        label="Fit"
        value={t.fit}
        options={
          [
            {
              value: "contain",
              label: "Fit",
              title: "Fit — whole image visible",
            },
            {
              value: "cover",
              label: "Fill",
              title: "Fill — panel fully covered, image may be cropped",
            },
            {
              value: "stretch",
              label: "Stretch",
              title: "Stretch — ignore aspect ratio",
            },
          ] as const
        }
        onChange={(fit) => {
          dispatch(setPanelFit(panel.id, fit));
          commit.flush();
        }}
      />

      <div className="field">
        <span className="field-label">Transform</span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              dispatch(rotatePanel90(panel.id));
              commit.flush();
            }}
            title="Rotate 90° clockwise (R)"
          >
            ↻ 90°
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={t.flipH}
            onClick={() => {
              dispatch(flipPanelH(panel.id));
              commit.flush();
            }}
            title="Flip horizontally (H)"
          >
            ⇄ H
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={t.flipV}
            onClick={() => {
              dispatch(flipPanelV(panel.id));
              commit.flush();
            }}
            title="Flip vertically (V)"
          >
            ⇅ V
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              dispatch(resetPanelTransform(panel.id));
              commit.flush();
            }}
            title="Reset pan, zoom, and rotation (0)"
          >
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

      <TextField
        label="Subpanel letter"
        value={letterOverrideText ?? ""}
        placeholder="(auto)"
        onChange={(s) => {
          if (s === "") {
            // Clearing the text leaves any style override intact: an
            // empty-text + null-style override normalizes to null in the
            // reducer, but a style-only override survives.
            const nextOverride: LetterOverride | null =
              letterOverride?.style !== undefined
                ? { style: letterOverride.style }
                : null;
            dispatch(setLetterOverride(panel.id, nextOverride));
          } else {
            const nextOverride: LetterOverride = { text: s };
            if (letterOverride?.style !== undefined) {
              nextOverride.style = letterOverride.style;
            }
            dispatch(setLetterOverride(panel.id, nextOverride));
          }
          commit.markDirty();
        }}
        onBlur={commit.flush}
      />

      <button type="button" className="btn" onClick={onCalibrate}>
        Calibrate scale…
      </button>

      <div className="field">
        <span className="field-label">Crop</span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={onCrop}>
            Crop…
          </button>
          {t.crop !== undefined && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                dispatch(resetPanelCrop(panel.id));
                commit.flush();
              }}
              title="Restore the full source image"
            >
              Reset crop
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        className="btn"
        onClick={() => {
          dispatch(unplacePanel(panel.id));
          commit.flush();
        }}
        title="Return this image to the tray (the panel becomes empty)"
      >
        Remove from panel
      </button>
    </div>
  );
}
