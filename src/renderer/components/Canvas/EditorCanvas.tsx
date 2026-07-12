import { useEffect, useRef } from "react";
import type { Figure } from "../../model/types";
import type { ImagePoolItem } from "../../model/pool";
import {
  createEditorRenderer,
  type EditorRenderer,
} from "../../render/editor-renderer";

interface Props {
  figure: Figure;
  images: Map<string, ImageBitmap>;
  /** Pool items keyed by image id. Required for scale-bar calibration. */
  pool: Map<string, ImagePoolItem>;
  /** Full-resolution backing-store multiplier (= export sourceScale). */
  editorScale: number;
  /** Editor chrome theme — threaded to the renderer's placeholder palette. */
  theme: "light" | "dark";
}

export function EditorCanvas({
  figure,
  images,
  pool,
  editorScale,
  theme,
}: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<EditorRenderer | null>(null);

  useEffect(() => {
    if (canvasRef.current === null) return;
    const r = createEditorRenderer(canvasRef.current);
    rendererRef.current = r;
    return () => {
      r.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setFigure(figure);
  }, [figure]);
  useEffect(() => {
    rendererRef.current?.setImages(images);
  }, [images]);
  useEffect(() => {
    rendererRef.current?.setPool(pool);
  }, [pool]);
  useEffect(() => {
    rendererRef.current?.setEditorScale(editorScale);
  }, [editorScale]);
  useEffect(() => {
    rendererRef.current?.setTheme(theme);
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="editor-canvas"
      style={{
        // Fill the zoom-sized wrapper (App sizes it to zoom.cssW × cssH). The
        // backing store stays at figure-px × editorScale × dpr for crisp,
        // export-faithful pixels; this CSS size is only the DISPLAY size, so
        // the browser scales that full-res bitmap down to the on-screen box.
        // Without this the canvas would render at its intrinsic backing size
        // (unaffected by zoom, doubled on HiDPI) and the zoom would appear to
        // resize only the surrounding chrome, not the canvas.
        display: "block",
        width: "100%",
        height: "100%",
      }}
    />
  );
}
