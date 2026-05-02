import type { Figure } from "../model/types";
import { renderFigureToPngBlob } from "../render/export-renderer";

export type ExportPngResult =
  | { ok: true; filePath: string; bytesWritten: number }
  | {
      ok: false;
      reason: "canceled" | "render-failed" | "ipc-failed" | "write-failed";
      message?: string;
    };

const DEFAULT_NAME = "mosaic-figure.png";

export async function exportFigureAsPng(
  figure: Figure,
  images: Map<string, ImageBitmap>,
): Promise<ExportPngResult> {
  let blob: Blob;
  try {
    blob = await renderFigureToPngBlob(figure, images);
  } catch (err) {
    return { ok: false, reason: "render-failed", message: String(err) };
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  try {
    const result = await window.api.exportPng(bytes, DEFAULT_NAME);
    return result;
  } catch (err) {
    return { ok: false, reason: "ipc-failed", message: String(err) };
  }
}
