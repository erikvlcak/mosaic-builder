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
  dispatch: Dispatch<FigureAction>;
}

/**
 * One-by-one relink: shows a list of missing images. Clicking "Locate…"
 * opens the native file picker; the user picks one file and we attempt
 * to decode it. On success, the imageId is removed from the missing list
 * and its bitmap is reported via `onRelinked`. The user can also "Skip"
 * an image (keeps the pool entry but no bitmap — placed panels render
 * as a missing-image placeholder).
 */
export function RelinkModal({
  missing,
  onRelinked,
  onClose,
  dispatch: _dispatch,
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
      setError(`Decode failed for ${f.filePath}: ${e instanceof Error ? e.message : String(e)}`);
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
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        data-testid="relink-modal"
        style={{
          background: "#FFF",
          borderRadius: 6,
          padding: 16,
          minWidth: 480,
          maxHeight: "80vh",
          overflow: "auto",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 14 }}>
          Locate missing images
        </h2>
        <p style={{ margin: "0 0 12px", color: "#555" }}>
          The project references files that aren't where it expected.
          Click <strong>Locate…</strong> to point at the correct file, or
          <strong> Skip</strong> to leave the panel empty.
        </p>
        {missing.length === 0 ? (
          <p>(none)</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>
                  Filename
                </th>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>
                  Status
                </th>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {missing.map((entry) => {
                const isPending = pending.some((p) => p.imageId === entry.imageId);
                const isResolved = resolved.has(entry.imageId);
                const isBusy = busy === entry.imageId;
                return (
                  <tr key={entry.imageId} style={{ borderTop: "1px solid #EEE" }}>
                    <td style={{ padding: "4px 6px" }}>{entry.filename}</td>
                    <td style={{ padding: "4px 6px" }}>
                      {isResolved ? (
                        <span style={{ color: "#080" }}>relinked</span>
                      ) : isPending ? (
                        <span style={{ color: "#B00" }}>missing</span>
                      ) : (
                        <span style={{ color: "#888" }}>skipped</span>
                      )}
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      {isPending && (
                        <>
                          <button
                            type="button"
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
                            onClick={() => onSkip(entry)}
                            style={{ marginLeft: 4 }}
                            data-testid={`relink-skip-${entry.imageId}`}
                          >
                            Skip
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {error !== null && (
          <p style={{ margin: "8px 0 0", color: "#B00" }}>{error}</p>
        )}
        <div
          style={{
            marginTop: 12,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onDone}
            data-testid="relink-done"
            disabled={pending.length > 0}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
