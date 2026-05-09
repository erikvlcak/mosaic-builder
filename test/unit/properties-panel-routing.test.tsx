// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PropertiesPanel } from "../../src/renderer/components/Properties/PropertiesPanel";
import { initialFigureState } from "../../src/renderer/model/figure-state";
import type { Panel, PanelTransform } from "../../src/renderer/model/panels";

const transform: PanelTransform = {
  fit: "contain", panX: 0, panY: 0, zoom: 1,
  rotation: 0, flipH: false, flipV: false,
};

describe("PropertiesPanel routes by selection", () => {
  it("renders the global form when nothing is selected", () => {
    render(
      <PropertiesPanel
        state={initialFigureState()}
        focusedPanel={undefined}
        selectedAnno={undefined}
        dispatch={vi.fn()}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
        onCalibrate={() => {}}
      />,
    );
    expect(screen.getByText(/Subpanel letters/)).toBeTruthy();
  });

  it("renders TextAnnoForm when a text annotation is selected", () => {
    render(
      <PropertiesPanel
        state={initialFigureState()}
        focusedPanel={undefined}
        selectedAnno={{
          id: "t1", kind: "text", x: 0, y: 0, text: "hi",
          font: "Arial", sizePt: 12, bold: false, italic: false,
          color: "#000", z: 1,
        }}
        dispatch={vi.fn()}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
        onCalibrate={() => {}}
      />,
    );
    expect(screen.getByLabelText("Text")).toBeTruthy();
  });

  it("renders PanelPropertiesForm when a focused image panel is given", () => {
    const focusedPanel: Panel = {
      id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1,
      imageId: "img1",
      transform,
    };
    render(
      <PropertiesPanel
        state={initialFigureState()}
        focusedPanel={focusedPanel}
        selectedAnno={undefined}
        dispatch={vi.fn()}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
        onCalibrate={() => {}}
      />,
    );
    expect(screen.getByLabelText("Subpanel letter")).toBeTruthy();
  });

  it("renders EmptyPanelForm with Hide + Delete for an empty focused panel", () => {
    const focusedPanel: Panel = {
      id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1,
    };
    const dispatch = vi.fn();
    render(
      <PropertiesPanel
        state={initialFigureState()}
        focusedPanel={focusedPanel}
        selectedAnno={undefined}
        dispatch={dispatch}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
        onCalibrate={() => {}}
      />,
    );
    const hide = screen.getByRole("button", { name: /^Hide$/ });
    const del = screen.getByRole("button", { name: /^Delete$/ });
    fireEvent.click(hide);
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_PANEL_HIDDEN",
      panelId: "p1",
      hidden: true,
    });
    fireEvent.click(del);
    expect(dispatch).toHaveBeenCalledWith({
      type: "DELETE_PANEL",
      panelId: "p1",
    });
  });

  it("renders EmptyPanelForm with Show button for a hidden focused panel", () => {
    const focusedPanel: Panel = {
      id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1, hidden: true,
    };
    render(
      <PropertiesPanel
        state={initialFigureState()}
        focusedPanel={focusedPanel}
        selectedAnno={undefined}
        dispatch={vi.fn()}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
        onCalibrate={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /^Show$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Hide$/ })).toBeNull();
  });

  it("renders LetterAnnoForm when a letter is selected (via selectedLetterPanelId)", () => {
    const state = initialFigureState();
    const firstPanelId = state.panels[0]!.id;
    render(
      <PropertiesPanel
        state={state}
        focusedPanel={undefined}
        selectedLetterPanelId={firstPanelId}
        selectedAnno={undefined}
        dispatch={vi.fn()}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
        onCalibrate={() => {}}
      />,
    );
    // Letter form's "Reset to global" button is unique to LetterAnnoForm.
    expect(
      screen.getByRole("button", { name: /reset to global/i }),
    ).toBeTruthy();
    // Title says "Letter" — confirms routing.
    expect(screen.getByText(/^Letter$/)).toBeTruthy();
  });
});
