import { contextBridge, ipcRenderer } from "electron";
import { API_CHANNELS, type MosaicApi } from "./api";

const api: MosaicApi = {
  ping: () => ipcRenderer.invoke(API_CHANNELS.ping) as Promise<number>,
};

contextBridge.exposeInMainWorld("api", api);
