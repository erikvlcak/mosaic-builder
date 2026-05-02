import { dialog, type BrowserWindow } from "electron";

export interface PickPathInput {
  parentWindow: BrowserWindow | null;
  defaultName: string;
}

export interface PickPathResult {
  canceled: boolean;
  filePath: string | undefined;
}

/** Back-compat alias kept so existing call sites keep building. */
export type PickPngPathInput = PickPathInput;
export type PickPngPathResult = PickPathResult;

interface FilterSpec {
  name: string;
  extensions: string[];
}

async function showSave(
  parentWindow: BrowserWindow | null,
  title: string,
  defaultName: string,
  filters: FilterSpec[],
): Promise<PickPathResult> {
  const opts = { title, defaultPath: defaultName, filters };
  const r =
    parentWindow !== null
      ? await dialog.showSaveDialog(parentWindow, opts)
      : await dialog.showSaveDialog(opts);
  return { canceled: r.canceled, filePath: r.filePath };
}

export async function pickPngSavePath(
  input: PickPathInput,
): Promise<PickPathResult> {
  return showSave(input.parentWindow, "Export figure as PNG", input.defaultName, [
    { name: "PNG image", extensions: ["png"] },
  ]);
}

export async function pickJpegSavePath(
  input: PickPathInput,
): Promise<PickPathResult> {
  return showSave(
    input.parentWindow,
    "Export figure as JPEG",
    input.defaultName,
    [{ name: "JPEG image", extensions: ["jpg", "jpeg"] }],
  );
}

export async function pickTiffSavePath(
  input: PickPathInput,
): Promise<PickPathResult> {
  return showSave(
    input.parentWindow,
    "Export figure as TIFF",
    input.defaultName,
    [{ name: "TIFF image", extensions: ["tif", "tiff"] }],
  );
}

export async function pickPdfSavePath(
  input: PickPathInput,
): Promise<PickPathResult> {
  return showSave(input.parentWindow, "Export figure as PDF", input.defaultName, [
    { name: "PDF document", extensions: ["pdf"] },
  ]);
}
