// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MultiAnnoForm } from "../../src/renderer/components/Properties/MultiAnnoForm";
import { PropertiesPanel } from "../../src/renderer/components/Properties/PropertiesPanel";
import { initialFigureState } from "../../src/renderer/model/figure-state";
import type {
  Annotation,
  TextAnnotation,
  SymbolAnnotation,
} from "../../src/renderer/model/annotations";

function textAnno(
  id: string,
  overrides?: Partial<TextAnnotation>,
): TextAnnotation {
  return {
    id,
    kind: "text",
    z: 0,
    x: 0,
    y: 0,
    text: "hi",
    font: "Arial",
    sizePt: 12,
    bold: false,
    italic: false,
    color: "#000000",
    ...overrides,
  };
}

function symbolAnno(
  id: string,
  overrides?: Partial<SymbolAnnotation>,
): SymbolAnnotation {
  return {
    id,
    kind: "symbol",
    z: 0,
    symbolId: "arrow-filled-right",
    x: 0,
    y: 0,
    sizePx: 50,
    rotationDeg: 0,
    color: "#FF0000",
    strokeWidthPx: 2,
    fillMode: "filled",
    strokeStyle: "solid",
    ...overrides,
  };
}

const COMMIT = { markDirty: vi.fn(), flush: vi.fn() };

describe("MultiAnnoForm", () => {
  it("shows N annotations and the kinds in the header summary", () => {
    render(
      <MultiAnnoForm
        selectedAnnos={[textAnno("t1"), symbolAnno("s1")]}
        dispatch={vi.fn()}
        commit={COMMIT}
        onBulkRemove={() => {}}
      />,
    );
    const summary = screen.getByTestId("multi-anno-summary");
    expect(summary.textContent).toContain("2 annotations selected");
    expect(summary.textContent).toContain("Text");
    expect(summary.textContent).toContain("Symbols");
  });

  it("Color change dispatches BULK_UPDATE_ANNOS with color", () => {
    const dispatch = vi.fn();
    render(
      <MultiAnnoForm
        selectedAnnos={[textAnno("t1"), symbolAnno("s1")]}
        dispatch={dispatch}
        commit={COMMIT}
        onBulkRemove={() => {}}
      />,
    );
    const swatch = screen.getByLabelText("Color");
    fireEvent.change(swatch, { target: { value: "#abcdef" } });
    const calls = dispatch.mock.calls.map(
      ([a]) =>
        a as { type: string; ids?: string[]; patch?: Record<string, unknown> },
    );
    const bulk = calls.find((c) => c.type === "BULK_UPDATE_ANNOS");
    expect(bulk).toBeDefined();
    expect(bulk!.ids).toEqual(["t1", "s1"]);
    expect(bulk!.patch).toMatchObject({ color: "#abcdef" });
  });

  it("Delete-all dispatches BULK_REMOVE_ANNOS and calls onBulkRemove", () => {
    const dispatch = vi.fn();
    const onBulkRemove = vi.fn();
    render(
      <MultiAnnoForm
        selectedAnnos={[textAnno("t1"), symbolAnno("s1")]}
        dispatch={dispatch}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
        onBulkRemove={onBulkRemove}
      />,
    );
    fireEvent.click(screen.getByTestId("multi-anno-delete-all"));
    expect(
      dispatch.mock.calls.some(
        ([a]) =>
          (a as { type: string }).type === "BULK_REMOVE_ANNOS" &&
          (a as { ids: string[] }).ids.join() === "t1,s1",
      ),
    ).toBe(true);
    expect(onBulkRemove).toHaveBeenCalled();
  });

  it("Size scale dispatches one UPDATE_ANNOTATION per anno against snapshot", () => {
    const dispatch = vi.fn();
    render(
      <MultiAnnoForm
        selectedAnnos={[
          textAnno("t1", { sizePt: 10 }),
          symbolAnno("s1", { sizePx: 40 }),
        ]}
        dispatch={dispatch}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
        onBulkRemove={() => {}}
      />,
    );
    const scale = screen.getByLabelText("Size scale (%)");
    fireEvent.change(scale, { target: { value: "200" } });
    const updates = dispatch.mock.calls
      .map(
        ([a]) =>
          a as {
            type: string;
            annotationId?: string;
            patch?: Record<string, unknown>;
          },
      )
      .filter((a) => a.type === "UPDATE_ANNOTATION");
    expect(updates).toHaveLength(2);
    const byId = new Map(updates.map((u) => [u.annotationId, u.patch]));
    expect(byId.get("t1")).toMatchObject({ sizePt: 20 });
    expect(byId.get("s1")).toMatchObject({ sizePx: 80 });
  });
});

describe("PropertiesPanel routes to MultiAnnoForm when selectedAnnos.length > 1", () => {
  it("renders MultiAnnoForm summary when selectedAnnos has > 1 entry", () => {
    const annos: Annotation[] = [textAnno("t1"), symbolAnno("s1")];
    render(
      <PropertiesPanel
        state={initialFigureState()}
        focusedPanel={undefined}
        selectedAnno={undefined}
        selectedAnnos={annos}
        dispatch={vi.fn()}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
        onCalibrate={() => {}}
      />,
    );
    expect(screen.getByTestId("multi-anno-summary")).toBeTruthy();
  });

  it("falls through to single-select when selectedAnnos has 1 entry", () => {
    render(
      <PropertiesPanel
        state={initialFigureState()}
        focusedPanel={undefined}
        selectedAnno={textAnno("t1")}
        selectedAnnos={[textAnno("t1")]}
        dispatch={vi.fn()}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
        onCalibrate={() => {}}
      />,
    );
    expect(screen.queryByTestId("multi-anno-summary")).toBeNull();
    expect(screen.getByLabelText("Text")).toBeTruthy();
  });
});
