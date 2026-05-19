import type {
  Figure,
  FigureCanvas,
  HardCodedPanel,
  ResolvedAnnotation,
} from "./types";
import type { FigureState } from "./figure-state";
import { DEFAULT_TRANSFORM } from "./panels";
import { labelForPattern } from "../render/letters";

export interface DeriveOptions {
  canvas: FigureCanvas;
}

export function deriveFigure(state: FigureState, opts: DeriveOptions): Figure {
  // Hidden panels are filtered out of the rendered figure: from the
  // export's perspective they're identical to holes (no placeholder, no
  // letter, no anchored annotation). They survive in `state.panels` so
  // the editor can paint a "hidden" badge and so toggling Hide off is a
  // simple flag-flip rather than a panel-recreate.
  const visiblePanels = state.panels.filter((p) => p.hidden !== true);

  const panels: HardCodedPanel[] = visiblePanels.map((p) => {
    if (p.imageId !== undefined) {
      return {
        panelId: p.id,
        row: p.row,
        col: p.col,
        kind: "image" as const,
        imageId: p.imageId,
        rowSpan: p.rowSpan,
        colSpan: p.colSpan,
        // Defensive: any image-bearing panel that bypassed the reducer
        // (test harnesses, hand-built fixtures) gets a default transform
        // so downstream render code never branches on undefined.
        transform: p.transform ?? DEFAULT_TRANSFORM,
      };
    }
    return {
      panelId: p.id,
      row: p.row,
      col: p.col,
      kind: "placeholder" as const,
      label: "",
      rowSpan: p.rowSpan,
      colSpan: p.colSpan,
    };
  });

  // Synthesise letter annotations (z=0) for each visible panel in
  // row-major order. Letters draw with the active `letterPattern`; manual
  // text overrides win over the pattern (so changing the pattern doesn't
  // overwrite hand-edited labels). Style overrides aren't carried on the
  // resolved annotation — `draw-annotations.ts` reads them straight off
  // `state.letterOverrides[panelId].style` via the figure's globalStyle
  // path. The annotation pass DOES NOT depend on
  // globalStyle.letters.enabled here — drawAnnotations checks the flag at
  // render time so toggling doesn't require a re-derive.
  const letters: ResolvedAnnotation[] = visiblePanels.map((p) => {
    const auto = labelForPattern(p.row, p.col, state.cols, state.letterPattern);
    const overrideText = state.letterOverrides[p.id]?.text;
    const text = overrideText ?? auto;
    return {
      id: `letter:${p.id}`,
      kind: "letter" as const,
      panelId: p.id,
      z: 0,
      text,
    };
  });

  // User annotations: filter to those whose panelId (if set) still
  // resolves to a *visible* panel. Annotations anchored to hidden panels
  // disappear from the export alongside their host. Scale bars get
  // `resolvedPanelId` for renderer convenience.
  const panelIds = new Set(visiblePanels.map((p) => p.id));
  const userAnnos: ResolvedAnnotation[] = state.annotations
    .filter((a) => a.panelId === undefined || panelIds.has(a.panelId))
    .map((a) => {
      if (a.kind === "scalebar") {
        return { ...a, resolvedPanelId: a.panelId };
      }
      return a;
    });

  return {
    canvas: opts.canvas,
    grid: {
      rows: state.rows,
      cols: state.cols,
      gutterPx: state.gutterPx,
      gutterColor: state.gutterColor,
      outerGutter: state.outerGutter,
      layout: state.layout,
    },
    panels,
    annotations: [...letters, ...userAnnos],
    globalStyle: state.globalStyle,
    letterOverrides: state.letterOverrides,
  };
}
