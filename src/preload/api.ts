/**
 * Single source of truth for the preload→main IPC contract.
 * Imported as a type by the renderer (no runtime code crosses the boundary).
 */

export const API_CHANNELS = {
  ping: "mosaic:ping",
  exportPng: "mosaic:export-png",
  openImages: "mosaic:open-images",
} as const;

export type ApiChannel = (typeof API_CHANNELS)[keyof typeof API_CHANNELS];

export type ExportPngResult =
  | { ok: true; filePath: string; bytesWritten: number }
  | {
      ok: false;
      reason: "canceled" | "render-failed" | "ipc-failed" | "write-failed";
      message?: string;
    };

export type OpenImagesMime = "image/png" | "image/jpeg" | "image/tiff";

export interface OpenedFileDto {
  filePath: string;
  bytes: Uint8Array;
  mime: OpenImagesMime;
}

export type OpenImagesResult =
  | { canceled: true }
  | { canceled: false; files: OpenedFileDto[] };

export interface MosaicApi {
  ping(): Promise<number>;
  exportPng(bytes: Uint8Array, defaultName: string): Promise<ExportPngResult>;
  openImages(): Promise<OpenImagesResult>;
}
