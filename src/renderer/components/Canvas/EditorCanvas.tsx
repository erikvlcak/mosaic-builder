import { useEffect, useRef } from "react";
import type { Figure } from "../../model/types";
import {
  createEditorRenderer,
  type EditorRenderer,
} from "../../render/editor-renderer";

interface Props {
  figure: Figure;
  images: Map<string, ImageBitmap>;
}

export function EditorCanvas({ figure, images }: Props): JSX.Element {
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

  return (
    <canvas
      ref={canvasRef}
      data-testid="editor-canvas"
      style={{
        display: "block",
        maxWidth: "100%",
        maxHeight: "calc(100vh - 120px)",
        width: "auto",
        height: "auto",
        border: "1px solid #DDD",
      }}
    />
  );
}
