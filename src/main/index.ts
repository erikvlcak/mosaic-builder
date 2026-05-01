import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { resolveWindowConfig } from "./window";
import { API_CHANNELS } from "../preload/api";

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
