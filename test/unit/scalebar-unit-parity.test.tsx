// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ScalebarPickerPanel } from "../../src/renderer/components/Properties/ScalebarPickerPanel";
import { ScalebarAnnoForm } from "../../src/renderer/components/Properties/ScalebarAnnoForm";
import { initialDefaultScalebarStyle } from "../../src/renderer/model/default-scalebar-style";
import type { ScaleBarAnnotation } from "../../src/renderer/model/annotations";

function unitOptions(): string[] {
  const select = screen.getByLabelText<HTMLSelectElement>("Unit");
  return Array.from(select.options).map((o) => o.value);
}

describe("scalebar Unit options parity (4.2)", () => {
  it("the placement picker offers the same units as the edit form", () => {
    render(
      <ScalebarPickerPanel
        value={initialDefaultScalebarStyle()}
        onChange={() => {}}
      />,
    );
    const pickerUnits = unitOptions();
    cleanup();

    const anno: ScaleBarAnnotation = {
      id: "s1",
      kind: "scalebar",
      panelId: "p1",
      z: 5,
      lengthValue: 50,
      lengthUnit: "um",
    };
    render(
      <ScalebarAnnoForm
        anno={anno}
        dispatch={() => {}}
        commit={{ markDirty: () => {}, flush: () => {} }}
      />,
    );
    const formUnits = unitOptions();

    // Both must expose px — the only calibration-independent unit — and stay
    // identical so they can't drift again.
    expect(pickerUnits).toContain("px");
    expect(pickerUnits).toEqual(formUnits);
  });
});
