/**
 * Single source of truth for the preload→main IPC contract.
 * Imported as a type by the renderer (no runtime code crosses the boundary).
 */

import type { MosaicFile } from "../renderer/model/schema";

export const API_CHANNELS = {
  ping: "mosaic:ping",
  exportPng: "mosaic:export-png",
  exportJpeg: "mosaic:export-jpeg",
  exportTiff: "mosaic:export-tiff",
  exportPdf: "mosaic:export-pdf",
  openImages: "mosaic:open-images",
  projectSave: "mosaic:project-save",
  projectLoad: "mosaic:project-load",
} as const;

export type ApiChannel = (typeof API_CHANNELS)[keyof typeof API_CHANNELS];

export const MENU_EVENTS = {
  new: "menu:new",
  open: "menu:open",
  save: "menu:save",
  saveAs: "menu:save-as",
  exportPng: "menu:export-png",
  exportJpeg: "menu:export-jpeg",
  exportTiff: "menu:export-tiff",
  exportPdf: "menu:export-pdf",
  undo: "menu:undo",
  redo: "menu:redo",
} as const;

export type MenuEvent = (typeof MENU_EVENTS)[keyof typeof MENU_EVENTS];

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

export interface SaveProjectInput {
  /**
   * Already-built MosaicFile from the renderer (currently always v2; v1 is
   * read-only — produced only by validating legacy on-disk files). Main
   * process writes it to disk after picking a path; main does NOT mutate
   * the file other than possibly re-stamping `modifiedAt` (caller passes a
   * fresh value).
   */
  file: MosaicFile;
  /** Suggested filename for the save dialog (e.g. "untitled.mosaic"). */
  defaultName: string;
}

export type SaveProjectResult =
  | { ok: true; filePath: string }
  | { ok: false; reason: "canceled" | "write-failed"; message?: string };

export interface MissingImageDto {
  imageId: string;
  filename: string;
  attemptedPaths: string[];
}

export interface ResolvedImageDto {
  imageId: string;
  filePath: string;
  mime: OpenImagesMime;
  bytes: Uint8Array;
  shaMismatch: boolean;
}

export type LoadProjectResult =
  | {
      ok: false;
      reason: "canceled" | "validation-failed" | "read-failed";
      message?: string;
    }
  | {
      ok: true;
      filePath: string;
      file: MosaicFile;
      images: ResolvedImageDto[];
      missing: MissingImageDto[];
    };

export interface MosaicApi {
  ping(): Promise<number>;
  exportPng(bytes: Uint8Array, defaultName: string): Promise<ExportResult>;
  exportJpeg(bytes: Uint8Array, defaultName: string): Promise<ExportResult>;
  exportTiff(bytes: Uint8Array, defaultName: string): Promise<ExportResult>;
  exportPdf(bytes: Uint8Array, defaultName: string): Promise<ExportResult>;
  openImages(): Promise<OpenImagesResult>;
  saveProject(input: SaveProjectInput): Promise<SaveProjectResult>;
  loadProject(): Promise<LoadProjectResult>;
  onMenuEvent(handler: (event: MenuEvent) => void): () => void;
}
