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
        // CSS size is set imperatively by the renderer to figure-px, so the
        // backing store can stay at figure-px × dpr for crisp text on HiDPI
        // displays. We leave width/height OUT of the inline style so the
        // renderer's pixel-perfect sizing wins; setting "width: 100%" here
        // would force the browser to up- or down-sample.
        display: "block",
        border: "1px solid var(--c-border)",
      }}
    />
  );
}
