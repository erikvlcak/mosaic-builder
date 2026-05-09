import { writeFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { validateMosaicFile, type MosaicFile } from "../renderer/model/schema";
import { mimeFromExt, type ImageMime } from "./mime";
import { sha256OfBytes } from "./sha256";

export interface ResolvedImage {
  imageId: string;
  filePath: string;
  mime: ImageMime;
  bytes: Uint8Array;
  /** True if a stored sha256 exists and disagrees with the loaded bytes. */
  shaMismatch: boolean;
}

export interface MissingImage {
  imageId: string;
  filename: string;
  attemptedPaths: string[];
}

export type LoadProjectResult =
  | { ok: false; error: string }
  | {
      ok: true;
      file: MosaicFile;
      images: ResolvedImage[];
      missing: MissingImage[];
    };

const ALLOWED_EXT = [".mosaic"];

export async function saveProjectToPath(
  target: string,
  file: MosaicFile,
): Promise<void> {
  const ext = path.extname(target).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    throw new Error(
      `saveProjectToPath: extension must be .mosaic (got "${ext}")`,
    );
  }
  const json = JSON.stringify(file, null, 2);
  await writeFile(target, json, "utf8");
}

export async function loadProjectFromPath(
  target: string,
): Promise<LoadProjectResult> {
  let raw: string;
  try {
    raw = await readFile(target, "utf8");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      ok: false,
      error: `JSON parse: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const v = validateMosaicFile(parsed);
  if (!v.ok) return { ok: false, error: v.error };
  const file = v.value;

  const baseDir = path.dirname(target);
  const images: ResolvedImage[] = [];
  const missing: MissingImage[] = [];

  type DiskPoolItem = MosaicFile["state"]["pool"][number];

  for (const item of file.state.pool as unknown as DiskPoolItem[]) {
    const tries: string[] = [];
    if (typeof item.relPath === "string") {
      tries.push(path.resolve(baseDir, item.relPath));
    }
    if (typeof item.filePath === "string" && path.isAbsolute(item.filePath)) {
      // Avoid duplicate try if relPath already resolved to the same absolute path.
      const abs = path.resolve(item.filePath);
      if (!tries.includes(abs)) tries.push(abs);
    }

    let resolvedBytes: Uint8Array | null = null;
    let resolvedPath: string | null = null;
    for (const p of tries) {
      try {
        const s = await stat(p);
        if (!s.isFile()) continue;
        const buf = await readFile(p);
        resolvedBytes = new Uint8Array(
          buf.buffer,
          buf.byteOffset,
          buf.byteLength,
        );
        resolvedPath = p;
        break;
      } catch {
        // try next
      }
    }

    if (resolvedBytes === null || resolvedPath === null) {
      missing.push({
        imageId: item.id,
        filename: item.filename,
        attemptedPaths: tries,
      });
      continue;
    }

    const mime = mimeFromExt(resolvedPath) ?? item.mime;
    const shaMismatch =
      typeof item.sha256 === "string" &&
      sha256OfBytes(resolvedBytes) !== item.sha256;

    images.push({
      imageId: item.id,
      filePath: resolvedPath,
      mime,
      bytes: resolvedBytes,
      shaMismatch,
    });
  }

  return { ok: true, file, images, missing };
}
