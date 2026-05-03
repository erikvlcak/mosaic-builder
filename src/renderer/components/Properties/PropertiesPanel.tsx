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

export function PropertiesPanel({
  state, focusedPanel, selectedAnno, dispatch, commit, onCalibrate,
}: Props): JSX.Element {
  let title: string;
  let body: JSX.Element;

  if (selectedAnno !== undefined) {
    const k = selectedAnno.kind;
    title = `${k.charAt(0).toUpperCase()}${k.slice(1)} annotation`;
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
    // Narrowed: focusedPanel.transform is PanelTransform.
    const panelWithTransform: Panel & { transform: PanelTransform } = {
      ...focusedPanel,
      transform: focusedPanel.transform,
    };
    title = `Panel ${focusedPanel.id.slice(0, 6)}`;
    const letterOverride = state.letterOverrides[focusedPanel.id];
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
    body = (
      <CanvasAndGlobalStyleForm
        globalStyle={state.globalStyle} dispatch={dispatch} commit={commit}
      />
    );
  }

  return (
    <aside
      data-testid="properties-panel"
      style={{
        width: 300, padding: 12, borderLeft: "1px solid #DDD",
        background: "#FAFAFA", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 12,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 14, color: "#333" }}>{title}</h2>
      {body}
    </aside>
  );
}
