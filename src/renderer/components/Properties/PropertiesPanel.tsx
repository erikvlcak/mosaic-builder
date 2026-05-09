import type { Dispatch } from "react";
import type { FigureState } from "../../model/figure-state";
import type { FigureAction } from "../../model/figure-actions";
import { setPanelHidden, deletePanel } from "../../model/figure-actions";
import type { Annotation } from "../../model/annotations";
import type { Panel, PanelTransform } from "../../model/panels";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { CanvasAndGlobalStyleForm } from "./CanvasAndGlobalStyleForm";
import { AnnotationOverview } from "./AnnotationOverview";
import { AnnotationPropertiesForm } from "./AnnotationPropertiesForm";
import { MultiAnnoForm } from "./MultiAnnoForm";
import { PanelPropertiesForm } from "./PanelPropertiesForm";
import { EmptyPanelForm } from "./EmptyPanelForm";

interface Props {
  state: FigureState;
  focusedPanel: Panel | undefined;
  selectedAnno: Annotation | undefined;
  /** Annotations represented by the multi-select set (size > 1 case).
   *  Empty / single-element arrays mean PropertiesPanel uses the single-select
   *  routing — `selectedAnno` covers that path. */
  selectedAnnos?: Annotation[];
  /** Called by MultiAnnoForm after a bulk-remove so the parent can clear its
   *  selection set (state lives outside this component). */
  onMultiBulkRemove?: () => void;
  /** Selection set + setter — wired through to the empty-state
   *  AnnotationOverview so its "Select all" buttons can populate the set. */
  selectedAnnotationIds?: ReadonlySet<string>;
  onSelectionChange?: (next: ReadonlySet<string>) => void;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
  onCalibrate: () => void;
}

const ANNO_TITLES: Record<Annotation["kind"], string> = {
  text: "Text annotation",
  symbol: "Symbol annotation",
  box: "Box annotation",
  scalebar: "Scale bar",
};

export function PropertiesPanel({
  state,
  focusedPanel,
  selectedAnno,
  selectedAnnos,
  onMultiBulkRemove,
  selectedAnnotationIds,
  onSelectionChange,
  dispatch,
  commit,
  onCalibrate,
}: Props): JSX.Element {
  let title: string;
  let subtitle: string | null = null;
  let body: JSX.Element;

  // Multi-select takes precedence over single-select: if the parent passed
  // an array of length > 1, route to MultiAnnoForm. The parent is also
  // responsible for keeping `selectedAnno` undefined in this case (or the
  // single-select branch below would race the multi-select branch).
  if (selectedAnnos !== undefined && selectedAnnos.length > 1) {
    title = "Multiple annotations";
    subtitle = `${selectedAnnos.length} selected`;
    body = (
      <MultiAnnoForm
        selectedAnnos={selectedAnnos}
        dispatch={dispatch}
        commit={commit}
        onBulkRemove={onMultiBulkRemove ?? (() => {})}
      />
    );
  } else if (selectedAnno !== undefined) {
    title = ANNO_TITLES[selectedAnno.kind];
    body = (
      <AnnotationPropertiesForm
        anno={selectedAnno}
        dispatch={dispatch}
        commit={commit}
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
    subtitle =
      letterOverride !== undefined
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
  } else if (focusedPanel !== undefined) {
    // Empty panel — no image, no transform. Hide / Delete live here.
    const isHidden = focusedPanel.hidden === true;
    title = "Selected panel";
    subtitle = `Row ${focusedPanel.row + 1}, col ${focusedPanel.col + 1} — empty${
      isHidden ? " (hidden)" : ""
    }`;
    body = (
      <EmptyPanelForm
        hidden={isHidden}
        onToggleHidden={() => {
          dispatch(setPanelHidden(focusedPanel.id, !isHidden));
          commit.flush();
        }}
        onDelete={() => {
          dispatch(deletePanel(focusedPanel.id));
          commit.flush();
        }}
      />
    );
  } else {
    title = "Figure";
    subtitle = "No selection — editing global style";
    // Render the annotation overview only when the selection-set props are
    // wired through. PropertiesPanel is also used in tests that don't pass
    // these — falling back to the global-style-only body keeps those tests
    // unchanged.
    const overview =
      selectedAnnotationIds !== undefined && onSelectionChange !== undefined ? (
        <AnnotationOverview
          annotations={state.annotations}
          selectedAnnotationIds={selectedAnnotationIds}
          onSelectionChange={onSelectionChange}
        />
      ) : null;
    body = (
      <>
        {overview}
        <CanvasAndGlobalStyleForm
          globalStyle={state.globalStyle}
          dispatch={dispatch}
          commit={commit}
        />
      </>
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
        {subtitle !== null && <div className="props-subtitle">{subtitle}</div>}
      </div>
      {body}
    </aside>
  );
}
