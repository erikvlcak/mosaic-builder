// @vitest-environment jsdom
/**
 * Regression: in select mode, clicking a grid *hole* (a cell left uncovered
 * by DELETE_PANEL, rendered as a dashed "+" click-to-restore affordance) did
 * nothing. The annotation backdrop is the topmost hit-target, and its
 * pointerup click branch only forwarded to onPanelClick via panelRectsById —
 * which contains no entry for a hole. So the restore click never reached
 * GridCells's hole onClick, leaving the user with no way to restore a deleted
 * panel except undo.
 *
 * Fix: the backdrop's pointerup click branch also hit-tests grid holes (using
 * the same equal-weight cell-grid math GridCells draws them with) and forwards
 * to onHoleClick(row, col). Mirrors the onPanelClick passthrough.
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

// 2 cols x 1 row, no gutter. Col 0 is a panel; col 1 is a hole.
// Cells are 100px wide each in a 200x200 figure/css space.
const FIG: Figure = {
  canvas: { widthPx: 200, heightPx: 200, background: "#FFF" },
  grid: { rows: 1, cols: 2, gutterPx: 0, gutterColor: "#FFF" },
  panels: [
    {
      panelId: "panel-A",
      row: 0,
      col: 0,
      kind: "placeholder",
      label: "A",
      rowSpan: 1,
      colSpan: 1,
    },
  ],
  annotations: [],
  globalStyle: LETTERS_OFF,
};

const PANEL_RECTS: Map<string, PanelRect> = new Map([
  ["panel-A", { x: 0, y: 0, w: 100, h: 200 }],
]);

function setup(): {
  onPanelClick: ReturnType<typeof vi.fn>;
  onHoleClick: ReturnType<typeof vi.fn>;
} {
  const onPanelClick = vi.fn();
  const onHoleClick = vi.fn();
  render(
    <AnnotationInteractionLayer
      activeTool="select"
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
      onPanelClick={onPanelClick}
      onHoleClick={onHoleClick}
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
  return { onPanelClick, onHoleClick };
}

describe("AnnotationInteractionLayer: hole click passthrough", () => {
  it("forwards a backdrop click over a hole to onHoleClick(row, col)", () => {
    const { onPanelClick, onHoleClick } = setup();
    const backdrop = screen.getByTestId("annotation-backdrop");

    // Click at (150, 100): right half → col 1, which is the hole.
    fireEvent.pointerDown(backdrop, {
      pointerId: 1,
      button: 0,
      clientX: 150,
      clientY: 100,
    });
    fireEvent.pointerUp(backdrop, {
      pointerId: 1,
      button: 0,
      clientX: 150,
      clientY: 100,
    });

    expect(onHoleClick).toHaveBeenCalledTimes(1);
    expect(onHoleClick).toHaveBeenCalledWith(0, 1);
    expect(onPanelClick).not.toHaveBeenCalled();
  });

  it("does not fire onHoleClick when clicking a covered panel cell", () => {
    const { onPanelClick, onHoleClick } = setup();
    const backdrop = screen.getByTestId("annotation-backdrop");

    // Click at (50, 100): left half → col 0, the panel.
    fireEvent.pointerDown(backdrop, {
      pointerId: 1,
      button: 0,
      clientX: 50,
      clientY: 100,
    });
    fireEvent.pointerUp(backdrop, {
      pointerId: 1,
      button: 0,
      clientX: 50,
      clientY: 100,
    });

    expect(onHoleClick).not.toHaveBeenCalled();
    expect(onPanelClick).toHaveBeenCalledWith("panel-A");
  });

  it("does not fire onHoleClick when the pointer moved past the marquee threshold (drag, not click)", () => {
    const { onHoleClick } = setup();
    const backdrop = screen.getByTestId("annotation-backdrop");

    fireEvent.pointerDown(backdrop, {
      pointerId: 1,
      button: 0,
      clientX: 150,
      clientY: 50,
    });
    fireEvent.pointerMove(backdrop, {
      pointerId: 1,
      clientX: 150,
      clientY: 160,
    });
    fireEvent.pointerUp(backdrop, {
      pointerId: 1,
      button: 0,
      clientX: 150,
      clientY: 160,
    });

    expect(onHoleClick).not.toHaveBeenCalled();
  });
});
