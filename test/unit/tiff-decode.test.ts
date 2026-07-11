import { describe, it, expect } from "vitest";
import {
  readCalibrationFromIFD,
  decodeTiffToRgba,
  type UtifIfd,
  type UtifLike,
} from "../../src/renderer/image/tiff-decode";

function ifd(partial: Partial<UtifIfd>): UtifIfd {
  return {
    width: 100,
    height: 100,
    ...partial,
  };
}

describe("readCalibrationFromIFD", () => {
  it("decodes cm-unit XResolution as µm calibration (645/100 px/cm → 0.000645 px/µm)", () => {
    const cal = readCalibrationFromIFD(ifd({ t282: [645, 100], t296: [3] }));
    expect(cal).toBeDefined();
    expect(cal!.unit).toBe("um");
    expect(cal!.source).toBe("tiff-meta");
    expect(cal!.pixelsPerUnit).toBeCloseTo(0.000645, 9);
  });

  it("decodes inch-unit XResolution as µm calibration (300 px/in → 300/25400 px/µm)", () => {
    const cal = readCalibrationFromIFD(ifd({ t282: [300, 1], t296: [2] }));
    expect(cal).toBeDefined();
    expect(cal!.unit).toBe("um");
    expect(cal!.source).toBe("tiff-meta");
    expect(cal!.pixelsPerUnit).toBeCloseTo(300 / 25400, 12);
  });

  it("returns undefined when ResolutionUnit is 1 (no absolute unit)", () => {
    const cal = readCalibrationFromIFD(ifd({ t282: [300, 1], t296: [1] }));
    expect(cal).toBeUndefined();
  });

  it("returns undefined when XResolution (t282) is missing", () => {
    const cal = readCalibrationFromIFD(ifd({ t296: [2] }));
    expect(cal).toBeUndefined();
  });

  it("returns undefined for zero XResolution numerator", () => {
    const cal = readCalibrationFromIFD(ifd({ t282: [0, 1], t296: [2] }));
    expect(cal).toBeUndefined();
  });

  it("returns undefined for zero denominator (avoid divide-by-zero)", () => {
    const cal = readCalibrationFromIFD(ifd({ t282: [300, 0], t296: [2] }));
    expect(cal).toBeUndefined();
  });

  it("defaults ResolutionUnit to 1 (none) when t296 is missing", () => {
    const cal = readCalibrationFromIFD(ifd({ t282: [300, 1] }));
    expect(cal).toBeUndefined();
  });

  it("returns undefined for unknown ResolutionUnit tags (e.g. 42)", () => {
    const cal = readCalibrationFromIFD(ifd({ t282: [300, 1], t296: [42] }));
    expect(cal).toBeUndefined();
  });
});

// Build a fake UtifLike whose toRGBA8 returns `rgba` and whose decodeImage
// optionally emits a UTIF-style console complaint (UTIF logs instead of
// throwing for unsupported formats).
function fakeUtif(opts: {
  ifds?: UtifIfd[];
  rgba?: Uint8Array;
  complaint?: string;
}): UtifLike {
  const ifds = opts.ifds ?? [{ width: 2, height: 2, t258: [8] }];
  return {
    decode: () => ifds,
    decodeImage: () => {
      if (opts.complaint !== undefined) console.log(opts.complaint);
    },
    toRGBA8: () => opts.rgba ?? new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]),
  };
}

describe("decodeTiffToRgba", () => {
  it("decodes a supported TIFF to rgba + dims + bit depth", () => {
    const out = decodeTiffToRgba(
      new ArrayBuffer(8),
      fakeUtif({ ifds: [{ width: 2, height: 2, t258: [16] }] }),
    );
    expect(out.width).toBe(2);
    expect(out.height).toBe(2);
    expect(out.bitDepth).toBe(16);
    expect(out.rgba.length).toBe(8);
  });

  it("rejects an unsupported compression (UTIF logs 'Unknown compression')", () => {
    expect(() =>
      decodeTiffToRgba(
        new ArrayBuffer(8),
        fakeUtif({ complaint: "Unknown compression: 7" }),
      ),
    ).toThrow(/unsupported tiff/i);
  });

  it("rejects an unsupported photometric interpretation", () => {
    expect(() =>
      decodeTiffToRgba(
        new ArrayBuffer(8),
        fakeUtif({ complaint: "Unknown Photometric type: 32803" }),
      ),
    ).toThrow(/unsupported tiff/i);
  });

  it("rejects 32-bit (float) TIFFs with a bit-depth message (3.2)", () => {
    expect(() =>
      decodeTiffToRgba(
        new ArrayBuffer(8),
        fakeUtif({ ifds: [{ width: 2, height: 2, t258: [32] }] }),
      ),
    ).toThrow(/bit depth/i);
  });

  it("rejects an all-zero decode of a non-trivial image (silent-black backstop)", () => {
    expect(() =>
      decodeTiffToRgba(
        new ArrayBuffer(8),
        fakeUtif({ rgba: new Uint8Array(16) }), // all zeros
      ),
    ).toThrow(/unsupported tiff/i);
  });

  it("rejects a TIFF with no IFDs", () => {
    expect(() =>
      decodeTiffToRgba(new ArrayBuffer(8), fakeUtif({ ifds: [] })),
    ).toThrow(/no image data/i);
  });

  it("rejects zero-dimension images with a friendly message (3.5)", () => {
    expect(() =>
      decodeTiffToRgba(
        new ArrayBuffer(8),
        fakeUtif({ ifds: [{ width: 0, height: 4, t258: [8] }] }),
      ),
    ).toThrow(/invalid dimensions/i);
  });
});
