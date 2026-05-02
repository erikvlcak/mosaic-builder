import { contextBridge, ipcRenderer } from "electron";
import { API_CHANNELS, type ExportPngResult, type MosaicApi } from "./api";

const api: MosaicApi = {
  ping: () => ipcRenderer.invoke(API_CHANNELS.ping) as Promise<number>,
  exportPng: (bytes, defaultName) =>
    ipcRenderer.invoke(
      API_CHANNELS.exportPng,
      bytes,
      defaultName,
    ) as Promise<ExportPngResult>,
};

contextBridge.exposeInMainWorld("api", api);
