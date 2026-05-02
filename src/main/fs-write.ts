import { writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Writes raw bytes to a .png path. Refuses any other extension to
 * avoid silently producing files of the wrong format.
 */
export async function writePngFile(
  filePath: string,
  bytes: Uint8Array,
): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".png") {
    throw new Error(`writePngFile: refusing non-.png path "${filePath}"`);
  }
  await writeFile(filePath, bytes);
}
