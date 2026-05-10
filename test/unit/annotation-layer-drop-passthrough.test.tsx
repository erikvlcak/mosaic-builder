// @vitest-environment jsdom
/**
 * Regression: tray drops onto the canvas were silently swallowed because
 * AnnotationInteractionLayer sat on top of GridCells (zIndex: 3) with
 * `pointerEvents: "auto"` (or a full-area select-mode backdrop) and no drag
 * handlers — so the browser's "no droppable target" branch ran and the
 * panel's onDrop never fired. The fix forwards drag-over/drop events from
 * the annotation layer to a panel hit-tested via panelRectsById.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, createEvent } from "@testing-library/react";
import { AnnotationInteractionLayer } from "../../src/renderer/components/Annotations/AnnotationInteractionLayer";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import type { PanelRect } from "../../src/renderer/render/coords";
import { DRAG_MIME, serializeDrag } from "../../src/renderer/dnd/drag-payload";

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
    (window as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent =
      PointerEventPolyfill;
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

// One panel covering the full 200×200 figure. Its rect is in figure-px.
const PANEL_ID = "panel-A";
const PANEL_RECTS: Map<string, PanelRect> = new Map([
  [PANEL_ID, { x: 0, y: 0, w: 200, h: 200 }],
]);

function setup(activeTool: "select" | "text" | "box" = "select"): {
  onTrayDrop: ReturnType<typeof vi.fn>;
} {
  const onTrayDrop = vi.fn();
  render(
    <AnnotationInteractionLayer
      activeTool={activeTool}
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
      onTrayDrop={onTrayDrop}
    />,
  );
  // Stub the layer's bounding rect so clientX/Y math maps to figure-px.
  const layer = screen.getByTestId("annotation-layer");
  layer.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return { onTrayDrop };
}

function trayDataTransfer(imageId: string): {
  types: string[];
  getData: (mime: string) => string;
  setData: () => void;
  dropEffect: string;
  effectAllowed: string;
} {
  const payload = serializeDrag({ kind: "tray", imageId });
  return {
    types: [DRAG_MIME],
    getData: (mime: string) => (mime === DRAG_MIME ? payload : ""),
    setData: () => {},
    dropEffect: "none",
    effectAllowed: "all",
  };
}

// jsdom's `fireEvent.drop({ clientX, ... })` does NOT propagate clientX/Y onto
// the native DragEvent (the underlying constructor in jsdom drops them). Build
// the event explicitly via createEvent.* and set the properties as own
// properties so React's synthetic-event layer reads them through.
function dispatchDrag(
  el: HTMLElement,
  type: "dragOver" | "drop",
  clientX: number,
  clientY: number,
  dataTransfer: ReturnType<typeof trayDataTransfer> | { types: string[]; getData: () => string },
): void {
  const ev =
    type === "dragOver" ? createEvent.dragOver(el) : createEvent.drop(el);
  Object.defineProperty(ev, "clientX", { get: () => clientX });
  Object.defineProperty(ev, "clientY", { get: () => clientY });
  Object.defineProperty(ev, "dataTransfer", { get: () => dataTransfer });
  fireEvent(el, ev);
}

describe("AnnotationInteractionLayer: tray drag passthrough", () => {
  it("forwards a tray drop to onTrayDrop with the panel id under the cursor (select tool)", () => {
    const { onTrayDrop } = setup("select");
    const layer = screen.getByTestId("annotation-layer");

    const dt = trayDataTransfer("img-1");
    // dragover MUST be preventDefault'd somewhere on the path or the browser
    // rejects the drop. Asserting that onTrayDrop fires on drop is sufficient
    // to prove the layer is forwarding correctly.
    dispatchDrag(layer, "dragOver", 100, 100, dt);
    dispatchDrag(layer, "drop", 100, 100, dt);

    expect(onTrayDrop).toHaveBeenCalledTimes(1);
    expect(onTrayDrop).toHaveBeenCalledWith({
      from: { kind: "tray", imageId: "img-1" },
      targetPanelId: PANEL_ID,
    });
  });

  it("forwards a tray drop in a creation tool too (text)", () => {
    const { onTrayDrop } = setup("text");
    const layer = screen.getByTestId("annotation-layer");

    const dt = trayDataTransfer("img-2");
    dispatchDrag(layer, "dragOver", 50, 50, dt);
    dispatchDrag(layer, "drop", 50, 50, dt);

    expect(onTrayDrop).toHaveBeenCalledTimes(1);
    expect(onTrayDrop).toHaveBeenCalledWith({
      from: { kind: "tray", imageId: "img-2" },
      targetPanelId: PANEL_ID,
    });
  });

  it("ignores non-mosaic drags (no DRAG_MIME on dataTransfer)", () => {
    const { onTrayDrop } = setup("select");
    const layer = screen.getByTestId("annotation-layer");

    const foreignDt = {
      types: ["text/plain"],
      getData: () => "hello",
    };
    dispatchDrag(layer, "dragOver", 100, 100, foreignDt);
    dispatchDrag(layer, "drop", 100, 100, foreignDt);

    expect(onTrayDrop).not.toHaveBeenCalled();
  });

  it("does not fire onTrayDrop when the cursor is outside every panel rect", () => {
    // Tighten panel rect so (190,190) is outside it.
    const tightRects: Map<string, PanelRect> = new Map([
      [PANEL_ID, { x: 0, y: 0, w: 100, h: 100 }],
    ]);
    const onTrayDrop = vi.fn();
    render(
      <AnnotationInteractionLayer
        activeTool="select"
        figure={FIG}
        panelRectsById={tightRects}
        imagesById={new Map()}
        cssW={200}
        cssH={200}
        figurePxW={200}
        figurePxH={200}
        selectedAnnotationIds={new Set()}
        onSelectionChange={() => {}}
        onEditingChange={() => {}}
        dispatch={vi.fn()}
        onTrayDrop={onTrayDrop}
      />,
    );
    const layer = screen.getByTestId("annotation-layer");
    layer.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const dt = trayDataTransfer("img-3");
    dispatchDrag(layer, "dragOver", 190, 190, dt);
    dispatchDrag(layer, "drop", 190, 190, dt);

    expect(onTrayDrop).not.toHaveBeenCalled();
  });
});
