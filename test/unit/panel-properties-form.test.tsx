// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PanelPropertiesForm } from "../../src/renderer/components/Properties/PanelPropertiesForm";
import type { Panel, PanelTransform } from "../../src/renderer/model/panels";

const transform: PanelTransform = {
  fit: "contain", panX: 0, panY: 0,
  zoom: 1, rotation: 0, flipH: false, flipV: false,
};
const panel: Panel & { transform: PanelTransform } = {
  id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1,
  imageId: "img1",
  transform,
};

describe("PanelPropertiesForm", () => {
  it("dispatches setLetterOverride when the override field changes", async () => {
    const dispatch = vi.fn();
    render(
      <PanelPropertiesForm
        panel={panel} letterOverride={undefined}
        dispatch={dispatch}
        onCalibrate={() => {}}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
      />,
    );
    // <TextField> is controlled — userEvent.type fights the static value prop.
    // Use fireEvent.change for a single-shot value change.
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(screen.getByLabelText("Subpanel letter"), {
      target: { value: "A" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_LETTER_OVERRIDE",
      panelId: "p1",
      override: "A",
    });
  });

  it("calls onCalibrate when the Calibrate button is clicked", async () => {
    const onCalibrate = vi.fn();
    render(
      <PanelPropertiesForm
        panel={panel} letterOverride={undefined}
        dispatch={vi.fn()} onCalibrate={onCalibrate}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /calibrate/i }));
    expect(onCalibrate).toHaveBeenCalled();
  });
});
