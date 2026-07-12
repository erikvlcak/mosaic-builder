// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useViewportGestures } from "../../src/renderer/interaction/useViewportGestures";
import { hitFromTarget } from "../../src/renderer/interaction/hit-test";

// jsdom doesn't ship PointerEvent; polyfill with MouseEvent so clientX/Y
// and button pass through.
beforeAll(() => {
  if (typeof window !== "undefined" && !("PointerEvent" in window)) {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    (
      window as unknown as { PointerEvent: typeof PointerEventPolyfill }
    ).PointerEvent = PointerEventPolyfill;
  }
});

afterEach(() => cleanup());

function setup(opts: { spaceHeld?: boolean } = {}) {
  const el = document.createElement("section");
  document.body.appendChild(el);
  el.scrollLeft = 100;
  el.scrollTop = 100;
  const onZoomWheel = vi.fn();
  renderHook(() =>
    useViewportGestures({
      scrollRef: { current: el },
      spaceHeld: opts.spaceHeld ?? false,
      frameMode: false,
      onZoomWheel,
    }),
  );
  return { el, onZoomWheel };
}

describe("useViewportGestures — wheel", () => {
  it("bare wheel pans the scroll container (and preventDefaults)", () => {
    const { el, onZoomWheel } = setup();
    const ev = new WheelEvent("wheel", {
      deltaX: 5,
      deltaY: 10,
      cancelable: true,
    });
    el.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(el.scrollLeft).toBe(105);
    expect(el.scrollTop).toBe(110);
    expect(onZoomWheel).not.toHaveBeenCalled();
  });

  it("⌘/Ctrl+wheel (and pinch) routes to the zoom callback instead", () => {
    const { el, onZoomWheel } = setup();
    el.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -4, ctrlKey: true, cancelable: true }),
    );
    expect(onZoomWheel).toHaveBeenCalledTimes(1);
    expect(el.scrollTop).toBe(100); // no pan
  });
});

describe("useViewportGestures — pointer pan", () => {
  function drag(el: HTMLElement, init: PointerEventInit) {
    el.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        clientX: 50,
        clientY: 50,
        bubbles: true,
        ...init,
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 30, clientY: 40 }),
    );
    window.dispatchEvent(new PointerEvent("pointerup", {}));
  }

  it("left-drag on background pans", () => {
    const { el } = setup();
    drag(el, {});
    expect(el.scrollLeft).toBe(120); // 100 - (30 - 50)
    expect(el.scrollTop).toBe(110);
  });

  it("left-drag on a data-interactive target does NOT pan", () => {
    const { el } = setup();
    const obj = document.createElement("div");
    obj.setAttribute("data-interactive", "true");
    el.appendChild(obj);
    drag(obj, {});
    expect(el.scrollLeft).toBe(100);
    expect(el.scrollTop).toBe(100);
  });

  it("Space+drag pans even over an interactive target", () => {
    const { el } = setup({ spaceHeld: true });
    const obj = document.createElement("div");
    obj.setAttribute("data-interactive", "true");
    el.appendChild(obj);
    drag(obj, {});
    expect(el.scrollLeft).toBe(120);
  });

  it("middle-drag pans (and preventDefaults to suppress autoscroll)", () => {
    const { el } = setup();
    const down = new PointerEvent("pointerdown", {
      button: 1,
      clientX: 50,
      clientY: 50,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    window.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 45, clientY: 50 }),
    );
    expect(el.scrollLeft).toBe(105);
  });
});

describe("hitFromTarget", () => {
  it("classifies stamped elements, panel stamps, and background", () => {
    const bg = document.createElement("div");
    expect(hitFromTarget(bg)).toBe("background");

    const anno = document.createElement("div");
    anno.setAttribute("data-interactive", "true");
    expect(hitFromTarget(anno)).toBe("interactive");

    const panel = document.createElement("div");
    panel.setAttribute("data-interactive", "panel");
    expect(hitFromTarget(panel)).toBe("placed-panel");

    // Nested child of an interactive element inherits the classification.
    const badge = document.createElement("button");
    panel.appendChild(badge);
    expect(hitFromTarget(badge)).toBe("placed-panel");

    expect(hitFromTarget(null)).toBe("background");
  });
});
