import { describe, it, expect } from "vitest";
import type { DrawCtx } from "../../src/renderer/render/draw-figure";
import { drawAnnotations } from "../../src/renderer/render/draw-annotations";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import { initialDefaultTextStyle } from "../../src/renderer/model/default-text-style";

interface Call {
  op: string;
  args: unknown[];
  fillStyle: string;
  strokeStyle: string;
  font: string;
  lineWidth: number;
  lineJoin: string;
}

function makeRecorder(): DrawCtx & { calls: Call[] } {
  const calls: Call[] = [];
  const ctx: DrawCtx & { calls: Call[] } = {
    calls,
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "left" as CanvasTextAlign,
    textBaseline: "top" as CanvasTextBaseline,
    lineWidth: 1,
    lineCap: "butt" as CanvasLineCap,
    lineJoin: "miter" as CanvasLineJoin,
    fillRect(...args) {
      calls.push(snapshot("fillRect", args));
    },
    strokeRect(...args) {
      calls.push(snapshot("strokeRect", args));
    },
    fillText(...args) {
      calls.push(snapshot("fillText", args));
    },
    strokeText(...args) {
      calls.push(snapshot("strokeText", args));
    },
    measureText(text: string) {
      const m = /(\d+)px/.exec(this.font);
      const sizePx = m && m[1] !== undefined ? Number(m[1]) : 8;
      return { width: text.length * sizePx * 0.6 };
    },
    drawImage: (() => {}) as DrawCtx["drawImage"],
    save() {
      calls.push(snapshot("save", []));
    },
    restore() {
      calls.push(snapshot("restore", []));
    },
    beginPath() {},
    closePath() {},
    rect() {},
    clip() {},
    translate() {},
    scale() {},
    rotate() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    setLineDash() {},
  };
  function snapshot(op: string, args: unknown[]): Call {
    return {
      op,
      args,
      fillStyle: String(ctx.fillStyle),
      strokeStyle: String(ctx.strokeStyle),
      font: ctx.font,
      lineWidth: ctx.lineWidth,
      lineJoin: String(ctx.lineJoin),
    };
  }
  return ctx;
}

const PANEL_RECT = { x: 10, y: 10, w: 100, h: 100 };
const DEPS = {
  panelRectsById: new Map([["p1", PANEL_RECT]]),
  panelsById: new Map(),
  imagesById: new Map(),
  bitmaps: new Map<string, ImageBitmap>(),
};

function figWith(
  annotations: Figure["annotations"],
  style = DEFAULT_GLOBAL_STYLE,
): Figure {
  return {
    canvas: { widthPx: 200, heightPx: 200, background: "#FFF" },
    grid: { rows: 1, cols: 1, gutterPx: 10, gutterColor: "#FFF" },
    panels: [{ panelId: "p1", row: 0, col: 0, kind: "placeholder", label: "" }],
    annotations,
    globalStyle: style,
  };
}

function letterStyle(patch: Record<string, unknown>) {
  return {
    ...DEFAULT_GLOBAL_STYLE,
    letters: { ...DEFAULT_GLOBAL_STYLE.letters, ...patch },
  };
}

describe("letter halo", () => {
  it("emits no strokeText when halo is absent (backward compatible)", () => {
    const ctx = makeRecorder();
    const fig = figWith(
      [{ id: "letter:p1", kind: "letter", panelId: "p1", z: 0, text: "A" }],
      // Explicit undefined = the pre-halo shape (default now ships halo: true).
      letterStyle({ color: "#000000", halo: undefined }),
    );
    drawAnnotations(ctx, fig, DEPS);
    expect(ctx.calls.some((c) => c.op === "strokeText")).toBe(false);
    // The fillText call is still present and unchanged.
    expect(ctx.calls.some((c) => c.op === "fillText")).toBe(true);
  });

  it("emits no strokeText when halo is explicitly false", () => {
    const ctx = makeRecorder();
    const fig = figWith(
      [{ id: "letter:p1", kind: "letter", panelId: "p1", z: 0, text: "A" }],
      letterStyle({ color: "#000000", halo: false }),
    );
    drawAnnotations(ctx, fig, DEPS);
    expect(ctx.calls.some((c) => c.op === "strokeText")).toBe(false);
  });

  it("strokes before filling when halo is on", () => {
    const ctx = makeRecorder();
    const fig = figWith(
      [{ id: "letter:p1", kind: "letter", panelId: "p1", z: 0, text: "A" }],
      letterStyle({ color: "#FFFFFF", halo: true }),
    );
    drawAnnotations(ctx, fig, DEPS);
    const strokeIdx = ctx.calls.findIndex((c) => c.op === "strokeText");
    const fillIdx = ctx.calls.findIndex((c) => c.op === "fillText");
    expect(strokeIdx).toBeGreaterThanOrEqual(0);
    expect(fillIdx).toBeGreaterThanOrEqual(0);
    expect(strokeIdx).toBeLessThan(fillIdx);
    // Same glyph + position for stroke and fill.
    const stroke = ctx.calls[strokeIdx];
    const fill = ctx.calls[fillIdx];
    expect(stroke?.args).toEqual(fill?.args);
  });

  it("uses a black halo behind a light-colored letter", () => {
    const ctx = makeRecorder();
    const fig = figWith(
      [{ id: "letter:p1", kind: "letter", panelId: "p1", z: 0, text: "A" }],
      letterStyle({ color: "#FFFFFF", halo: true }),
    );
    drawAnnotations(ctx, fig, DEPS);
    const stroke = ctx.calls.find((c) => c.op === "strokeText");
    expect(stroke?.strokeStyle.toUpperCase()).toBe("#000000");
  });

  it("uses a white halo behind a dark-colored letter", () => {
    const ctx = makeRecorder();
    const fig = figWith(
      [{ id: "letter:p1", kind: "letter", panelId: "p1", z: 0, text: "A" }],
      letterStyle({ color: "#000000", halo: true }),
    );
    drawAnnotations(ctx, fig, DEPS);
    const stroke = ctx.calls.find((c) => c.op === "strokeText");
    expect(stroke?.strokeStyle.toUpperCase()).toBe("#FFFFFF");
  });

  it("rounds the halo stroke joins so glyph corners don't spike", () => {
    const ctx = makeRecorder();
    const fig = figWith(
      [{ id: "letter:p1", kind: "letter", panelId: "p1", z: 0, text: "A" }],
      letterStyle({ color: "#FFFFFF", halo: true }),
    );
    drawAnnotations(ctx, fig, DEPS);
    const stroke = ctx.calls.find((c) => c.op === "strokeText");
    expect(stroke?.lineJoin).toBe("round");
    expect(stroke?.lineWidth).toBeGreaterThan(0);
  });
});

describe("text halo", () => {
  function textAnno(patch: Record<string, unknown>) {
    return {
      id: "t1",
      kind: "text" as const,
      z: 2,
      x: 50,
      y: 60,
      text: "Hi",
      font: "Arial",
      sizePt: 14,
      bold: false,
      italic: false,
      color: "#000000",
      ...patch,
    };
  }

  it("emits no strokeText when halo is absent (backward compatible)", () => {
    const ctx = makeRecorder();
    const fig = figWith([textAnno({})]);
    drawAnnotations(ctx, fig, DEPS);
    expect(ctx.calls.some((c) => c.op === "strokeText")).toBe(false);
  });

  it("strokes a contrasting halo before filling when halo is on", () => {
    const ctx = makeRecorder();
    const fig = figWith([textAnno({ color: "#000000", halo: true })]);
    drawAnnotations(ctx, fig, DEPS);
    const strokeIdx = ctx.calls.findIndex((c) => c.op === "strokeText");
    const fillIdx = ctx.calls.findIndex((c) => c.op === "fillText");
    expect(strokeIdx).toBeGreaterThanOrEqual(0);
    expect(strokeIdx).toBeLessThan(fillIdx);
    const stroke = ctx.calls[strokeIdx];
    // Dark text → white halo.
    expect(stroke?.strokeStyle.toUpperCase()).toBe("#FFFFFF");
    expect(stroke?.lineJoin).toBe("round");
  });

  it("uses a black halo behind light-colored text", () => {
    const ctx = makeRecorder();
    const fig = figWith([textAnno({ color: "#FFFFFF", halo: true })]);
    drawAnnotations(ctx, fig, DEPS);
    const stroke = ctx.calls.find((c) => c.op === "strokeText");
    expect(stroke?.strokeStyle.toUpperCase()).toBe("#000000");
  });
});

describe("halo defaults", () => {
  it("new-figure global letter style ships white + halo on", () => {
    expect(DEFAULT_GLOBAL_STYLE.letters.color).toBe("#FFFFFF");
    expect(DEFAULT_GLOBAL_STYLE.letters.halo).toBe(true);
  });

  it("default text style ships halo on (black glyph stays legible on dark panels)", () => {
    const s = initialDefaultTextStyle();
    expect(s.halo).toBe(true);
    expect(s.color).toBe("#000000");
  });
});
