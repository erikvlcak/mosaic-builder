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
  return showSave(
    input.parentWindow,
    "Export figure as PNG",
    input.defaultName,
    [{ name: "PNG image", extensions: ["png"] }],
  );
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
  return showSave(
    input.parentWindow,
    "Export figure as PDF",
    input.defaultName,
    [{ name: "PDF document", extensions: ["pdf"] }],
  );
}

export async function pickMosaicSavePath(
  input: PickPathInput,
): Promise<PickPathResult> {
  return showSave(
    input.parentWindow,
    "Save mosaic project",
    input.defaultName,
    [{ name: "Mosaic project", extensions: ["mosaic"] }],
  );
}

export interface PickOpenInput {
  parentWindow: BrowserWindow | null;
}

export async function pickMosaicOpenPath(
  input: PickOpenInput,
): Promise<PickPathResult> {
  const opts: Electron.OpenDialogOptions = {
    title: "Open mosaic project",
    filters: [{ name: "Mosaic project", extensions: ["mosaic"] }],
    properties: ["openFile"],
  };
  const r =
    input.parentWindow !== null
      ? await dialog.showOpenDialog(input.parentWindow, opts)
      : await dialog.showOpenDialog(opts);
  if (r.canceled || r.filePaths.length === 0) {
    return { canceled: true, filePath: undefined };
  }
  return { canceled: false, filePath: r.filePaths[0]! };
}
