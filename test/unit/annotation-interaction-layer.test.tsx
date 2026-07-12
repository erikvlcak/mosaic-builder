// @vitest-environment jsdom
/**
 * Behavior tests for the AnnotationInteractionLayer's text creation flow.
 * Locks in the fix for the "text option is not working" bug:
 *
 *  - Clicking inside the inline text-input does NOT bubble up to the layer's
 *    onPointerDown (which would call setPendingText again, remounting the
 *    input and dropping the user's typing).
 *  - Pressing Enter commits, dispatching ADD_ANNOTATION with the typed text.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnnotationInteractionLayer } from "../../src/renderer/components/Annotations/AnnotationInteractionLayer";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import type { SymbolAnnotation } from "../../src/renderer/model/annotations";
import type { PanelRect } from "../../src/renderer/render/coords";
import type { ImagePoolItem } from "../../src/renderer/model/pool";
import { initialDefaultSymbolStyle } from "../../src/renderer/model/default-symbol-style";
import { initialDefaultTextStyle } from "../../src/renderer/model/default-text-style";
import { initialDefaultScalebarStyle } from "../../src/renderer/model/default-scalebar-style";

const DEFAULT_PICKER = initialDefaultSymbolStyle();
const DEFAULT_TEXT_PICKER = initialDefaultTextStyle();
const DEFAULT_SCALEBAR_PICKER = initialDefaultScalebarStyle();

// jsdom doesn't ship a PointerEvent constructor. Without one, testing-library's
// fireEvent.pointerDown dispatches a MouseEvent with type "pointerdown" — which
// React's event system silently ignores. Polyfilling with MouseEvent is the
// standard workaround documented in jsdom issue #2527.
beforeAll(() => {
  if (typeof window !== "undefined" && !("PointerEvent" in window)) {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? "mouse";
      }
    }
    (
      window as unknown as { PointerEvent: typeof PointerEventPolyfill }
    ).PointerEvent = PointerEventPolyfill;
  }
  // jsdom doesn't implement Pointer Capture; stub the methods so handlers
  // that call setPointerCapture/hasPointerCapture don't throw.
  if (typeof Element !== "undefined") {
    if (typeof Element.prototype.setPointerCapture !== "function") {
      Element.prototype.setPointerCapture = function () {};
    }
    if (typeof Element.prototype.releasePointerCapture !== "function") {
      Element.prototype.releasePointerCapture = function () {};
    }
    if (typeof Element.prototype.hasPointerCapture !== "function") {
      Element.prototype.hasPointerCapture = function () {
        return false;
      };
    }
  }
});

const LETTERS_OFF = {
  ...DEFAULT_GLOBAL_STYLE,
  letters: { ...DEFAULT_GLOBAL_STYLE.letters, enabled: false },
};

const FIG: Figure = {
  canvas: { widthPx: 200, heightPx: 200, background: "#FFF" },
  grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
  panels: [],
  annotations: [],
  globalStyle: LETTERS_OFF,
};

function symAnno(
  id: string,
  overrides: Partial<SymbolAnnotation> = {},
): SymbolAnnotation {
  return {
    id,
    kind: "symbol",
    z: 1,
    symbolId: "shape-square",
    x: 25,
    y: 25,
    sizePx: 30,
    rotationDeg: 0,
    color: "#FF0000",
    strokeWidthPx: 1,
    fillMode: "outlined",
    strokeStyle: "solid",
    ...overrides,
  };
}

function setup(): { dispatch: ReturnType<typeof vi.fn> } {
  const dispatch = vi.fn();
  render(
    <AnnotationInteractionLayer
      activeTool="text"
      defaultSymbolStyle={DEFAULT_PICKER}
      defaultTextStyle={DEFAULT_TEXT_PICKER}
      defaultScalebarStyle={DEFAULT_SCALEBAR_PICKER}
      onDefaultScalebarStyleChange={() => {}}
      figure={FIG}
      panelRectsById={new Map()}
      imagesById={new Map()}
      cssW={200}
      cssH={200}
      figurePxW={200}
      figurePxH={200}
      selectedAnnotationIds={new Set()}
      onSelectionChange={() => {}}
      onEditingChange={() => {}}
      dispatch={dispatch}
    />,
  );
  return { dispatch };
}

describe("AnnotationInteractionLayer: text creation", () => {
  it("clicks the layer in text mode → opens the inline text input", () => {
    setup();
    const layer = screen.getByTestId("annotation-layer");
    fireEvent.pointerDown(layer, { button: 0, clientX: 80, clientY: 60 });
    expect(screen.getByTestId("anno-text-input")).toBeDefined();
  });

  it("typing into the input + Enter dispatches ADD_ANNOTATION with the typed text", () => {
    const { dispatch } = setup();
    const layer = screen.getByTestId("annotation-layer");
    fireEvent.pointerDown(layer, { button: 0, clientX: 80, clientY: 60 });
    const input = screen.getByTestId("anno-text-input");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const adds = dispatch.mock.calls
      .map(
        ([a]) =>
          a as { type: string; annotation?: { kind: string; text?: string } },
      )
      .filter((a) => a.type === "ADD_ANNOTATION");
    expect(adds).toHaveLength(1);
    expect(adds[0]?.annotation?.kind).toBe("text");
    expect(adds[0]?.annotation?.text).toBe("hello");
  });

  it("carries the default text style's halo flag onto the created annotation", () => {
    const { dispatch } = setup();
    const layer = screen.getByTestId("annotation-layer");
    fireEvent.pointerDown(layer, { button: 0, clientX: 80, clientY: 60 });
    const input = screen.getByTestId("anno-text-input");
    fireEvent.change(input, { target: { value: "legend" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const add = dispatch.mock.calls
      .map(([a]) => a as { type: string; annotation?: { halo?: boolean } })
      .find((a) => a.type === "ADD_ANNOTATION");
    // DEFAULT_TEXT_PICKER = initialDefaultTextStyle() ships halo on.
    expect(add?.annotation?.halo).toBe(true);
  });

  it("switching tools mid-type commits the pending text instead of dropping it (4.1)", () => {
    const dispatch = vi.fn();
    const props = {
      defaultSymbolStyle: DEFAULT_PICKER,
      defaultTextStyle: DEFAULT_TEXT_PICKER,
      defaultScalebarStyle: DEFAULT_SCALEBAR_PICKER,
      onDefaultScalebarStyleChange: () => {},
      figure: FIG,
      panelRectsById: new Map(),
      imagesById: new Map(),
      cssW: 200,
      cssH: 200,
      figurePxW: 200,
      figurePxH: 200,
      selectedAnnotationIds: new Set<string>(),
      onSelectionChange: () => {},
      onEditingChange: () => {},
      dispatch,
    };
    const { rerender } = render(
      <AnnotationInteractionLayer activeTool="text" {...props} />,
    );
    const layer = screen.getByTestId("annotation-layer");
    fireEvent.pointerDown(layer, { button: 0, clientX: 80, clientY: 60 });
    fireEvent.change(screen.getByTestId("anno-text-input"), {
      target: { value: "caption" },
    });
    // User clicks another tool button WITHOUT pressing Enter/blur.
    rerender(<AnnotationInteractionLayer activeTool="select" {...props} />);

    const adds = dispatch.mock.calls
      .map(([a]) => a as { type: string; annotation?: { text?: string } })
      .filter((a) => a.type === "ADD_ANNOTATION");
    expect(adds).toHaveLength(1);
    expect(adds[0]?.annotation?.text).toBe("caption");
  });
});

describe("AnnotationInteractionLayer: symbol creation + handles", () => {
  function setupSymbolTool(
    customPicker?: typeof DEFAULT_PICKER,
    opts?: {
      panelRectsById?: Map<string, PanelRect>;
      imagesById?: Map<string, ImagePoolItem>;
      figureOverride?: Figure;
    },
  ): {
    dispatch: ReturnType<typeof vi.fn>;
    onSelect: ReturnType<typeof vi.fn>;
  } {
    const dispatch = vi.fn();
    const onSelect = vi.fn();
    render(
      <AnnotationInteractionLayer
        activeTool="symbol"
        defaultSymbolStyle={customPicker ?? DEFAULT_PICKER}
        defaultTextStyle={DEFAULT_TEXT_PICKER}
        defaultScalebarStyle={DEFAULT_SCALEBAR_PICKER}
        onDefaultScalebarStyleChange={() => {}}
        figure={opts?.figureOverride ?? FIG}
        panelRectsById={opts?.panelRectsById ?? new Map()}
        imagesById={opts?.imagesById ?? new Map()}
        cssW={200}
        cssH={200}
        figurePxW={200}
        figurePxH={200}
        selectedAnnotationIds={new Set()}
        onSelectionChange={onSelect}
        onEditingChange={() => {}}
        dispatch={dispatch}
      />,
    );
    return { dispatch, onSelect };
  }

  function setupSelectedSymbol(symbol: SymbolAnnotation): {
    dispatch: ReturnType<typeof vi.fn>;
    onSelect: ReturnType<typeof vi.fn>;
  } {
    const dispatch = vi.fn();
    const onSelect = vi.fn();
    const figureWithSymbol: Figure = {
      ...FIG,
      annotations: [symbol],
    };
    render(
      <AnnotationInteractionLayer
        activeTool="select"
        defaultSymbolStyle={DEFAULT_PICKER}
        defaultTextStyle={DEFAULT_TEXT_PICKER}
        defaultScalebarStyle={DEFAULT_SCALEBAR_PICKER}
        onDefaultScalebarStyleChange={() => {}}
        figure={figureWithSymbol}
        panelRectsById={new Map()}
        imagesById={new Map()}
        cssW={200}
        cssH={200}
        figurePxW={200}
        figurePxH={200}
        selectedAnnotationIds={new Set([symbol.id])}
        onSelectionChange={onSelect}
        onEditingChange={() => {}}
        dispatch={dispatch}
      />,
    );
    return { dispatch, onSelect };
  }

  it("clicking the layer in symbol mode dispatches ADD_ANNOTATION with the picker's defaultSymbolStyle", () => {
    const { dispatch } = setupSymbolTool({
      symbolId: "shape-circle",
      fillMode: "outlined",
      strokeStyle: "dashed",
      strokeWidthPx: 5,
      color: "#00FF00",
    });
    const layer = screen.getByTestId("annotation-layer");
    fireEvent.pointerDown(layer, { button: 0, clientX: 100, clientY: 80 });
    const adds = dispatch.mock.calls
      .map(([a]) => a as { type: string; annotation?: SymbolAnnotation })
      .filter((a) => a.type === "ADD_ANNOTATION");
    expect(adds).toHaveLength(1);
    const ann = adds[0]!.annotation!;
    expect(ann.kind).toBe("symbol");
    expect(ann.symbolId).toBe("shape-circle");
    expect(ann.fillMode).toBe("outlined");
    expect(ann.strokeStyle).toBe("dashed");
    expect(ann.strokeWidthPx).toBe(5);
    expect(ann.color).toBe("#00FF00");
  });

  it("symbol placement does NOT auto-select the new annotation (placement mode persists)", () => {
    const { onSelect } = setupSymbolTool();
    const layer = screen.getByTestId("annotation-layer");
    fireEvent.pointerDown(layer, { button: 0, clientX: 100, clientY: 80 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clicking on an image-bearing panel binds the new symbol to the image", () => {
    const panelRectsById = new Map<string, PanelRect>([
      ["p-1", { x: 0, y: 0, w: 200, h: 200 }],
    ]);
    const imagesById = new Map<string, ImagePoolItem>([
      [
        "img-1",
        {
          id: "img-1",
          filename: "x.png",
          filePath: "/tmp/x.png",
          mime: "image/png",
          width: 100,
          height: 100,
          bitDepth: 8,
        },
      ],
    ]);
    const figure: Figure = {
      ...FIG,
      panels: [
        {
          panelId: "p-1",
          row: 0,
          col: 0,
          kind: "image",
          imageId: "img-1",
          transform: {
            fit: "cover",
            zoom: 1,
            panX: 0,
            panY: 0,
            rotation: 0,
            flipH: false,
            flipV: false,
          },
        },
      ],
    };
    const { dispatch } = setupSymbolTool(undefined, {
      panelRectsById,
      imagesById,
      figureOverride: figure,
    });
    const layer = screen.getByTestId("annotation-layer");
    fireEvent.pointerDown(layer, { button: 0, clientX: 100, clientY: 100 });
    const call = dispatch.mock.calls.find(
      ([action]) => (action as { type: string }).type === "ADD_ANNOTATION",
    );
    expect(call).toBeDefined();
    const action = call![0] as {
      type: "ADD_ANNOTATION";
      annotation: SymbolAnnotation;
    };
    expect(action.annotation.imageId).toBe("img-1");
    expect(action.annotation.panelId).toBe("p-1");
    expect(action.annotation.anchor).toBeDefined();
  });

  it("renders 4 corner handles + 1 rotation handle for a selected symbol", () => {
    const sym: SymbolAnnotation = {
      id: "sym-1",
      kind: "symbol",
      z: 1,
      symbolId: "arrow-filled-right",
      x: 100,
      y: 100,
      sizePx: 60,
      rotationDeg: 0,
      color: "#FF0000",
      strokeWidthPx: 2,
      fillMode: "filled",
      strokeStyle: "solid",
    };
    setupSelectedSymbol(sym);
    expect(screen.getByTestId("anno-symbol-handle-tl")).toBeDefined();
    expect(screen.getByTestId("anno-symbol-handle-tr")).toBeDefined();
    expect(screen.getByTestId("anno-symbol-handle-bl")).toBeDefined();
    expect(screen.getByTestId("anno-symbol-handle-br")).toBeDefined();
    expect(screen.getByTestId("anno-symbol-handle-rotate")).toBeDefined();
  });

  it("dragging the BR corner dispatches UPDATE_ANNOTATION with new sizePx", () => {
    const sym: SymbolAnnotation = {
      id: "sym-1",
      kind: "symbol",
      z: 1,
      symbolId: "arrow-filled-right",
      x: 100,
      y: 100,
      sizePx: 60,
      rotationDeg: 0,
      color: "#FF0000",
      strokeWidthPx: 2,
      fillMode: "filled",
      strokeStyle: "solid",
    };
    const { dispatch } = setupSelectedSymbol(sym);
    const handle = screen.getByTestId("anno-symbol-handle-br");
    fireEvent.pointerDown(handle, { button: 0, clientX: 130, clientY: 130 });
    fireEvent.pointerMove(handle, { clientX: 150, clientY: 140 });
    const call = dispatch.mock.calls.find(
      ([action]) => (action as { type: string }).type === "UPDATE_ANNOTATION",
    );
    expect(call).toBeDefined();
    const action = call![0] as {
      type: "UPDATE_ANNOTATION";
      annotationId: string;
      patch: Partial<SymbolAnnotation>;
    };
    expect(action.annotationId).toBe("sym-1");
    // Center is (100, 100); pointer is at (150, 140) → max(|50|, |40|) = 50, sizePx = 100.
    expect(action.patch.sizePx).toBe(100);
  });

  it("dragging the rotation handle dispatches UPDATE_ANNOTATION with a new rotationDeg", () => {
    const sym: SymbolAnnotation = {
      id: "sym-1",
      kind: "symbol",
      z: 1,
      symbolId: "arrow-filled-right",
      x: 100,
      y: 100,
      sizePx: 60,
      rotationDeg: 0,
      color: "#FF0000",
      strokeWidthPx: 2,
      fillMode: "filled",
      strokeStyle: "solid",
    };
    const { dispatch } = setupSelectedSymbol(sym);
    const handle = screen.getByTestId("anno-symbol-handle-rotate");
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 54 });
    fireEvent.pointerMove(handle, { clientX: 146, clientY: 100 });
    const call = dispatch.mock.calls.find(
      ([action]) => (action as { type: string }).type === "UPDATE_ANNOTATION",
    );
    expect(call).toBeDefined();
    const action = call![0] as {
      type: "UPDATE_ANNOTATION";
      annotationId: string;
      patch: Partial<SymbolAnnotation>;
    };
    expect(action.patch.rotationDeg).toBeCloseTo(90, 0);
  });

  it("rotation handle preserves the start rotation across a small move (no snap)", () => {
    const sym: SymbolAnnotation = {
      id: "sym-1",
      kind: "symbol",
      z: 1,
      symbolId: "arrow-filled-right",
      x: 100,
      y: 100,
      sizePx: 60,
      rotationDeg: 45,
      color: "#FF0000",
      strokeWidthPx: 2,
      fillMode: "filled",
      strokeStyle: "solid",
    };
    const { dispatch } = setupSelectedSymbol(sym);
    const handle = screen.getByTestId("anno-symbol-handle-rotate");
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 54 });
    fireEvent.pointerMove(handle, { clientX: 100.1, clientY: 54 });
    const update = dispatch.mock.calls.find(
      ([a]) => (a as { type: string }).type === "UPDATE_ANNOTATION",
    );
    expect(update).toBeDefined();
    const action = update![0] as {
      type: "UPDATE_ANNOTATION";
      annotationId: string;
      patch: Partial<SymbolAnnotation>;
    };
    expect(action.patch.rotationDeg).toBeCloseTo(45, 0);
  });
});

describe("AnnotationInteractionLayer: multi-select gestures", () => {
  /** Two annos placed at known positions so hit-rect coords are predictable. */
  const FIG_TWO_SYMBOLS: Figure = {
    ...FIG,
    annotations: [
      symAnno("b1", { x: 25, y: 25, sizePx: 30 }),
      symAnno("b2", { x: 120, y: 120, sizePx: 40 }),
    ],
  };

  function setupSelectMode(opts?: {
    selectedIds?: ReadonlySet<string>;
    figure?: Figure;
  }): {
    dispatch: ReturnType<typeof vi.fn>;
    onSelectionChange: ReturnType<typeof vi.fn>;
  } {
    const dispatch = vi.fn();
    const onSelectionChange = vi.fn();
    render(
      <AnnotationInteractionLayer
        activeTool="select"
        defaultSymbolStyle={DEFAULT_PICKER}
        defaultTextStyle={DEFAULT_TEXT_PICKER}
        defaultScalebarStyle={DEFAULT_SCALEBAR_PICKER}
        onDefaultScalebarStyleChange={() => {}}
        figure={opts?.figure ?? FIG_TWO_SYMBOLS}
        panelRectsById={new Map()}
        imagesById={new Map()}
        cssW={200}
        cssH={200}
        figurePxW={200}
        figurePxH={200}
        selectedAnnotationIds={opts?.selectedIds ?? new Set()}
        onSelectionChange={onSelectionChange}
        onEditingChange={() => {}}
        dispatch={dispatch}
      />,
    );
    return { dispatch, onSelectionChange };
  }

  it("plain click on an anno replaces the selection with just that id", () => {
    const { onSelectionChange } = setupSelectMode({
      selectedIds: new Set(["b2"]),
    });
    fireEvent.pointerDown(screen.getByTestId("anno-hit-b1"), {
      button: 0,
      clientX: 25,
      clientY: 25,
    });
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["b1"]));
  });

  it("shift-click on an unselected anno adds it to the selection", () => {
    const { onSelectionChange } = setupSelectMode({
      selectedIds: new Set(["b2"]),
    });
    fireEvent.pointerDown(screen.getByTestId("anno-hit-b1"), {
      button: 0,
      clientX: 25,
      clientY: 25,
      shiftKey: true,
    });
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["b2", "b1"]));
  });

  it("shift-click on an already-selected anno removes it from the selection", () => {
    const { onSelectionChange } = setupSelectMode({
      selectedIds: new Set(["b1", "b2"]),
    });
    fireEvent.pointerDown(screen.getByTestId("anno-hit-b1"), {
      button: 0,
      clientX: 25,
      clientY: 25,
      shiftKey: true,
    });
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["b2"]));
  });

  it("clicking an already-selected anno (multi-select) does NOT collapse to single-select", () => {
    const { onSelectionChange } = setupSelectMode({
      selectedIds: new Set(["b1", "b2"]),
    });
    fireEvent.pointerDown(screen.getByTestId("anno-hit-b1"), {
      button: 0,
      clientX: 25,
      clientY: 25,
    });
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("renders chrome for every selected annotation when > 1 is selected", () => {
    setupSelectMode({ selectedIds: new Set(["b1", "b2"]) });
    expect(screen.queryByTestId("anno-selection-chrome-b1")).not.toBeNull();
    expect(screen.queryByTestId("anno-selection-chrome-b2")).not.toBeNull();
    expect(screen.queryByTestId("anno-group-bbox")).not.toBeNull();
  });

  it("does not render the group bbox when only one is selected", () => {
    setupSelectMode({ selectedIds: new Set(["b1"]) });
    expect(screen.queryByTestId("anno-group-bbox")).toBeNull();
    expect(screen.queryByTestId("anno-selection-chrome-b1")).not.toBeNull();
  });

  it("dragging one of N selected annos translates every selected anno by the same delta", () => {
    const { dispatch } = setupSelectMode({
      selectedIds: new Set(["b1", "b2"]),
    });
    fireEvent.pointerDown(screen.getByTestId("anno-hit-b1"), {
      button: 0,
      clientX: 25,
      clientY: 25,
    });
    fireEvent.pointerMove(screen.getByTestId("anno-hit-b1"), {
      clientX: 40,
      clientY: 35,
    });
    // Two UPDATE_ANNOTATION calls, one per selected anno, with matching delta (15, 10).
    const updates = dispatch.mock.calls
      .map(
        ([a]) =>
          a as {
            type: string;
            annotationId?: string;
            patch?: { x?: number; y?: number };
          },
      )
      .filter((a) => a.type === "UPDATE_ANNOTATION");
    expect(updates).toHaveLength(2);
    const byId = new Map(updates.map((u) => [u.annotationId, u.patch]));
    // Symbol annotations' x,y is the center; both move by the same delta.
    expect(byId.get("b1")).toMatchObject({ x: 40, y: 35 });
    expect(byId.get("b2")).toMatchObject({ x: 135, y: 130 });
  });

  it("clicking empty backdrop with no movement clears the selection", () => {
    const { onSelectionChange } = setupSelectMode({
      selectedIds: new Set(["b1", "b2"]),
    });
    const backdrop = screen.getByTestId("annotation-backdrop");
    fireEvent.pointerDown(backdrop, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(backdrop, { clientX: 5, clientY: 5 });
    expect(onSelectionChange).toHaveBeenCalledWith(new Set());
  });

  it("shift-click on empty backdrop preserves the existing selection", () => {
    const { onSelectionChange } = setupSelectMode({
      selectedIds: new Set(["b1", "b2"]),
    });
    const backdrop = screen.getByTestId("annotation-backdrop");
    fireEvent.pointerDown(backdrop, {
      button: 0,
      clientX: 5,
      clientY: 5,
      shiftKey: true,
    });
    fireEvent.pointerUp(backdrop, { clientX: 5, clientY: 5, shiftKey: true });
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("dragging on empty space does NOT select annotations (drag is a view pan)", () => {
    // Marquee area-selection was removed: a drag on the backdrop pans the
    // view (handled by useCanvasZoom) and must not select anything.
    const { onSelectionChange } = setupSelectMode();
    const backdrop = screen.getByTestId("annotation-backdrop");
    fireEvent.pointerDown(backdrop, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerMove(backdrop, { clientX: 160, clientY: 160 });
    fireEvent.pointerUp(backdrop, { clientX: 160, clientY: 160 });
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("dragging on empty space does NOT clear an existing selection", () => {
    // The user's complaint: dragging to pan shouldn't disturb selection.
    const { onSelectionChange } = setupSelectMode({
      selectedIds: new Set(["b2"]),
    });
    const backdrop = screen.getByTestId("annotation-backdrop");
    fireEvent.pointerDown(backdrop, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerMove(backdrop, { clientX: 160, clientY: 160 });
    fireEvent.pointerUp(backdrop, { clientX: 160, clientY: 160 });
    expect(onSelectionChange).not.toHaveBeenCalled();
  });
});

describe("AnnotationInteractionLayer: letter selection (spec 08)", () => {
  /**
   * Figure with a single panel + one derived letter annotation, with letters
   * enabled in the global style so the layer renders a hit-rect for it.
   */
  const FIG_WITH_LETTER: Figure = {
    canvas: { widthPx: 200, heightPx: 200, background: "#FFF" },
    grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
    panels: [
      {
        panelId: "p1",
        row: 0,
        col: 0,
        kind: "placeholder",
        label: "",
        rowSpan: 1,
        colSpan: 1,
      },
    ],
    annotations: [
      { id: "letter:p1", kind: "letter", panelId: "p1", z: 0, text: "A" },
    ],
    globalStyle: DEFAULT_GLOBAL_STYLE,
  };

  function setupLetter(opts?: { selectedIds?: ReadonlySet<string> }): {
    onSelectionChange: ReturnType<typeof vi.fn>;
  } {
    const onSelectionChange = vi.fn();
    const panelRect: PanelRect = { x: 0, y: 0, w: 200, h: 200 };
    render(
      <AnnotationInteractionLayer
        activeTool="select"
        defaultSymbolStyle={DEFAULT_PICKER}
        defaultTextStyle={DEFAULT_TEXT_PICKER}
        defaultScalebarStyle={DEFAULT_SCALEBAR_PICKER}
        onDefaultScalebarStyleChange={() => {}}
        figure={FIG_WITH_LETTER}
        panelRectsById={new Map([["p1", panelRect]])}
        imagesById={new Map()}
        cssW={200}
        cssH={200}
        figurePxW={200}
        figurePxH={200}
        selectedAnnotationIds={opts?.selectedIds ?? new Set()}
        onSelectionChange={onSelectionChange}
        onEditingChange={() => {}}
        dispatch={vi.fn()}
      />,
    );
    return { onSelectionChange };
  }

  it("renders a hit-rect for derived letters", () => {
    setupLetter();
    expect(screen.getByTestId("anno-hit-letter:p1")).toBeDefined();
  });

  it("plain click on a letter replaces selection with the letter id", () => {
    const { onSelectionChange } = setupLetter();
    const hit = screen.getByTestId("anno-hit-letter:p1");
    fireEvent.pointerDown(hit, { button: 0, clientX: 5, clientY: 5 });
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["letter:p1"]));
  });

  it("shift-click toggles a letter in the existing selection", () => {
    const { onSelectionChange } = setupLetter({
      selectedIds: new Set(["someAnno"]),
    });
    const hit = screen.getByTestId("anno-hit-letter:p1");
    fireEvent.pointerDown(hit, {
      button: 0,
      clientX: 5,
      clientY: 5,
      shiftKey: true,
    });
    expect(onSelectionChange).toHaveBeenCalledWith(
      new Set(["someAnno", "letter:p1"]),
    );
  });
});

describe("AnnotationInteractionLayer: alignment guidelines (spec 14)", () => {
  /**
   * Two symbols set up so that nudging b1 aligns its left edge with b2's left
   * edge. Symbols are center-anchored so we use bounds derived from sizePx/2.
   *
   *   b1: center (25, 25), sizePx 30 → x range 10..40
   *   b2: center (125, 125), sizePx 50 → x range 100..150
   */
  const FIG_TWO_FOR_SNAP: Figure = {
    canvas: { widthPx: 300, heightPx: 300, background: "#FFF" },
    grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
    panels: [],
    annotations: [
      symAnno("b1", { x: 25, y: 25, sizePx: 30 }),
      symAnno("b2", { x: 125, y: 125, sizePx: 50 }),
    ],
    globalStyle: LETTERS_OFF,
  };

  function setupSnap(): {
    dispatch: ReturnType<typeof vi.fn>;
  } {
    const dispatch = vi.fn();
    render(
      <AnnotationInteractionLayer
        activeTool="select"
        defaultSymbolStyle={DEFAULT_PICKER}
        defaultTextStyle={DEFAULT_TEXT_PICKER}
        defaultScalebarStyle={DEFAULT_SCALEBAR_PICKER}
        onDefaultScalebarStyleChange={() => {}}
        figure={FIG_TWO_FOR_SNAP}
        panelRectsById={new Map()}
        imagesById={new Map()}
        cssW={300}
        cssH={300}
        figurePxW={300}
        figurePxH={300}
        selectedAnnotationIds={new Set(["b1"])}
        onSelectionChange={() => {}}
        onEditingChange={() => {}}
        dispatch={dispatch}
      />,
    );
    return { dispatch };
  }

  it("dragging b1 near b2's left edge shows an alignment guideline", () => {
    const { dispatch } = setupSnap();
    // Move b1's center close enough to align its left edge with b2's left
    // edge (b2 center 125, sizePx 50 → left edge at 100; b1 sizePx 30 →
    // x_center to match must be 115). We don't depend on the exact snap
    // tolerance value here — the guideline appearance is the contract.
    fireEvent.pointerDown(screen.getByTestId("anno-hit-b1"), {
      button: 0,
      clientX: 25,
      clientY: 25,
    });
    fireEvent.pointerMove(screen.getByTestId("anno-hit-b1"), {
      clientX: 116,
      clientY: 25,
    });
    expect(dispatch.mock.calls.length).toBeGreaterThan(0);
    expect(screen.queryByTestId("anno-guidelines")).not.toBeNull();
    const lines = screen.getAllByTestId("anno-guideline");
    expect(lines.some((l) => l.getAttribute("data-axis") === "x")).toBe(true);
  });

  it("guidelines disappear on pointerup", () => {
    setupSnap();
    fireEvent.pointerDown(screen.getByTestId("anno-hit-b1"), {
      button: 0,
      clientX: 25,
      clientY: 25,
    });
    fireEvent.pointerMove(screen.getByTestId("anno-hit-b1"), {
      clientX: 116,
      clientY: 25,
    });
    expect(screen.queryByTestId("anno-guidelines")).not.toBeNull();
    fireEvent.pointerUp(screen.getByTestId("anno-hit-b1"), {
      clientX: 116,
      clientY: 25,
    });
    expect(screen.queryByTestId("anno-guidelines")).toBeNull();
  });

  it("dragging far from any other anno produces no guidelines", () => {
    setupSnap();
    fireEvent.pointerDown(screen.getByTestId("anno-hit-b1"), {
      button: 0,
      clientX: 25,
      clientY: 25,
    });
    // Move b1 to (240, 240) — well clear of b2.
    fireEvent.pointerMove(screen.getByTestId("anno-hit-b1"), {
      clientX: 240,
      clientY: 240,
    });
    expect(screen.queryByTestId("anno-guidelines")).toBeNull();
  });
});

describe("AnnotationInteractionLayer: scale bar on uncalibrated panel", () => {
  const panelRectsById = new Map<string, PanelRect>([
    ["p-1", { x: 0, y: 0, w: 200, h: 200 }],
  ]);
  const uncalibrated = new Map<string, ImagePoolItem>([
    [
      "img-1",
      {
        id: "img-1",
        filename: "x.png",
        filePath: "/tmp/x.png",
        mime: "image/png",
        width: 100,
        height: 100,
        bitDepth: 8,
      },
    ],
  ]);
  const figureWithImage: Figure = {
    ...FIG,
    panels: [
      {
        panelId: "p-1",
        row: 0,
        col: 0,
        kind: "image",
        imageId: "img-1",
        transform: {
          fit: "cover",
          zoom: 1,
          panX: 0,
          panY: 0,
          rotation: 0,
          flipH: false,
          flipV: false,
        },
      },
    ],
  };

  function renderScalebar(
    onRequestCalibration: (i: string, p: string) => void,
  ) {
    render(
      <AnnotationInteractionLayer
        activeTool="scalebar"
        defaultSymbolStyle={DEFAULT_PICKER}
        defaultTextStyle={DEFAULT_TEXT_PICKER}
        defaultScalebarStyle={DEFAULT_SCALEBAR_PICKER}
        onDefaultScalebarStyleChange={() => {}}
        figure={figureWithImage}
        panelRectsById={panelRectsById}
        imagesById={uncalibrated}
        cssW={200}
        cssH={200}
        figurePxW={200}
        figurePxH={200}
        selectedAnnotationIds={new Set()}
        onSelectionChange={() => {}}
        onEditingChange={() => {}}
        dispatch={vi.fn()}
        onRequestCalibration={onRequestCalibration}
      />,
    );
  }

  it("clicking an uncalibrated image panel requests calibration instead of dead-ending", () => {
    const onRequestCalibration = vi.fn();
    renderScalebar(onRequestCalibration);
    fireEvent.pointerDown(screen.getByTestId("annotation-layer"), {
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    expect(onRequestCalibration).toHaveBeenCalledWith("img-1", "p-1");
  });
});
