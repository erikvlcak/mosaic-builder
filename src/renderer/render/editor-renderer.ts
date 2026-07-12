import type { Figure } from "../model/types";
import type { ImagePoolItem } from "../model/pool";
import { drawFigure } from "./draw-figure";

// Browsers cap a single canvas's backing-store dimensions (~16384px in
// Chromium; lower on some GPUs/Safari). Exceeding it makes the context
// silently fail to paint — the "canvas crashes on upload" symptom, since a
// high-res image drives editorScale (and thus model×editorScale×dpr) past the
// cap. 8192 is safe across the browsers/GPUs we ship on and is still far more
// resolution than the on-screen display box can show. Exports use their own
// full-resolution OffscreenCanvas path and are unaffected by this editor cap.
export const MAX_EDITOR_CANVAS_PX = 8192;

export interface EditorRenderer {
  setFigure(figure: Figure): void;
  setImages(images: Map<string, ImageBitmap>): void;
  setPool(pool: Map<string, ImagePoolItem>): void;
  setEditorScale(scale: number): void;
  setTheme(theme: "light" | "dark"): void;
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
  // Chrome-only theme: selects the empty-panel placeholder palette. Figure
  // content never reads this, so it can't leak into exports (which never
  // construct an EditorRenderer).
  let theme: "light" | "dark" = "light";
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
    // The drawing coordinate system stays in figure-px (see the composed
    // transform below) so annotations and exports don't have to know about DPR.
    const dpr =
      typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio)
        ? Math.max(1, window.devicePixelRatio)
        : 1;
    // Two independent multipliers stack on the backing store: editorScale
    // (full source resolution, from the pool) and dpr (HiDPI). Both are also
    // composed into the single ctx transform so drawFigure still paints in
    // the 800x600 model coordinate system and never learns about zoom.
    //
    // Clamp so neither axis exceeds MAX_EDITOR_CANVAS_PX — a high-res image
    // can push model×editorScale×dpr past the browser's canvas-size limit,
    // which silently blanks the whole editor. We scale `combined` down to the
    // largest multiple that keeps both axes within the cap; the same clamped
    // value feeds the ctx transform below, so drawing stays consistent with
    // the backing store (just at a slightly lower editor resolution — still
    // sharper than the display box, and exports are unaffected).
    const requested = editorScale * dpr;
    const capMultiple = Math.min(
      MAX_EDITOR_CANVAS_PX / figure.canvas.widthPx,
      MAX_EDITOR_CANVAS_PX / figure.canvas.heightPx,
    );
    const combined = Math.min(requested, capMultiple);
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
    // Editor-only affordances: empty panels invite a drag (shown from the
    // first run, even before any image is imported). Exports never see these.
    drawFigure(ctx, figure, images, pool, {
      editorHints: true,
      theme,
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
    setTheme(next: "light" | "dark"): void {
      theme = next;
      schedule();
    },
    dispose(): void {
      disposed = true;
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    },
  };
}
