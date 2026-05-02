/**
 * Single source of truth for the preload→main IPC contract.
 * Imported as a type by the renderer (no runtime code crosses the boundary).
 */

export const API_CHANNELS = {
  ping: "mosaic:ping",
  exportPng: "mosaic:export-png",
  exportJpeg: "mosaic:export-jpeg",
  exportTiff: "mosaic:export-tiff",
  exportPdf: "mosaic:export-pdf",
  openImages: "mosaic:open-images",
} as const;

export type ApiChannel = (typeof API_CHANNELS)[keyof typeof API_CHANNELS];

export type ExportResult =
  | { ok: true; filePath: string; bytesWritten: number }
  | {
      ok: false;
      reason: "canceled" | "render-failed" | "ipc-failed" | "write-failed";
      message?: string;
    };

/** Back-compat alias so `export/png.ts` and existing tests still type-check. */
export type ExportPngResult = ExportResult;

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
  exportPng(bytes: Uint8Array, defaultName: string): Promise<ExportResult>;
  exportJpeg(bytes: Uint8Array, defaultName: string): Promise<ExportResult>;
  exportTiff(bytes: Uint8Array, defaultName: string): Promise<ExportResult>;
  exportPdf(bytes: Uint8Array, defaultName: string): Promise<ExportResult>;
  openImages(): Promise<OpenImagesResult>;
}
