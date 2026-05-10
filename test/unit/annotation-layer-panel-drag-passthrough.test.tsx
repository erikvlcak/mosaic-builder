// @vitest-environment jsdom
/**
 * Regression: in select mode, dragging an image from one panel to another
 * silently became a marquee gesture, and clicking inside an occupied
 * panel became panel selection instead of marquee. The annotation
 * layer's full-coverage backdrop (zIndex 3, pointerEvents: auto) sat
 * above GridCells's `<div draggable>` panels and captured every
 * pointerdown via setPointerCapture for marquee. The browser never saw
 * the mousedown reach a [draggable] element, so native HTML5 dragstart
 * never fired and the panel-to-panel swap gesture was lost.
 *
 * Fix (two-step model):
 * 1. Single-click on an occupied panel → "selected" (green border).
 *    The backdrop carves a hole over the selected occupied panel so a
 *    subsequent mousedown there triggers a native HTML5 drag-to-swap
 *    via GridCells's `<div draggable>`. GridCells gates draggable on
 *    `isSelected` so HTML5 drag is only attempted from selected panels.
 * 2. Drag from an unselected occupied panel → marquee selection of
 *    annotations (backdrop still covers it, so pointerdown there
 *    starts a marquee). Empty panels and gutters work the same way.
 *
 * jsdom doesn't implement real CSS hit-testing, so we lock in the
 * structural invariant: only the selected occupied panel's rect is
 * uncovered by an auto-pointer-events backdrop strip.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnnotationInteractionLayer } from "../../src/renderer/components/Annotations/AnnotationInteractionLayer";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import type { PanelRect } from "../../src/renderer/render/coords";
import { initialDefaultSymbolStyle } from "../../src/renderer/model/default-symbol-style";

const DEFAULT_PICKER = initialDefaultSymbolStyle();

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

const LETTERS_OFF = {
  ...DEFAULT_GLOBAL_STYLE,
  letters: { ...DEFAULT_GLOBAL_STYLE.letters, enabled: false },
};

// 2x1 grid: panel A occupied (left half), panel B occupied (right half).
const PANEL_A = "panel-A";
const PANEL_B = "panel-B";
const RECT_A: PanelRect = { x: 0, y: 0, w: 100, h: 200 };
const RECT_B: PanelRect = { x: 100, y: 0, w: 100, h: 200 };
const PANEL_RECTS: Map<string, PanelRect> = new Map([
  [PANEL_A, RECT_A],
  [PANEL_B, RECT_B],
]);

const FIG: Figure = {
  canvas: { widthPx: 200, heightPx: 200, background: "#FFF" },
  grid: { rows: 1, cols: 2, gutterPx: 0, gutterColor: "#FFF" },
  panels: [
    {
      panelId: PANEL_A,
      row: 0,
      col: 0,
      kind: "image",
      imageId: "img-1",
      transform: {
        fit: "contain",
        zoom: 1,
        panX: 0,
        panY: 0,
        rotation: 0,
        flipH: false,
        flipV: false,
      },
    },
    {
      panelId: PANEL_B,
      row: 0,
      col: 1,
      kind: "image",
      imageId: "img-2",
      transform: {
        fit: "contain",
        zoom: 1,
        panX: 0,
        panY: 0,
        rotation: 0,
        flipH: false,
        flipV: false,
      },
    },
  ],
  annotations: [],
  globalStyle: LETTERS_OFF,
};

interface CssRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const FULL_COVERAGE: CssRect = { left: 0, top: 0, right: 200, bottom: 200 };

function rectFromStyle(el: HTMLElement): CssRect {
  if (el.style.inset === "0" || el.style.inset === "0px") {
    return FULL_COVERAGE;
  }
  const left = parseFloat(el.style.left || "0");
  const top = parseFloat(el.style.top || "0");
  const width = parseFloat(el.style.width || "0");
  const height = parseFloat(el.style.height || "0");
  return { left, top, right: left + width, bottom: top + height };
}

function overlaps(a: CssRect, b: CssRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function pointInside(p: { x: number; y: number }, r: CssRect): boolean {
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}

function backdropStrips(): HTMLElement[] {
  return screen.queryAllByTestId(/^annotation-backdrop(-strip-\d+|$)/);
}

describe("AnnotationInteractionLayer: selection-driven backdrop carve", () => {
  it("carves a hole over the SELECTED occupied panel so HTML5 drag can fire", () => {
    render(
      <AnnotationInteractionLayer
        activeTool="select"
        defaultSymbolStyle={DEFAULT_PICKER}
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
        selectedPanelId={PANEL_A}
      />,
    );
    const aRect: CssRect = {
      left: RECT_A.x,
      top: RECT_A.y,
      right: RECT_A.x + RECT_A.w,
      bottom: RECT_A.y + RECT_A.h,
    };
    for (const s of backdropStrips()) {
      expect(overlaps(rectFromStyle(s), aRect)).toBe(false);
    }
  });

  it("STILL covers unselected occupied panels so marquee selection works on them", () => {
    render(
      <AnnotationInteractionLayer
        activeTool="select"
        defaultSymbolStyle={DEFAULT_PICKER}
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
        selectedPanelId={PANEL_A}
      />,
    );
    // Center of unselected panel B must be inside at least one auto-pointer-
    // events backdrop strip; otherwise marquee can't start there.
    const bCenter = { x: RECT_B.x + RECT_B.w / 2, y: RECT_B.y + RECT_B.h / 2 };
    const covered = backdropStrips().some((s) =>
      pointInside(bCenter, rectFromStyle(s)),
    );
    expect(covered).toBe(true);
  });

  it("when no panel is selected, both occupied panels stay covered (full backdrop)", () => {
    render(
      <AnnotationInteractionLayer
        activeTool="select"
        defaultSymbolStyle={DEFAULT_PICKER}
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
    // No selectedPanelId, no editingPanelRect → single full-coverage backdrop.
    expect(screen.getByTestId("annotation-backdrop")).toBeTruthy();
    const aCenter = { x: RECT_A.x + RECT_A.w / 2, y: RECT_A.y + RECT_A.h / 2 };
    const bCenter = { x: RECT_B.x + RECT_B.w / 2, y: RECT_B.y + RECT_B.h / 2 };
    const aCovered = backdropStrips().some((s) =>
      pointInside(aCenter, rectFromStyle(s)),
    );
    const bCovered = backdropStrips().some((s) =>
      pointInside(bCenter, rectFromStyle(s)),
    );
    expect(aCovered).toBe(true);
    expect(bCovered).toBe(true);
  });
});
