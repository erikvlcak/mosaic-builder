import type { Calibration } from "../model/pool";

/**
 * The subset of the UTIF module surface the decoder uses. Injected rather than
 * imported directly so this module stays free of the heavy UTIF dependency and
 * is unit-testable with a fake.
 */
export interface UtifLike {
  decode(buffer: ArrayBuffer): UtifIfd[];
  decodeImage(buffer: ArrayBuffer, ifd: UtifIfd): void;
  toRGBA8(ifd: UtifIfd): Uint8Array;
}

export interface DecodedTiff {
  rgba: Uint8Array;
  width: number;
  height: number;
  bitDepth: 8 | 16;
  calibration?: Calibration;
}

/**
 * Decode the first image of a TIFF to RGBA, or throw a user-meaningful error.
 *
 * UTIF does NOT throw on unsupported files. For unknown compression /
 * photometric interpretation / unsupported bit depths it merely emits a
 * `console.log`/`console.warn` and returns an all-zero RGBA buffer — so a naive
 * try/catch lets the user get a solid-black panel with no warning (findings
 * 3.1/3.2). We defend three ways:
 *   1. Reject bits-per-sample > 16 up front — toRGBA8 has no float branch, so
 *      32-bit files can't be represented and would decode blank while being
 *      mislabeled 16-bit.
 *   2. Intercept console output during the UTIF calls and treat an
 *      "Unknown compression/Photometric" emission as a decode error.
 *   3. Backstop: if a non-trivial image decodes to an all-zero buffer, treat it
 *      as a failed decode rather than shipping a black panel.
 */
export function decodeTiffToRgba(
  buffer: ArrayBuffer,
  utif: UtifLike,
): DecodedTiff {
  const ifds = utif.decode(buffer);
  if (ifds.length === 0)
    throw new Error("Not a readable TIFF (no image data).");
  const ifd0 = ifds[0]!;

  const bps = ifd0.t258?.[0] ?? 8;
  if (bps > 16) {
    throw new Error(
      `Unsupported TIFF bit depth (${bps}-bit). Only 8- and 16-bit images are supported.`,
    );
  }

  const complaint = captureUtifComplaint(() => {
    utif.decodeImage(buffer, ifd0);
  });
  if (complaint !== null) {
    throw new Error(`Unsupported TIFF: ${complaint}`);
  }

  const rgba = utif.toRGBA8(ifd0);
  const width = ifd0.width;
  const height = ifd0.height;
  if (width <= 0 || height <= 0) {
    throw new Error(`TIFF has invalid dimensions (${width}×${height}).`);
  }
  // Backstop: a non-trivial image that came out fully transparent/black almost
  // certainly hit an unsupported path UTIF logged rather than threw.
  if (rgba.length > 0 && isAllZero(rgba)) {
    throw new Error("Unsupported TIFF (unknown compression or color format).");
  }

  const bitDepth: 8 | 16 = bps >= 16 ? 16 : 8;
  const calibration = readCalibrationFromIFD(ifd0);
  return {
    rgba,
    width,
    height,
    bitDepth,
    ...(calibration !== undefined ? { calibration } : {}),
  };
}

/**
 * Run `fn` with console.log/warn intercepted; return the first message that
 * looks like a UTIF "unsupported format" complaint, or null if there was none.
 * UTIF emits e.g. "Unknown compression: 7" / "Unknown Photometric ..." for
 * formats it can't handle instead of throwing.
 */
function captureUtifComplaint(fn: () => void): string | null {
  const origLog = console.log;
  const origWarn = console.warn;
  let complaint: string | null = null;
  const capture = (...args: unknown[]): void => {
    const text = args.map((a) => String(a)).join(" ");
    if (complaint === null && /unknown (compression|photometric)/i.test(text)) {
      complaint = text;
    }
  };
  console.log = capture;
  console.warn = capture;
  try {
    fn();
  } finally {
    console.log = origLog;
    console.warn = origWarn;
  }
  return complaint;
}

function isAllZero(a: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== 0) return false;
  }
  return true;
}

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
export function readCalibrationFromIFD(ifd: UtifIfd): Calibration | undefined {
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
