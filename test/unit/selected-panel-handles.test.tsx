// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SelectedPanelHandles } from "../../src/renderer/components/Grid/SelectedPanelHandles";

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

afterEach(() => cleanup());

function renderHandles(onResizeFreeform = vi.fn(), onCommit = vi.fn()) {
  render(
    <SelectedPanelHandles
      panelRect={{ x: 0, y: 0, w: 200, h: 200 }}
      figurePxW={800}
      figurePxH={600}
      cssW={800}
      cssH={600}
      onResizeFreeform={onResizeFreeform}
      onCommit={onCommit}
    />,
  );
  return { onResizeFreeform, onCommit };
}

describe("SelectedPanelHandles — corner resize on SELECTED panels", () => {
  it("renders four corner handles, each stamped data-interactive", () => {
    renderHandles();
    for (const corner of ["tl", "tr", "bl", "br"]) {
      const h = screen.getByTestId(`corner-handle-${corner}`);
      expect(h.getAttribute("data-interactive")).toBe("true");
    }
    // The container itself is hit-transparent.
    expect(
      screen.getByTestId("selected-panel-handles").style.pointerEvents,
    ).toBe("none");
  });

  it("dragging the bottom-right corner emits incremental deltas and commits on release", () => {
    const { onResizeFreeform, onCommit } = renderHandles();
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
    expect(onCommit).toHaveBeenCalledOnce();
  });
});
