import { describe, it, expect } from "vitest";
import {
  readCalibrationFromIFD,
  type UtifIfd,
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
    const cal = readCalibrationFromIFD(
      ifd({ t282: [645, 100], t296: [3] }),
    );
    expect(cal).toBeDefined();
    expect(cal!.unit).toBe("um");
    expect(cal!.source).toBe("tiff-meta");
    expect(cal!.pixelsPerUnit).toBeCloseTo(0.000645, 9);
  });

  it("decodes inch-unit XResolution as µm calibration (300 px/in → 300/25400 px/µm)", () => {
    const cal = readCalibrationFromIFD(
      ifd({ t282: [300, 1], t296: [2] }),
    );
    expect(cal).toBeDefined();
    expect(cal!.unit).toBe("um");
    expect(cal!.source).toBe("tiff-meta");
    expect(cal!.pixelsPerUnit).toBeCloseTo(300 / 25400, 12);
  });

  it("returns undefined when ResolutionUnit is 1 (no absolute unit)", () => {
    const cal = readCalibrationFromIFD(
      ifd({ t282: [300, 1], t296: [1] }),
    );
    expect(cal).toBeUndefined();
  });

  it("returns undefined when XResolution (t282) is missing", () => {
    const cal = readCalibrationFromIFD(ifd({ t296: [2] }));
    expect(cal).toBeUndefined();
  });

  it("returns undefined for zero XResolution numerator", () => {
    const cal = readCalibrationFromIFD(
      ifd({ t282: [0, 1], t296: [2] }),
    );
    expect(cal).toBeUndefined();
  });

  it("returns undefined for zero denominator (avoid divide-by-zero)", () => {
    const cal = readCalibrationFromIFD(
      ifd({ t282: [300, 0], t296: [2] }),
    );
    expect(cal).toBeUndefined();
  });

  it("defaults ResolutionUnit to 1 (none) when t296 is missing", () => {
    const cal = readCalibrationFromIFD(ifd({ t282: [300, 1] }));
    expect(cal).toBeUndefined();
  });
});
