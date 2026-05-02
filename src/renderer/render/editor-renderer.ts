import type { Figure } from "../model/types";
import { drawFigure } from "./draw-figure";

export interface EditorRenderer {
  setFigure(figure: Figure): void;
  setImages(images: Map<string, ImageBitmap>): void;
  dispose(): void;
}

/**
 * Mounts on an HTMLCanvasElement. Renders into a backing store sized to
 * the figure's pixel dimensions; CSS scales it down to fit the viewport.
 *
 * M2: single rAF coalescing. No editorScale yet — that lands in M5.
 */
export function createEditorRenderer(
  canvas: HTMLCanvasElement,
): EditorRenderer {
  let figure: Figure | null = null;
  let images: Map<string, ImageBitmap> = new Map();
  let rafHandle: number | null = null;
  let disposed = false;

  function schedule(): void {
    if (disposed || rafHandle !== null) return;
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      paint();
    });
  }

  function paint(): void {
    if (figure === null) return;
    if (canvas.width !== figure.canvas.widthPx) {
      canvas.width = figure.canvas.widthPx;
    }
    if (canvas.height !== figure.canvas.heightPx) {
      canvas.height = figure.canvas.heightPx;
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    drawFigure(ctx, figure, images);
  }

  return {
    setFigure(next: Figure): void {
      figure = next;
      schedule();
    },
    setImages(next: Map<string, ImageBitmap>): void {
      images = next;
      schedule();
    },
    dispose(): void {
      disposed = true;
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    },
  };
}
