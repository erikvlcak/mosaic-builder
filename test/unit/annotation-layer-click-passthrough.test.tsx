// @vitest-environment jsdom
/**
 * Regression: in select mode, single-clicking an occupied panel did not
 * select it. The annotation backdrop covers unselected occupied panels
 * (so marquee selection of annotations can rubber-band over them), so
 * the click never reached GridCells's per-panel onClick. Without this
 * forward, the user has no path from "panel not selected" to "panel
 * selected" via clicking on the panel itself.
 *
 * Fix: the backdrop's pointerup handler — in the no-movement (click)
 * branch — hit-tests panelRectsById and forwards to onPanelClick.
 * Mirrors the existing onPanelDoubleClick passthrough.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnnotationInteractionLayer } from "../../src/renderer/components/Annotations/AnnotationInteractionLayer";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import type { PanelRect } from "../../src/renderer/render/coords";

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

function setup(): { onPanelClick: ReturnType<typeof vi.fn> } {
  const onPanelClick = vi.fn();
  render(
    <AnnotationInteractionLayer
      activeTool="select"
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
  return { onPanelClick };
}

describe("AnnotationInteractionLayer: click passthrough", () => {
  it("forwards a backdrop click to onPanelClick with the panel id under the cursor", () => {
    const { onPanelClick } = setup();
    const backdrop = screen.getByTestId("annotation-backdrop");

    fireEvent.pointerDown(backdrop, {
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(backdrop, {
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 100,
    });

    expect(onPanelClick).toHaveBeenCalledTimes(1);
    expect(onPanelClick).toHaveBeenCalledWith(PANEL_ID);
  });

  it("does not fire onPanelClick when the pointer moved past the marquee threshold (it's a drag, not a click)", () => {
    const { onPanelClick } = setup();
    const backdrop = screen.getByTestId("annotation-backdrop");

    fireEvent.pointerDown(backdrop, {
      pointerId: 1,
      button: 0,
      clientX: 50,
      clientY: 50,
    });
    fireEvent.pointerMove(backdrop, {
      pointerId: 1,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerUp(backdrop, {
      pointerId: 1,
      button: 0,
      clientX: 150,
      clientY: 150,
    });

    expect(onPanelClick).not.toHaveBeenCalled();
  });
});
