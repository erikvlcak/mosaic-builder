import { useState } from "react";
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
      data-testid="export-menu"
      style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8 }}
    >
      <button
        type="button"
        data-testid="export-menu-toggle"
        onClick={() => setOpen((v) => !v)}
        disabled={exporting}
      >
        {exporting ? `Exporting ${status.format}…` : "Export ▾"}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            background: "#fff",
            border: "1px solid #CCC",
            borderRadius: 4,
            padding: 4,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minWidth: 140,
            zIndex: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
        >
          <button
            type="button"
            data-testid="export-png-btn"
            onClick={() => {
              void runPng();
            }}
            disabled={exporting}
            style={{ textAlign: "left" }}
          >
            PNG
          </button>
          <button
            type="button"
            data-testid="export-jpeg-btn"
            onClick={() => setJpegOpen((v) => !v)}
            disabled={exporting}
            style={{ textAlign: "left" }}
          >
            JPEG…
          </button>
          {jpegOpen && (
            <div
              style={{
                padding: 6,
                border: "1px solid #DDD",
                borderRadius: 4,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <label style={{ fontSize: 12 }}>
                Quality: {jpegQuality.toFixed(2)}
              </label>
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.01}
                value={jpegQuality}
                onChange={(e) => setJpegQuality(Number(e.target.value))}
                data-testid="export-jpeg-quality"
              />
              <button
                type="button"
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
            data-testid="export-tiff-btn"
            onClick={() => {
              void runTiff();
            }}
            disabled={exporting}
            style={{ textAlign: "left" }}
          >
            TIFF
          </button>
          <button
            type="button"
            data-testid="export-pdf-btn"
            onClick={() => {
              void runPdf();
            }}
            disabled={exporting}
            style={{ textAlign: "left" }}
          >
            PDF
          </button>
        </div>
      )}
      {status.kind === "success" && (
        <span style={{ color: "#070" }}>saved → {status.filePath}</span>
      )}
      {status.kind === "error" && (
        <span style={{ color: "#B00" }}>error: {status.message}</span>
      )}
    </span>
  );
}
