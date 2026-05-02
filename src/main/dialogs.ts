import { dialog, type BrowserWindow } from "electron";

export interface PickPngPathInput {
  parentWindow: BrowserWindow | null;
  defaultName: string;
}

export interface PickPngPathResult {
  canceled: boolean;
  filePath: string | undefined;
}

export async function pickPngSavePath(
  input: PickPngPathInput,
): Promise<PickPngPathResult> {
  const opts = {
    title: "Export figure as PNG",
    defaultPath: input.defaultName,
    filters: [{ name: "PNG image", extensions: ["png"] }],
  };
  const r =
    input.parentWindow !== null
      ? await dialog.showSaveDialog(input.parentWindow, opts)
      : await dialog.showSaveDialog(opts);
  return { canceled: r.canceled, filePath: r.filePath };
}
