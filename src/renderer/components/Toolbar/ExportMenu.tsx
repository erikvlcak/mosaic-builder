import { useEffect, useRef, useState } from "react";
import type { Figure } from "../../model/types";
import type { ImagePoolItem } from "../../model/pool";
import { exportFigureAsPng } from "../../export/png";
import { exportFigureAsJpeg } from "../../export/jpeg";
import { exportFigureAsTiff } from "../../export/tiff";
import { exportFigureAsPdf } from "../../export/pdf";

interface Props {
  figure: Figure;
  images: Map<string, ImageBitmap>;
  pool?: Map<string, ImagePoolItem>;
}

type Status =
  | { kind: "idle" }
  | { kind: "exporting"; format: string }
  | { kind: "success"; filePath: string }
  | { kind: "error"; message: string };

const TIFF_DPI = 300;

export function ExportMenu({ figure, images, pool }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [jpegOpen, setJpegOpen] = useState(false);
  const [jpegQuality, setJpegQuality] = useState(0.92);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

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

  function applyResult(format: string, r: Awaited<ReturnType<typeof exportFigureAsPng>>): void {
    if (r.ok) {
      setStatus({ kind: "success", filePath: r.filePath });
      setOpen(false);
      setJpegOpen(false);
    } else if (r.reason === "canceled") {
      setStatus({ kind: "idle" });
    } else {
      setStatus({
        kind: "error",
        message: `${format}: ${r.message ?? r.reason}`,
      });
    }
  }

  async function runPng(): Promise<void> {
    setStatus({ kind: "exporting", format: "PNG" });
    applyResult("PNG", await exportFigureAsPng(figure, images, pool));
  }
  async function runJpeg(): Promise<void> {
    setStatus({ kind: "exporting", format: "JPEG" });
    applyResult("JPEG", await exportFigureAsJpeg(figure, images, jpegQuality, pool));
  }
  async function runTiff(): Promise<void> {
    setStatus({ kind: "exporting", format: "TIFF" });
    applyResult("TIFF", await exportFigureAsTiff(figure, images, TIFF_DPI, pool));
  }
  async function runPdf(): Promise<void> {
    setStatus({ kind: "exporting", format: "PDF" });
    applyResult("PDF", await exportFigureAsPdf(figure, images, pool));
  }

  const exporting = status.kind === "exporting";

  return (
    <span
      ref={wrapRef}
      data-testid="export-menu"
      style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8 }}
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
          style={{ top: "calc(100% + 4px)", left: 0 }}
        >
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            data-testid="export-png-btn"
            onClick={() => {
              void runPng();
            }}
            disabled={exporting}
          >
            PNG
            <span style={{ float: "right", color: "var(--c-text-faint)", marginLeft: 12 }}>
              transparent OK
            </span>
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
          </button>
          {jpegOpen && (
            <div className="menu-section">
              <label
                className="field"
                style={{ gap: 4 }}
              >
                <span className="field-label">
                  Quality: {jpegQuality.toFixed(2)}
                </span>
                <input
                  type="range"
                  min={0.5}
                  max={1}
                  step={0.01}
                  value={jpegQuality}
                  onChange={(e) => setJpegQuality(Number(e.target.value))}
                  data-testid="export-jpeg-quality"
                  style={{ accentColor: "var(--c-accent)" }}
                />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                data-testid="export-jpeg-confirm"
                onClick={() => {
                  void runJpeg();
                }}
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
            onClick={() => {
              void runTiff();
            }}
            disabled={exporting}
          >
            TIFF
            <span style={{ float: "right", color: "var(--c-text-faint)", marginLeft: 12 }}>
              {TIFF_DPI} dpi
            </span>
          </button>
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            data-testid="export-pdf-btn"
            onClick={() => {
              void runPdf();
            }}
            disabled={exporting}
          >
            PDF
          </button>
        </div>
      )}
      {status.kind === "success" && (
        <span style={{ color: "var(--c-success)", fontSize: 12 }}>
          Saved → {status.filePath}
        </span>
      )}
      {status.kind === "error" && (
        <span style={{ color: "var(--c-danger)", fontSize: 12 }}>
          {status.message}
        </span>
      )}
    </span>
  );
}
