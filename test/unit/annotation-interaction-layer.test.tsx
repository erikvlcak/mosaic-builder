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
