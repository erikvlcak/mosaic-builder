// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SymbolAnnoForm } from "../../src/renderer/components/Properties/SymbolAnnoForm";
import type { SymbolAnnotation } from "../../src/renderer/model/annotations";

const makeAnno = (
  overrides: Partial<SymbolAnnotation> = {},
): SymbolAnnotation => ({
  id: "s1",
  kind: "symbol",
  z: 0,
  symbolId: "arrow-filled-right",
  x: 0,
  y: 0,
  sizePx: 60,
  rotationDeg: 0,
  color: "#FF0000",
  strokeWidthPx: 2,
  ...overrides,
});

const noopCommit = { markDirty: () => {}, flush: () => {} };

describe("SymbolAnnoForm", () => {
  it("renders gallery groups for each category", () => {
    const dispatch = vi.fn();
    const { getAllByTestId } = render(
      <SymbolAnnoForm
        anno={makeAnno()}
        dispatch={dispatch}
        commit={noopCommit}
      />,
    );
    expect(getAllByTestId(/^symbol-gallery-group-/).length).toBe(4);
  });

  it("clicking a non-active gallery cell dispatches UPDATE_ANNOTATION with that symbolId", () => {
    const dispatch = vi.fn();
    const { getByTestId } = render(
      <SymbolAnnoForm
        anno={makeAnno()}
        dispatch={dispatch}
        commit={noopCommit}
      />,
    );
    fireEvent.click(getByTestId("symbol-gallery-cell-shape-circle"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ANNOTATION",
      annotationId: "s1",
      patch: { symbolId: "shape-circle" },
    });
  });

  it("rotation reset button dispatches rotationDeg=0", () => {
    const dispatch = vi.fn();
    const anno = makeAnno({ rotationDeg: 137 });
    const { getByTestId } = render(
      <SymbolAnnoForm anno={anno} dispatch={dispatch} commit={noopCommit} />,
    );
    fireEvent.click(getByTestId("symbol-rotate-reset"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ANNOTATION",
      annotationId: "s1",
      patch: { rotationDeg: 0 },
    });
  });

  it("stroke-width input is disabled for fill symbols", () => {
    const dispatch = vi.fn();
    const { getByTestId } = render(
      <SymbolAnnoForm
        anno={makeAnno({ symbolId: "shape-circle" })}
        dispatch={dispatch}
        commit={noopCommit}
      />,
    );
    expect(
      (getByTestId("symbol-stroke-width") as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it("stroke-width input is enabled for stroke symbols", () => {
    const dispatch = vi.fn();
    const { getByTestId } = render(
      <SymbolAnnoForm
        anno={makeAnno({ symbolId: "marker-tick" })}
        dispatch={dispatch}
        commit={noopCommit}
      />,
    );
    expect(
      (getByTestId("symbol-stroke-width") as HTMLInputElement).disabled,
    ).toBe(false);
  });
});
