// @vitest-environment jsdom
/**
 * Regression: when a panel is in editing mode, PanelInteractionLayer mounts
 * over that panel with corner-resize handles. AnnotationInteractionLayer's
 * select-mode backdrop (`pointer-events: auto`, zIndex 3) sits ABOVE PIL
 * (zIndex 2) and was swallowing every pointerdown that should have reached
 * the corner handles or PIL's pan-drag area.
 *
 * Fix: the select-mode backdrop carves holes over the editing panel rect
 * (and over every occupied panel — see annotation-layer-panel-drag-
 * passthrough.test.tsx). jsdom doesn't implement real CSS hit-testing, so
 * we can't simulate the cross-element interception directly — instead we
 * lock in the structural property: no backdrop strip overlaps the editing
 * panel rect. App.tsx must pass `focusedPanelRect` here when editing, and
 * the stacking with PIL underneath means real-browser hit-testing routes
 * clicks inside the rect to PIL's handles, not to a backdrop region.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
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

const FIG: Figure = {
  canvas: { widthPx: 200, heightPx: 200, background: "#FFF" },
  grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
  panels: [],
  annotations: [],
  globalStyle: LETTERS_OFF,
};

const PANEL_ID = "panel-A";
const PANEL_RECT: PanelRect = { x: 0, y: 0, w: 200, h: 200 };
const PANEL_RECTS: Map<string, PanelRect> = new Map([[PANEL_ID, PANEL_RECT]]);

interface CssRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
function rectFromStyle(el: HTMLElement): CssRect {
  const left = parseFloat(el.style.left || "0");
  const top = parseFloat(el.style.top || "0");
  const width = parseFloat(el.style.width || "0");
  const height = parseFloat(el.style.height || "0");
  return { left, top, right: left + width, bottom: top + height };
}
function overlaps(a: CssRect, b: CssRect): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

describe("AnnotationInteractionLayer — editing-panel donut backdrop", () => {
  it("no backdrop strip overlaps the editing panel rect", () => {
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
        editingPanelRect={{ x: 50, y: 50, w: 100, h: 100 }}
      />,
    );
    const editing: CssRect = { left: 50, top: 50, right: 150, bottom: 150 };
    const strips = screen.queryAllByTestId(/^annotation-backdrop-strip-\d+$/);
    expect(strips.length).toBeGreaterThan(0);
    for (const s of strips) {
      expect(overlaps(rectFromStyle(s), editing)).toBe(false);
    }
    // The legacy full-coverage testid must NOT be present when carving.
    expect(screen.queryByTestId("annotation-backdrop")).toBeNull();
  });

  it("falls back to a single full-coverage backdrop when no panel is editing or occupied", () => {
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
      />,
    );
    expect(screen.getByTestId("annotation-backdrop")).toBeTruthy();
    expect(
      screen.queryAllByTestId(/^annotation-backdrop-strip-\d+$/).length,
    ).toBe(0);
  });
});
