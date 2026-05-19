import type { FillMode, StrokeStyle } from "../../model/annotations";
import { SYMBOL_LIBRARY } from "../../symbols/library";

interface Props {
  /** Currently-selected symbol id (drives `aria-pressed`). */
  value: string;
  /** Current style — drives the per-cell preview rendering. */
  currentColor: string;
  currentStrokeWidthPx: number;
  currentFillMode: FillMode;
  currentStrokeStyle: StrokeStyle;
  /** Called when the user clicks a cell. */
  onChange: (symbolId: string) => void;
}

const STROKE_DASH_BY_STYLE: Record<StrokeStyle, string | undefined> = {
  solid: undefined,
  dashed: "8 4",
  dotted: "1.5 3",
};

export function SymbolGrid({
  value,
  currentColor,
  currentStrokeWidthPx,
  currentFillMode,
  currentStrokeStyle,
  onChange,
}: Props): JSX.Element {
  return (
    <div
      role="group"
      aria-label="Symbol"
      data-testid="symbol-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: 6,
      }}
    >
      {SYMBOL_LIBRARY.map((s) => {
        const isActive = s.id === value;
        // A cell preview reflects the *current* style: filled if both the
        // user's fillMode is "filled" AND the geometry supports it.
        const wantFill =
          currentFillMode === "filled" && s.geometry === "closed";
        const dash = STROKE_DASH_BY_STYLE[currentStrokeStyle];
        return (
          <button
            key={s.id}
            type="button"
            title={s.label}
            aria-label={s.label}
            aria-pressed={isActive}
            data-testid={`symbol-grid-cell-${s.id}`}
            className={"symbol-gallery-cell" + (isActive ? " is-active" : "")}
            onClick={() => onChange(s.id)}
          >
            <svg viewBox="0 0 100 100" width={24} height={24}>
              <path
                d={s.pathD}
                fill={wantFill ? currentColor : "none"}
                stroke={wantFill ? "none" : currentColor}
                {...(wantFill ? {} : { strokeWidth: currentStrokeWidthPx * 3 })}
                strokeLinecap="round"
                strokeLinejoin="round"
                {...(dash !== undefined && !wantFill
                  ? { strokeDasharray: dash }
                  : {})}
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
