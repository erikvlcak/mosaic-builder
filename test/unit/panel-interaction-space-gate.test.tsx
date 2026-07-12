// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PanelInteractionLayer } from "../../src/renderer/components/Grid/PanelInteractionLayer";
import { DEFAULT_TRANSFORM } from "../../src/renderer/model/panels";

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

const RECT = { x: 0, y: 0, w: 100, h: 100 };
const BITMAP = { width: 200, height: 200 } as unknown as ImageBitmap;

function renderLayer(spacebarHeld: boolean, dispatch = vi.fn()) {
  const utils = render(
    <PanelInteractionLayer
      panelId="p1"
      panelRect={RECT}
      transform={DEFAULT_TRANSFORM}
      bitmap={BITMAP}
      figurePxW={800}
      figurePxH={600}
      cssW={800}
      cssH={600}
      spacebarHeld={spacebarHeld}
      dispatch={dispatch}
      onCommit={vi.fn()}
    />,
  );
  const el = utils.getByTestId("panel-interaction-layer");
  return { el, dispatch };
}

afterEach(() => cleanup());

describe("PanelInteractionLayer space gate", () => {
  it("does NOT preventDefault the wheel when space is not held", () => {
    const { el } = renderLayer(false);
    const ev = new WheelEvent("wheel", {
      deltaY: 100,
      cancelable: true,
      bubbles: true,
    });
    el.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("DOES preventDefault the wheel when space is held", () => {
    const { el } = renderLayer(true);
    const ev = new WheelEvent("wheel", {
      deltaY: 100,
      cancelable: true,
      bubbles: true,
    });
    el.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("does NOT capture the pointer / dispatch a pan on pointerdown when space is not held", () => {
    const { el } = renderLayer(false);
    const capture = vi.fn();
    (el as unknown as { setPointerCapture: unknown }).setPointerCapture =
      capture;
    el.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        pointerId: 1,
        bubbles: true,
      }),
    );
    expect(capture).not.toHaveBeenCalled();
  });

  it("DOES capture the pointer on pointerdown when space is held", () => {
    const { el } = renderLayer(true);
    const capture = vi.fn();
    (el as unknown as { setPointerCapture: unknown }).setPointerCapture =
      capture;
    el.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        pointerId: 1,
        bubbles: true,
      }),
    );
    expect(capture).toHaveBeenCalledWith(1);
  });
});
