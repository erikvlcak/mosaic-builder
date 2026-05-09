// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GridControls } from "../../src/renderer/components/Toolbar/GridControls";

describe("GridControls — Reset to uniform grid (spec 11)", () => {
  const defaults = {
    rows: 2,
    cols: 2,
    gutterPx: 12,
    gutterColor: "#FFFFFF",
    outerGutter: true,
    onChangeRows: () => {},
    onChangeCols: () => {},
    onChangeGutterPx: () => {},
    onChangeGutterColor: () => {},
    onChangeOuterGutter: () => {},
  };

  it("hides the Reset button when layout is uniform", () => {
    render(
      <GridControls
        {...defaults}
        layoutKind="uniform"
        onResetUniform={() => {}}
      />,
    );
    expect(screen.queryByTestId("reset-uniform-grid")).toBeNull();
  });

  it("shows the Reset button when layout is free", () => {
    render(
      <GridControls
        {...defaults}
        layoutKind="free"
        onResetUniform={() => {}}
      />,
    );
    expect(screen.getByTestId("reset-uniform-grid")).toBeTruthy();
  });

  it("clicking Reset calls onResetUniform", () => {
    const onResetUniform = vi.fn();
    render(
      <GridControls
        {...defaults}
        layoutKind="free"
        onResetUniform={onResetUniform}
      />,
    );
    fireEvent.click(screen.getByTestId("reset-uniform-grid"));
    expect(onResetUniform).toHaveBeenCalledTimes(1);
  });
});
