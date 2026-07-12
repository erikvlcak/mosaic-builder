// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FrameChrome } from "../../src/renderer/components/Grid/FrameChrome";

afterEach(() => cleanup());

function renderChrome(zoomPct = 100) {
  render(
    <FrameChrome
      panelRect={{ x: 100, y: 50, w: 200, h: 150 }}
      figurePxW={800}
      figurePxH={600}
      cssW={800}
      cssH={600}
      zoomPct={zoomPct}
    />,
  );
  return screen.getByTestId("frame-chrome");
}

describe("FrameChrome — pure Frame-mode chrome", () => {
  it("renders the dashed accent outline at the panel rect", () => {
    const el = renderChrome();
    expect(el.style.outline).toContain("dashed");
    expect(el.style.outline).toContain("var(--c-accent)");
    expect(el.style.left).toBe("100px");
    expect(el.style.top).toBe("50px");
    expect(el.style.width).toBe("200px");
    expect(el.style.height).toBe("150px");
  });

  it("dims everything else with a scrim (giant spread shadow, DOM-only)", () => {
    const el = renderChrome();
    expect(el.style.boxShadow).toContain("9999px");
    expect(el.style.boxShadow).toContain("var(--c-frame-scrim)");
  });

  it("shows the exit chip and the zoom readout", () => {
    renderChrome(237.4);
    expect(screen.getByTestId("frame-chip").textContent).toBe(
      "Framing — Esc when done",
    );
    expect(screen.getByTestId("frame-zoom-readout").textContent).toBe("237%");
  });

  it("owns no gestures: hit-transparent and never preventDefaults a wheel", () => {
    const el = renderChrome();
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
