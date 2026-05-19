import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  pdfPageSize,
  PDF_DPI,
  PT_PER_INCH,
} from "../../src/renderer/export/pdf";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import type { Figure } from "../../src/renderer/model/types";

const HAS_OFFSCREEN = typeof OffscreenCanvas !== "undefined";

const exportPdf = vi.fn();

beforeEach(() => {
  exportPdf.mockReset();
  exportPdf.mockResolvedValue({
    ok: true,
    filePath: "/tmp/mosaic-figure.pdf",
    bytesWritten: 0,
  });
  // @ts-expect-error — assigning to globalThis for renderer lookup.
  globalThis.window = { api: { exportPdf } };
});

describe.skipIf(!HAS_OFFSCREEN)("exportFigureAsPdf", () => {
  it("emits a PDF whose first 4 bytes are %PDF", async () => {
    const { exportFigureAsPdf } = await import("../../src/renderer/export/pdf");
    const { HARDCODED_FIGURE } = await import(
      "../../src/renderer/model/hardcoded"
    );

    const result = await exportFigureAsPdf(HARDCODED_FIGURE, new Map());
    expect(result.ok).toBe(true);

    const call = exportPdf.mock.calls[0];
    expect(call).toBeDefined();
    const [bytes, defaultName] = call as [Uint8Array, string];
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0x25); // %
    expect(bytes[1]).toBe(0x50); // P
    expect(bytes[2]).toBe(0x44); // D
    expect(bytes[3]).toBe(0x46); // F
    expect(defaultName.endsWith(".pdf")).toBe(true);
  });

  it("produces non-zero bytes", async () => {
    const { exportFigureAsPdf } = await import("../../src/renderer/export/pdf");
    const { HARDCODED_FIGURE } = await import(
      "../../src/renderer/model/hardcoded"
    );

    await exportFigureAsPdf(HARDCODED_FIGURE, new Map());

    const call = exportPdf.mock.calls[0];
    expect(call).toBeDefined();
    const [bytes] = call as [Uint8Array, string];
    expect(bytes.byteLength).toBeGreaterThan(100);
  });
});

describe("pdfPageSize", () => {
  const figure: Figure = {
    canvas: { widthPx: 1200, heightPx: 900, background: "#FFFFFF" },
    grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#000000" },
    panels: [{ row: 0, col: 0, kind: "placeholder", label: "" }],
    annotations: [],
    globalStyle: DEFAULT_GLOBAL_STYLE,
  };

  it("scales the page with exportScale so the embedded PNG draws 1:1 at PDF_DPI", () => {
    const at1 = pdfPageSize(figure, 1);
    expect(at1.wPt).toBe((1200 / PDF_DPI) * PT_PER_INCH);
    expect(at1.hPt).toBe((900 / PDF_DPI) * PT_PER_INCH);

    const at3 = pdfPageSize(figure, 3);
    expect(at3.wPt).toBe(((1200 * 3) / PDF_DPI) * PT_PER_INCH);
    expect(at3.hPt).toBe(((900 * 3) / PDF_DPI) * PT_PER_INCH);
  });

  it("at exportScale=1 a typical editor canvas yields a 5–9 inch page", () => {
    const { wPt } = pdfPageSize(figure, 1);
    const inches = wPt / PT_PER_INCH;
    expect(inches).toBeGreaterThanOrEqual(5);
    expect(inches).toBeLessThanOrEqual(9);
  });
});
