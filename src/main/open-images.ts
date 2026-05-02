import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  BrowserWindow,
  OpenDialogOptions,
  OpenDialogReturnValue,
} from "electron";
import { mimeFromExt, type ImageMime } from "./mime";

/**
 * Decoupled from `electron.dialog` so tests can stub it. Production wires
 * this to `dialog.showOpenDialog` in `src/main/index.ts`.
 */
export type ShowOpenDialog = (
  parent: BrowserWindow | null,
  options: OpenDialogOptions,
) => Promise<OpenDialogReturnValue>;

export interface OpenedFile {
  filePath: string;
  bytes: Uint8Array;
  mime: ImageMime;
}

export type OpenImagesResult =
  | { canceled: true }
  | { canceled: false; files: OpenedFile[] };

export interface PickAndReadInput {
  parentWindow: BrowserWindow | null;
  showOpenDialog: ShowOpenDialog;
}

const FILTERS = [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }];

export async function pickAndReadImages(
  input: PickAndReadInput,
): Promise<OpenImagesResult> {
  const r = await input.showOpenDialog(input.parentWindow, {
    title: "Add images to figure",
    filters: FILTERS,
    properties: ["openFile", "multiSelections"],
  });
  if (r.canceled || r.filePaths.length === 0) return { canceled: true };

  const files: OpenedFile[] = [];
  for (const filePath of r.filePaths) {
    const mime = mimeFromExt(filePath);
    if (mime === null) continue;
    const buf = await readFile(filePath);
    files.push({
      filePath: path.resolve(filePath),
      bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
      mime,
    });
  }
  return { canceled: false, files };
}
