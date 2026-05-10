// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AnnotationOverview } from "../../src/renderer/components/Properties/AnnotationOverview";
import type {
  Annotation,
  TextAnnotation,
  SymbolAnnotation,
  ScaleBarAnnotation,
} from "../../src/renderer/model/annotations";

function textAnno(id: string): TextAnnotation {
  return {
    id,
    kind: "text",
    z: 0,
    x: 0,
    y: 0,
    text: "x",
    font: "Arial",
    sizePt: 12,
    bold: false,
    italic: false,
    color: "#000",
  };
}
function symAnno(id: string): SymbolAnnotation {
  return {
    id,
    kind: "symbol",
    z: 0,
    symbolId: "arrow-filled-right",
    x: 0,
    y: 0,
    sizePx: 10,
    rotationDeg: 0,
    color: "#000",
    strokeWidthPx: 1,
    fillMode: "filled",
    strokeStyle: "solid",
  };
}
function scalebarAnno(id: string, panelId = "p1"): ScaleBarAnnotation {
  return {
    id,
    kind: "scalebar",
    z: 0,
    panelId,
    lengthValue: 10,
    lengthUnit: "um",
  };
}

describe("AnnotationOverview", () => {
  it("renders rows only for non-empty kinds with the right counts", () => {
    const annotations: Annotation[] = [
      textAnno("t1"),
      textAnno("t2"),
      symAnno("s1"),
      // no scalebars
    ];
    render(
      <AnnotationOverview
        annotations={annotations}
        selectedAnnotationIds={new Set()}
        onSelectionChange={vi.fn()}
      />,
    );
    const textRow = screen.getByTestId("anno-overview-row-text");
    expect(textRow.textContent).toContain("Text");
    expect(textRow.textContent).toContain("(2)");
    expect(screen.getByTestId("anno-overview-row-symbol").textContent).toContain(
      "(1)",
    );
    expect(screen.queryByTestId("anno-overview-row-scalebar")).toBeNull();
  });

  it("returns null when there are no overview-eligible annotations", () => {
    const { container } = render(
      <AnnotationOverview
        annotations={[]}
        selectedAnnotationIds={new Set()}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("Select-all replaces the current selection with every id of that kind", () => {
    const annotations = [symAnno("s1"), symAnno("s2"), textAnno("t1")];
    const onSelectionChange = vi.fn();
    render(
      <AnnotationOverview
        annotations={annotations}
        selectedAnnotationIds={new Set(["t1"])}
        onSelectionChange={onSelectionChange}
      />,
    );
    fireEvent.click(screen.getByTestId("anno-overview-select-symbol"));
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["s1", "s2"]));
  });

  it("Shift-click on Select-all unions with the existing selection", () => {
    const annotations = [symAnno("s1"), symAnno("s2"), textAnno("t1")];
    const onSelectionChange = vi.fn();
    render(
      <AnnotationOverview
        annotations={annotations}
        selectedAnnotationIds={new Set(["t1"])}
        onSelectionChange={onSelectionChange}
      />,
    );
    fireEvent.click(screen.getByTestId("anno-overview-select-symbol"), {
      shiftKey: true,
    });
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["t1", "s1", "s2"]));
  });

  it("Letters do not appear as a row even when present in the figure", () => {
    // Note: AnnotationOverview takes user-creatable annotations as input;
    // letters are derived from state.letterOverrides at render time. There
    // is no "letter" kind in the user-facing Annotation union, but we
    // double-check that even if a future change widens the type, the row
    // stays hidden (per spec — wait until 08 lands).
    render(
      <AnnotationOverview
        annotations={[textAnno("t1"), symAnno("s1"), scalebarAnno("sb1")]}
        selectedAnnotationIds={new Set()}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("anno-overview-row-letter")).toBeNull();
  });
});
