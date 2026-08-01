import { useEffect, useState } from "react";
import { GLYPHS } from "../../platform/shortcuts";

export interface ZoomControlsProps {
  /** Zoom shown to the user, e.g. 100 for 100%. */
  displayPct: number;
  /** True when the view is in fit-to-window mode. */
  isFit: boolean;
  onFit: () => void;
  onActualSize: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSetPercent: (pct: number) => void;
}

export function ZoomControls({
  displayPct,
  isFit,
  onFit,
  onActualSize,
  onZoomIn,
  onZoomOut,
  onSetPercent,
}: ZoomControlsProps): JSX.Element {
  const { mod, plus, minus, chord } = GLYPHS;
  // Local buffer so typing doesn't fight the controlled displayPct until the
  // user commits with Enter/blur.
  const [draft, setDraft] = useState(String(displayPct));
  useEffect(() => setDraft(String(displayPct)), [displayPct]);

  function commit(): void {
    const n = Number.parseInt(draft, 10);
    if (Number.isFinite(n) && n > 0) onSetPercent(n);
    else setDraft(String(displayPct));
  }

  return (
    <div className="zoom-controls" data-testid="zoom-controls">
      <button
        type="button"
        className={`btn${isFit ? " btn-active" : ""}`}
        data-testid="zoom-fit"
        onClick={onFit}
        title={`Fit to window (${chord(mod, "0")})`}
      >
        Fit
      </button>
      <button
        type="button"
        className="btn"
        data-testid="zoom-actual"
        onClick={onActualSize}
        title={`Actual pixels — 100% (${chord(mod, "1")})`}
      >
        100%
      </button>
      <button
        type="button"
        className="btn btn-icon"
        data-testid="zoom-out"
        onClick={onZoomOut}
        title={`Zoom out (${chord(mod, minus)})`}
        aria-label="Zoom out"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        className="zoom-pct-input"
        data-testid="zoom-pct-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        onBlur={commit}
        aria-label="Zoom percent"
      />
      <button
        type="button"
        className="btn btn-icon"
        data-testid="zoom-in"
        onClick={onZoomIn}
        title={`Zoom in (${chord(mod, plus)})`}
        aria-label="Zoom in"
      >
        +
      </button>
    </div>
  );
}
