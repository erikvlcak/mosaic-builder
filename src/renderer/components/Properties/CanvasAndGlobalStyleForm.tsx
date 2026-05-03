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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 12, color: "#444" }}>Subpanel letters</h3>
      <NumberField label="Letters size (pt)" value={globalStyle.letters.sizePt}
        min={4} max={144}
        onChange={(sizePt) => patchLetters({ sizePt })}
        onBlur={commit.flush} />
      <ColorField label="Letters color" value={globalStyle.letters.color}
        onChange={(color) => patchLetters({ color })}
        onBlur={commit.flush} />
      <CornerField label="Letters corner"
        value={globalStyle.letters.corner}
        onChange={(c) => patchLetters({ corner: c }, true)} />

      <h3 style={{ margin: 0, fontSize: 12, color: "#444", marginTop: 8 }}>Scale bar</h3>
      <NumberField label="Scale-bar thickness (px)"
        value={globalStyle.scalebar.thicknessPx} min={1} max={32}
        onChange={(thicknessPx) => patchScalebar({ thicknessPx })}
        onBlur={commit.flush} />
      <ColorField label="Scale-bar color" value={globalStyle.scalebar.barColor}
        onChange={(barColor) => patchScalebar({ barColor, color: barColor })}
        onBlur={commit.flush} />
      <NumberField label="Scale-bar label size (pt)"
        value={globalStyle.scalebar.sizePt} min={4} max={48}
        onChange={(sizePt) => patchScalebar({ sizePt })}
        onBlur={commit.flush} />
      <CornerField label="Scale-bar corner"
        value={globalStyle.scalebar.corner}
        onChange={(c) => patchScalebar({ corner: c }, true)} />
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
        <input type="checkbox"
          checked={globalStyle.scalebar.showLabel}
          onChange={(e) =>
            patchScalebar({ showLabel: e.currentTarget.checked }, true)} />
        Show scale-bar label
      </label>
    </div>
  );
}
