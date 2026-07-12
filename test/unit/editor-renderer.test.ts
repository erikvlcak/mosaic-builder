// @vitest-environment jsdom
/**
 * Regression test: the editor renderer must thread the pool (per-image
 * calibration) into drawFigure. Without it, scale-bar annotations silently
 * fail to render in the editor — the bar's barLength returns 0 because
 * `imagesById.get(panel.imageId)?.calibration` is undefined.
 *
 * Approach: mock `draw-figure`'s drawFigure so we can read back the args
 * the renderer passes. Bypassing the real drawFigure also sidesteps the
 * need to fully stub a 2D canvas context.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createEditorRenderer,
  MAX_EDITOR_CANVAS_PX,
} from "../../src/renderer/render/editor-renderer";
import type { Figure } from "../../src/renderer/model/types";
import type { ImagePoolItem } from "../../src/renderer/model/pool";
import { DEFAULT_TRANSFORM } from "../../src/renderer/model/panels";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import * as drawFigureModule from "../../src/renderer/render/draw-figure";

const LETTERS_OFF = {
  ...DEFAULT_GLOBAL_STYLE,
  letters: { ...DEFAULT_GLOBAL_STYLE.letters, enabled: false },
};

const FIG: Figure = {
  canvas: { widthPx: 100, heightPx: 100, background: "#000" },
  grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#000" },
  panels: [
    {
      panelId: "p1",
      row: 0,
      col: 0,
      kind: "image",
      imageId: "img-cal",
      transform: DEFAULT_TRANSFORM,
    },
  ],
  annotations: [
    {
      id: "sb1",
      kind: "scalebar",
      panelId: "p1",
      z: 1,
      lengthValue: 50,
      lengthUnit: "um",
      resolvedPanelId: "p1",
    } as Figure["annotations"][number],
  ],
  globalStyle: LETTERS_OFF,
};

const calibratedPool: Map<string, ImagePoolItem> = new Map([
  [
    "img-cal",
    {
      id: "img-cal",
      filename: "x.tif",
      filePath: "/tmp/x.tif",
      mime: "image/tiff",
      width: 100,
      height: 100,
      bitDepth: 8,
      calibration: { unit: "um", pixelsPerUnit: 6.45, source: "manual" },
    },
  ],
]);

describe("editor-renderer: pool propagation", () => {
  let canvas: HTMLCanvasElement;
  let drawFigureSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    canvas = document.createElement("canvas");
    // jsdom returns null for getContext("2d") in some configs and a real
    // (but non-rendering) context in others. Force a non-null sentinel so
    // paint() doesn't bail at the `if (ctx === null) return;` guard.
    // Stub canvas APIs the renderer touches before handing off to drawFigure
    // (which is itself mocked below). setTransform/scale are called on the
    // raw context for HiDPI scaling.
    canvas.getContext = (() =>
      ({
        setTransform: () => {},
        scale: () => {},
      }) as unknown) as HTMLCanvasElement["getContext"];

    drawFigureSpy = vi
      .spyOn(drawFigureModule, "drawFigure")
      .mockImplementation(() => {});

    // jsdom rAF can be flaky; use a microtask flush instead.
    let pending: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      pending = cb;
      // Run on next microtask so it fires after the schedule() return value
      // has been written to rafHandle (mirrors real async rAF semantics).
      queueMicrotask(() => {
        if (pending !== null) {
          const c = pending;
          pending = null;
          c(0);
        }
      });
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    drawFigureSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("threads the pool to drawFigure when setPool + setFigure are wired", async () => {
    const r = createEditorRenderer(canvas);
    r.setPool(calibratedPool);
    r.setImages(
      new Map([
        ["img-cal", { width: 100, height: 100 } as unknown as ImageBitmap],
      ]),
    );
    r.setFigure(FIG);
    // Flush queued microtasks (the rAF callbacks).
    await Promise.resolve();
    await Promise.resolve();

    expect(drawFigureSpy).toHaveBeenCalled();
    // The most recent call should reflect all three setters.
    const last = drawFigureSpy.mock.calls.at(-1);
    expect(last).toBeDefined();
    const [, fig, images, pool] = last as unknown as [
      unknown,
      Figure,
      Map<string, ImageBitmap>,
      Map<string, ImagePoolItem>,
    ];
    expect(fig).toBe(FIG);
    expect(images.get("img-cal")?.width).toBe(100);
    // The crucial assertion: the calibrated pool reaches drawFigure.
    expect(pool).toBeDefined();
    expect(pool.get("img-cal")?.calibration?.pixelsPerUnit).toBe(6.45);
  });

  it("passes editorHints on so empty panels get the drag caption, images or not", async () => {
    const r = createEditorRenderer(canvas);
    r.setFigure(FIG);
    await Promise.resolve();
    await Promise.resolve();

    const optsEmpty = (
      drawFigureSpy.mock.calls.at(-1) as unknown as [
        unknown,
        Figure,
        Map<string, ImageBitmap>,
        Map<string, ImagePoolItem>,
        { editorHints?: boolean } | undefined,
      ]
    )[4];
    expect(optsEmpty?.editorHints).toBe(true);

    // …and still on once images are loaded.
    r.setImages(
      new Map([
        ["img-cal", { width: 100, height: 100 } as unknown as ImageBitmap],
      ]),
    );
    await Promise.resolve();
    await Promise.resolve();

    const optsWithImages = (
      drawFigureSpy.mock.calls.at(-1) as unknown as [
        unknown,
        Figure,
        Map<string, ImageBitmap>,
        Map<string, ImagePoolItem>,
        { editorHints?: boolean } | undefined,
      ]
    )[4];
    expect(optsWithImages?.editorHints).toBe(true);
  });

  it("defaults the pool to an empty Map before setPool is called (regression: prior bug behaviour)", async () => {
    // Without the new setPool wiring, drawFigure used to be called with the
    // default empty pool, silently dropping scale bars. This test pins the
    // *correct* default so a future refactor can't regress to undefined.
    const r = createEditorRenderer(canvas);
    r.setFigure(FIG);
    await Promise.resolve();
    await Promise.resolve();

    expect(drawFigureSpy).toHaveBeenCalled();
    const [, , , pool] = drawFigureSpy.mock.calls.at(-1) as unknown as [
      unknown,
      Figure,
      Map<string, ImageBitmap>,
      Map<string, ImagePoolItem>,
    ];
    expect(pool).toBeInstanceOf(Map);
    expect(pool.size).toBe(0);
  });
});

describe("editor-renderer: editorScale", () => {
  let canvas: HTMLCanvasElement;
  let drawFigureSpy: ReturnType<typeof vi.spyOn>;
  let setTransformCalls: number[][];

  beforeEach(() => {
    canvas = document.createElement("canvas");
    setTransformCalls = [];
    canvas.getContext = (() =>
      ({
        setTransform: (...args: number[]) => {
          setTransformCalls.push(args);
        },
        scale: () => {},
      }) as unknown) as HTMLCanvasElement["getContext"];

    drawFigureSpy = vi
      .spyOn(drawFigureModule, "drawFigure")
      .mockImplementation(() => {});

    let pending: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      pending = cb;
      queueMicrotask(() => {
        if (pending !== null) {
          const c = pending;
          pending = null;
          c(0);
        }
      });
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    // Force a deterministic dpr for the assertions.
    vi.stubGlobal("window", { devicePixelRatio: 2 });
  });

  afterEach(() => {
    drawFigureSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("sizes the backing store to model * editorScale * dpr", async () => {
    const r = createEditorRenderer(canvas);
    r.setEditorScale(3);
    r.setFigure(FIG); // FIG.canvas is 100x100 in this test file
    await Promise.resolve();
    await Promise.resolve();
    // 100 * 3 * 2 = 600
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(600);
  });

  it("composes editorScale*dpr into the single ctx transform", async () => {
    const r = createEditorRenderer(canvas);
    r.setEditorScale(3);
    r.setFigure(FIG);
    await Promise.resolve();
    await Promise.resolve();
    // editorScale 3 * dpr 2 = 6 on both axes.
    expect(setTransformCalls.at(-1)).toEqual([6, 0, 0, 6, 0, 0]);
  });

  it("passes an identical model-space figure to drawFigure regardless of editorScale", async () => {
    const r1 = createEditorRenderer(canvas);
    r1.setEditorScale(1);
    r1.setFigure(FIG);
    await Promise.resolve();
    await Promise.resolve();
    const figAt1 = drawFigureSpy.mock.calls.at(-1)?.[1];

    const r2 = createEditorRenderer(canvas);
    r2.setEditorScale(4);
    r2.setFigure(FIG);
    await Promise.resolve();
    await Promise.resolve();
    const figAt4 = drawFigureSpy.mock.calls.at(-1)?.[1];

    // Same model figure object reaches drawFigure; zoom does not leak in.
    expect(figAt1).toBe(FIG);
    expect(figAt4).toBe(FIG);
  });

  it("defaults editorScale to 1 before setEditorScale is called", async () => {
    const r = createEditorRenderer(canvas);
    r.setFigure(FIG);
    await Promise.resolve();
    await Promise.resolve();
    // 100 * 1 * 2 = 200
    expect(canvas.width).toBe(200);
  });

  it("clamps the backing store to the max canvas dimension for huge scales", async () => {
    // A high-res image drives editorScale up; 100 * 500 * 2 = 100000 would
    // blow past the browser's ~16384px canvas limit and paint nothing (the
    // "canvas crashes on upload" bug). The backing store must stay ≤ the max.
    const r = createEditorRenderer(canvas);
    r.setEditorScale(500);
    r.setFigure(FIG);
    await Promise.resolve();
    await Promise.resolve();
    expect(canvas.width).toBeLessThanOrEqual(MAX_EDITOR_CANVAS_PX);
    expect(canvas.height).toBeLessThanOrEqual(MAX_EDITOR_CANVAS_PX);
    expect(canvas.width).toBeGreaterThan(0);
  });

  it("keeps the ctx transform consistent with the clamped backing store", async () => {
    // When clamped, the transform scale must match the actual backing store
    // (backingW / modelW) or the drawing overflows / underfills the canvas.
    const r = createEditorRenderer(canvas);
    r.setEditorScale(500);
    r.setFigure(FIG); // 100x100 model
    await Promise.resolve();
    await Promise.resolve();
    const scale = setTransformCalls.at(-1)?.[0];
    expect(scale).toBeCloseTo(canvas.width / 100, 6);
  });
});

describe("editor-renderer: setTheme", () => {
  let canvas: HTMLCanvasElement;
  let drawFigureSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    canvas = document.createElement("canvas");
    canvas.getContext = (() =>
      ({
        setTransform: () => {},
        scale: () => {},
      }) as unknown) as HTMLCanvasElement["getContext"];

    drawFigureSpy = vi
      .spyOn(drawFigureModule, "drawFigure")
      .mockImplementation(() => {});

    let pending: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      pending = cb;
      queueMicrotask(() => {
        if (pending !== null) {
          const c = pending;
          pending = null;
          c(0);
        }
      });
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    drawFigureSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("exposes setTheme and tolerates calls before a figure is set", () => {
    const r = createEditorRenderer(canvas);
    expect(typeof r.setTheme).toBe("function");
    expect(() => r.setTheme("dark")).not.toThrow();
    r.dispose();
  });

  it("threads the chrome theme into drawFigure opts", async () => {
    const r = createEditorRenderer(canvas);
    r.setTheme("dark");
    r.setFigure(FIG);
    await Promise.resolve();
    await Promise.resolve();

    const [, , , , opts] = drawFigureSpy.mock.calls.at(-1) as unknown as [
      unknown,
      Figure,
      Map<string, ImageBitmap>,
      Map<string, ImagePoolItem>,
      { theme?: "light" | "dark" } | undefined,
    ];
    expect(opts?.theme).toBe("dark");
  });

  it("defaults the theme to light before setTheme is called", async () => {
    const r = createEditorRenderer(canvas);
    r.setFigure(FIG);
    await Promise.resolve();
    await Promise.resolve();

    const [, , , , opts] = drawFigureSpy.mock.calls.at(-1) as unknown as [
      unknown,
      Figure,
      Map<string, ImageBitmap>,
      Map<string, ImagePoolItem>,
      { theme?: "light" | "dark" } | undefined,
    ];
    expect(opts?.theme).toBe("light");
  });
});
