import { useState } from "react";
import type { Dispatch } from "react";
import { decodeImageBytes } from "../../image/decode-bytes";
import type { FigureAction } from "../../model/figure-actions";

export interface MissingEntry {
  imageId: string;
  filename: string;
  attemptedPaths: string[];
}

interface Props {
  missing: MissingEntry[];
  onRelinked: (
    bitmaps: Map<string, ImageBitmap>,
    stillMissing: MissingEntry[],
  ) => void;
  onClose: () => void;
  /** Reserved for future actions (e.g. removing image-pool entries on Skip). */
  dispatch: Dispatch<FigureAction>;
}

export function RelinkModal({
  missing,
  onRelinked,
  onClose,
}: Props): JSX.Element {
  const [pending, setPending] = useState<MissingEntry[]>(missing);
  const [resolved, setResolved] = useState<Map<string, ImageBitmap>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onLocate(entry: MissingEntry): Promise<void> {
    setBusy(entry.imageId);
    setError(null);
    const r = await window.api.openImages();
    if (r.canceled) {
      setBusy(null);
      return;
    }
    if (r.files.length === 0) {
      setBusy(null);
      setError("No file selected.");
      return;
    }
    const f = r.files[0]!;
    try {
      const decoded = await decodeImageBytes(f.bytes, f.mime);
      setResolved((prev) => {
        const next = new Map(prev);
        next.set(entry.imageId, decoded.bitmap);
        return next;
      });
      setPending((prev) => prev.filter((p) => p.imageId !== entry.imageId));
    } catch (e) {
      setError(
        `Could not decode ${f.filePath}: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(null);
    }
  }

  function onSkip(entry: MissingEntry): void {
    setPending((prev) => prev.filter((p) => p.imageId !== entry.imageId));
  }

  function onDone(): void {
    onRelinked(resolved, pending);
    onClose();
  }

  return (
    <div
      data-testid="relink-backdrop"
      className="dialog-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="relink-modal"
        className="dialog"
        style={{
          padding: 20,
          minWidth: 520,
          maxHeight: "80vh",
          overflow: "auto",
        }}
      >
        <h2 className="dialog-title">Locate missing images</h2>
        <p className="dialog-body">
          This project references images that aren&rsquo;t at their saved paths.
          Click <strong>Locate…</strong> to browse for the file, or{" "}
          <strong>Skip</strong> to leave the panel empty.
        </p>
        {missing.length === 0 ? (
          <p style={{ color: "var(--c-text-muted)" }}>(none)</p>
        ) : (
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
          >
            <thead>
              <tr style={{ color: "var(--c-text-muted)", textAlign: "left" }}>
                <th
                  style={{
                    padding: "6px 8px",
                    fontWeight: 500,
                    borderBottom: "1px solid var(--c-divider)",
                  }}
                >
                  Filename
                </th>
                <th
                  style={{
                    padding: "6px 8px",
                    fontWeight: 500,
                    borderBottom: "1px solid var(--c-divider)",
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    padding: "6px 8px",
                    fontWeight: 500,
                    borderBottom: "1px solid var(--c-divider)",
                  }}
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {missing.map((entry) => {
                const isPending = pending.some(
                  (p) => p.imageId === entry.imageId,
                );
                const isResolved = resolved.has(entry.imageId);
                const isBusy = busy === entry.imageId;
                return (
                  <tr
                    key={entry.imageId}
                    style={{ borderBottom: "1px solid var(--c-divider)" }}
                  >
                    <td style={{ padding: "8px" }}>{entry.filename}</td>
                    <td style={{ padding: "8px" }}>
                      {isResolved ? (
                        <span style={{ color: "var(--c-success)" }}>
                          Relinked
                        </span>
                      ) : isPending ? (
                        <span style={{ color: "var(--c-danger)" }}>
                          Missing
                        </span>
                      ) : (
                        <span style={{ color: "var(--c-text-faint)" }}>
                          Skipped
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px" }}>
                      {isPending && (
                        <span style={{ display: "inline-flex", gap: 4 }}>
                          <button
                            type="button"
                            className="btn"
                            disabled={isBusy}
                            onClick={() => {
                              void onLocate(entry);
                            }}
                            data-testid={`relink-locate-${entry.imageId}`}
                          >
                            {isBusy ? "Picking…" : "Locate…"}
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => onSkip(entry)}
                            data-testid={`relink-skip-${entry.imageId}`}
                          >
                            Skip
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {error !== null && (
          <p
            role="alert"
            style={{
              margin: "10px 0 0",
              color: "var(--c-danger)",
              fontSize: 12,
            }}
          >
            {error}
          </p>
        )}
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "flex-end",
            gap: 6,
          }}
        >
          <button
            type="button"
            className="btn btn-primary"
            onClick={onDone}
            data-testid="relink-done"
            disabled={pending.length > 0}
            title={pending.length > 0 ? "Resolve all images first" : undefined}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
