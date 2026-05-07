import { PDFDocument } from "pdf-lib";
import type { Figure } from "../model/types";
import type { ImagePoolItem } from "../model/pool";
import type { ExportResult } from "../../preload/api";
import { renderFigureToPngBlob } from "../render/export-renderer";

const DEFAULT_NAME = "mosaic-figure.pdf";
// TODO(M8): plumb dpi through the export call rather than hardcoding 300
const PDF_DPI = 300;
const PT_PER_INCH = 72;

/**
 * Renders the figure to a PNG, embeds it 1:1 into a single-page PDF.
 * Page size is computed from the figure's pixel dimensions assuming
 * `PDF_DPI`, so the figure prints at that density on standard PDF
 * tools.
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
    // Page size stays in editor figure-pt: the embedded PNG is bigger
    // (figureW·s × figureH·s pixels) but printed at 300 DPI on a page
    // sized for the editor figure — i.e. the higher-res pixels become
    // higher effective DPI on the same physical page.
    const wPt = (figure.canvas.widthPx / PDF_DPI) * PT_PER_INCH;
    const hPt = (figure.canvas.heightPx / PDF_DPI) * PT_PER_INCH;
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
