// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScalebarPickerPanel } from "../../src/renderer/components/Properties/ScalebarPickerPanel";
import { initialDefaultScalebarStyle } from "../../src/renderer/model/default-scalebar-style";

describe("ScalebarPickerPanel calibration status", () => {
  it("reports how many placed images are calibrated", () => {
    render(
      <ScalebarPickerPanel
        value={initialDefaultScalebarStyle()}
        onChange={vi.fn()}
        calibratedCount={1}
        placedCount={3}
      />,
    );
    expect(screen.getByTestId("scalebar-cal-status").textContent).toMatch(
      /1 of 3/,
    );
  });

  it("omits the status line when no counts are provided", () => {
    render(
      <ScalebarPickerPanel
        value={initialDefaultScalebarStyle()}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("scalebar-cal-status")).toBeNull();
  });
});
