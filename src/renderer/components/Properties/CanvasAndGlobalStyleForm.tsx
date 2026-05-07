import type { Dispatch } from "react";
import type { FigureAction } from "../../model/figure-actions";
import { setGlobalStyle } from "../../model/figure-actions";
import type { GlobalAnnoStyle, LetterStyle, ScaleBarStyle } from "../../model/global-style";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { NumberField } from "./inputs/NumberField";
import { ColorField } from "./inputs/ColorField";
import { CornerField } from "./inputs/CornerField";

interface Props {
  globalStyle: GlobalAnnoStyle;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

export function CanvasAndGlobalStyleForm({
  globalStyle, dispatch, commit,
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
        <legend className="section-heading" style={{ padding: 0, marginBottom: 4 }}>
          Subpanel letters
        </legend>
        <NumberField label="Size (pt)" value={globalStyle.letters.sizePt}
          min={4} max={144}
          onChange={(sizePt) => patchLetters({ sizePt })}
          onBlur={commit.flush} />
        <ColorField label="Color" value={globalStyle.letters.color}
          onChange={(color) => patchLetters({ color })}
          onBlur={commit.flush} />
        <CornerField label="Corner"
          value={globalStyle.letters.corner}
          onChange={(c) => patchLetters({ corner: c }, true)} />
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
        <legend className="section-heading" style={{ padding: 0, marginBottom: 4 }}>
          Scale bar
        </legend>
        <NumberField label="Thickness (px)"
          value={globalStyle.scalebar.thicknessPx} min={1} max={32}
          onChange={(thicknessPx) => patchScalebar({ thicknessPx })}
          onBlur={commit.flush} />
        <ColorField label="Color" value={globalStyle.scalebar.barColor}
          onChange={(barColor) => patchScalebar({ barColor, color: barColor })}
          onBlur={commit.flush} />
        <NumberField label="Label size (pt)"
          value={globalStyle.scalebar.sizePt} min={4} max={48}
          onChange={(sizePt) => patchScalebar({ sizePt })}
          onBlur={commit.flush} />
        <CornerField label="Corner"
          value={globalStyle.scalebar.corner}
          onChange={(c) => patchScalebar({ corner: c }, true)} />
        <label className="checkbox-row">
          <input type="checkbox"
            checked={globalStyle.scalebar.showLabel}
            onChange={(e) =>
              patchScalebar({ showLabel: e.currentTarget.checked }, true)} />
          Show label
        </label>
      </fieldset>
    </div>
  );
}
