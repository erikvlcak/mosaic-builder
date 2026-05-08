import { PDFDocument } from "pdf-lib";
import type { Figure } from "../model/types";
import type { ImagePoolItem } from "../model/pool";
import type { ExportResult } from "../../preload/api";
import { renderFigureToPngBlob } from "../render/export-renderer";

const DEFAULT_NAME = "mosaic-figure.pdf";
// Sized so a typical editor canvas (~1200 px wide) prints around 7.5" —
// the standard journal figure column. The actually-rendered PNG is
// `canvas × exportScale` pixels; the page is sized to match, so the
// embedded PNG draws 1:1 at PDF_DPI without viewer-side downsampling.
export const PDF_DPI = 160;
export const PT_PER_INCH = 72;

/**
 * Page dimensions in PDF points for the given figure and exportScale.
 * Multiplying by `exportScale` keeps the embedded high-resolution PNG
 * drawing 1:1 in pixels rather than being downsampled by PDF viewers.
 */
export function pdfPageSize(
  figure: Figure,
  exportScale: number,
): { wPt: number; hPt: number } {
  const renderedWPx = figure.canvas.widthPx * exportScale;
  const renderedHPx = figure.canvas.heightPx * exportScale;
  return {
    wPt: (renderedWPx / PDF_DPI) * PT_PER_INCH,
    hPt: (renderedHPx / PDF_DPI) * PT_PER_INCH,
  };
}

/**
 * Renders the figure to a PNG, embeds it 1:1 into a single-page PDF.
 * Page size accounts for `exportScale` so upscaled bitmaps from
 * high-resolution source images get a physically-larger page (denser
 * effective DPI on a same-shape figure), and the embedded PNG draws
 * 1:1 in pixels at `PDF_DPI` rather than being downsampled by viewers.
 */
export async function exportFigureAsPdf(
  figure: Figure,
  images: Map<string, ImageBitmap>,
  pool?: Map<string, ImagePoolItem>,
  exportScale = 1,
): Promise<ExportResult> {
  let bytes: Uint8Array;
  try {
    const blob = await renderFigureToPngBlob(figure, images, pool, exportScale);
    const pngBytes = new Uint8Array(await blob.arrayBuffer());
    const pdf = await PDFDocument.create();
    const img = await pdf.embedPng(pngBytes);
    const { wPt, hPt } = pdfPageSize(figure, exportScale);
    const page = pdf.addPage([wPt, hPt]);
    page.drawImage(img, { x: 0, y: 0, width: wPt, height: hPt });
    bytes = await pdf.save();
  } catch (err) {
    return { ok: false, reason: "render-failed", message: String(err) };
  }
  try {
    return await window.api.exportPdf(bytes, DEFAULT_NAME);
  } catch (err) {
    return { ok: false, reason: "ipc-failed", message: String(err) };
  }
}
