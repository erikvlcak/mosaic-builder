import type { Figure } from "../model/types";
import type { ImagePoolItem } from "../model/pool";
import type { ExportResult } from "../../preload/api";
import { renderFigureToPngBlob } from "../render/export-renderer";

/** Back-compat alias kept so older imports keep working. */
export type ExportPngResult = ExportResult;

const DEFAULT_NAME = "mosaic-figure.png";

export async function exportFigureAsPng(
  figure: Figure,
  images: Map<string, ImageBitmap>,
  pool?: Map<string, ImagePoolItem>,
  exportScale = 1,
): Promise<ExportResult> {
  let blob: Blob;
  try {
    blob = await renderFigureToPngBlob(figure, images, pool, exportScale);
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
