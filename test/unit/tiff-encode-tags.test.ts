// Most cases here use UTIF.encodeImage to mint a baseline TIFF, which
// always emits little-endian (II) data WITH placeholder t282/t283/t296
// tags. To exercise the MM (big-endian) branch and the rebuildIFD path
// (when those tags are missing), we hand-build minimal TIFF fixtures
// further down.
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

// ---------------------------------------------------------------------
// Hand-built TIFF helpers
// ---------------------------------------------------------------------

const TYPE_BYTE = 1;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;

interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  /** Inline raw 4 bytes for the value field. Caller picks endianness. */
  valueBytes: Uint8Array;
}

function u16LE(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
}
function u32LE(v: number): Uint8Array {
  return new Uint8Array([
    v & 0xff,
    (v >>> 8) & 0xff,
    (v >>> 16) & 0xff,
    (v >>> 24) & 0xff,
  ]);
}
function u16BE(v: number): Uint8Array {
  return new Uint8Array([(v >>> 8) & 0xff, v & 0xff]);
}
function u32BE(v: number): Uint8Array {
  return new Uint8Array([
    (v >>> 24) & 0xff,
    (v >>> 16) & 0xff,
    (v >>> 8) & 0xff,
    v & 0xff,
  ]);
}

/**
 * Build a minimal TIFF with header + IFD0 of the given entries + 1
 * byte of pixel data referenced by t273 (StripOffsets) when present.
 * Layout:
 *   [0..7]   Header (II/MM, magic 42, IFD0 offset)
 *   [8]      1 byte pixel payload (so StripOffsets can point here)
 *   [9..]    IFD0 (count + entries + nextIfdOffset=0)
 *   [..]     External rational payloads written after IFD if any
 */
function buildMinimalTiff(opts: {
  littleEndian: boolean;
  /** Entries by tag — order is preserved (must be ascending). */
  entries: Array<{
    tag: number;
    type: number;
    count: number;
    /** If RATIONAL with count=1, this number is encoded as numerator/10000. */
    rationalValue?: number;
    /** If SHORT/LONG inline, the integer value. */
    inlineValue?: number;
    /** Override raw 4-byte value field if provided. */
    valueBytesOverride?: Uint8Array;
  }>;
}): Uint8Array {
  const { littleEndian, entries } = opts;
  const u16 = littleEndian ? u16LE : u16BE;
  const u32 = littleEndian ? u32LE : u32BE;

  // Pre-compute layout. We need to know external payload offsets up
  // front (RATIONAL = 8 bytes external).
  const PIXEL_DATA_OFFSET = 8;
  const PIXEL_DATA_LEN = 1;
  const ifdOffset = PIXEL_DATA_OFFSET + PIXEL_DATA_LEN; // 9
  const entryCount = entries.length;
  const ifdSize = 2 + entryCount * 12 + 4;
  const externalStart = ifdOffset + ifdSize;

  // Walk entries, allocate external slots for RATIONALs that need them.
  const externalChunks: Uint8Array[] = [];
  let cursor = externalStart;
  const builtEntries: IfdEntry[] = entries.map((e) => {
    if (e.valueBytesOverride !== undefined) {
      return {
        tag: e.tag,
        type: e.type,
        count: e.count,
        valueBytes: e.valueBytesOverride,
      };
    }
    if (e.type === TYPE_RATIONAL && e.count === 1) {
      const payloadOff = cursor;
      cursor += 8;
      const num = Math.round((e.rationalValue ?? 1) * 10000);
      const denom = 10000;
      const payload = new Uint8Array(8);
      payload.set(u32(num), 0);
      payload.set(u32(denom), 4);
      externalChunks.push(payload);
      return {
        tag: e.tag,
        type: e.type,
        count: e.count,
        valueBytes: u32(payloadOff),
      };
    }
    if (
      (e.type === TYPE_SHORT || e.type === TYPE_LONG || e.type === TYPE_BYTE) &&
      e.count === 1
    ) {
      const v = e.inlineValue ?? 0;
      // SHORT: 2 bytes, padded to 4. LONG: 4 bytes. BYTE: 1 byte padded.
      const valBytes = new Uint8Array(4);
      if (e.type === TYPE_LONG) {
        valBytes.set(u32(v), 0);
      } else if (e.type === TYPE_SHORT) {
        valBytes.set(u16(v), 0);
      } else {
        valBytes[0] = v & 0xff;
      }
      return {
        tag: e.tag,
        type: e.type,
        count: e.count,
        valueBytes: valBytes,
      };
    }
    throw new Error(`unsupported test entry: tag=${String(e.tag)}`);
  });

  const externalSize = externalChunks.reduce((sum, c) => sum + c.length, 0);
  const totalSize = externalStart + externalSize;
  const out = new Uint8Array(totalSize);

  // Header.
  if (littleEndian) {
    out[0] = 0x49;
    out[1] = 0x49;
  } else {
    out[0] = 0x4d;
    out[1] = 0x4d;
  }
  out.set(u16(42), 2);
  out.set(u32(ifdOffset), 4);

  // 1 byte of pixel payload (zero — fine).
  out[PIXEL_DATA_OFFSET] = 0;

  // IFD entry count.
  out.set(u16(entryCount), ifdOffset);
  // Entries.
  for (let i = 0; i < builtEntries.length; i++) {
    const e = builtEntries[i]!;
    const off = ifdOffset + 2 + i * 12;
    out.set(u16(e.tag), off);
    out.set(u16(e.type), off + 2);
    out.set(u32(e.count), off + 4);
    out.set(e.valueBytes, off + 8);
  }
  // Next IFD offset = 0.
  out.set(u32(0), ifdOffset + 2 + entryCount * 12);

  // External payloads.
  let extCursor = externalStart;
  for (const chunk of externalChunks) {
    out.set(chunk, extCursor);
    extCursor += chunk.length;
  }

  return out;
}

/** Walks IFD0 by hand and pulls back tag values we care about. */
function readDpiManual(
  bytes: Uint8Array,
  littleEndian: boolean,
): { x: number; y: number; unit: number; entryCount: number } {
  const readU16 = (o: number): number =>
    littleEndian
      ? bytes[o]! | (bytes[o + 1]! << 8)
      : (bytes[o]! << 8) | bytes[o + 1]!;
  const readU32 = (o: number): number =>
    littleEndian
      ? (bytes[o]! |
          (bytes[o + 1]! << 8) |
          (bytes[o + 2]! << 16) |
          (bytes[o + 3]! << 24)) >>>
        0
      : ((bytes[o]! << 24) |
          (bytes[o + 1]! << 16) |
          (bytes[o + 2]! << 8) |
          bytes[o + 3]!) >>>
        0;

  const ifdOff = readU32(4);
  const count = readU16(ifdOff);
  let xNum = -1;
  let yNum = -1;
  let unit = -1;
  for (let i = 0; i < count; i++) {
    const eOff = ifdOff + 2 + i * 12;
    const tag = readU16(eOff);
    const type = readU16(eOff + 2);
    if (tag === 282 && type === 5) {
      const payloadOff = readU32(eOff + 8);
      const num = readU32(payloadOff);
      const denom = readU32(payloadOff + 4);
      xNum = denom === 0 ? -1 : num / denom;
    } else if (tag === 283 && type === 5) {
      const payloadOff = readU32(eOff + 8);
      const num = readU32(payloadOff);
      const denom = readU32(payloadOff + 4);
      yNum = denom === 0 ? -1 : num / denom;
    } else if (tag === 296 && type === 3) {
      unit = readU16(eOff + 8);
    }
  }
  return { x: xNum, y: yNum, unit, entryCount: count };
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

  // -----------------------------------------------------------------
  // Hand-built TIFF tests: cover branches UTIF.encodeImage cannot reach.
  // -----------------------------------------------------------------

  it("patches MM (big-endian) TIFF in place with all three tags present", () => {
    const tiff = buildMinimalTiff({
      littleEndian: false,
      entries: [
        // Tags must be ascending: 282, 283, 296.
        { tag: 282, type: TYPE_RATIONAL, count: 1, rationalValue: 1 },
        { tag: 283, type: TYPE_RATIONAL, count: 1, rationalValue: 1 },
        { tag: 296, type: TYPE_SHORT, count: 1, inlineValue: 1 },
      ],
    });
    const out = injectResolutionTags(tiff, 300);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out).not.toBe(tiff);

    // UTIF.decode handles MM endianness; verify via it.
    const dpi = readDpi(out);
    expect(dpi.x).toBe(300);
    expect(dpi.y).toBe(300);
    expect(dpi.unit).toBe(2);

    // Belt-and-braces: also walk by hand to confirm MM byte order.
    const manual = readDpiManual(out, false);
    expect(manual.x).toBe(300);
    expect(manual.y).toBe(300);
    expect(manual.unit).toBe(2);
  });

  it("rebuilds IFD when t282/t283/t296 are missing (II-endian)", () => {
    // Pixel-data-only IFD: 6 entries, none of which are resolution tags.
    // Tags must be ascending: 256, 257, 258, 273, 278, 279.
    const tiff = buildMinimalTiff({
      littleEndian: true,
      entries: [
        { tag: 256, type: TYPE_LONG, count: 1, inlineValue: 1 }, // ImageWidth
        { tag: 257, type: TYPE_LONG, count: 1, inlineValue: 1 }, // ImageLength
        { tag: 258, type: TYPE_SHORT, count: 1, inlineValue: 8 }, // BitsPerSample
        { tag: 273, type: TYPE_LONG, count: 1, inlineValue: 8 }, // StripOffsets -> pixel byte
        { tag: 278, type: TYPE_LONG, count: 1, inlineValue: 1 }, // RowsPerStrip
        { tag: 279, type: TYPE_LONG, count: 1, inlineValue: 1 }, // StripByteCounts
      ],
    });

    const out = injectResolutionTags(tiff, 72);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out).not.toBe(tiff);
    // Output strictly larger (we appended new IFD + payloads).
    expect(out.length).toBeGreaterThan(tiff.length);

    // The header IFD0 pointer must now point at the newly-built IFD,
    // which by construction sits AT the old end-of-file (>= tiff.length).
    const newIfdOff =
      out[4]! | (out[5]! << 8) | (out[6]! << 16) | (out[7]! << 24);
    expect(newIfdOff).toBeGreaterThanOrEqual(tiff.length);

    const manual = readDpiManual(out, true);
    expect(manual.entryCount).toBe(9); // 6 original + 3 new
    expect(manual.x).toBe(72);
    expect(manual.y).toBe(72);
    expect(manual.unit).toBe(2);
  });

  it("returns input unchanged when t282 has wrong type (SHORT instead of RATIONAL)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // All three tags present but t282 is SHORT — patchRational guards
      // the wrong type and bails. The full file pointer stays the same
      // (because rewriteInPlace runs and produces a copy of the input).
      const tiff = buildMinimalTiff({
        littleEndian: true,
        entries: [
          { tag: 282, type: TYPE_SHORT, count: 1, inlineValue: 99 }, // wrong type
          { tag: 283, type: TYPE_RATIONAL, count: 1, rationalValue: 1 },
          { tag: 296, type: TYPE_SHORT, count: 1, inlineValue: 1 },
        ],
      });
      const out = injectResolutionTags(tiff, 300);
      // injectResolutionTags returns a fresh buffer here (rewriteInPlace
      // path always copies). The wrong-type guard means the t282 SHORT
      // value is left untouched in that copy.
      expect(out).toBeInstanceOf(Uint8Array);
      const manual = readDpiManual(out, true);
      // x stays unmatched (-1) because our reader requires type=5 for tag 282.
      expect(manual.x).toBe(-1);
      // y was patched normally.
      expect(manual.y).toBe(300);
      // unit was patched normally.
      expect(manual.unit).toBe(2);
      // No warn is expected here — patchRational silently skips wrong-type
      // entries (degraded export beats hard failure). Just assert it did
      // not throw.
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
