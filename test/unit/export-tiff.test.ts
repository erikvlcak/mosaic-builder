import { describe, it, expect, vi, beforeEach } from "vitest";
import { SAMPLE_FIGURE } from "../helpers/sample-figure";

const HAS_OFFSCREEN = typeof OffscreenCanvas !== "undefined";

const exportTiff = vi.fn();

beforeEach(() => {
  exportTiff.mockReset();
  exportTiff.mockResolvedValue({
    ok: true,
    filePath: "/tmp/mosaic-figure.tif",
    bytesWritten: 0,
  });
  // @ts-expect-error — assigning to globalThis for renderer lookup.
  globalThis.window = { api: { exportTiff } };
});

describe.skipIf(!HAS_OFFSCREEN)("exportFigureAsTiff", () => {
  it("calls window.api.exportTiff with non-zero bytes and a .tif defaultName", async () => {
    const { exportFigureAsTiff } = await import(
      "../../src/renderer/export/tiff"
    );

    const result = await exportFigureAsTiff(SAMPLE_FIGURE, new Map(), 300);
    expect(result.ok).toBe(true);

    const call = exportTiff.mock.calls[0];
    expect(call).toBeDefined();
    const [bytes, defaultName] = call as [Uint8Array, string];
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(defaultName.endsWith(".tif")).toBe(true);
  });

  it("emits TIFF byte order marker (II or MM) at offset 0", async () => {
    const { exportFigureAsTiff } = await import(
      "../../src/renderer/export/tiff"
    );

    await exportFigureAsTiff(SAMPLE_FIGURE, new Map(), 300);

    const call = exportTiff.mock.calls[0];
    expect(call).toBeDefined();
    const [bytes] = call as [Uint8Array, string];
    const b0 = bytes[0];
    const b1 = bytes[1];
    const isII = b0 === 0x49 && b1 === 0x49;
    const isMM = b0 === 0x4d && b1 === 0x4d;
    expect(isII || isMM).toBe(true);
  });
});
