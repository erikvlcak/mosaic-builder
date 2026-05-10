// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SymbolGrid } from "../../src/renderer/components/Properties/SymbolGrid";
import { SYMBOL_LIBRARY } from "../../src/renderer/symbols/library";

describe("<SymbolGrid>", () => {
  it("renders one cell per library entry, flat (no category headers)", () => {
    render(
      <SymbolGrid
        value="arrow-filled-right"
        currentColor="#FF0000"
        currentStrokeWidthPx={2}
        currentFillMode="filled"
        currentStrokeStyle="solid"
        onChange={() => {}}
      />,
    );
    for (const def of SYMBOL_LIBRARY) {
      expect(screen.getByTestId(`symbol-grid-cell-${def.id}`)).toBeDefined();
    }
    expect(screen.queryByTestId(/symbol-grid-group-/)).toBeNull();
  });

  it("marks the active cell with aria-pressed=true", () => {
    render(
      <SymbolGrid
        value="shape-circle"
        currentColor="#FF0000"
        currentStrokeWidthPx={2}
        currentFillMode="filled"
        currentStrokeStyle="solid"
        onChange={() => {}}
      />,
    );
    const active = screen.getByTestId("symbol-grid-cell-shape-circle");
    expect(active.getAttribute("aria-pressed")).toBe("true");
    const other = screen.getByTestId("symbol-grid-cell-shape-square");
    expect(other.getAttribute("aria-pressed")).toBe("false");
  });

  it("clicking a cell calls onChange with that symbol id", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SymbolGrid
        value="shape-circle"
        currentColor="#FF0000"
        currentStrokeWidthPx={2}
        currentFillMode="filled"
        currentStrokeStyle="solid"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByTestId("symbol-grid-cell-shape-square"));
    expect(onChange).toHaveBeenCalledWith("shape-square");
  });

  it("preview SVGs use the current color for fill when shape is fillable + filled", () => {
    render(
      <SymbolGrid
        value="shape-circle"
        currentColor="#00FF00"
        currentStrokeWidthPx={2}
        currentFillMode="filled"
        currentStrokeStyle="solid"
        onChange={() => {}}
      />,
    );
    const cell = screen.getByTestId("symbol-grid-cell-shape-circle");
    const path = cell.querySelector("path");
    expect(path?.getAttribute("fill")).toBe("#00FF00");
  });

  it("preview SVGs stroke instead of fill when fillMode='outlined'", () => {
    render(
      <SymbolGrid
        value="shape-circle"
        currentColor="#00FF00"
        currentStrokeWidthPx={2}
        currentFillMode="outlined"
        currentStrokeStyle="solid"
        onChange={() => {}}
      />,
    );
    const cell = screen.getByTestId("symbol-grid-cell-shape-circle");
    const path = cell.querySelector("path");
    expect(path?.getAttribute("fill")).toBe("none");
    expect(path?.getAttribute("stroke")).toBe("#00FF00");
  });
});
