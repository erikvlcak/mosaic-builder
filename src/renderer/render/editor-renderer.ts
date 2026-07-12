import type { Figure } from "../model/types";
import type { ImagePoolItem } from "../model/pool";
import { drawFigure } from "./draw-figure";

export interface EditorRenderer {
  setFigure(figure: Figure): void;
  setImages(images: Map<string, ImageBitmap>): void;
  setPool(pool: Map<string, ImagePoolItem>): void;
  setEditorScale(scale: number): void;
  dispose(): void;
}

/**
 * Mounts on an HTMLCanvasElement. Renders into a backing store sized to
 * the figure's pixel dimensions; CSS scales it down to fit the viewport.
 *
 * M2: single rAF coalescing.
 */
export function createEditorRenderer(
  canvas: HTMLCanvasElement,
): EditorRenderer {
  let figure: Figure | null = null;
  let images: Map<string, ImageBitmap> = new Map();
  // Pool items carry per-image calibration; without them, drawFigure's
  // scale-bar pass treats every image as uncalibrated and silently skips
  // the bar.
  let pool: Map<string, ImagePoolItem> = new Map();
  let editorScale = 1;
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
    // Match the canvas backing store to the device pixel ratio so text and
    // strokes stay crisp on Retina/HiDPI displays. Without this, the 800×600
    // logical canvas paints into 800×600 device pixels and the browser
    // upscales to 1600×1200 on a 2× screen — every glyph turns into 2× blocks.
    //
    // We keep the *drawing* coordinate system in figure-px (translate via
    // ctx.scale(dpr, dpr) below) so annotations and exports don't have to
    // know about DPR.
    const dpr =
      typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio)
        ? Math.max(1, window.devicePixelRatio)
        : 1;
    // Two independent multipliers stack on the backing store: editorScale
    // (full source resolution, from the pool) and dpr (HiDPI). Both are also
    // composed into the single ctx transform so drawFigure still paints in
    // the 800x600 model coordinate system and never learns about zoom.
    const combined = editorScale * dpr;
    const targetW = Math.round(figure.canvas.widthPx * combined);
    const targetH = Math.round(figure.canvas.heightPx * combined);
    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;
    // CSS size is owned by the wrapper <div> (App.tsx), driven by the view
    // zoom. The renderer no longer sets canvas.style.* — doing so would fight
    // the zoom's CSS box.
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    // Reset to identity, scale once, then let drawFigure paint in figure-px.
    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(combined, 0, 0, combined, 0, 0);
    } else {
      ctx.scale(combined, combined);
    }
    // Editor-only affordances: empty panels invite a drag, but only when the
    // pool actually holds a decoded image to drag. Exports never see these.
    drawFigure(ctx, figure, images, pool, {
      editorHints: true,
      poolHasImages: images.size > 0,
    });
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
    setPool(next: Map<string, ImagePoolItem>): void {
      pool = next;
      schedule();
    },
    setEditorScale(next: number): void {
      editorScale = next;
      schedule();
    },
    dispose(): void {
      disposed = true;
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    },
  };
}
