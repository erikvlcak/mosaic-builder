import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { resolveWindowConfig } from "./window";
import { API_CHANNELS } from "../preload/api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// `vite-plugin-electron` injects this at build time.
declare const VITE_DEV_SERVER_URL: string | undefined;

const DEV_URL =
  typeof VITE_DEV_SERVER_URL === "string" ? VITE_DEV_SERVER_URL : undefined;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const preloadPath = path.join(__dirname, "../preload/preload.mjs");

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
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
