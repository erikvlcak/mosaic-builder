// @vitest-environment jsdom
/**
 * Placement tools are one-shot stamps: after placing, the tool returns to
 * Select (via onToolAutoReturn). Shift+click places and keeps the tool
 * armed for another. This is what makes the Cmd-hold "temporary select"
 * mode unnecessary.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AnnotationInteractionLayer } from "../../src/renderer/components/Annotations/AnnotationInteractionLayer";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import type { Tool } from "../../src/renderer/components/Toolbar/AnnotationToolbar";
import { initialDefaultSymbolStyle } from "../../src/renderer/model/default-symbol-style";
import { initialDefaultTextStyle } from "../../src/renderer/model/default-text-style";
import { initialDefaultScalebarStyle } from "../../src/renderer/model/default-scalebar-style";

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
});

afterEach(() => cleanup());

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

function setup(tool: Tool) {
  const dispatch = vi.fn();
  const onToolAutoReturn = vi.fn();
  render(
    <AnnotationInteractionLayer
      activeTool={tool}
      defaultSymbolStyle={initialDefaultSymbolStyle()}
      defaultTextStyle={initialDefaultTextStyle()}
      defaultScalebarStyle={initialDefaultScalebarStyle()}
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
      onToolAutoReturn={onToolAutoReturn}
    />,
  );
  return { dispatch, onToolAutoReturn };
}

describe("placement tools auto-return to Select", () => {
  it("symbol: click places and returns the tool", () => {
    const { dispatch, onToolAutoReturn } = setup("symbol");
    fireEvent.pointerDown(screen.getByTestId("annotation-layer"), {
      button: 0,
      clientX: 80,
      clientY: 60,
    });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(onToolAutoReturn).toHaveBeenCalledOnce();
  });

  it("symbol: Shift+click places and KEEPS the tool armed", () => {
    const { dispatch, onToolAutoReturn } = setup("symbol");
    fireEvent.pointerDown(screen.getByTestId("annotation-layer"), {
      button: 0,
      clientX: 80,
      clientY: 60,
      shiftKey: true,
    });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(onToolAutoReturn).not.toHaveBeenCalled();
  });

  it("text: committing the typed caption returns the tool", () => {
    const { dispatch, onToolAutoReturn } = setup("text");
    fireEvent.pointerDown(screen.getByTestId("annotation-layer"), {
      button: 0,
      clientX: 80,
      clientY: 60,
    });
    const input = screen.getByTestId("anno-text-input");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(onToolAutoReturn).toHaveBeenCalledOnce();
  });

  it("text: canceling with Esc keeps the tool armed (nothing was placed)", () => {
    const { dispatch, onToolAutoReturn } = setup("text");
    fireEvent.pointerDown(screen.getByTestId("annotation-layer"), {
      button: 0,
      clientX: 80,
      clientY: 60,
    });
    fireEvent.keyDown(screen.getByTestId("anno-text-input"), {
      key: "Escape",
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(onToolAutoReturn).not.toHaveBeenCalled();
  });

  it("text: Shift at the placing click keeps the tool armed after commit", () => {
    const { onToolAutoReturn } = setup("text");
    fireEvent.pointerDown(screen.getByTestId("annotation-layer"), {
      button: 0,
      clientX: 80,
      clientY: 60,
      shiftKey: true,
    });
    const input = screen.getByTestId("anno-text-input");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onToolAutoReturn).not.toHaveBeenCalled();
  });
});
