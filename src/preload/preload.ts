import { contextBridge, ipcRenderer } from "electron";
import {
  API_CHANNELS,
  type ExportResult,
  type LoadProjectResult,
  type MenuEvent,
  type MosaicApi,
  type OpenImagesResult,
  type SaveProjectInput,
  type SaveProjectResult,
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
  saveProject: (input: SaveProjectInput) =>
    ipcRenderer.invoke(
      API_CHANNELS.projectSave,
      input,
    ) as Promise<SaveProjectResult>,
  loadProject: () =>
    ipcRenderer.invoke(API_CHANNELS.projectLoad) as Promise<LoadProjectResult>,
  onMenuEvent(handler) {
    const listener = (_e: Electron.IpcRendererEvent, ev: MenuEvent): void =>
      handler(ev);
    ipcRenderer.on("menu:event", listener);
    return () => {
      ipcRenderer.off("menu:event", listener);
    };
  },
};

contextBridge.exposeInMainWorld("api", api);
