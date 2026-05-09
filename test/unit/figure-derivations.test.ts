import { describe, it, expect, beforeEach } from "vitest";
import type { Figure } from "../../src/renderer/model/types";
import {
  initialFigureState,
  figureReducer,
  __resetPanelIdsForTests,
} from "../../src/renderer/model/figure-state";
import { addToPool, placeIntoPanel } from "../../src/renderer/model/figure-actions";
import { findPanelAt, DEFAULT_TRANSFORM } from "../../src/renderer/model/panels";
import { deriveFigure } from "../../src/renderer/model/figure-derivations";

const CANVAS = { widthPx: 800, heightPx: 600, background: "#FFFFFF" } as const;

describe("deriveFigure", () => {
  beforeEach(() => {
    __resetPanelIdsForTests();
  });

  it("derives all-placeholder figure from empty state", () => {
    const s = initialFigureState();
    const f: Figure = deriveFigure(s, { canvas: CANVAS });
    expect(f.canvas).toEqual(CANVAS);
    expect(f.grid.rows).toBe(2);
    expect(f.grid.cols).toBe(2);
    expect(f.grid.gutterPx).toBe(s.gutterPx);
    expect(f.grid.gutterColor).toBe(s.gutterColor);
    expect(f.panels).toHaveLength(4);
    expect(f.panels.map((p) => p.kind)).toEqual([
      "placeholder",
      "placeholder",
      "placeholder",
      "placeholder",
    ]);
    // M6: cellLabel is no longer the placeholder label — letters go
    // through the annotation pass. Placeholders display "(empty)".
    expect(
      f.panels.map((p) => (p.kind === "placeholder" ? p.label : "")),
    ).toEqual(["(empty)", "(empty)", "(empty)", "(empty)"]);
    // Every derived panel carries its source panel id.
    expect(f.panels.every((p) => typeof p.panelId === "string")).toBe(true);
    // 1x1 panels: spans omitted is fine.
    expect(f.panels.every((p) => (p.rowSpan ?? 1) === 1)).toBe(true);
    expect(f.panels.every((p) => (p.colSpan ?? 1) === 1)).toBe(true);

    // M6: globalStyle is propagated, and a letter annotation is synthesised
    // per panel in row-major order with its panelId + auto cellLabel text.
    expect(f.globalStyle).toBe(s.globalStyle);
    const letters = f.annotations.filter((a) => a.kind === "letter");
    expect(letters).toHaveLength(4);
    expect(letters.map((l) => (l.kind === "letter" ? l.text : ""))).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
    // Letter ids derive from panelId so they're stable across re-derives.
    const ids = new Set(letters.map((l) => l.id));
    expect(ids.size).toBe(4);
  });

  it("uses letterOverrides for the letter annotation text when set", () => {
    const s = initialFigureState();
    const firstPanelId = s.panels[0]?.id;
    if (firstPanelId === undefined) throw new Error("no first panel");
    s.letterOverrides = { [firstPanelId]: { text: "A1" } };
    const f = deriveFigure(s, { canvas: CANVAS });
    const letterFor0 = f.annotations.find(
      (a) => a.kind === "letter" && a.panelId === firstPanelId,
    );
    if (letterFor0?.kind === "letter") {
      expect(letterFor0.text).toBe("A1");
    } else {
      throw new Error("expected letter annotation for first panel");
    }
  });

  it("derives auto labels from the active letterPattern", () => {
    const s = initialFigureState();
    const numericState = { ...s, letterPattern: "numeric" as const };
    const f = deriveFigure(numericState, { canvas: CANVAS });
    const letters = f.annotations.filter((a) => a.kind === "letter");
    // 2x2 grid → 1, 2, 3, 4 in row-major order.
    expect(letters.map((l) => l.kind === "letter" && l.text)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("manual text override wins over the pattern", () => {
    const s = initialFigureState();
    const firstPanelId = s.panels[0]?.id;
    if (firstPanelId === undefined) throw new Error("no first panel");
    const customState = {
      ...s,
      letterPattern: "numeric" as const,
      letterOverrides: { [firstPanelId]: { text: "Hero" } },
    };
    const f = deriveFigure(customState, { canvas: CANVAS });
    const letterFor0 = f.annotations.find(
      (a) => a.kind === "letter" && a.panelId === firstPanelId,
    );
    if (letterFor0?.kind === "letter") {
      // Manual override beats the numeric pattern.
      expect(letterFor0.text).toBe("Hero");
    } else {
      throw new Error("expected letter annotation for first panel");
    }
  });

  it("derives image panels for occupied panels", () => {
    let s = initialFigureState();
    s = figureReducer(s, addToPool({
      id: "img-1", filename: "x.png", filePath: "/x", mime: "image/png",
      width: 1, height: 1,
    }));
    const pid = findPanelAt(s.panels, 0, 1)?.id;
    if (pid === undefined) throw new Error("no panel at (0,1)");
    s = figureReducer(s, placeIntoPanel("img-1", pid));

    const f = deriveFigure(s, { canvas: CANVAS });
    const at01 = f.panels.find((p) => p.row === 0 && p.col === 1);
    expect(at01?.kind).toBe("image");
    if (at01?.kind === "image") {
      expect(at01.imageId).toBe("img-1");
      // PLACE_INTO_PANEL stamps DEFAULT_TRANSFORM, which the derivation passes through.
      expect(at01.transform).toEqual(DEFAULT_TRANSFORM);
    }
  });

  it("substitutes DEFAULT_TRANSFORM if a state-side panel has imageId without transform (defensive)", () => {
    const s = initialFigureState();
    s.panels = [
      // Hand-built: imageId without transform (shouldn't happen post-reducer)
      { id: "x", row: 0, col: 0, rowSpan: 1, colSpan: 1, imageId: "img-x" },
      { id: "y", row: 0, col: 1, rowSpan: 1, colSpan: 1 },
      { id: "z", row: 1, col: 0, rowSpan: 1, colSpan: 1 },
      { id: "w", row: 1, col: 1, rowSpan: 1, colSpan: 1 },
    ];
    const f = deriveFigure(s, { canvas: CANVAS });
    const at00 = f.panels.find((p) => p.row === 0 && p.col === 0);
    if (at00?.kind === "image") {
      expect(at00.transform).toEqual(DEFAULT_TRANSFORM);
    }
  });

  it("emits rowSpan/colSpan for a merged panel and labels it from its top-left index", () => {
    // Hand-craft a merged 1x2 hero on the top row of a 2x2 grid.
    const s = initialFigureState();
    s.panels = [
      { id: "hero", row: 0, col: 0, rowSpan: 1, colSpan: 2 },
      { id: "c", row: 1, col: 0, rowSpan: 1, colSpan: 1 },
      { id: "d", row: 1, col: 1, rowSpan: 1, colSpan: 1 },
    ];
    const f = deriveFigure(s, { canvas: CANVAS });
    const hero = f.panels.find((p) => p.row === 0 && p.col === 0);
    expect(hero?.rowSpan).toBe(1);
    expect(hero?.colSpan).toBe(2);
    expect(hero?.kind).toBe("placeholder");
    if (hero?.kind === "placeholder") expect(hero.label).toBe("(empty)");
    // M6: Letters live on the annotation pass — the merged top-left cell's
    // letter text is derived from its row-major top-left index → "A".
    const heroLetter = f.annotations.find(
      (a) => a.kind === "letter" && a.panelId === "hero",
    );
    if (heroLetter?.kind === "letter") expect(heroLetter.text).toBe("A");
    // Bottom row letters are based on row-major *cell* index → "C","D".
    const cLetter = f.annotations.find(
      (a) => a.kind === "letter" && a.panelId === "c",
    );
    if (cLetter?.kind === "letter") expect(cLetter.text).toBe("C");
  });

  it("filters hidden panels out of the derived figure", () => {
    const s = initialFigureState();
    s.panels = [
      { id: "a", row: 0, col: 0, rowSpan: 1, colSpan: 1 },
      { id: "b", row: 0, col: 1, rowSpan: 1, colSpan: 1, hidden: true },
      { id: "c", row: 1, col: 0, rowSpan: 1, colSpan: 1 },
      { id: "d", row: 1, col: 1, rowSpan: 1, colSpan: 1 },
    ];
    const f = deriveFigure(s, { canvas: CANVAS });
    expect(f.panels.map((p) => p.panelId)).toEqual(["a", "c", "d"]);
    const letters = f.annotations.filter((a) => a.kind === "letter");
    expect(letters.map((l) => (l.kind === "letter" ? l.panelId : ""))).toEqual([
      "a",
      "c",
      "d",
    ]);
  });

  it("drops annotations anchored to hidden panels", () => {
    const s = initialFigureState();
    s.panels = [
      { id: "a", row: 0, col: 0, rowSpan: 1, colSpan: 1 },
      { id: "b", row: 0, col: 1, rowSpan: 1, colSpan: 1, hidden: true },
    ];
    s.annotations = [
      {
        id: "t1",
        kind: "text",
        panelId: "b",
        z: 1,
        x: 0,
        y: 0,
        text: "x",
        font: "system-ui",
        sizePt: 12,
        bold: false,
        italic: false,
        color: "#000000",
      },
    ];
    const f = deriveFigure(s, { canvas: CANVAS });
    expect(f.annotations.filter((a) => a.kind !== "letter")).toEqual([]);
  });

  it("treats holes (uncovered cells) as absent — no panel, no letter", () => {
    const s = initialFigureState();
    // Drop the (1,1) panel — leave a hole.
    s.panels = [
      { id: "a", row: 0, col: 0, rowSpan: 1, colSpan: 1 },
      { id: "b", row: 0, col: 1, rowSpan: 1, colSpan: 1 },
      { id: "c", row: 1, col: 0, rowSpan: 1, colSpan: 1 },
    ];
    const f = deriveFigure(s, { canvas: CANVAS });
    expect(f.panels).toHaveLength(3);
    const letters = f.annotations.filter((a) => a.kind === "letter");
    expect(letters.map((l) => (l.kind === "letter" ? l.text : ""))).toEqual([
      "A",
      "B",
      "C",
    ]);
  });
});

describe("deriveFigure — layout passthrough (spec 11)", () => {
  it("copies state.layout onto figure.grid.layout", () => {
    const s = initialFigureState();
    const f = deriveFigure(s, { canvas: CANVAS });
    expect(f.grid.layout).toEqual({
      kind: "uniform",
      colWeights: [0.5, 0.5],
      rowWeights: [0.5, 0.5],
    });
  });

  it("propagates a free-form layout unchanged", () => {
    const s0 = initialFigureState();
    const free = {
      ...s0,
      layout: {
        kind: "free" as const,
        rects: {
          "panel-1": { x: 10, y: 10, w: 100, h: 100 },
        },
      },
    };
    const f = deriveFigure(free, { canvas: CANVAS });
    expect(f.grid.layout).toEqual(free.layout);
  });
});
