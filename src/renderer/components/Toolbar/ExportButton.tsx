import { useState } from "react";
import type { Figure } from "../../model/types";
import { exportFigureAsPng } from "../../export/png";

interface Props {
  figure: Figure;
  images: Map<string, ImageBitmap>;
}

type Status =
  | { kind: "idle" }
  | { kind: "exporting" }
  | { kind: "success"; filePath: string }
  | { kind: "error"; message: string };

export function ExportButton({ figure, images }: Props): JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onClick(): Promise<void> {
    setStatus({ kind: "exporting" });
    const result = await exportFigureAsPng(figure, images);
    if (result.ok) {
      setStatus({ kind: "success", filePath: result.filePath });
    } else if (result.reason === "canceled") {
      setStatus({ kind: "idle" });
    } else {
      setStatus({
        kind: "error",
        message: result.message ?? result.reason,
      });
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={() => {
          void onClick();
        }}
        disabled={status.kind === "exporting"}
        data-testid="export-png"
      >
        {status.kind === "exporting" ? "Exporting…" : "Export as PNG"}
      </button>
      {status.kind === "success" && (
        <span style={{ color: "#070" }}>saved → {status.filePath}</span>
      )}
      {status.kind === "error" && (
        <span style={{ color: "#B00" }}>error: {status.message}</span>
      )}
    </span>
  );
}
