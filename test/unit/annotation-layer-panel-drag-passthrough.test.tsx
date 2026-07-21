// @vitest-environment jsdom
/**
 * Direct image moving: dragging a placed image to another panel is a
 * first-class gesture with no pre-selection step. The annotation layer's
 * select-mode backdrop (zIndex 3, pointerEvents: auto) must therefore
 * carve a hole over EVERY occupied panel so the mousedown reaches
 * GridCells's `<div draggable>` and native HTML5 dragstart can fire.
 *
 * Empty panels and gutters keep backdrop coverage: clicks there clear
 * the annotation selection and forward to onPanelClick / onHoleClick,
 * and drags there are viewport pans (owned by useViewportGestures).
 *
 * jsdom doesn't implement real CSS hit-testing, so we lock in the
 * structural invariant: occupied panel rects are uncovered by any
 * auto-pointer-events backdrop strip; other areas stay covered.
 */

import { describe, it, expect, vi } from "vitest";
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

const LETTERS_OFF = {
  ...DEFAULT_GLOBAL_STYLE,
  letters: { ...DEFAULT_GLOBAL_STYLE.letters, enabled: false },
};

// 2x1 grid: panel A occupied (left half), panel B empty placeholder
// (right half).
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
      kind: "placeholder",
      label: "B",
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
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

function pointInside(p: { x: number; y: number }, r: CssRect): boolean {
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}

function backdropStrips(): HTMLElement[] {
  return screen.queryAllByTestId(/^annotation-backdrop(-strip-\d+|$)/);
}

function renderLayer(figure: Figure): void {
  render(
    <AnnotationInteractionLayer
      activeTool="select"
      defaultSymbolStyle={DEFAULT_PICKER}
      defaultTextStyle={DEFAULT_TEXT}
      defaultScalebarStyle={DEFAULT_SCALEBAR}
      onDefaultScalebarStyleChange={vi.fn()}
      figure={figure}
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
}

describe("AnnotationInteractionLayer: occupied-panel backdrop carve", () => {
  it("carves a hole over every occupied panel so HTML5 drag fires without pre-selection", () => {
    renderLayer(FIG);
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

  it("still covers empty panels outside the browse zone so clicks clear/forward and drags pan the view", () => {
    renderLayer(FIG);
    // RECT_B's exact center now sits inside its own browse-zone hole (by
    // design, see annotation-layer-browse-zone-passthrough.test.tsx); probe
    // a corner instead, which stays outside that zone regardless of size.
    const bCorner = { x: RECT_B.x + 2, y: RECT_B.y + 2 };
    const covered = backdropStrips().some((s) =>
      pointInside(bCorner, rectFromStyle(s)),
    );
    expect(covered).toBe(true);
  });

  it("empty-only figure renders backdrop strips around the browse zones", () => {
    const emptyFig: Figure = {
      ...FIG,
      panels: [
        { panelId: PANEL_A, row: 0, col: 0, kind: "placeholder", label: "A" },
        { panelId: PANEL_B, row: 0, col: 1, kind: "placeholder", label: "B" },
      ],
    };
    renderLayer(emptyFig);
    // Two empty panels now carve two browse-zone holes, so the backdrop is
    // strips. What still matters is that coverage exists outside the zones.
    expect(screen.queryByTestId("annotation-backdrop")).toBeNull();
    expect(
      screen.getAllByTestId(/^annotation-backdrop-strip-/).length,
    ).toBeGreaterThan(0);
  });
});
