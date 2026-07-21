// @vitest-environment jsdom
/**
 * The select-mode backdrop covers empty panels, so GridCells's browse-zone
 * <button> would never receive a click without a matching hole carved out
 * of the backdrop. These tests pin that hole down: it exists, it is the
 * right size, and it does NOT swallow clicks elsewhere on the same panel.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnnotationInteractionLayer } from "../../src/renderer/components/Annotations/AnnotationInteractionLayer";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import {
  browseZoneRect,
  type PanelRect,
} from "../../src/renderer/render/coords";
import { initialDefaultSymbolStyle } from "../../src/renderer/model/default-symbol-style";
import { initialDefaultTextStyle } from "../../src/renderer/model/default-text-style";
import { initialDefaultScalebarStyle } from "../../src/renderer/model/default-scalebar-style";

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

const PANEL_ID = "p1";
const PANEL_RECT: PanelRect = { x: 0, y: 0, w: 200, h: 200 };

const FIG: Figure = {
  canvas: { widthPx: 200, heightPx: 200, background: "#FFF" },
  grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
  panels: [
    {
      panelId: PANEL_ID,
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

function setup(): { onPanelClick: ReturnType<typeof vi.fn> } {
  const onPanelClick = vi.fn();
  render(
    <AnnotationInteractionLayer
      activeTool="select"
      defaultSymbolStyle={initialDefaultSymbolStyle()}
      defaultTextStyle={initialDefaultTextStyle()}
      defaultScalebarStyle={initialDefaultScalebarStyle()}
      onDefaultScalebarStyleChange={vi.fn()}
      figure={FIG}
      panelRectsById={new Map([[PANEL_ID, PANEL_RECT]])}
      imagesById={new Map()}
      cssW={200}
      cssH={200}
      figurePxW={200}
      figurePxH={200}
      selectedAnnotationIds={new Set()}
      onSelectionChange={vi.fn()}
      onEditingChange={vi.fn()}
      dispatch={vi.fn()}
      onPanelClick={onPanelClick}
      onHoleClick={vi.fn()}
      onToolAutoReturn={vi.fn()}
    />,
  );
  return { onPanelClick };
}

function strips(): HTMLElement[] {
  return screen.queryAllByTestId(/^annotation-backdrop-strip-/);
}

describe("annotation backdrop — empty-panel browse zones are holes", () => {
  it("renders strips rather than one full-coverage backdrop", () => {
    setup();
    expect(screen.queryByTestId("annotation-backdrop")).toBeNull();
    expect(strips().length).toBeGreaterThan(0);
  });

  it("leaves the browse-zone rect uncovered by any strip", () => {
    setup();
    const z = browseZoneRect(PANEL_RECT);
    const cx = z.x + z.w / 2;
    const cy = z.y + z.h / 2;
    const covers = strips().some((s) => {
      const px = (v: string): number => Number(v.replace("px", ""));
      const l = px(s.style.left);
      const t = px(s.style.top);
      const w = px(s.style.width);
      const h = px(s.style.height);
      return cx >= l && cx <= l + w && cy >= t && cy <= t + h;
    });
    expect(covers).toBe(false);
  });

  it("still forwards a click on the panel OUTSIDE the browse zone", () => {
    const { onPanelClick } = setup();
    // (4, 4) is inside the panel but far outside the centred zone.
    const strip = strips()[0]!;
    fireEvent.pointerDown(strip, { button: 0, clientX: 4, clientY: 4 });
    fireEvent.pointerUp(strip, { clientX: 4, clientY: 4 });
    expect(onPanelClick).toHaveBeenCalledWith(PANEL_ID);
  });
});
