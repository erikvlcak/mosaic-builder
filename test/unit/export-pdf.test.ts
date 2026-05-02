import { describe, it, expect, vi, beforeEach } from "vitest";

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
    const { HARDCODED_FIGURE } = await import("../../src/renderer/model/hardcoded");

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
    const { HARDCODED_FIGURE } = await import("../../src/renderer/model/hardcoded");

    await exportFigureAsPdf(HARDCODED_FIGURE, new Map());

    const call = exportPdf.mock.calls[0];
    expect(call).toBeDefined();
    const [bytes] = call as [Uint8Array, string];
    expect(bytes.byteLength).toBeGreaterThan(100);
  });
});
