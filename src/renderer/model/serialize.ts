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
  const baseDir = posixDirname(inp.mosaicPath);
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
    canvas: inp.canvas,
    state: { ...inp.state, pool } as MosaicFileV1["state"],
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
  const canvas = {
    widthPx: file.canvas.widthPx,
    heightPx: file.canvas.heightPx,
    background: file.canvas.background,
  };
  const state: FigureState = {
    ...file.state,
    pool: runtimePool,
    // Pre-spec-10 files lack `outerGutter`; default to true (the prior behavior).
    outerGutter: file.state.outerGutter ?? true,
  };
  return { state, canvas, relinkHints };
}

function isPosixAbsolute(p: string): boolean {
  return p.startsWith("/");
}

function posixDirname(p: string): string {
  const i = p.lastIndexOf("/");
  if (i < 0) return ".";
  if (i === 0) return "/";
  return p.slice(0, i);
}

/**
 * Compute a posix-form relative path from `fromDir` to `toFile`, or null
 * if either path isn't posix-absolute. The returned path always begins with
 * "./" or "../" so it's unambiguously relative.
 */
function posixRelative(fromDir: string, toFile: string): string | null {
  if (!isPosixAbsolute(fromDir) || !isPosixAbsolute(toFile)) return null;
  const fromParts = fromDir.split("/").filter((s) => s.length > 0);
  const toParts = toFile.split("/").filter((s) => s.length > 0);
  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
  const ups = fromParts.slice(i).map(() => "..");
  const downs = toParts.slice(i);
  const segs = [...ups, ...downs];
  if (segs.length === 0) return null;
  const joined = segs.join("/");
  return joined.startsWith(".") ? joined : `./${joined}`;
}
