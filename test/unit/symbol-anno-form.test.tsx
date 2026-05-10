// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SymbolAnnoForm } from "../../src/renderer/components/Properties/SymbolAnnoForm";
import type { SymbolAnnotation } from "../../src/renderer/model/annotations";
import type { FieldCommit } from "../../src/renderer/hooks/useFieldCommit";

function ann(overrides: Partial<SymbolAnnotation> = {}): SymbolAnnotation {
  return {
    id: "s1",
    kind: "symbol",
    z: 0,
    symbolId: "arrow-filled-right",
    x: 50, y: 50, sizePx: 60, rotationDeg: 0,
    color: "#FF0000", strokeWidthPx: 2,
    fillMode: "filled", strokeStyle: "solid",
    ...overrides,
  };
}

const COMMIT: FieldCommit = { markDirty: () => {}, flush: () => {} };

describe("<SymbolAnnoForm>", () => {
  it("renders the flat grid (no category headers)", () => {
    render(<SymbolAnnoForm anno={ann()} dispatch={vi.fn()} commit={COMMIT} />);
    expect(screen.getByTestId("symbol-grid")).toBeDefined();
    expect(screen.queryByTestId(/symbol-grid-group-/)).toBeNull();
    // The legacy `symbol-gallery-group-*` test ids are also gone.
    expect(screen.queryByTestId(/symbol-gallery-group-/)).toBeNull();
  });

  it("clicking a shape dispatches UPDATE_ANNOTATION with new symbolId", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<SymbolAnnoForm anno={ann()} dispatch={dispatch} commit={COMMIT} />);
    await user.click(screen.getByTestId("symbol-grid-cell-shape-circle"));
    const calls = dispatch.mock.calls.map(
      ([a]) => a as { type?: string; patch?: { symbolId?: string } },
    );
    expect(
      calls.some(
        (c) =>
          c.type === "UPDATE_ANNOTATION" && c.patch?.symbolId === "shape-circle",
      ),
    ).toBe(true);
  });

  it("Filled toggle disabled when current shape is stroke-only", () => {
    render(
      <SymbolAnnoForm
        anno={ann({ symbolId: "arrow-line-right", fillMode: "outlined" })}
        dispatch={vi.fn()}
        commit={COMMIT}
      />,
    );
    expect(
      screen
        .getByTestId("symbol-fill-mode-filled")
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("toggling Outlined dispatches fillMode patch", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(
      <SymbolAnnoForm
        anno={ann({ fillMode: "filled" })}
        dispatch={dispatch}
        commit={COMMIT}
      />,
    );
    await user.click(screen.getByTestId("symbol-fill-mode-outlined"));
    const calls = dispatch.mock.calls.map(
      ([a]) => a as { type?: string; patch?: { fillMode?: string } },
    );
    expect(
      calls.some(
        (c) =>
          c.type === "UPDATE_ANNOTATION" && c.patch?.fillMode === "outlined",
      ),
    ).toBe(true);
  });

  it("Size, Rotation, and Delete controls are still present", () => {
    render(<SymbolAnnoForm anno={ann()} dispatch={vi.fn()} commit={COMMIT} />);
    expect(screen.getByTestId("symbol-rotate-reset")).toBeDefined();
    expect(screen.getByLabelText(/Size/i)).toBeDefined();
    expect(screen.getByLabelText(/Rotation/i)).toBeDefined();
    expect(screen.getByText(/Delete annotation/i)).toBeDefined();
  });
});
