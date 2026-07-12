// @vitest-environment jsdom
/**
 * Regression: double-clicking a panel did nothing because
 * AnnotationInteractionLayer (zIndex: 3) sat above GridCells. In select
 * mode a full-area backdrop with `pointerEvents: "auto"` was the topmost
 * hit-target, so native dblclick fired on the backdrop and never reached
 * GridCells's panel onDoubleClick. The fix forwards dblclick from the
 * annotation layer to a panel hit-tested via panelRectsById, mirroring
 * the existing onTrayDrop passthrough.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnnotationInteractionLayer } from "../../src/renderer/components/Annotations/AnnotationInteractionLayer";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import type { PanelRect } from "../../src/renderer/render/coords";
import { initialDefaultSymbolStyle } from "../../src/renderer/model/default-symbol-style";
import { initialDefaultTextStyle } from "../../src/renderer/model/default-text-style";
import { initialDefaultScalebarStyle } from "../../src/renderer/model/default-scalebar-style";

const DEFAULT_PICKER = initialDefaultSymbolStyle();
const DEFAULT_TEXT = initialDefaultTextStyle();
const DEFAULT_SCALEBAR = initialDefaultScalebarStyle();

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

const PANEL_ID = "panel-A";
const PANEL_RECTS: Map<string, PanelRect> = new Map([
  [PANEL_ID, { x: 0, y: 0, w: 200, h: 200 }],
]);

function setup(activeTool: "select" | "text" = "select"): {
  onPanelDoubleClick: ReturnType<typeof vi.fn>;
} {
  const onPanelDoubleClick = vi.fn();
  render(
    <AnnotationInteractionLayer
      activeTool={activeTool}
      defaultSymbolStyle={DEFAULT_PICKER}
      defaultTextStyle={DEFAULT_TEXT}
      defaultScalebarStyle={DEFAULT_SCALEBAR}
      onDefaultScalebarStyleChange={vi.fn()}
      figure={FIG}
      panelRectsById={PANEL_RECTS}
      imagesById={new Map()}
      cssW={200}
      cssH={200}
      figurePxW={200}
      figurePxH={200}
      selectedAnnotationIds={new Set()}
      onSelectionChange={() => {}}
      onEditingChange={() => {}}
      dispatch={vi.fn()}
      onPanelDoubleClick={onPanelDoubleClick}
    />,
  );
  // Stub the layer's bounding rect so clientX/Y math maps to figure-px.
  const layer = screen.getByTestId("annotation-layer");
  layer.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return { onPanelDoubleClick };
}

describe("AnnotationInteractionLayer: dblclick passthrough", () => {
  it("forwards dblclick on the select-mode backdrop to onPanelDoubleClick with the panel id under the cursor", () => {
    const { onPanelDoubleClick } = setup("select");
    // The backdrop is the actual hit-target in select mode (it sits above
    // GridCells with pointerEvents: auto). Double-clicking it must forward
    // to the panel underneath.
    const backdrop = screen.getByTestId("annotation-backdrop");
    fireEvent.doubleClick(backdrop, { clientX: 100, clientY: 100 });

    expect(onPanelDoubleClick).toHaveBeenCalledTimes(1);
    expect(onPanelDoubleClick).toHaveBeenCalledWith(PANEL_ID);
  });

  it("forwards dblclick anywhere on the layer in a creation tool too (text)", () => {
    const { onPanelDoubleClick } = setup("text");
    // No backdrop in creation tools — the layer itself is auto.
    const layer = screen.getByTestId("annotation-layer");
    fireEvent.doubleClick(layer, { clientX: 50, clientY: 50 });

    expect(onPanelDoubleClick).toHaveBeenCalledTimes(1);
    expect(onPanelDoubleClick).toHaveBeenCalledWith(PANEL_ID);
  });

  it("does not fire onPanelDoubleClick when the cursor is outside every panel rect", () => {
    const tightRects: Map<string, PanelRect> = new Map([
      [PANEL_ID, { x: 0, y: 0, w: 100, h: 100 }],
    ]);
    const onPanelDoubleClick = vi.fn();
    render(
      <AnnotationInteractionLayer
        activeTool="select"
        defaultSymbolStyle={DEFAULT_PICKER}
        defaultTextStyle={DEFAULT_TEXT}
        defaultScalebarStyle={DEFAULT_SCALEBAR}
        onDefaultScalebarStyleChange={vi.fn()}
        figure={FIG}
        panelRectsById={tightRects}
        imagesById={new Map()}
        cssW={200}
        cssH={200}
        figurePxW={200}
        figurePxH={200}
        selectedAnnotationIds={new Set()}
        onSelectionChange={() => {}}
        onEditingChange={() => {}}
        dispatch={vi.fn()}
        onPanelDoubleClick={onPanelDoubleClick}
      />,
    );
    const layer = screen.getByTestId("annotation-layer");
    layer.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const backdrop = screen.getByTestId("annotation-backdrop");
    fireEvent.doubleClick(backdrop, { clientX: 190, clientY: 190 });

    expect(onPanelDoubleClick).not.toHaveBeenCalled();
  });
});
