import type { MosaicApi } from "../preload/api";

declare global {
  interface Window {
    api: MosaicApi;
  }
}

export {};
