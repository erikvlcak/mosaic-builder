/**
 * Inject XResolution (t282), YResolution (t283), ResolutionUnit (t296=2 for inch)
 * tags into the IFD0 of a TIFF byte stream so viewers like ImageJ
 * recognise the DPI. Returns a NEW Uint8Array (never mutates input).
 *
 * Pure byte walker — no UTIF dependency. We parse just enough of the
 * TIFF header to locate IFD0, then either:
 *
 *   - replace each tag's value in place if its data fits in the 4-byte
 *     entry slot or if we can update the existing external pointer to
 *     re-use the same payload bytes, OR
 *
 *   - rebuild the IFD with extra entries appended at the end of the
 *     file when a tag is missing (the rational payloads — 8 bytes each
 *     — sit past the existing pixel data, so we never overlap).
 *
 * On any failure (corrupt header, no IFDs, etc.) we return the input
 * bytes unchanged with a `console.warn`. Degraded export (TIFF without
 * resolution tags) is preferable to corrupting the file on disk.
 */
export function injectResolutionTags(
  tiffBytes: Uint8Array,
  dpi: number,
): Uint8Array {
  if (!Number.isFinite(dpi) || dpi <= 0) {
    console.warn(
      `injectResolutionTags: ignoring non-positive dpi=${String(dpi)}; returning input unchanged`,
    );
    return tiffBytes;
  }
  try {
    return rewrite(tiffBytes, dpi);
  } catch (err) {
    console.warn(
      `injectResolutionTags: failed (${err instanceof Error ? err.message : String(err)}); returning input unchanged`,
    );
    return tiffBytes;
  }
}

interface IO {
  readU16(off: number): number;
  readU32(off: number): number;
  writeU16(arr: Uint8Array, off: number, v: number): void;
  writeU32(arr: Uint8Array, off: number, v: number): void;
}

function makeIO(bytes: Uint8Array, littleEndian: boolean): IO {
  if (littleEndian) {
    return {
      readU16: (o) => bytes[o]! | (bytes[o + 1]! << 8),
      readU32: (o) =>
        (bytes[o]! |
          (bytes[o + 1]! << 8) |
          (bytes[o + 2]! << 16) |
          (bytes[o + 3]! << 24)) >>>
        0,
      writeU16: (a, o, v) => {
        a[o] = v & 0xff;
        a[o + 1] = (v >>> 8) & 0xff;
      },
      writeU32: (a, o, v) => {
        a[o] = v & 0xff;
        a[o + 1] = (v >>> 8) & 0xff;
        a[o + 2] = (v >>> 16) & 0xff;
        a[o + 3] = (v >>> 24) & 0xff;
      },
    };
  }
  return {
    readU16: (o) => (bytes[o]! << 8) | bytes[o + 1]!,
    readU32: (o) =>
      ((bytes[o]! << 24) |
        (bytes[o + 1]! << 16) |
        (bytes[o + 2]! << 8) |
        bytes[o + 3]!) >>>
      0,
    writeU16: (a, o, v) => {
      a[o] = (v >>> 8) & 0xff;
      a[o + 1] = v & 0xff;
    },
    writeU32: (a, o, v) => {
      a[o] = (v >>> 24) & 0xff;
      a[o + 1] = (v >>> 16) & 0xff;
      a[o + 2] = (v >>> 8) & 0xff;
      a[o + 3] = v & 0xff;
    },
  };
}

const TAG_X_RES = 282;
const TAG_Y_RES = 283;
const TAG_RES_UNIT = 296;
const TYPE_RATIONAL = 5;
const TYPE_SHORT = 3;
const RATIONAL_DENOM = 10000;

function rewrite(input: Uint8Array, dpi: number): Uint8Array {
  if (input.length < 8) throw new Error("buffer too small for TIFF header");

  const b0 = input[0]!;
  const b1 = input[1]!;
  let littleEndian: boolean;
  if (b0 === 0x49 && b1 === 0x49) littleEndian = true;
  else if (b0 === 0x4d && b1 === 0x4d) littleEndian = false;
  else throw new Error("invalid TIFF byte order marker");

  const io = makeIO(input, littleEndian);
  const magic = io.readU16(2);
  if (magic !== 42) throw new Error(`unexpected TIFF magic ${String(magic)}`);

  const ifd0Offset = io.readU32(4);
  if (ifd0Offset === 0 || ifd0Offset >= input.length) {
    throw new Error("IFD0 offset out of range");
  }

  const entryCount = io.readU16(ifd0Offset);
  const entriesStart = ifd0Offset + 2;
  const entriesEnd = entriesStart + entryCount * 12;
  if (entriesEnd + 4 > input.length) {
    throw new Error("IFD0 truncated");
  }

  // Scan existing entries — record index of any pre-existing tag we
  // want to overwrite. Also collect them in tag order so we can
  // re-insert in tag-numeric order when rebuilding.
  let xResIdx = -1;
  let yResIdx = -1;
  let resUnitIdx = -1;
  for (let i = 0; i < entryCount; i++) {
    const tag = io.readU16(entriesStart + i * 12);
    if (tag === TAG_X_RES) xResIdx = i;
    else if (tag === TAG_Y_RES) yResIdx = i;
    else if (tag === TAG_RES_UNIT) resUnitIdx = i;
  }

  const haveAll = xResIdx >= 0 && yResIdx >= 0 && resUnitIdx >= 0;

  if (haveAll) {
    return rewriteInPlace(input, io, entriesStart, xResIdx, yResIdx, resUnitIdx, dpi);
  }
  return rebuildIFD(input, io, ifd0Offset, entryCount, entriesStart, dpi, {
    xResIdx,
    yResIdx,
    resUnitIdx,
  });
}

interface ExistingTagIndices {
  xResIdx: number;
  yResIdx: number;
  resUnitIdx: number;
}

/**
 * Best path: all three tags exist. We just overwrite the t296 inline
 * value (SHORT fits in 4 bytes) and overwrite the rational payloads at
 * the offsets the existing entries point to.
 *
 * (UTIF emits placeholders `t282:[1], t283:[1], t296:[1]` by default,
 * so the rational payload slots already live somewhere in the file.)
 */
function rewriteInPlace(
  input: Uint8Array,
  io: IO,
  entriesStart: number,
  xResIdx: number,
  yResIdx: number,
  resUnitIdx: number,
  dpi: number,
): Uint8Array {
  const out = new Uint8Array(input);
  patchRational(out, io, entriesStart + xResIdx * 12, dpi);
  patchRational(out, io, entriesStart + yResIdx * 12, dpi);
  patchShort(out, io, entriesStart + resUnitIdx * 12, 2);
  return out;
}

/** Overwrites the 8-byte rational payload pointed to by an entry. */
function patchRational(out: Uint8Array, io: IO, entryOff: number, dpi: number): void {
  const type = io.readU16(entryOff + 2);
  if (type !== TYPE_RATIONAL) {
    // Wrong type — skip rather than corrupt.
    return;
  }
  const count = io.readU32(entryOff + 4);
  if (count !== 1) return;
  const valueFieldOff = entryOff + 8;
  // RATIONAL is 8 bytes per element → always external.
  const payloadOff = io.readU32(valueFieldOff);
  if (payloadOff + 8 > out.length) return;
  io.writeU32(out, payloadOff, Math.round(dpi * RATIONAL_DENOM));
  io.writeU32(out, payloadOff + 4, RATIONAL_DENOM);
}

/** SHORT count=1 fits inline in the value-field slot. */
function patchShort(out: Uint8Array, io: IO, entryOff: number, v: number): void {
  const type = io.readU16(entryOff + 2);
  if (type !== TYPE_SHORT) return;
  const count = io.readU32(entryOff + 4);
  if (count !== 1) return;
  // Inline SHORT: written in first 2 bytes of value field; remaining 2
  // bytes are padding (zeroed for cleanliness).
  io.writeU16(out, entryOff + 8, v);
  out[entryOff + 10] = 0;
  out[entryOff + 11] = 0;
}

/**
 * Some tags missing — append a fresh IFD0 at end of file with the
 * existing entries plus the missing ones, then update the header's
 * IFD0 pointer to the new location. Pixel data offsets stay valid
 * because we never relocate any entry payload, only entry slots.
 *
 * The rational payloads for newly-added t282 / t283 are appended right
 * after the new IFD block.
 */
function rebuildIFD(
  input: Uint8Array,
  io: IO,
  oldIfdOffset: number,
  oldEntryCount: number,
  oldEntriesStart: number,
  dpi: number,
  existing: ExistingTagIndices,
): Uint8Array {
  // New entry list = existing entries (untouched) + missing-tag stubs.
  // Inserted entries must keep IFD entries in ascending tag order — the
  // TIFF spec mandates this. We do a merge.
  const existingEntries: Array<{ tag: number; bytes: Uint8Array }> = [];
  for (let i = 0; i < oldEntryCount; i++) {
    const off = oldEntriesStart + i * 12;
    const tag = io.readU16(off);
    existingEntries.push({ tag, bytes: input.slice(off, off + 12) });
  }

  // Compute sizes. We grow the file by:
  //   - 12 bytes per missing tag (entry slot).
  //   - 8 bytes per missing RATIONAL tag (external payload).
  //   - The new IFD goes at end-of-file. Old IFD is left in place but
  //     orphaned (small leak, harmless — no tools follow the old
  //     header pointer once we rewrite it).
  const insertions: Array<{
    tag: number;
    type: number;
    count: number;
    /** If RATIONAL, denom-units value to encode externally. If SHORT, inline. */
    value: number;
  }> = [];
  if (existing.xResIdx < 0) {
    insertions.push({ tag: TAG_X_RES, type: TYPE_RATIONAL, count: 1, value: dpi });
  }
  if (existing.yResIdx < 0) {
    insertions.push({ tag: TAG_Y_RES, type: TYPE_RATIONAL, count: 1, value: dpi });
  }
  if (existing.resUnitIdx < 0) {
    insertions.push({ tag: TAG_RES_UNIT, type: TYPE_SHORT, count: 1, value: 2 });
  }

  // For tags that already exist, also patch them via in-place rules so
  // the value reflects our requested DPI (caller may have re-injected
  // with a new dpi).
  // We do this on the output bytes after they're built.

  const newEntryCount = existingEntries.length + insertions.length;
  const ifdSize = 2 + newEntryCount * 12 + 4; // count + entries + nextIfdOffset

  const rationalInsertCount = insertions.filter(
    (e) => e.type === TYPE_RATIONAL,
  ).length;
  const externalPayloadSize = rationalInsertCount * 8;

  const newIfdStart = input.length;
  const externalPayloadStart = newIfdStart + ifdSize;
  const newTotalSize = externalPayloadStart + externalPayloadSize;

  const out = new Uint8Array(newTotalSize);
  out.set(input, 0);

  // Build merged entries (sorted by tag).
  const merged: Array<{ tag: number; entryWriter: (entryOff: number) => void }> = [];
  for (const e of existingEntries) {
    merged.push({
      tag: e.tag,
      entryWriter: (entryOff) => {
        out.set(e.bytes, entryOff);
      },
    });
  }
  let nextRationalOff = externalPayloadStart;
  for (const ins of insertions) {
    if (ins.type === TYPE_RATIONAL) {
      const payloadOff = nextRationalOff;
      nextRationalOff += 8;
      // Write payload now.
      io.writeU32(out, payloadOff, Math.round(ins.value * RATIONAL_DENOM));
      io.writeU32(out, payloadOff + 4, RATIONAL_DENOM);
      merged.push({
        tag: ins.tag,
        entryWriter: (entryOff) => {
          io.writeU16(out, entryOff, ins.tag);
          io.writeU16(out, entryOff + 2, TYPE_RATIONAL);
          io.writeU32(out, entryOff + 4, 1);
          io.writeU32(out, entryOff + 8, payloadOff);
        },
      });
    } else {
      // SHORT, count=1, inline in value field.
      merged.push({
        tag: ins.tag,
        entryWriter: (entryOff) => {
          io.writeU16(out, entryOff, ins.tag);
          io.writeU16(out, entryOff + 2, TYPE_SHORT);
          io.writeU32(out, entryOff + 4, 1);
          io.writeU16(out, entryOff + 8, ins.value);
          out[entryOff + 10] = 0;
          out[entryOff + 11] = 0;
        },
      });
    }
  }
  merged.sort((a, b) => a.tag - b.tag);

  // Write new IFD: count, entries, nextIfdOffset(=0).
  io.writeU16(out, newIfdStart, newEntryCount);
  for (let i = 0; i < merged.length; i++) {
    merged[i]!.entryWriter(newIfdStart + 2 + i * 12);
  }
  io.writeU32(out, newIfdStart + 2 + newEntryCount * 12, 0);

  // Patch existing-tag values in the *new* IFD so the requested DPI
  // takes effect even when the old IFD already had the tags.
  const newEntriesStart = newIfdStart + 2;
  for (let i = 0; i < merged.length; i++) {
    const tag = merged[i]!.tag;
    const entryOff = newEntriesStart + i * 12;
    if (tag === TAG_X_RES || tag === TAG_Y_RES) {
      patchRational(out, io, entryOff, dpi);
    } else if (tag === TAG_RES_UNIT) {
      patchShort(out, io, entryOff, 2);
    }
  }

  // Update header to point to new IFD.
  io.writeU32(out, 4, newIfdStart);
  // Mark old IFD as no-next so anything still walking it stops cleanly.
  // (We don't actually rewrite the old IFD header, just leave the next
  // pointer alone — its presence in the file is harmless because
  // nothing reaches it from the header anymore.)
  return out;
}
