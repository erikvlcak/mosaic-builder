import { describe, it, expect, vi } from "vitest";
import UTIF from "utif";
import { injectResolutionTags } from "../../src/renderer/image/tiff-encode-tags";

function makeTiff(w: number, h: number): Uint8Array {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 128;
    rgba[i + 1] = 128;
    rgba[i + 2] = 128;
    rgba[i + 3] = 255;
  }
  return new Uint8Array(UTIF.encodeImage(rgba, w, h));
}

function readDpi(bytes: Uint8Array): { x: number; y: number; unit: number } {
  const ifds = UTIF.decode(
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.slice().buffer,
  );
  const ifd = ifds[0]!;
  const xRes = ifd["t282"] as number[] | undefined;
  const yRes = ifd["t283"] as number[] | undefined;
  const unit = ifd["t296"] as number[] | undefined;
  return {
    x: xRes !== undefined ? xRes[0]! : -1,
    y: yRes !== undefined ? yRes[0]! : -1,
    unit: unit !== undefined ? unit[0]! : -1,
  };
}

describe("injectResolutionTags", () => {
  it("injects 300 dpi into a UTIF-encoded TIFF", () => {
    const tiff = makeTiff(8, 8);
    const out = injectResolutionTags(tiff, 300);
    const dpi = readDpi(out);
    expect(dpi.x).toBe(300);
    expect(dpi.y).toBe(300);
    expect(dpi.unit).toBe(2); // inch
  });

  it("injects 72 dpi when requested", () => {
    const tiff = makeTiff(4, 4);
    const out = injectResolutionTags(tiff, 72);
    const dpi = readDpi(out);
    expect(dpi.x).toBe(72);
    expect(dpi.y).toBe(72);
    expect(dpi.unit).toBe(2);
  });

  it("does not mutate the input array", () => {
    const tiff = makeTiff(4, 4);
    const before = new Uint8Array(tiff); // copy
    injectResolutionTags(tiff, 300);
    expect(Buffer.from(tiff).equals(Buffer.from(before))).toBe(true);
  });

  it("returns input unchanged + warns on non-positive dpi", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const tiff = makeTiff(4, 4);
      const out = injectResolutionTags(tiff, 0);
      expect(out).toBe(tiff);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("returns input unchanged + warns on garbage bytes", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const garbage = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      const out = injectResolutionTags(garbage, 300);
      expect(out).toBe(garbage);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
