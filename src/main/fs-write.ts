import { writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Writes raw bytes to a path whose extension must be one of `allowedExt`.
 * Refuses any other extension to avoid silently producing files of the
 * wrong format. Extensions in `allowedExt` must include the leading dot
 * and be lowercase (e.g. `[".png"]`, `[".jpg", ".jpeg"]`).
 */
export async function writeBytesToPath(
  filePath: string,
  bytes: Uint8Array,
  allowedExt: readonly string[],
): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  if (!allowedExt.includes(ext)) {
    throw new Error(
      `writeBytesToPath: refusing path "${filePath}" — extension must be one of ${allowedExt.join(", ")}`,
    );
  }
  await writeFile(filePath, bytes);
}

/**
 * Writes raw bytes to a .png path. Refuses any other extension to
 * avoid silently producing files of the wrong format.
 */
export async function writePngFile(
  filePath: string,
  bytes: Uint8Array,
): Promise<void> {
  return writeBytesToPath(filePath, bytes, [".png"]);
}
