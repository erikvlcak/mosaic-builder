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
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AnnotationInteractionLayer } from "../../src/renderer/components/Annotations/AnnotationInteractionLayer";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import type { SymbolAnnotation } from "../../src/renderer/model/annotations";
import type { PanelRect } from "../../src/renderer/render/coords";
import type { ImagePoolItem } from "../../src/renderer/model/pool";

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
    (window as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent =
      PointerEventPolyfill;
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

function setup(): { dispatch: ReturnType<typeof vi.fn> } {
  const dispatch = vi.fn();
  render(
    <AnnotationInteractionLayer
      activeTool="text"
      figure={FIG}
      panelRectsById={new Map()}
      imagesById={new Map()}
      cssW={200}
      cssH={200}
      figurePxW={200}
      figurePxH={200}
      selectedAnnotationId={null}
      onSelectAnnotation={() => {}}
      onEditingChange={() => {}}
      dispatch={dispatch}
    />,
  );
  return { dispatch };
}

describe("AnnotationInteractionLayer: text creation", () => {
  it("opens the inline input when the user clicks the layer in text mode", () => {
    setup();
    const layer = screen.getByTestId("annotation-layer");
    fireEvent.pointerDown(layer, { button: 0, clientX: 50, clientY: 50 });
    expect(screen.getByTestId("anno-text-input")).toBeDefined();
  });

  it("does NOT remount the inline input when the user clicks inside it", () => {
    setup();
    const layer = screen.getByTestId("annotation-layer");
    fireEvent.pointerDown(layer, { button: 0, clientX: 50, clientY: 50 });
    const input = screen.getByTestId<HTMLInputElement>("anno-text-input");
    // User types something into the controlled input.
    fireEvent.change(input, { target: { value: "hello" } });
    // Simulate the user clicking inside the input to position the cursor.
    // This pointerdown event must NOT bubble up to the layer's
    // onPointerDown — that would call setPendingText with a new id and
    // remount the input (losing the typed value).
    fireEvent.pointerDown(input, {
      button: 0,
      clientX: 60,
      clientY: 50,
      bubbles: true,
    });
    // Same DOM node, same value — proof that the input wasn't remounted.
    const stillSame = screen.getByTestId<HTMLInputElement>("anno-text-input");
    expect(stillSame).toBe(input);
    expect(stillSame.value).toBe("hello");
  });

  it("commits typed text on Enter, dispatching ADD_ANNOTATION", () => {
    const { dispatch } = setup();
    const layer = screen.getByTestId("annotation-layer");
    fireEvent.pointerDown(layer, { button: 0, clientX: 80, clientY: 40 });
    const input = screen.getByTestId<HTMLInputElement>("anno-text-input");
    fireEvent.change(input, { target: { value: "hello world" } });
    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    const call = dispatch.mock.calls.find(
      ([action]) =>
        (action as { type: string }).type === "ADD_ANNOTATION",
    );
    expect(call).toBeDefined();
    const action = call![0] as {
      type: "ADD_ANNOTATION";
      annotation: { kind: string; text: string; x: number; y: number };
    };
    expect(action.annotation.kind).toBe("text");
    expect(action.annotation.text).toBe("hello world");
    // Coordinates: cssW=figurePxW=200, so figure-px === css-px.
    expect(action.annotation.x).toBe(80);
    expect(action.annotation.y).toBe(40);
  });

  it("Escape cancels without dispatching ADD_ANNOTATION", () => {
    const { dispatch } = setup();
    const layer = screen.getByTestId("annotation-layer");
    fireEvent.pointerDown(layer, { button: 0, clientX: 80, clientY: 40 });
    const input = screen.getByTestId<HTMLInputElement>("anno-text-input");
    input.value = "abandoned";
    fireEvent.keyDown(input, { key: "Escape" });
    expect(
      dispatch.mock.calls.some(
        ([a]) => (a as { type: string }).type === "ADD_ANNOTATION",
      ),
    ).toBe(false);
  });
});

describe("AnnotationInteractionLayer: click-on-anno-selects in creation mode", () => {
  function setupWithExistingBox(activeTool: "select" | "box"): {
    dispatch: ReturnType<typeof vi.fn>;
    onSelect: ReturnType<typeof vi.fn>;
  } {
    const dispatch = vi.fn();
    const onSelect = vi.fn();
    const figureWithBox: Figure = {
      ...FIG,
      annotations: [
        {
          id: "box-1",
          kind: "box",
          z: 1,
          x: 50,
          y: 50,
          w: 60,
          h: 40,
          stroke: "#FF0000",
          strokeWidthPx: 2,
        },
      ],
    };
    render(
      <AnnotationInteractionLayer
        activeTool={activeTool}
        figure={figureWithBox}
        panelRectsById={new Map()}
        imagesById={new Map()}
        cssW={200}
        cssH={200}
        figurePxW={200}
        figurePxH={200}
        selectedAnnotationId={null}
        onSelectAnnotation={onSelect}
        onEditingChange={() => {}}
        dispatch={dispatch}
      />,
    );
    return { dispatch, onSelect };
  }

  it("renders hit-rects even when a creation tool is active", () => {
    setupWithExistingBox("box");
    expect(screen.queryByTestId("anno-hit-box-1")).not.toBeNull();
  });

  it("clicking an existing annotation while Box tool is active selects it (no creation)", () => {
    const { dispatch, onSelect } = setupWithExistingBox("box");
    const hit = screen.getByTestId("anno-hit-box-1");
    fireEvent.pointerDown(hit, { button: 0, clientX: 60, clientY: 60 });
    expect(onSelect).toHaveBeenCalledWith("box-1");
    expect(
      dispatch.mock.calls.some(
        ([a]) => (a as { type: string }).type === "ADD_ANNOTATION",
      ),
    ).toBe(false);
  });
});

describe("AnnotationInteractionLayer: symbol creation + handles", () => {
  function setupSymbolTool(opts?: {
    panelRectsById?: Map<string, PanelRect>;
    imagesById?: Map<string, ImagePoolItem>;
    figureOverride?: Figure;
  }): { dispatch: ReturnType<typeof vi.fn>; onSelect: ReturnType<typeof vi.fn> } {
    const dispatch = vi.fn();
    const onSelect = vi.fn();
    render(
      <AnnotationInteractionLayer
        activeTool="symbol"
        figure={opts?.figureOverride ?? FIG}
        panelRectsById={opts?.panelRectsById ?? new Map()}
        imagesById={opts?.imagesById ?? new Map()}
        cssW={200}
        cssH={200}
        figurePxW={200}
        figurePxH={200}
        selectedAnnotationId={null}
        onSelectAnnotation={onSelect}
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
        figure={figureWithSymbol}
        panelRectsById={new Map()}
        imagesById={new Map()}
        cssW={200}
        cssH={200}
        figurePxW={200}
        figurePxH={200}
        selectedAnnotationId={symbol.id}
        onSelectAnnotation={onSelect}
        onEditingChange={() => {}}
        dispatch={dispatch}
      />,
    );
    return { dispatch, onSelect };
  }

  it("clicking the layer in symbol mode dispatches ADD_ANNOTATION with default symbol", () => {
    const { dispatch, onSelect } = setupSymbolTool();
    const layer = screen.getByTestId("annotation-layer");
    fireEvent.pointerDown(layer, { button: 0, clientX: 80, clientY: 60 });
    const call = dispatch.mock.calls.find(
      ([action]) => (action as { type: string }).type === "ADD_ANNOTATION",
    );
    expect(call).toBeDefined();
    const action = call![0] as {
      type: "ADD_ANNOTATION";
      annotation: SymbolAnnotation;
    };
    expect(action.annotation.kind).toBe("symbol");
    expect(action.annotation.symbolId).toBe("arrow-filled-right");
    expect(action.annotation.x).toBe(80);
    expect(action.annotation.y).toBe(60);
    expect(action.annotation.sizePx).toBe(60);
    expect(action.annotation.rotationDeg).toBe(0);
    expect(onSelect).toHaveBeenCalledWith(action.annotation.id);
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
    const { dispatch } = setupSymbolTool({
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
    };
    const { dispatch } = setupSelectedSymbol(sym);
    const handle = screen.getByTestId("anno-symbol-handle-rotate");
    // Handle CSS position is (selected.x - HANDLE_PX/2, (selected.y - sizePx/2 - 16) - HANDLE_PX/2)
    // With cssW=figurePxW=200 the conversion is identity.
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 54 });
    // Rotate the pointer 90° around the symbol center: from (100, 54) at -90°
    // to (146, 100) at 0° → expected delta ≈ +90°.
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
    };
    const { dispatch } = setupSelectedSymbol(sym);
    const handle = screen.getByTestId("anno-symbol-handle-rotate");
    // Grab the rotation handle at its center: (selected.x, selected.y - sizePx/2 - 16).
    // For sym at (100, 100) with sizePx=60 that's (100, 54). Because cssW===figurePxW,
    // 1 css-px == 1 figure-px so we can pass these numbers straight to clientX/Y.
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 54 });
    // Tiny move (~0.1 figure-px) so onSymbolRotatePointerMove actually runs and
    // exercises startGripAngleRad. If the no-snap math is broken (e.g. someone
    // drops the baseline and writes `rotationDeg = atan2(...) * 180/PI`), the
    // dispatched value would be ~-90° instead of ~45°.
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
    // toBeCloseTo(45, 0) → |actual - 45| < 0.5. The 0.1-px move yields a delta
    // of ~0.12°, so the dispatched rotationDeg lands at ~45.12 — well within
    // tolerance. The broken impl would land near -90° and fail loudly.
    expect(action.patch.rotationDeg).toBeCloseTo(45, 0);
  });
});
