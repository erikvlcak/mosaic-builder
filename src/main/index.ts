import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { resolveWindowConfig } from "./window";
import { installMenu } from "./menu";
import { API_CHANNELS } from "../preload/api";
import {
  pickJpegSavePath,
  pickMosaicOpenPath,
  pickMosaicSavePath,
  pickPdfSavePath,
  pickPngSavePath,
  pickTiffSavePath,
  type PickPathInput,
  type PickPathResult,
} from "./dialogs";
import { writeBytesToPath, writePngFile } from "./fs-write";
import { pickAndReadImages } from "./open-images";
import { saveProjectToPath, loadProjectFromPath } from "./project-io";
import type { SaveProjectInput } from "../preload/api";

// `vite-plugin-electron` sets this on process.env at dev-server start.
const DEV_URL =
  typeof process.env.VITE_DEV_SERVER_URL === "string"
    ? process.env.VITE_DEV_SERVER_URL
    : undefined;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const preloadPath = path.join(__dirname, "../preload/preload.js");

  const cfg = resolveWindowConfig({
    preloadPath,
    devServerUrl: DEV_URL,
  });

  mainWindow = new BrowserWindow({
    width: cfg.width,
    height: cfg.height,
    show: cfg.show,
    backgroundColor: cfg.backgroundColor,
    webPreferences: cfg.webPreferences,
  });

  installMenu(mainWindow);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  if (cfg.loadTarget.kind === "url") {
    void mainWindow.loadURL(cfg.loadTarget.url);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexHtml = path.join(__dirname, "../../dist/renderer/index.html");
    void mainWindow.loadFile(indexHtml);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

type Picker = (input: PickPathInput) => Promise<PickPathResult>;

async function handleExport(
  event: Electron.IpcMainInvokeEvent,
  bytes: Uint8Array,
  defaultName: string,
  picker: Picker,
  allowedExt: readonly string[],
): Promise<
  | { ok: true; filePath: string; bytesWritten: number }
  | { ok: false; reason: "canceled" | "write-failed"; message?: string }
> {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  const picked = await picker({ parentWindow: senderWindow, defaultName });
  if (picked.canceled || picked.filePath === undefined) {
    return { ok: false, reason: "canceled" };
  }
  try {
    if (allowedExt.length === 1 && allowedExt[0] === ".png") {
      await writePngFile(picked.filePath, bytes);
    } else {
      await writeBytesToPath(picked.filePath, bytes, allowedExt);
    }
    return {
      ok: true,
      filePath: picked.filePath,
      bytesWritten: bytes.byteLength,
    };
  } catch (err) {
    return {
      ok: false,
      reason: "write-failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function registerIpc(): void {
  ipcMain.handle(API_CHANNELS.ping, () => Date.now());

  ipcMain.handle(
    API_CHANNELS.exportPng,
    (event, bytes: Uint8Array, defaultName: string) =>
      handleExport(event, bytes, defaultName, pickPngSavePath, [".png"]),
  );

  ipcMain.handle(
    API_CHANNELS.exportJpeg,
    (event, bytes: Uint8Array, defaultName: string) =>
      handleExport(event, bytes, defaultName, pickJpegSavePath, [
        ".jpg",
        ".jpeg",
      ]),
  );

  ipcMain.handle(
    API_CHANNELS.exportTiff,
    (event, bytes: Uint8Array, defaultName: string) =>
      handleExport(event, bytes, defaultName, pickTiffSavePath, [
        ".tif",
        ".tiff",
      ]),
  );

  ipcMain.handle(
    API_CHANNELS.exportPdf,
    (event, bytes: Uint8Array, defaultName: string) =>
      handleExport(event, bytes, defaultName, pickPdfSavePath, [".pdf"]),
  );

  ipcMain.handle(API_CHANNELS.openImages, async (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    return pickAndReadImages({
      parentWindow: senderWindow,
      showOpenDialog: (parent, options) =>
        parent !== null
          ? dialog.showOpenDialog(parent, options)
          : dialog.showOpenDialog(options),
    });
  });

  ipcMain.handle(
    API_CHANNELS.projectSave,
    async (event, input: SaveProjectInput) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      const picked = await pickMosaicSavePath({
        parentWindow: senderWindow,
        defaultName: input.defaultName,
      });
      if (picked.canceled || picked.filePath === undefined) {
        return { ok: false, reason: "canceled" } as const;
      }
      try {
        await saveProjectToPath(picked.filePath, input.file);
        return { ok: true, filePath: picked.filePath } as const;
      } catch (e) {
        return {
          ok: false,
          reason: "write-failed",
          message: e instanceof Error ? e.message : String(e),
        } as const;
      }
    },
  );

  ipcMain.handle(API_CHANNELS.projectLoad, async (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    const picked = await pickMosaicOpenPath({ parentWindow: senderWindow });
    if (picked.canceled || picked.filePath === undefined) {
      return { ok: false, reason: "canceled" } as const;
    }
    const r = await loadProjectFromPath(picked.filePath);
    if (!r.ok) {
      return {
        ok: false,
        reason: "validation-failed",
        message: r.error,
      } as const;
    }
    return {
      ok: true,
      filePath: picked.filePath,
      file: r.file,
      images: r.images,
      missing: r.missing,
    } as const;
  });
}

void app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
