/**
 * Pure serializer/deserializer between runtime FigureState (+ canvas)
 * and the on-disk MosaicFileV1 shape. No fs, no hashing, no IPC — those
 * happen one layer up in the main-process project-io.
 *
 * Path strategy:
 *   - On save: compute `relPath` = posix-style path relative to the .mosaic
 *     file's containing directory, when both paths share a common root.
 *     If they don't (different windows volumes, etc.), omit relPath and
 *     leave `filePath` as the only hint.
 *   - On load: the runtime `pool[]` strips relPath/sha256 — they're not
 *     part of FigureState. They're returned alongside as `relinkHints`
 *     so the loader can resolve files.
 */

import type { FigureState, LetterOverride } from "./figure-state";
import type { ImagePoolItem } from "./pool";
import type { Annotation } from "./annotations";
import type { MosaicFile, MosaicFileV5 } from "./schema";
import { migrateAnnotationsV1ToV2 } from "./migrate-v1-to-v2";
import { uniformLayoutFor } from "./grid-layout";

export interface RelinkHint {
  imageId: string;
  filePath: string;
  relPath?: string;
  sha256?: string;
}

export interface ToMosaicInput {
  state: FigureState;
  canvas: { widthPx: number; heightPx: number; background: string };
  /** Absolute path to the .mosaic file we're writing to. */
  mosaicPath: string;
  appVersion: string;
  /** Defaults to `() => new Date().toISOString()`. Test seam. */
  now?: () => string;
  /** Optional sha256-by-imageId map. Hashing happens in the main process. */
  shaByImageId?: Record<string, string>;
}

export function toMosaicFile(inp: ToMosaicInput): MosaicFileV5 {
  const now = inp.now ?? (() => new Date().toISOString());
  const baseDir = pathDirname(inp.mosaicPath);
  const stamp = now();

  const pool = inp.state.pool.map((item) => {
    const out: MosaicFileV5["state"]["pool"][number] = { ...item };
    const rel = posixRelative(baseDir, item.filePath);
    if (rel !== null) out.relPath = rel;
    const sha = inp.shaByImageId?.[item.id];
    if (sha !== undefined) out.sha256 = sha;
    return out;
  });

  return {
    schemaVersion: 5,
    app: "mosaic-builder",
    appVersion: inp.appVersion,
    createdAt: stamp,
    modifiedAt: stamp,
    canvas: inp.canvas,
    state: { ...inp.state, pool } as MosaicFileV5["state"],
  };
}

export interface FromMosaicResult {
  state: FigureState;
  canvas: { widthPx: number; heightPx: number; background: string };
  relinkHints: RelinkHint[];
}

export function fromMosaicFile(file: MosaicFile): FromMosaicResult {
  const relinkHints: RelinkHint[] = [];
  const runtimePool = file.state.pool.map((item) => {
    const { relPath, sha256, ...rest } = item as unknown as ImagePoolItem & {
      relPath?: string;
      sha256?: string;
    };
    const hint: RelinkHint = { imageId: rest.id, filePath: rest.filePath };
    if (relPath !== undefined) hint.relPath = relPath;
    if (sha256 !== undefined) hint.sha256 = sha256;
    relinkHints.push(hint);
    return rest;
  });
  const canvas = {
    widthPx: file.canvas.widthPx,
    heightPx: file.canvas.heightPx,
    background: file.canvas.background,
  };
  // v1 files carry legacy `arrow` annotations; migrate to v2 `symbol` shape
  // before constructing runtime state. v2/v3 symbols become v5 symbols
  // verbatim; the migrator seeds fillMode/strokeStyle defaults on arrow→symbol.
  const annotations: Annotation[] =
    file.schemaVersion === 1
      ? migrateAnnotationsV1ToV2(file.state.annotations)
      : file.state.annotations;
  // v1/v2 stored letterOverrides as Record<panelId, string>. Migrate to the
  // v3 shape so all downstream code sees one type. The cast through unknown
  // is required because the validator accepts either shape on disk; the
  // discriminator here is `schemaVersion`, not the static type.
  const letterOverrides: Record<string, LetterOverride> =
    file.schemaVersion === 3 || file.schemaVersion === 5
      ? file.state.letterOverrides
      : migrateLetterOverridesV2ToV3(
          file.state.letterOverrides as unknown as Record<string, string>,
        );
  const letterPattern: FigureState["letterPattern"] =
    file.schemaVersion === 3 || file.schemaVersion === 5
      ? file.state.letterPattern
      : "uppercase";
  // Spec 11: v4+ carries `state.layout`; older versions seed a uniform layout
  // for the current rows/cols (matches pre-spec-11 behavior). v4 is rejected
  // at the validator, so only v5 is reachable here on the layout-present path.
  const layout =
    file.schemaVersion === 5
      ? file.state.layout
      : uniformLayoutFor(file.state.rows, file.state.cols);
  // v1/v2 globalStyle.letters lacks `italic`; default to false at load. We
  // spread first then overlay the missing-field default — for v3 files the
  // spread already carries italic so the overlay is a no-op.
  const baseLetters = file.state.globalStyle
    .letters as FigureState["globalStyle"]["letters"] & {
    italic?: boolean;
  };
  const globalStyle: FigureState["globalStyle"] = {
    letters: { ...baseLetters, italic: baseLetters.italic ?? false },
    scalebar: { ...file.state.globalStyle.scalebar },
  };
  const state: FigureState = {
    ...file.state,
    pool: runtimePool,
    annotations,
    letterOverrides,
    letterPattern,
    globalStyle,
    // Pre-spec-10 files lack `outerGutter`; default to true (the prior behavior).
    outerGutter: file.state.outerGutter ?? true,
    layout,
  };
  return { state, canvas, relinkHints };
}

/**
 * Lift the legacy `Record<panelId, string>` letter-overrides shape into the
 * v3 `Record<panelId, LetterOverride>` shape. The old string was always a
 * text override, so it lands in `LetterOverride.text`. Returns a fresh
 * object — never mutates the input.
 */
function migrateLetterOverridesV2ToV3(
  legacy: Record<string, string>,
): Record<string, LetterOverride> {
  const out: Record<string, LetterOverride> = {};
  for (const k in legacy) {
    out[k] = { text: legacy[k]! };
  }
  return out;
}

/**
 * A parsed absolute path split into its volume `root` and its `parts`.
 *
 * `root` is the volume identity used to decide whether two paths live on the
 * same volume: `"/"` for POSIX, a lower-cased drive prefix like `"c:"` for
 * Windows drive paths, or `"//server/share"` for UNC. Comparing roots for
 * equality answers "same volume?" — a different drive or share yields no
 * relative path.
 */
interface ParsedPath {
  root: string;
  parts: string[];
}

/**
 * Parse a POSIX or Windows absolute path, or return null if it isn't absolute.
 * Separators (`/` and `\`) are treated interchangeably so the same code path
 * serves both platforms; drive letters compare case-insensitively (Windows
 * treats `C:` and `c:` as one volume). Recognized absolute forms:
 *   - POSIX:        /a/b/c
 *   - Windows drive: C:\a\b  or  C:/a/b
 *   - UNC:          \\server\share\a  or  //server/share/a
 */
function parseAbsolute(p: string): ParsedPath | null {
  // UNC: \\server\share\... — the server+share pair is the volume root.
  const unc = /^[\\/]{2}([^\\/]+)[\\/]+([^\\/]+)(.*)$/.exec(p);
  if (unc !== null) {
    const [, server, share, rest] = unc;
    return {
      root: `//${server!.toLowerCase()}/${share!.toLowerCase()}`,
      parts: splitSegments(rest!),
    };
  }
  // Windows drive: C:\... or C:/...
  const drive = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (drive !== null) {
    const [, letter, rest] = drive;
    return { root: `${letter!.toLowerCase()}:`, parts: splitSegments(rest!) };
  }
  // POSIX absolute.
  if (p.startsWith("/")) {
    return { root: "/", parts: splitSegments(p) };
  }
  return null;
}

function splitSegments(p: string): string[] {
  return p.split(/[\\/]+/).filter((s) => s.length > 0);
}

/**
 * Directory portion of an absolute path, preserving the original volume root.
 * Falls back to `"."` for non-absolute inputs (unreachable for save paths,
 * which always come from a native dialog).
 */
function pathDirname(p: string): string {
  const parsed = parseAbsolute(p);
  if (parsed === null) return ".";
  const dirParts = parsed.parts.slice(0, -1);
  return joinFromRoot(parsed.root, dirParts);
}

function joinFromRoot(root: string, parts: string[]): string {
  if (root === "/") return `/${parts.join("/")}`;
  // Drive (`c:`) and UNC (`//server/share`) roots are followed by a separator.
  return `${root}/${parts.join("/")}`;
}

/**
 * Compute a forward-slash relative path from `fromDir` to `toFile`, or null if
 * either path isn't absolute or the two sit on different volumes (different
 * drive letter / UNC share). The result always begins with "./" or "../" so
 * it's unambiguously relative, and always uses "/" so the stored `.mosaic`
 * form is portable (Node's `path.resolve` reads it back on both platforms).
 */
function posixRelative(fromDir: string, toFile: string): string | null {
  const from = parseAbsolute(fromDir);
  const to = parseAbsolute(toFile);
  if (from === null || to === null) return null;
  // Different volume → no meaningful relative path.
  if (from.root !== to.root) return null;
  let i = 0;
  while (
    i < from.parts.length &&
    i < to.parts.length &&
    from.parts[i] === to.parts[i]
  )
    i++;
  const ups = from.parts.slice(i).map(() => "..");
  const downs = to.parts.slice(i);
  const segs = [...ups, ...downs];
  if (segs.length === 0) return null;
  const joined = segs.join("/");
  return joined.startsWith(".") ? joined : `./${joined}`;
}
