import { useEffect, useState } from "react";
import { EditorCanvas } from "./components/Canvas/EditorCanvas";
import {
  HARDCODED_FIGURE,
  SAMPLE_IMAGE_ID,
  SAMPLE_IMAGE_URL,
} from "./model/hardcoded";
import { loadImageBitmap } from "./image/load-image";

export function App(): JSX.Element {
  const [images, setImages] = useState<Map<string, ImageBitmap>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadImageBitmap(SAMPLE_IMAGE_URL)
      .then((bitmap) => {
        if (cancelled) return;
        setImages(new Map([[SAMPLE_IMAGE_ID, bitmap]]));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: 16,
        color: "#333",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Mosaic Builder</h1>
        {loadError !== null && (
          <span style={{ color: "#B00" }}>image load error: {loadError}</span>
        )}
        {/* ExportButton lands in Task 11. */}
      </header>
      <EditorCanvas figure={HARDCODED_FIGURE} images={images} />
    </main>
  );
}
