import { useEffect, useRef, useState } from "react";
import type { Figure } from "../../model/types";
import type { ExportStatus } from "../../hooks/useFigureExport";
import { TIFF_DPI } from "../../hooks/useFigureExport";
import { PDF_DPI } from "../../export/pdf";

interface Props {
  figure: Figure;
  /** Output enlargement factor; drives the displayed pixel dimensions. */
  exportScale: number;
  status: ExportStatus;
  jpegQuality: number;
  onJpegQualityChange: (q: number) => void;
  runPng: () => void | Promise<void>;
  runJpeg: () => void | Promise<void>;
  runTiff: () => void | Promise<void>;
  runPdf: () => void | Promise<void>;
}

const CM_PER_INCH = 2.54;

export function ExportMenu({
  figure,
  exportScale,
  status,
  jpegQuality,
  onJpegQualityChange,
  runPng,
  runJpeg,
  runTiff,
  runPdf,
}: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [jpegOpen, setJpegOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  const outW = Math.round(figure.canvas.widthPx * exportScale);
  const outH = Math.round(figure.canvas.heightPx * exportScale);
  const pxLabel = `${outW} × ${outH} px`;
  // PDF pages are sized to physical dimensions at PDF_DPI — the researcher's
  // real question is "how big on the page", answered in cm.
  const cmW = ((outW / PDF_DPI) * CM_PER_INCH).toFixed(1);
  const cmH = ((outH / PDF_DPI) * CM_PER_INCH).toFixed(1);
  const pdfLabel = `${cmW} × ${cmH} cm`;

  const exporting = status.kind === "exporting";

  useEffect(() => {
    if (!open) return;
    function onDoc(e: PointerEvent): void {
      if (wrapRef.current === null) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setJpegOpen(false);
      }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        setOpen(false);
        setJpegOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Close the menu after a run is dispatched so the toast (success/error) is
  // the single feedback surface.
  function afterRun(run: () => void | Promise<void>): void {
    void run();
    setOpen(false);
    setJpegOpen(false);
  }

  return (
    <span
      ref={wrapRef}
      data-testid="export-menu"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <button
        type="button"
        className="btn btn-primary"
        data-testid="export-menu-toggle"
        onClick={() => setOpen((v) => !v)}
        disabled={exporting}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {exporting ? `Exporting ${status.format}…` : "Export ▾"}
      </button>
      {open && (
        <div
          className="menu"
          role="menu"
          style={{
            top: "calc(100% + 4px)",
            right: 0,
            maxHeight: "calc(100vh - 80px)",
            overflowY: "auto",
          }}
        >
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            data-testid="export-png-btn"
            onClick={() => afterRun(runPng)}
            disabled={exporting}
          >
            PNG
            <span className="export-meta">{pxLabel} · keeps transparency</span>
          </button>
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            data-testid="export-jpeg-btn"
            onClick={() => setJpegOpen((v) => !v)}
            disabled={exporting}
            aria-expanded={jpegOpen}
          >
            JPEG…
            <span className="export-meta">{pxLabel}</span>
          </button>
          {jpegOpen && (
            <div className="menu-section">
              <label className="field" style={{ gap: 4 }}>
                <span className="field-label">
                  Quality: {jpegQuality.toFixed(2)}
                </span>
                <input
                  type="range"
                  min={0.5}
                  max={1}
                  step={0.01}
                  value={jpegQuality}
                  onChange={(e) => onJpegQualityChange(Number(e.target.value))}
                  data-testid="export-jpeg-quality"
                  style={{ accentColor: "var(--c-accent)" }}
                />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                data-testid="export-jpeg-confirm"
                onClick={() => afterRun(runJpeg)}
                disabled={exporting}
              >
                Export JPEG
              </button>
            </div>
          )}
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            data-testid="export-tiff-btn"
            onClick={() => afterRun(runTiff)}
            disabled={exporting}
          >
            TIFF
            <span className="export-meta">
              {pxLabel} · {TIFF_DPI} dpi
            </span>
          </button>
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            data-testid="export-pdf-btn"
            onClick={() => afterRun(runPdf)}
            disabled={exporting}
          >
            PDF
            <span className="export-meta">{pdfLabel}</span>
          </button>
        </div>
      )}
    </span>
  );
}
