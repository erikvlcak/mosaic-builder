import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { resolveWindowConfig } from "./window";
import { API_CHANNELS } from "../preload/api";
import { pickPngSavePath } from "./dialogs";
import { writePngFile } from "./fs-write";
import { pickAndReadImages } from "./open-images";

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

function registerIpc(): void {
  ipcMain.handle(API_CHANNELS.ping, () => Date.now());

  ipcMain.handle(
    API_CHANNELS.exportPng,
    async (event, bytes: Uint8Array, defaultName: string) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      const picked = await pickPngSavePath({
        parentWindow: senderWindow,
        defaultName,
      });
      if (picked.canceled || picked.filePath === undefined) {
        return { ok: false as const, reason: "canceled" as const };
      }
      try {
        await writePngFile(picked.filePath, bytes);
        return {
          ok: true as const,
          filePath: picked.filePath,
          bytesWritten: bytes.byteLength,
        };
      } catch (err) {
        return {
          ok: false as const,
          reason: "write-failed" as const,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
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
