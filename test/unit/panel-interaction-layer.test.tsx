// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PanelInteractionLayer } from "../../src/renderer/components/Grid/PanelInteractionLayer";
import type { PanelTransform } from "../../src/renderer/model/panels";

// jsdom doesn't ship PointerEvent; polyfill with MouseEvent so clientX/Y
// pass through and React routes the event to its synthetic system.
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

const BASIC_TRANSFORM: PanelTransform = {
  fit: "contain",
  panX: 0,
  panY: 0,
  zoom: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
};
describe("PanelInteractionLayer — editing-mode outline", () => {
  it("renders a dashed accent outline (dashed = editing; solid accent = selected)", () => {
    render(
      <PanelInteractionLayer
        panelRect={{ x: 0, y: 0, w: 200, h: 200 }}
        transform={BASIC_TRANSFORM}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onCommit={vi.fn()}
      />,
    );
    const el = screen.getByTestId("panel-interaction-layer");
    expect(el.style.outline).toContain("dashed");
    expect(el.style.outline).toContain("var(--c-accent)");
  });

  it("is chrome-only: no pointer/wheel ownership (gestures belong to the viewport/frame owners)", () => {
    render(
      <PanelInteractionLayer
        panelRect={{ x: 0, y: 0, w: 200, h: 200 }}
        transform={BASIC_TRANSFORM}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onCommit={vi.fn()}
      />,
    );
    const el = screen.getByTestId("panel-interaction-layer");
    expect(el.style.pointerEvents).toBe("none");
    const ev = new WheelEvent("wheel", {
      deltaY: 100,
      cancelable: true,
      bubbles: true,
    });
    el.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe("PanelInteractionLayer — corner-resize handles (spec 11)", () => {
  it("renders four corner handles when onResizeFreeform is supplied", () => {
    render(
      <PanelInteractionLayer
        panelRect={{ x: 0, y: 0, w: 200, h: 200 }}
        transform={BASIC_TRANSFORM}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onCommit={vi.fn()}
        onResizeFreeform={vi.fn()}
      />,
    );
    expect(screen.getByTestId("corner-handle-tl")).toBeTruthy();
    expect(screen.getByTestId("corner-handle-tr")).toBeTruthy();
    expect(screen.getByTestId("corner-handle-bl")).toBeTruthy();
    expect(screen.getByTestId("corner-handle-br")).toBeTruthy();
  });

  it("does not render corner handles when onResizeFreeform is omitted", () => {
    render(
      <PanelInteractionLayer
        panelRect={{ x: 0, y: 0, w: 200, h: 200 }}
        transform={BASIC_TRANSFORM}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("corner-handle-br")).toBeNull();
  });

  it("dragging the bottom-right corner emits an incremental delta with corner=br", () => {
    const onResizeFreeform = vi.fn();
    render(
      <PanelInteractionLayer
        panelRect={{ x: 0, y: 0, w: 200, h: 200 }}
        transform={BASIC_TRANSFORM}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onCommit={vi.fn()}
        onResizeFreeform={onResizeFreeform}
      />,
    );
    const handle = screen.getByTestId("corner-handle-br");
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      button: 0,
    });
    // Fire move on the handle itself (pointer capture re-routes events).
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: 130,
      clientY: 120,
      button: 0,
    });
    fireEvent.pointerUp(handle, { pointerId: 1, button: 0 });
    expect(onResizeFreeform).toHaveBeenCalled();
    const lastCall =
      onResizeFreeform.mock.calls[onResizeFreeform.mock.calls.length - 1]!;
    expect(lastCall[0]).toBe("br");
    // cssW===figurePxW so cssToFigX===1, dx=30, dy=20.
    expect(lastCall[1]).toBeCloseTo(30, 0);
    expect(lastCall[2]).toBeCloseTo(20, 0);
  });
});
