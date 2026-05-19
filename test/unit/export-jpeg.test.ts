import { describe, it, expect, vi, beforeEach } from "vitest";

// OffscreenCanvas is not available in Node by default. Skip cleanly so
// CI without a browser-like env still runs the rest of the suite.
const HAS_OFFSCREEN = typeof OffscreenCanvas !== "undefined";

const exportJpeg = vi.fn();

beforeEach(() => {
  exportJpeg.mockReset();
  exportJpeg.mockResolvedValue({
    ok: true,
    filePath: "/tmp/mosaic-figure.jpg",
    bytesWritten: 0,
  });
  // @ts-expect-error — assigning to globalThis for the renderer's
  // `window.api.exportJpeg` lookup to resolve in node test env.
  globalThis.window = { api: { exportJpeg } };
});

describe.skipIf(!HAS_OFFSCREEN)("exportFigureAsJpeg", () => {
  it("calls window.api.exportJpeg with non-zero bytes and a .jpg defaultName", async () => {
    const { exportFigureAsJpeg } = await import(
      "../../src/renderer/export/jpeg"
    );
    const { HARDCODED_FIGURE } = await import(
      "../../src/renderer/model/hardcoded"
    );

    const result = await exportFigureAsJpeg(HARDCODED_FIGURE, new Map(), 0.92);
    expect(result.ok).toBe(true);

    const call = exportJpeg.mock.calls[0];
    expect(call).toBeDefined();
    const [bytes, defaultName] = call as [Uint8Array, string];
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(defaultName.endsWith(".jpg")).toBe(true);
  });

  it("produces an image/jpeg blob via OffscreenCanvas", async () => {
    const off = new OffscreenCanvas(8, 8);
    const ctx = off.getContext("2d");
    expect(ctx).not.toBeNull();
    if (ctx === null) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 8, 8);
    const blob = await off.convertToBlob({ type: "image/jpeg", quality: 0.9 });
    expect(blob.type).toBe("image/jpeg");
  });
});
