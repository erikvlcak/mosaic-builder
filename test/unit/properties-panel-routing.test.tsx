// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
