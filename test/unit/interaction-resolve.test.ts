import { describe, it, expect } from "vitest";
import {
  normalizeWheelPan,
  resolvePointerDown,
  resolveWheel,
} from "../../src/renderer/interaction/resolve";
import type {
  PointerHit,
  PointerIntent,
  WheelIntent,
} from "../../src/renderer/interaction/intents";

describe("resolveWheel", () => {
  // Every combination of the three inputs — the entire wheel routing table.
  const table: {
    frameMode: boolean;
    zoomModifier: boolean;
    overCanvasPane: boolean;
    expected: WheelIntent;
  }[] = [
    // Outside the canvas pane the wheel is never hijacked.
    {
      frameMode: false,
      zoomModifier: false,
      overCanvasPane: false,
      expected: "native",
    },
    {
      frameMode: false,
      zoomModifier: true,
      overCanvasPane: false,
      expected: "native",
    },
    {
      frameMode: true,
      zoomModifier: false,
      overCanvasPane: false,
      expected: "native",
    },
    {
      frameMode: true,
      zoomModifier: true,
      overCanvasPane: false,
      expected: "native",
    },
    // Base: scroll pans the view, ⌘/Ctrl (or pinch) zooms the view.
    {
      frameMode: false,
      zoomModifier: false,
      overCanvasPane: true,
      expected: "pan-view",
    },
    {
      frameMode: false,
      zoomModifier: true,
      overCanvasPane: true,
      expected: "zoom-view",
    },
    // Frame mode: same verbs, retargeted onto the framed image —
    // position within the pane never matters.
    {
      frameMode: true,
      zoomModifier: false,
      overCanvasPane: true,
      expected: "pan-image",
    },
    {
      frameMode: true,
      zoomModifier: true,
      overCanvasPane: true,
      expected: "zoom-image",
    },
  ];

  for (const row of table) {
    it(`frame=${String(row.frameMode)} mod=${String(row.zoomModifier)} overPane=${String(row.overCanvasPane)} → ${row.expected}`, () => {
      expect(
        resolveWheel({
          frameMode: row.frameMode,
          zoomModifier: row.zoomModifier,
          overCanvasPane: row.overCanvasPane,
        }),
      ).toBe(row.expected);
    });
  }
});

describe("resolvePointerDown", () => {
  const HITS: PointerHit[] = ["interactive", "placed-panel", "background"];

  it("middle button pans the view from anywhere, in any mode", () => {
    for (const frameMode of [false, true]) {
      for (const spaceHeld of [false, true]) {
        for (const hit of HITS) {
          expect(
            resolvePointerDown({ frameMode, spaceHeld, button: 1, hit }),
          ).toBe("pan-view");
        }
      }
    }
  });

  it("Space+left-drag pans the view from anywhere, overriding everything", () => {
    for (const frameMode of [false, true]) {
      for (const hit of HITS) {
        expect(
          resolvePointerDown({ frameMode, spaceHeld: true, button: 0, hit }),
        ).toBe("pan-view");
      }
    }
  });

  it("right button is left to the browser (context menu)", () => {
    for (const hit of HITS) {
      expect(
        resolvePointerDown({
          frameMode: false,
          spaceHeld: false,
          button: 2,
          hit,
        }),
      ).toBe("click-through");
    }
  });

  it("Frame mode owns bare left-drag regardless of what's under the cursor", () => {
    for (const hit of HITS) {
      expect(
        resolvePointerDown({
          frameMode: true,
          spaceHeld: false,
          button: 0,
          hit,
        }),
      ).toBe("frame-drag");
    }
  });

  // Base mode hit-test routing: drag moves the thing under the cursor.
  const baseTable: { hit: PointerHit; expected: PointerIntent }[] = [
    { hit: "interactive", expected: "object-drag-passthrough" },
    { hit: "placed-panel", expected: "native-dnd" },
    { hit: "background", expected: "pan-view" },
  ];
  for (const row of baseTable) {
    it(`base mode, left button on ${row.hit} → ${row.expected}`, () => {
      expect(
        resolvePointerDown({
          frameMode: false,
          spaceHeld: false,
          button: 0,
          hit: row.hit,
        }),
      ).toBe(row.expected);
    });
  }
});

describe("normalizeWheelPan", () => {
  it("passes pixel deltas through unchanged (trackpad 2-D pan)", () => {
    expect(
      normalizeWheelPan({
        deltaX: 3,
        deltaY: -7,
        deltaMode: 0,
        shiftKey: false,
      }),
    ).toEqual({ dx: 3, dy: -7 });
  });

  it("scales line-mode deltas ×16", () => {
    expect(
      normalizeWheelPan({
        deltaX: 0,
        deltaY: 2,
        deltaMode: 1,
        shiftKey: false,
      }),
    ).toEqual({ dx: 0, dy: 32 });
  });

  it("Shift turns a mouse's vertical wheel horizontal", () => {
    expect(
      normalizeWheelPan({ deltaX: 0, deltaY: 5, deltaMode: 0, shiftKey: true }),
    ).toEqual({ dx: 5, dy: 0 });
  });

  it("Shift does NOT swap axes when the device already pans 2-D", () => {
    expect(
      normalizeWheelPan({ deltaX: 4, deltaY: 5, deltaMode: 0, shiftKey: true }),
    ).toEqual({ dx: 4, dy: 5 });
  });
});
