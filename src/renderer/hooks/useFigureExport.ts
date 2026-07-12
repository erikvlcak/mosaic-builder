import { useCallback, useMemo, useState } from "react";
import type { Figure } from "../model/types";
import type { ImagePoolItem } from "../model/pool";
import type { ExportResult } from "../../preload/api";
import { exportFigureAsPng } from "../export/png";
import { exportFigureAsJpeg } from "../export/jpeg";
import { exportFigureAsTiff } from "../export/tiff";
import { exportFigureAsPdf } from "../export/pdf";
import { computeExportScale } from "../render/export-scale";
import { placedPoolImages } from "../model/canvas-dims";

export const TIFF_DPI = 300;

export type ExportStatus =
  | { kind: "idle" }
  | { kind: "exporting"; format: string };

export type PushToast = (t: {
  kind: "success" | "error" | "info";
  message: string;
}) => void;

interface Params {
  figure: Figure;
  images: Map<string, ImageBitmap>;
  pool?: Map<string, ImagePoolItem>;
  poolList: readonly ImagePoolItem[];
  rows: number;
  cols: number;
  gutterPx: number;
  jpegQuality: number;
  pushToast: PushToast;
}

export interface FigureExport {
  exportScale: number;
  status: ExportStatus;
  runPng: () => Promise<void>;
  runJpeg: () => Promise<void>;
  runTiff: () => Promise<void>;
  runPdf: () => Promise<void>;
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] ?? p;
}

/**
 * Single home for the four export runs, so the toolbar menu AND the native
 * menu-bar Export items call the same code (previously the menu items were
 * stubs telling the user to use the toolbar). Success/cancel/error all route
 * through the toast system: success shows the saved file's basename, cancel
 * is silent, and any other failure surfaces the format + reason.
 */
export function useFigureExport({
  figure,
  images,
  pool,
  poolList,
  rows,
  cols,
  gutterPx,
  jpegQuality,
  pushToast,
}: Params): FigureExport {
  const [status, setStatus] = useState<ExportStatus>({ kind: "idle" });

  const exportScale = useMemo(
    () =>
      computeExportScale(
        // Placed images only — an unplaced tray image adds no pixels to the
        // export and must not inflate its resolution.
        placedPoolImages(
          poolList,
          new Set(
            figure.panels.flatMap((p) =>
              p.kind === "image" ? [p.imageId] : [],
            ),
          ),
        ),
        rows,
        cols,
        gutterPx,
        figure.canvas.widthPx,
        figure.canvas.heightPx,
      ),
    [
      poolList,
      figure.panels,
      rows,
      cols,
      gutterPx,
      figure.canvas.widthPx,
      figure.canvas.heightPx,
    ],
  );

  const applyResult = useCallback(
    (format: string, r: ExportResult): void => {
      setStatus({ kind: "idle" });
      if (r.ok) {
        pushToast({
          kind: "success",
          message: `Saved ${basename(r.filePath)}`,
        });
      } else if (r.reason === "canceled") {
        // User dismissed the save dialog — nothing to report.
      } else {
        pushToast({
          kind: "error",
          message: `${format} export failed: ${r.message ?? r.reason}`,
        });
      }
    },
    [pushToast],
  );

  const runPng = useCallback(async (): Promise<void> => {
    setStatus({ kind: "exporting", format: "PNG" });
    applyResult(
      "PNG",
      await exportFigureAsPng(figure, images, pool, exportScale),
    );
  }, [figure, images, pool, exportScale, applyResult]);

  const runJpeg = useCallback(async (): Promise<void> => {
    setStatus({ kind: "exporting", format: "JPEG" });
    applyResult(
      "JPEG",
      await exportFigureAsJpeg(figure, images, jpegQuality, pool, exportScale),
    );
  }, [figure, images, jpegQuality, pool, exportScale, applyResult]);

  const runTiff = useCallback(async (): Promise<void> => {
    setStatus({ kind: "exporting", format: "TIFF" });
    applyResult(
      "TIFF",
      await exportFigureAsTiff(figure, images, TIFF_DPI, pool, exportScale),
    );
  }, [figure, images, pool, exportScale, applyResult]);

  const runPdf = useCallback(async (): Promise<void> => {
    setStatus({ kind: "exporting", format: "PDF" });
    applyResult(
      "PDF",
      await exportFigureAsPdf(figure, images, pool, exportScale),
    );
  }, [figure, images, pool, exportScale, applyResult]);

  return { exportScale, status, runPng, runJpeg, runTiff, runPdf };
}
