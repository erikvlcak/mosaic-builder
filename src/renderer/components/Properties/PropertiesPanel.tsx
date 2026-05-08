import type { Dispatch } from "react";
import type { FigureState } from "../../model/figure-state";
import type { FigureAction } from "../../model/figure-actions";
import type { Annotation } from "../../model/annotations";
import type { Panel, PanelTransform } from "../../model/panels";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { CanvasAndGlobalStyleForm } from "./CanvasAndGlobalStyleForm";
import { AnnotationPropertiesForm } from "./AnnotationPropertiesForm";
import { PanelPropertiesForm } from "./PanelPropertiesForm";

interface Props {
  state: FigureState;
  focusedPanel: Panel | undefined;
  selectedAnno: Annotation | undefined;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
  onCalibrate: () => void;
}

const ANNO_TITLES: Record<Annotation["kind"], string> = {
  text: "Text annotation",
  arrow: "Arrow annotation",
  box: "Box annotation",
  scalebar: "Scale bar",
};

export function PropertiesPanel({
  state, focusedPanel, selectedAnno, dispatch, commit, onCalibrate,
}: Props): JSX.Element {
  let title: string;
  let subtitle: string | null = null;
  let body: JSX.Element;

  if (selectedAnno !== undefined) {
    title = ANNO_TITLES[selectedAnno.kind];
    body = (
      <AnnotationPropertiesForm
        anno={selectedAnno} dispatch={dispatch} commit={commit}
      />
    );
  } else if (
    focusedPanel !== undefined &&
    focusedPanel.imageId !== undefined &&
    focusedPanel.transform !== undefined
  ) {
    const panelWithTransform: Panel & { transform: PanelTransform } = {
      ...focusedPanel,
      transform: focusedPanel.transform,
    };
    title = "Selected panel";
    const letterOverride = state.letterOverrides[focusedPanel.id];
    subtitle = letterOverride !== undefined
      ? `Subpanel ${letterOverride}`
      : `Row ${focusedPanel.row + 1}, col ${focusedPanel.col + 1}`;
    body = (
      <PanelPropertiesForm
        panel={panelWithTransform}
        letterOverride={letterOverride}
        dispatch={dispatch}
        commit={commit}
        onCalibrate={onCalibrate}
      />
    );
  } else {
    title = "Figure";
    subtitle = "No selection — editing global style";
    body = (
      <CanvasAndGlobalStyleForm
        globalStyle={state.globalStyle} dispatch={dispatch} commit={commit}
      />
    );
  }

  return (
    <aside
      data-testid="properties-panel"
      className="surface-sidebar-end"
      style={{
        width: 304,
        padding: 16,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div className="props-title-block">
        <h2 className="props-title">{title}</h2>
        {subtitle !== null && (
          <div className="props-subtitle">{subtitle}</div>
        )}
      </div>
      {body}
    </aside>
  );
}
