import type { Calibration } from "../model/pool";

/**
 * Minimal IFD shape we read from. Mirrors the subset of UTIF.IFD tags we
 * care about for calibration + bit-depth detection. Kept structural so
 * test fixtures and the worker payload can both satisfy it without
 * depending on the full UTIF.IFD interface (which carries the raw `data`
 * Uint8Array and is awkward to construct by hand).
 *
 * TIFF tag reference:
 *  - t258 = BitsPerSample
 *  - t282 = XResolution (rational pixels per unit)
 *  - t283 = YResolution (we use X; warn if X != Y in caller if needed)
 *  - t296 = ResolutionUnit (1=none, 2=inch, 3=cm)
 */
export interface UtifIfd {
  t258?: number[];
  t282?: number[];
  t283?: number[];
  t296?: number[];
  width: number;
  height: number;
}

const MICROMETERS_PER_INCH = 25400;
const MICROMETERS_PER_CM = 10000;

/**
 * Map UTIF IFD calibration tags to our Calibration type. Returns undefined
 * if the IFD lacks an absolute resolution unit, lacks XResolution, or
 * carries a degenerate/zero rational.
 */
export function readCalibrationFromIFD(
  ifd: UtifIfd,
): Calibration | undefined {
  const xres = ratioToFloat(ifd.t282);
  const unitTag = ifd.t296?.[0] ?? 1;
  if (xres === undefined || xres <= 0 || !Number.isFinite(xres)) {
    return undefined;
  }
  // Reject anything that isn't a known absolute unit (2=inch, 3=cm).
  // 1 means "no absolute unit"; everything else is an unrecognized tag.
  if (unitTag !== 2 && unitTag !== 3) return undefined;
  if (unitTag === 2) {
    return {
      unit: "um",
      pixelsPerUnit: xres / MICROMETERS_PER_INCH,
      source: "tiff-meta",
    };
  }
  // unitTag === 3 (centimeters)
  return {
    unit: "um",
    pixelsPerUnit: xres / MICROMETERS_PER_CM,
    source: "tiff-meta",
  };
}

function ratioToFloat(r: number[] | undefined): number | undefined {
  if (r === undefined) return undefined;
  if (r.length === 1) return r[0];
  if (r.length >= 2 && r[1] !== 0 && r[1] !== undefined && r[0] !== undefined) {
    return r[0] / r[1];
  }
  return undefined;
}
