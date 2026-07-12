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
  confirmDiscard: "mosaic:confirm-discard",
  setDirty: "mosaic:set-dirty",
  requestClose: "mosaic:request-close",
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
  // View-menu canvas zoom. These replace the Electron resetZoom/zoomIn/
  // zoomOut roles: the roles zoomed the WEBPAGE on the same accelerators
  // the canvas zoom wants (⌘+/⌘−/⌘0), so the two raced. Canvas zoom is
  // menu-driven and single-bound.
  zoomIn: "menu:zoom-in",
  zoomOut: "menu:zoom-out",
  zoomFit: "menu:zoom-fit",
  zoomActual: "menu:zoom-actual",
} as const;

export type MenuEvent = (typeof MENU_EVENTS)[keyof typeof MENU_EVENTS];

/**
 * Main→renderer push events not tied to a menu item. `beforeClose` fires when
 * the user tries to close the window with unsaved changes and chose "Save" in
 * the native dialog: the renderer saves, then calls `requestClose()` to let
 * the (now-clean) window close.
 */
export const APP_EVENTS = {
  beforeClose: "app:before-close",
} as const;

export type AppEvent = (typeof APP_EVENTS)[keyof typeof APP_EVENTS];

/** User's choice in the unsaved-changes confirmation dialog. */
export type DiscardChoice = "save" | "discard" | "cancel";

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
  /** Native "you have unsaved changes" prompt for New/Open when dirty. */
  confirmDiscard(): Promise<DiscardChoice>;
  /** Push the renderer's dirty state to main so it can guard window close. */
  setDirty(dirty: boolean): void;
  /** Ask main to close the window (used after a save triggered by close). */
  requestClose(): void;
  /** Subscribe to main→renderer app events (e.g. save-then-close). */
  onAppEvent(handler: (event: AppEvent) => void): () => void;
}
