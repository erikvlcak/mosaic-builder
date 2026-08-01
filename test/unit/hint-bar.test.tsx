// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  HintBar,
  hintFor,
  type HintContext,
} from "../../src/renderer/components/StatusHints/HintBar";
import { MAC_GLYPHS, PC_GLYPHS } from "../../src/renderer/platform/shortcuts";

afterEach(() => cleanup());

const BASE: HintContext = {
  spaceHeld: false,
  frameMode: false,
  toolArmed: false,
  selection: "none",
};

// Glyphs are injected, never sniffed, so the table pins BOTH platforms rather
// than whatever UA the test environment happens to report.
describe("hintFor — one hint per interaction state (spec Part 3 table)", () => {
  const table: {
    name: string;
    ctx: HintContext;
    mac: string;
    pc: string;
  }[] = [
    {
      name: "nothing selected",
      ctx: BASE,
      mac: "Click a panel to select · Double-click to frame · Scroll to pan · ⌘Scroll to zoom",
      pc: "Click a panel to select · Double-click to frame · Scroll to pan · Ctrl+Scroll to zoom",
    },
    {
      name: "placed panel selected",
      ctx: { ...BASE, selection: "placed-panel" },
      mac: "Drag image to another panel to move or swap · Double-click to frame · Delete removes · Shift-click cells to merge",
      pc: "Drag image to another panel to move or swap · Double-click to frame · Delete removes · Shift-click cells to merge",
    },
    {
      name: "empty panel selected",
      ctx: { ...BASE, selection: "empty-panel" },
      mac: "Drag an image here from the tray · Click the centre to browse · Shift-click cells to merge",
      pc: "Drag an image here from the tray · Click the centre to browse · Shift-click cells to merge",
    },
    {
      name: "frame mode",
      ctx: { ...BASE, frameMode: true },
      mac: "Drag to position · ⌘Scroll to zoom · Arrows nudge · 0 reset · Esc done",
      pc: "Drag to position · Ctrl+Scroll to zoom · Arrows nudge · 0 reset · Esc done",
    },
    {
      name: "tool armed",
      ctx: { ...BASE, toolArmed: true },
      mac: "Click to place · Shift-click to place several · Esc cancel",
      pc: "Click to place · Shift-click to place several · Esc cancel",
    },
    {
      name: "Space held",
      ctx: { ...BASE, spaceHeld: true },
      mac: "Panning — release Space to return",
      pc: "Panning — release Space to return",
    },
  ];
  for (const row of table) {
    it(`${row.name} (mac)`, () => {
      expect(hintFor(row.ctx, MAC_GLYPHS)).toBe(row.mac);
    });
    it(`${row.name} (windows/linux)`, () => {
      expect(hintFor(row.ctx, PC_GLYPHS)).toBe(row.pc);
    });
  }

  it("never prints a Mac-only glyph on Windows/Linux", () => {
    for (const row of table) {
      expect(hintFor(row.ctx, PC_GLYPHS)).not.toMatch(/[⌘⇧⌥⌫⌦]/);
    }
  });

  // Prose spells keys out, so the ONLY thing that may differ between
  // platforms is the zoom modifier. Any other divergence means a symbol
  // leaked back into a sentence.
  it("differs between platforms only where the zoom modifier appears", () => {
    for (const row of table) {
      const mac = hintFor(row.ctx, MAC_GLYPHS);
      const pc = hintFor(row.ctx, PC_GLYPHS);
      if (mac.includes("to zoom")) {
        expect(mac).toContain("⌘Scroll");
        expect(pc).toContain("Ctrl+Scroll");
      } else {
        expect(mac).toBe(pc);
      }
    }
  });

  it("spells Shift and Delete as words on both platforms", () => {
    const placed: HintContext = { ...BASE, selection: "placed-panel" };
    for (const g of [MAC_GLYPHS, PC_GLYPHS]) {
      expect(hintFor(placed, g)).toContain("Shift-click");
      expect(hintFor(placed, g)).toContain("Delete removes");
    }
  });

  it("Space held wins over every other state", () => {
    expect(
      hintFor({
        spaceHeld: true,
        frameMode: true,
        toolArmed: true,
        selection: "placed-panel",
      }),
    ).toBe("Panning — release Space to return");
  });

  it("armed tool wins over frame mode and selection (matches the Esc unwind order)", () => {
    expect(
      hintFor({
        spaceHeld: false,
        frameMode: true,
        toolArmed: true,
        selection: "placed-panel",
      }),
    ).toContain("Click to place");
  });
});

describe("HintBar", () => {
  it("renders the resolved hint as a non-interactive strip", () => {
    render(<HintBar context={{ ...BASE, frameMode: true }} />);
    const el = screen.getByTestId("hint-bar");
    expect(el.textContent).toContain("Esc done");
  });
});
