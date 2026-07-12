// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { paintFlattenedFigure } from "../../src/renderer/render/export-renderer";
import type { DrawCtx } from "../../src/renderer/render/draw-figure";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import type { Figure } from "../../src/renderer/model/types";

function recorderFills(): DrawCtx & { fills: string[]; strokes: string[] } {
  const fills: string[] = [];
  const strokes: string[] = [];
  const noop = () => {};
  const ctx: Partial<DrawCtx> & { fills: string[]; strokes: string[] } = {
    fills,
    strokes,
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "left" as CanvasTextAlign,
    textBaseline: "top" as CanvasTextBaseline,
    lineWidth: 1,
    lineCap: "butt" as CanvasLineCap,
    lineJoin: "miter" as CanvasLineJoin,
    fillRect() {
      fills.push(String(this.fillStyle));
    },
    strokeRect() {
      strokes.push(String(this.strokeStyle));
    },
    fillText: noop,
    strokeText: noop,
    measureText: () => ({ width: 0 }),
    drawImage: noop,
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    rect: noop,
    clip: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    fill: noop,
    setLineDash: noop,
  };
  return ctx as DrawCtx & { fills: string[]; strokes: string[] };
}

describe("export is theme-independent", () => {
  function exportFigure(): Figure {
    return {
      canvas: { widthPx: 80, heightPx: 60, background: "#FFFFFF" },
      grid: { rows: 1, cols: 2, gutterPx: 6, gutterColor: "#FFFFFF" },
      panels: [
        { row: 0, col: 0, kind: "placeholder", label: "A" },
        { row: 0, col: 1, kind: "placeholder", label: "B" },
      ],
      annotations: [],
      globalStyle: DEFAULT_GLOBAL_STYLE,
    };
  }

  const DARK_CHROME = ["#2A2F37", "#3A414D", "#A6ADBA", "#7B8494"];

  it("never emits dark placeholder chrome even when the DOM is in dark mode", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const ctx = recorderFills();
    paintFlattenedFigure(ctx, exportFigure(), new Map(), 80, 60, 1);
    for (const c of DARK_CHROME) {
      expect(ctx.fills).not.toContain(c);
      expect(ctx.strokes).not.toContain(c);
    }
    // It emits the LIGHT placeholder chrome (export path uses drawFigure with
    // no theme opt → default light).
    expect(ctx.fills).toContain("#EEEEEE");
    document.documentElement.removeAttribute("data-theme");
  });

  it("produces an identical op-stream across a DOM theme flip", () => {
    document.documentElement.setAttribute("data-theme", "light");
    const light = recorderFills();
    paintFlattenedFigure(light, exportFigure(), new Map(), 80, 60, 1);

    document.documentElement.setAttribute("data-theme", "dark");
    const dark = recorderFills();
    paintFlattenedFigure(dark, exportFigure(), new Map(), 80, 60, 1);

    document.documentElement.removeAttribute("data-theme");
    expect(dark.fills).toEqual(light.fills);
    expect(dark.strokes).toEqual(light.strokes);
  });
});
