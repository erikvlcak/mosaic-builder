// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import {
  useFrameGestures,
  type FrameTarget,
} from "../../src/renderer/interaction/useFrameGestures";
import type { FigureAction } from "../../src/renderer/model/figure-actions";
import type { PanelTransform } from "../../src/renderer/model/panels";

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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const TRANSFORM: PanelTransform = {
  fit: "contain",
  panX: 0,
  panY: 0,
  zoom: 2,
  rotation: 0,
  flipH: false,
  flipV: false,
};

// Panel occupies the top-left 100×100 of an 800×600 figure rendered 1:1.
const TARGET: FrameTarget = {
  panelId: "p1",
  panelRect: { x: 0, y: 0, w: 100, h: 100 },
  transform: TRANSFORM,
  imageW: 200,
  imageH: 200,
};

function setup(target: FrameTarget | null = TARGET) {
  const scrollEl = document.createElement("section");
  const wrapperEl = document.createElement("div");
  scrollEl.appendChild(wrapperEl);
  document.body.appendChild(scrollEl);
  const dispatch = vi.fn<(a: FigureAction) => void>();
  const onCommit = vi.fn();
  const onExit = vi.fn();
  const { result } = renderHook(() =>
    useFrameGestures({
      scrollRef: { current: scrollEl },
      wrapperRef: { current: wrapperEl },
      target,
      spaceHeld: false,
      toolArmed: false,
      figurePxW: 800,
      figurePxH: 600,
      cssW: 800,
      cssH: 600,
      dispatch,
      onCommit,
      onExit,
    }),
  );
  return { scrollEl, dispatch, onCommit, onExit, frame: result.current };
}

function lastTransform(dispatch: ReturnType<typeof vi.fn>): PanelTransform {
  const call = dispatch.mock.calls[dispatch.mock.calls.length - 1]![0] as {
    type: string;
    transform: PanelTransform;
  };
  expect(call.type).toBe("SET_PANEL_TRANSFORM");
  return call.transform;
}

function key(k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent("keydown", {
    key: k,
    cancelable: true,
    bubbles: true,
    ...init,
  });
  window.dispatchEvent(e);
  return e;
}

describe("useFrameGestures — keys", () => {
  it("arrows nudge the image 1 px (10 with Shift)", () => {
    const { dispatch } = setup();
    key("ArrowRight");
    expect(lastTransform(dispatch).panX).toBe(1);
    key("ArrowDown", { shiftKey: true });
    expect(lastTransform(dispatch).panY).toBe(10);
  });

  it("+ / − zoom the image in 1.25× steps about the panel center", () => {
    const { dispatch } = setup();
    key("+");
    expect(lastTransform(dispatch).zoom).toBeCloseTo(2 * 1.25, 6);
    key("-");
    expect(lastTransform(dispatch).zoom).toBeCloseTo(2 / 1.25, 6);
  });

  it("Esc exits one level (consumed — never reaches the global clear-everything handler)", () => {
    const { onExit, dispatch } = setup();
    const globalEscape = vi.fn();
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") globalEscape();
    });
    const e = key("Escape");
    expect(onExit).toHaveBeenCalledOnce();
    expect(e.defaultPrevented).toBe(true);
    expect(globalEscape).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("Enter also exits Frame mode", () => {
    const { onExit } = setup();
    key("Enter");
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("respects typing targets (arrows in an input are left alone)", () => {
    const { dispatch } = setup();
    const input = document.createElement("input");
    document.body.appendChild(input);
    const e = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      cancelable: true,
      bubbles: true,
    });
    input.dispatchEvent(e);
    expect(dispatch).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it("does nothing when not framing", () => {
    const { dispatch, onExit } = setup(null);
    key("ArrowRight");
    key("Escape");
    expect(dispatch).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
  });

  it("key bursts seal into one undo step after the 250 ms settle", () => {
    vi.useFakeTimers();
    const { onCommit } = setup();
    key("ArrowRight");
    key("ArrowRight");
    expect(onCommit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(onCommit).toHaveBeenCalledOnce();
  });
});

describe("useFrameGestures — wheel verbs (via useViewportGestures)", () => {
  it("wheelPan moves the image opposite the scroll deltas (content-scroll feel)", () => {
    const { frame, dispatch } = setup();
    frame.wheelPan(5, 10);
    const t = lastTransform(dispatch);
    expect(t.panX).toBe(-5);
    expect(t.panY).toBe(-10);
  });

  it("wheelZoom is position-independent: outside the panel it anchors at the panel center", () => {
    const { frame, dispatch } = setup();
    // (700, 500) is far outside the 100×100 panel → center anchor keeps pan at 0.
    frame.wheelZoom({ deltaY: -100, clientX: 700, clientY: 500 });
    const t = lastTransform(dispatch);
    expect(t.zoom).toBeGreaterThan(2);
    expect(t.panX).toBe(0);
    expect(t.panY).toBe(0);
  });
});

describe("useFrameGestures — drag", () => {
  function pointer(el: HTMLElement, type: string, x: number, y: number): void {
    const target = type === "pointerdown" ? el : window;
    target.dispatchEvent(
      new PointerEvent(type, {
        button: 0,
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  it("drag anywhere in the pane pans the image and commits once on release", () => {
    const { scrollEl, dispatch, onCommit } = setup();
    // Start OUTSIDE the panel rect — position-independence is the point.
    pointer(scrollEl, "pointerdown", 400, 300);
    pointer(scrollEl, "pointermove", 430, 320);
    const t = lastTransform(dispatch);
    expect(t.panX).toBe(30);
    expect(t.panY).toBe(20);
    pointer(scrollEl, "pointerup", 430, 320);
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("a sub-4px press is a click: inside the panel it stays framing, outside it exits", () => {
    const { scrollEl, dispatch, onExit, onCommit } = setup();
    // Click inside the panel (50, 50): no exit, no pan.
    pointer(scrollEl, "pointerdown", 50, 50);
    pointer(scrollEl, "pointerup", 51, 50);
    expect(onExit).not.toHaveBeenCalled();
    // Click outside (400, 300): exits (the click event then selects
    // whatever was under the cursor via the untouched click handlers).
    pointer(scrollEl, "pointerdown", 400, 300);
    pointer(scrollEl, "pointerup", 401, 300);
    expect(onExit).toHaveBeenCalledOnce();
    expect(dispatch).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("Space+drag falls through to the viewport pan owner", () => {
    const scrollEl = document.createElement("section");
    const wrapperEl = document.createElement("div");
    scrollEl.appendChild(wrapperEl);
    document.body.appendChild(scrollEl);
    const dispatch = vi.fn();
    renderHook(() =>
      useFrameGestures({
        scrollRef: { current: scrollEl },
        wrapperRef: { current: wrapperEl },
        target: TARGET,
        spaceHeld: true,
        toolArmed: false,
        figurePxW: 800,
        figurePxH: 600,
        cssW: 800,
        cssH: 600,
        dispatch,
        onCommit: vi.fn(),
        onExit: vi.fn(),
      }),
    );
    const down = new PointerEvent("pointerdown", {
      button: 0,
      clientX: 50,
      clientY: 50,
      bubbles: true,
      cancelable: true,
    });
    scrollEl.dispatchEvent(down);
    window.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 80, clientY: 80 }),
    );
    expect(dispatch).not.toHaveBeenCalled();
  });
});
