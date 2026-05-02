import { contextBridge, ipcRenderer } from "electron";
import {
  API_CHANNELS,
  type ExportResult,
  type MosaicApi,
  type OpenImagesResult,
} from "./api";

const api: MosaicApi = {
  ping: () => ipcRenderer.invoke(API_CHANNELS.ping) as Promise<number>,
  exportPng: (bytes, defaultName) =>
    ipcRenderer.invoke(
      API_CHANNELS.exportPng,
      bytes,
      defaultName,
    ) as Promise<ExportResult>,
  exportJpeg: (bytes, defaultName) =>
    ipcRenderer.invoke(
      API_CHANNELS.exportJpeg,
      bytes,
      defaultName,
    ) as Promise<ExportResult>,
  exportTiff: (bytes, defaultName) =>
    ipcRenderer.invoke(
      API_CHANNELS.exportTiff,
      bytes,
      defaultName,
    ) as Promise<ExportResult>,
  exportPdf: (bytes, defaultName) =>
    ipcRenderer.invoke(
      API_CHANNELS.exportPdf,
      bytes,
      defaultName,
    ) as Promise<ExportResult>,
  openImages: () =>
    ipcRenderer.invoke(API_CHANNELS.openImages) as Promise<OpenImagesResult>,
};

contextBridge.exposeInMainWorld("api", api);
