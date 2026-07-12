// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFigureExport } from "../../src/renderer/hooks/useFigureExport";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import * as pngMod from "../../src/renderer/export/png";
import * as jpegMod from "../../src/renderer/export/jpeg";
import * as tiffMod from "../../src/renderer/export/tiff";
import * as pdfMod from "../../src/renderer/export/pdf";

const FIG: Figure = {
  canvas: { widthPx: 800, heightPx: 600, background: "#FFF" },
  grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#FFF" },
  panels: [{ panelId: "p1", row: 0, col: 0, kind: "placeholder", label: "A" }],
  annotations: [],
  globalStyle: DEFAULT_GLOBAL_STYLE,
};

function makeProps(push: ReturnType<typeof vi.fn>) {
  return {
    figure: FIG,
    images: new Map<string, ImageBitmap>(),
    pool: new Map(),
    poolList: [],
    rows: 1,
    cols: 1,
    gutterPx: 0,
    jpegQuality: 0.92,
    pushToast: push,
  };
}

describe("useFigureExport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pushes a success toast with the basename (not the full path) on a successful PNG export", async () => {
    vi.spyOn(pngMod, "exportFigureAsPng").mockResolvedValue({
      ok: true,
      filePath: "/Users/erik/figures/panel.png",
      bytesWritten: 100,
    });
    const push = vi.fn();
    const { result } = renderHook(() => useFigureExport(makeProps(push)));
    await act(async () => {
      await result.current.runPng();
    });
    expect(push).toHaveBeenCalledTimes(1);
    const arg = push.mock.calls[0]?.[0] as { kind: string; message: string };
    expect(arg.kind).toBe("success");
    expect(arg.message).toContain("panel.png");
    expect(arg.message).not.toContain("/Users/erik");
  });

  it("stays silent (no toast) when the export is canceled", async () => {
    vi.spyOn(pngMod, "exportFigureAsPng").mockResolvedValue({
      ok: false,
      reason: "canceled",
    });
    const push = vi.fn();
    const { result } = renderHook(() => useFigureExport(makeProps(push)));
    await act(async () => {
      await result.current.runPng();
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("pushes an error toast on a failed export", async () => {
    vi.spyOn(pngMod, "exportFigureAsPng").mockResolvedValue({
      ok: false,
      reason: "write-failed",
      message: "disk full",
    });
    const push = vi.fn();
    const { result } = renderHook(() => useFigureExport(makeProps(push)));
    await act(async () => {
      await result.current.runPng();
    });
    expect(push).toHaveBeenCalledTimes(1);
    const arg = push.mock.calls[0]?.[0] as { kind: string; message: string };
    expect(arg.kind).toBe("error");
    expect(arg.message).toMatch(/PNG|disk full/);
  });

  it("passes the stored JPEG quality through to the JPEG exporter", async () => {
    const spy = vi.spyOn(jpegMod, "exportFigureAsJpeg").mockResolvedValue({
      ok: true,
      filePath: "/x/y.jpg",
      bytesWritten: 1,
    });
    const push = vi.fn();
    const props = { ...makeProps(push), jpegQuality: 0.7 };
    const { result } = renderHook(() => useFigureExport(props));
    await act(async () => {
      await result.current.runJpeg();
    });
    // signature: (figure, images, quality, pool, exportScale)
    expect(spy.mock.calls[0]?.[2]).toBe(0.7);
  });

  it("exposes runTiff and runPdf", async () => {
    vi.spyOn(tiffMod, "exportFigureAsTiff").mockResolvedValue({
      ok: true,
      filePath: "/x/y.tif",
      bytesWritten: 1,
    });
    vi.spyOn(pdfMod, "exportFigureAsPdf").mockResolvedValue({
      ok: true,
      filePath: "/x/y.pdf",
      bytesWritten: 1,
    });
    const push = vi.fn();
    const { result } = renderHook(() => useFigureExport(makeProps(push)));
    await act(async () => {
      await result.current.runTiff();
      await result.current.runPdf();
    });
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("computes an export scale (>= 1)", () => {
    const push = vi.fn();
    const { result } = renderHook(() => useFigureExport(makeProps(push)));
    expect(result.current.exportScale).toBeGreaterThanOrEqual(1);
  });
});
