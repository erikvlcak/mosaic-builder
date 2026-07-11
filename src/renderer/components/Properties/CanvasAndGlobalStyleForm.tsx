import type { Dispatch } from "react";
import type { FigureAction } from "../../model/figure-actions";
import {
  clearAllLetterOverrides,
  setGlobalStyle,
  setLetterPattern,
} from "../../model/figure-actions";
import type { FigureState, LetterPattern } from "../../model/figure-state";
import type {
  GlobalAnnoStyle,
  LetterStyle,
  ScaleBarStyle,
} from "../../model/global-style";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { NumberField } from "./inputs/NumberField";
import { ColorField } from "./inputs/ColorField";
import { CornerField } from "./inputs/CornerField";

interface Props {
  /**
   * Full figure state. Required for the spec-08 pattern picker to read
   * `letterPattern` and detect whether any overrides exist (for the reset
   * button's enabled state).
   */
  state: FigureState;
  globalStyle: GlobalAnnoStyle;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

const PATTERN_OPTIONS: ReadonlyArray<{ value: LetterPattern; label: string }> =
  [
    { value: "uppercase", label: "A, B, C…" },
    { value: "lowercase", label: "a, b, c…" },
    { value: "numeric", label: "1, 2, 3…" },
    { value: "uppercase-paren", label: "(A), (B)…" },
    { value: "uppercase-bracket", label: "[A], [B]…" },
    { value: "rowcol-mixed", label: "1a, 1b… 2a, 2b…" },
  ];

export function CanvasAndGlobalStyleForm({
  state,
  globalStyle,
  dispatch,
  commit,
}: Props): JSX.Element {
  function patchLetters(p: Partial<LetterStyle>, immediate = false): void {
    const next: GlobalAnnoStyle = {
      ...globalStyle,
      letters: { ...globalStyle.letters, ...p },
    };
    dispatch(setGlobalStyle(next));
    if (immediate) commit.flush();
    else commit.markDirty();
  }
  function patchScalebar(p: Partial<ScaleBarStyle>, immediate = false): void {
    const next: GlobalAnnoStyle = {
      ...globalStyle,
      scalebar: { ...globalStyle.scalebar, ...p },
    };
    dispatch(setGlobalStyle(next));
    if (immediate) commit.flush();
    else commit.markDirty();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <fieldset
        style={{
          border: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <legend
          className="section-heading"
          style={{ padding: 0, marginBottom: 4 }}
        >
          Subpanel letters
        </legend>
        <label htmlFor="letter-pattern" className="field">
          <span className="field-label">Pattern</span>
          <select
            id="letter-pattern"
            aria-label="Letter pattern"
            className="input"
            value={state.letterPattern}
            onChange={(e) => {
              dispatch(
                setLetterPattern(e.currentTarget.value as LetterPattern),
              );
              commit.flush();
            }}
          >
            {PATTERN_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {Object.keys(state.letterOverrides).length > 0 && (
          <button
            type="button"
            className="btn"
            title="Pattern controls auto-generated labels; letters with manual overrides are unaffected. Reset to re-apply the pattern everywhere."
            onClick={() => {
              dispatch(clearAllLetterOverrides());
              commit.flush();
            }}
          >
            Reset all letter overrides
          </button>
        )}
        <NumberField
          label="Size (pt)"
          value={globalStyle.letters.sizePt}
          min={4}
          max={144}
          onChange={(sizePt) => patchLetters({ sizePt })}
          onBlur={commit.flush}
        />
        <ColorField
          label="Color"
          value={globalStyle.letters.color}
          onChange={(color) => patchLetters({ color })}
          onBlur={commit.flush}
        />
        <CornerField
          label="Corner"
          value={globalStyle.letters.corner}
          onChange={(c) => patchLetters({ corner: c }, true)}
        />
        <label className="checkbox-row">
          <input
            type="checkbox"
            aria-label="Halo"
            checked={globalStyle.letters.halo === true}
            onChange={(e) =>
              patchLetters({ halo: e.currentTarget.checked }, true)
            }
          />
          Halo (outline for contrast)
        </label>
      </fieldset>

      <fieldset
        style={{
          border: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <legend
          className="section-heading"
          style={{ padding: 0, marginBottom: 4 }}
        >
          Scale bar
        </legend>
        <NumberField
          label="Thickness (px)"
          value={globalStyle.scalebar.thicknessPx}
          min={1}
          max={32}
          onChange={(thicknessPx) => patchScalebar({ thicknessPx })}
          onBlur={commit.flush}
        />
        <ColorField
          label="Color"
          value={globalStyle.scalebar.barColor}
          onChange={(barColor) => patchScalebar({ barColor, color: barColor })}
          onBlur={commit.flush}
        />
        <NumberField
          label="Label size (pt)"
          value={globalStyle.scalebar.sizePt}
          min={4}
          max={48}
          onChange={(sizePt) => patchScalebar({ sizePt })}
          onBlur={commit.flush}
        />
        <CornerField
          label="Corner"
          value={globalStyle.scalebar.corner}
          onChange={(c) => patchScalebar({ corner: c }, true)}
        />
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={globalStyle.scalebar.showLabel}
            onChange={(e) =>
              patchScalebar({ showLabel: e.currentTarget.checked }, true)
            }
          />
          Show label
        </label>
      </fieldset>
    </div>
  );
}
