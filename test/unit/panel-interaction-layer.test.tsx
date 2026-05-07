// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PanelInteractionLayer } from "../../src/renderer/components/Grid/PanelInteractionLayer";
import type { PanelTransform } from "../../src/renderer/model/panels";

describe("PanelInteractionLayer — editing-mode outline", () => {
  it("renders a dashed warn-color outline (distinct from the selected focus-stroke)", () => {
    const transform: PanelTransform = {
      fit: "contain",
      panX: 0,
      panY: 0,
      zoom: 1,
      rotation: 0,
      flipH: false,
      flipV: false,
    };
    // Minimal ImageBitmap stub — the layer reads .width and .height only
    // for pan-clamping math. The cast is safe in this jsdom-only test.
    const bitmap = { width: 100, height: 100 } as unknown as ImageBitmap;
    render(
      <PanelInteractionLayer
        panelId="p1"
        panelRect={{ x: 0, y: 0, w: 200, h: 200 }}
        transform={transform}
        bitmap={bitmap}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        dispatch={vi.fn()}
        onCommit={vi.fn()}
      />,
    );
    const el = screen.getByTestId("panel-interaction-layer");
    expect(el.style.outline).toContain("dashed");
    expect(el.style.outline).toContain("var(--c-warn)");
  });
});
