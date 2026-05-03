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

import path from "node:path";
import type { FigureState } from "./figure-state";
import type { ImagePoolItem } from "./pool";
import type { MosaicFileV1 } from "./schema";

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

export function toMosaicFile(inp: ToMosaicInput): MosaicFileV1 {
  const now = inp.now ?? (() => new Date().toISOString());
  const baseDir = path.dirname(inp.mosaicPath);
  const stamp = now();

  const pool = inp.state.pool.map((item) => {
    const out: MosaicFileV1["state"]["pool"][number] = { ...item };
    const rel = posixRelative(baseDir, item.filePath);
    if (rel !== null) out.relPath = rel;
    const sha = inp.shaByImageId?.[item.id];
    if (sha !== undefined) out.sha256 = sha;
    return out;
  });

  return {
    schemaVersion: 1,
    app: "mosaic-builder",
    appVersion: inp.appVersion,
    createdAt: stamp,
    modifiedAt: stamp,
    canvas: { ...inp.canvas },
    state: { ...inp.state, pool },
  };
}

export interface FromMosaicResult {
  state: FigureState;
  canvas: { widthPx: number; heightPx: number; background: string };
  relinkHints: RelinkHint[];
}

export function fromMosaicFile(file: MosaicFileV1): FromMosaicResult {
  const relinkHints: RelinkHint[] = [];
  const runtimePool = file.state.pool.map((item) => {
    const { relPath, sha256, ...rest } = item as unknown as ImagePoolItem & { relPath?: string; sha256?: string };
    const hint: RelinkHint = { imageId: rest.id, filePath: rest.filePath };
    if (relPath !== undefined) hint.relPath = relPath;
    if (sha256 !== undefined) hint.sha256 = sha256;
    relinkHints.push(hint);
    return rest;
  });
  return {
    state: { ...file.state, pool: runtimePool },
    canvas: { ...file.canvas },
    relinkHints,
  };
}

/**
 * Compute a posix-form relative path from `fromDir` to `toFile`, or null
 * if they don't share a common root (e.g. different windows drives, or
 * `toFile` isn't an absolute path). The returned path always begins with
 * "./" or "../" so it's unambiguously relative.
 */
function posixRelative(fromDir: string, toFile: string): string | null {
  if (!path.isAbsolute(toFile)) return null;
  // Detect different windows drives (e.g. C: vs D:) — node:path.relative
  // returns an absolute-looking path in that case which we must reject.
  const r = path.relative(fromDir, toFile);
  if (r === "" || path.isAbsolute(r)) return null;
  // Normalize to posix separators for cross-platform .mosaic files.
  const posix = r.split(path.sep).join("/");
  return posix.startsWith(".") ? posix : `./${posix}`;
}
