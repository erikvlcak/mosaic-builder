// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SymbolPickerPanel } from "../../src/renderer/components/Properties/SymbolPickerPanel";
import { initialDefaultSymbolStyle } from "../../src/renderer/model/default-symbol-style";

describe("<SymbolPickerPanel>", () => {
  it("clicking a shape in the grid updates the picker style", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SymbolPickerPanel
        value={initialDefaultSymbolStyle()}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByTestId("symbol-grid-cell-shape-circle"));
    const calls = onChange.mock.calls.map((c) => c[0]);
    expect(calls.some((p) => p.symbolId === "shape-circle")).toBe(true);
  });

  it("Filled toggle is disabled when active shape is stroke-only", () => {
    render(
      <SymbolPickerPanel
        value={{
          ...initialDefaultSymbolStyle(),
          symbolId: "arrow-line-right",
          fillMode: "outlined",
        }}
        onChange={() => {}}
      />,
    );
    const filledBtn = screen.getByTestId("symbol-fill-mode-filled");
    expect(filledBtn.hasAttribute("disabled")).toBe(true);
  });

  it("Filled toggle is enabled when active shape is closed", () => {
    render(
      <SymbolPickerPanel
        value={{
          ...initialDefaultSymbolStyle(),
          symbolId: "shape-circle",
          fillMode: "outlined",
        }}
        onChange={() => {}}
      />,
    );
    const filledBtn = screen.getByTestId("symbol-fill-mode-filled");
    expect(filledBtn.hasAttribute("disabled")).toBe(false);
  });

  it("stroke-style and stroke-width inputs are disabled when fillMode='filled' on a closed shape", () => {
    render(
      <SymbolPickerPanel
        value={{
          ...initialDefaultSymbolStyle(),
          symbolId: "shape-circle",
          fillMode: "filled",
        }}
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByTestId("symbol-stroke-style").hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByTestId("symbol-stroke-width").hasAttribute("disabled"),
    ).toBe(true);
  });

  it("stroke-style and stroke-width inputs are enabled when fillMode='outlined'", () => {
    render(
      <SymbolPickerPanel
        value={{
          ...initialDefaultSymbolStyle(),
          symbolId: "shape-circle",
          fillMode: "outlined",
        }}
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByTestId("symbol-stroke-style").hasAttribute("disabled"),
    ).toBe(false);
    expect(
      screen.getByTestId("symbol-stroke-width").hasAttribute("disabled"),
    ).toBe(false);
  });

  it("toggling Filled → Outlined patches the style", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SymbolPickerPanel
        value={{
          ...initialDefaultSymbolStyle(),
          symbolId: "shape-circle",
          fillMode: "filled",
        }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByTestId("symbol-fill-mode-outlined"));
    const calls = onChange.mock.calls.map((c) => c[0]);
    expect(calls.some((p) => p.fillMode === "outlined")).toBe(true);
  });
});
