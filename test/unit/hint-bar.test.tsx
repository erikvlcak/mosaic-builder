// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  HintBar,
  hintFor,
  type HintContext,
} from "../../src/renderer/components/StatusHints/HintBar";

afterEach(() => cleanup());

const BASE: HintContext = {
  spaceHeld: false,
  frameMode: false,
  toolArmed: false,
  selection: "none",
};

describe("hintFor — one hint per interaction state (spec Part 3 table)", () => {
  const table: { name: string; ctx: HintContext; expected: string }[] = [
    {
      name: "nothing selected",
      ctx: BASE,
      expected:
        "Click a panel to select · Double-click to frame · Scroll to pan · ⌘Scroll to zoom",
    },
    {
      name: "placed panel selected",
      ctx: { ...BASE, selection: "placed-panel" },
      expected:
        "Drag image to another panel to move or swap · Double-click to frame · ⌫ remove · ⇧Click cells to merge",
    },
    {
      name: "empty panel selected",
      ctx: { ...BASE, selection: "empty-panel" },
      expected: "Drag an image here from the tray · ⇧Click cells to merge",
    },
    {
      name: "frame mode",
      ctx: { ...BASE, frameMode: true },
      expected:
        "Drag to position · ⌘Scroll to zoom · Arrows nudge · 0 reset · Esc done",
    },
    {
      name: "tool armed",
      ctx: { ...BASE, toolArmed: true },
      expected: "Click to place · ⇧Click to place several · Esc cancel",
    },
    {
      name: "Space held",
      ctx: { ...BASE, spaceHeld: true },
      expected: "Panning — release Space to return",
    },
  ];
  for (const row of table) {
    it(row.name, () => {
      expect(hintFor(row.ctx)).toBe(row.expected);
    });
  }

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
