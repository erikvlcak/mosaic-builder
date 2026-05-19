import type { ImagePoolItem, Calibration } from "./pool";
import type {
  Panel,
  PanelTransform,
  PanelCrop,
  FitMode,
  Rotation,
} from "./panels";
import { DEFAULT_TRANSFORM, findPanelAt, isValidCrop } from "./panels";
import type {
  FigureState,
  LetterOverride,
  LetterPattern,
} from "./figure-state";
import { initialFigureState, newPanelId } from "./figure-state";
import { resizePanels } from "./grid-resize";
import {
  canMergeSelection,
  mergePanels,
  unmergePanel,
  type CellCoord,
} from "./merge";
import type { Annotation, AnnotationKind } from "./annotations";
import type { GlobalAnnoStyle } from "./global-style";
import { relocateImageBoundAnnotations } from "./relocate-anno";
import {
  setTrackWeight,
  uniformLayoutFor,
  resizePanelFreeform,
  resizePanelUniform,
  type Corner,
  type GridLayout,
} from "./grid-layout";

export type FigureAction =
  | { type: "ADD_TO_POOL"; item: ImagePoolItem }
  | { type: "PLACE_INTO_PANEL"; imageId: string; panelId: string }
  | { type: "SWAP_PANELS"; aPanelId: string; bPanelId: string }
  | { type: "REPLACE_INTO_PANEL"; imageId: string; panelId: string }
  | { type: "UNPLACE_PANEL"; panelId: string }
  | { type: "REMOVE_FROM_POOL"; imageId: string }
  | { type: "RESIZE_GRID"; rows: number; cols: number }
  | { type: "SET_GUTTER_PX"; gutterPx: number }
  | { type: "SET_GUTTER_COLOR"; gutterColor: string }
  | { type: "SET_OUTER_GUTTER"; outerGutter: boolean }
  | { type: "MERGE_CELLS"; cells: CellCoord[] }
  | { type: "UNMERGE_PANEL"; panelId: string }
  | { type: "SET_PANEL_TRANSFORM"; panelId: string; transform: PanelTransform }
  | { type: "SET_PANEL_FIT"; panelId: string; fit: FitMode }
  | { type: "ROTATE_PANEL_90"; panelId: string }
  | { type: "FLIP_PANEL_H"; panelId: string }
  | { type: "FLIP_PANEL_V"; panelId: string }
  | { type: "RESET_PANEL_TRANSFORM"; panelId: string }
  | { type: "SET_PANEL_CROP"; panelId: string; crop: PanelCrop | null }
  | { type: "RESET_PANEL_CROP"; panelId: string }
  | { type: "ADD_ANNOTATION"; annotation: Annotation }
  | {
      type: "UPDATE_ANNOTATION";
      annotationId: string;
      patch: Partial<Annotation>;
    }
  | { type: "REMOVE_ANNOTATION"; annotationId: string }
  | {
      type: "BULK_UPDATE_ANNOS";
      ids: string[];
      patch: Partial<Annotation>;
    }
  | { type: "BULK_REMOVE_ANNOS"; ids: string[] }
  | {
      type: "SET_LETTER_OVERRIDE";
      panelId: string;
      override: LetterOverride | null;
    }
  | { type: "SET_LETTER_PATTERN"; pattern: LetterPattern }
  | { type: "CLEAR_ALL_LETTER_OVERRIDES" }
  | { type: "SET_GLOBAL_STYLE"; style: GlobalAnnoStyle }
  | { type: "SET_LETTERS_ENABLED"; enabled: boolean }
  | {
      type: "SET_IMAGE_CALIBRATION";
      imageId: string;
      calibration: Calibration | null;
    }
  | { type: "SET_PANEL_HIDDEN"; panelId: string; hidden: boolean }
  | { type: "DELETE_PANEL"; panelId: string }
  | { type: "RESTORE_PANEL_AT"; row: number; col: number }
  | { type: "RESET_TO_STATE"; state: FigureState }
  | { type: "RESET_FIGURE" }
  | {
      type: "SET_TRACK_WEIGHT";
      axis: "row" | "col";
      index: number;
      weight: number;
    }
  | {
      type: "RESIZE_PANEL_FREEFORM";
      panelId: string;
      corner: Corner;
      dx: number;
      dy: number;
      canvas: { widthPx: number; heightPx: number };
    }
  | { type: "RESET_TO_UNIFORM_GRID" };

export const addToPool = (item: ImagePoolItem): FigureAction => ({
  type: "ADD_TO_POOL",
  item,
});
export const placeIntoPanel = (
  imageId: string,
  panelId: string,
): FigureAction => ({ type: "PLACE_INTO_PANEL", imageId, panelId });
export const swapPanels = (
  aPanelId: string,
  bPanelId: string,
): FigureAction => ({ type: "SWAP_PANELS", aPanelId, bPanelId });
export const replaceIntoPanel = (
  imageId: string,
  panelId: string,
): FigureAction => ({ type: "REPLACE_INTO_PANEL", imageId, panelId });
export const removeFromPool = (imageId: string): FigureAction => ({
  type: "REMOVE_FROM_POOL",
  imageId,
});
export const unplacePanel = (panelId: string): FigureAction => ({
  type: "UNPLACE_PANEL",
  panelId,
});
export const resizeGrid = (rows: number, cols: number): FigureAction => ({
  type: "RESIZE_GRID",
  rows,
  cols,
});
export const setGutterPx = (gutterPx: number): FigureAction => ({
  type: "SET_GUTTER_PX",
  gutterPx,
});
export const setGutterColor = (gutterColor: string): FigureAction => ({
  type: "SET_GUTTER_COLOR",
  gutterColor,
});
export const setOuterGutter = (outerGutter: boolean): FigureAction => ({
  type: "SET_OUTER_GUTTER",
  outerGutter,
});
export const mergeCells = (cells: CellCoord[]): FigureAction => ({
  type: "MERGE_CELLS",
  cells,
});
export const unmergePanelAction = (panelId: string): FigureAction => ({
  type: "UNMERGE_PANEL",
  panelId,
});
export const setPanelTransform = (
  panelId: string,
  transform: PanelTransform,
): FigureAction => ({ type: "SET_PANEL_TRANSFORM", panelId, transform });
export const setPanelFit = (panelId: string, fit: FitMode): FigureAction => ({
  type: "SET_PANEL_FIT",
  panelId,
  fit,
});
export const rotatePanel90 = (panelId: string): FigureAction => ({
  type: "ROTATE_PANEL_90",
  panelId,
});
export const flipPanelH = (panelId: string): FigureAction => ({
  type: "FLIP_PANEL_H",
  panelId,
});
export const flipPanelV = (panelId: string): FigureAction => ({
  type: "FLIP_PANEL_V",
  panelId,
});
export const resetPanelTransform = (panelId: string): FigureAction => ({
  type: "RESET_PANEL_TRANSFORM",
  panelId,
});
export const setPanelCrop = (
  panelId: string,
  crop: PanelCrop | null,
): FigureAction => ({ type: "SET_PANEL_CROP", panelId, crop });
export const resetPanelCrop = (panelId: string): FigureAction => ({
  type: "RESET_PANEL_CROP",
  panelId,
});
export const addAnnotation = (annotation: Annotation): FigureAction => ({
  type: "ADD_ANNOTATION",
  annotation,
});
export const updateAnnotation = (
  annotationId: string,
  patch: Partial<Annotation>,
): FigureAction => ({ type: "UPDATE_ANNOTATION", annotationId, patch });
export const removeAnnotation = (annotationId: string): FigureAction => ({
  type: "REMOVE_ANNOTATION",
  annotationId,
});
export const bulkUpdateAnnos = (
  ids: string[],
  patch: Partial<Annotation>,
): FigureAction => ({ type: "BULK_UPDATE_ANNOS", ids, patch });
export const bulkRemoveAnnos = (ids: string[]): FigureAction => ({
  type: "BULK_REMOVE_ANNOS",
  ids,
});
export const setLetterOverride = (
  panelId: string,
  override: LetterOverride | null,
): FigureAction => ({ type: "SET_LETTER_OVERRIDE", panelId, override });
export const setLetterPattern = (pattern: LetterPattern): FigureAction => ({
  type: "SET_LETTER_PATTERN",
  pattern,
});
export const clearAllLetterOverrides = (): FigureAction => ({
  type: "CLEAR_ALL_LETTER_OVERRIDES",
});
export const setGlobalStyle = (style: GlobalAnnoStyle): FigureAction => ({
  type: "SET_GLOBAL_STYLE",
  style,
});
export const setLettersEnabled = (enabled: boolean): FigureAction => ({
  type: "SET_LETTERS_ENABLED",
  enabled,
});
export const setImageCalibration = (
  imageId: string,
  calibration: Calibration | null,
): FigureAction => ({ type: "SET_IMAGE_CALIBRATION", imageId, calibration });
export const setPanelHidden = (
  panelId: string,
  hidden: boolean,
): FigureAction => ({ type: "SET_PANEL_HIDDEN", panelId, hidden });
export const deletePanel = (panelId: string): FigureAction => ({
  type: "DELETE_PANEL",
  panelId,
});
export const restorePanelAt = (row: number, col: number): FigureAction => ({
  type: "RESTORE_PANEL_AT",
  row,
  col,
});
export const resetToState = (state: FigureState): FigureAction => ({
  type: "RESET_TO_STATE",
  state,
});
export const resetFigureAction = (): FigureAction => ({ type: "RESET_FIGURE" });
export const setTrackWeightAction = (
  axis: "row" | "col",
  index: number,
  weight: number,
): FigureAction => ({ type: "SET_TRACK_WEIGHT", axis, index, weight });
export const resizePanelFreeformAction = (
  panelId: string,
  corner: Corner,
  dx: number,
  dy: number,
  canvas: { widthPx: number; heightPx: number },
): FigureAction => ({
  type: "RESIZE_PANEL_FREEFORM",
  panelId,
  corner,
  dx,
  dy,
  canvas,
});
export const resetToUniformGridAction = (): FigureAction => ({
  type: "RESET_TO_UNIFORM_GRID",
});

function isImageInPool(s: FigureState, imageId: string): boolean {
  return s.pool.some((p) => p.id === imageId);
}

function findPanelById(panels: Panel[], id: string): Panel | undefined {
  return panels.find((p) => p.id === id);
}

function isImagePlaced(panels: readonly Panel[], imageId: string): boolean {
  return panels.some((p) => p.imageId === imageId);
}

/**
 * Replace a panel's imageId AND transform together. They are paired:
 * `imageId === undefined` ⇔ `transform === undefined`.
 */
function setPanelImage(
  panels: Panel[],
  panelId: string,
  imageId: string | undefined,
): Panel[] {
  return panels.map((p) =>
    p.id === panelId
      ? imageId === undefined
        ? omitImage(p)
        : withFreshImage(p, imageId)
      : p,
  );
}

function withFreshImage(p: Panel, imageId: string): Panel {
  // Placing an image must clear `hidden` — it's defined only for empty panels.
  // The reducer rejects setting `hidden` on image-bearing panels, but we
  // clear here too so any state-rebuild path can't smuggle the flag in.
  return {
    id: p.id,
    row: p.row,
    col: p.col,
    rowSpan: p.rowSpan,
    colSpan: p.colSpan,
    imageId,
    transform: DEFAULT_TRANSFORM,
  };
}

function omitImage(p: Panel): Panel {
  return {
    id: p.id,
    row: p.row,
    col: p.col,
    rowSpan: p.rowSpan,
    colSpan: p.colSpan,
  };
}

function withImage(
  p: Panel,
  imageId: string | undefined,
  transform: PanelTransform | undefined,
): Panel {
  if (imageId === undefined || transform === undefined) {
    return omitImage(p);
  }
  // Same hidden-clearing reasoning as withFreshImage: an image-bearing
  // panel cannot also be hidden.
  return {
    id: p.id,
    row: p.row,
    col: p.col,
    rowSpan: p.rowSpan,
    colSpan: p.colSpan,
    imageId,
    transform,
  };
}

function mapPanel(
  panels: Panel[],
  panelId: string,
  fn: (p: Panel) => Panel,
): { panels: Panel[]; changed: boolean } {
  let changed = false;
  const next = panels.map((p) => {
    if (p.id !== panelId) return p;
    const updated = fn(p);
    if (updated !== p) changed = true;
    return updated;
  });
  return { panels: next, changed };
}

export function figureReducer(s: FigureState, a: FigureAction): FigureState {
  switch (a.type) {
    case "ADD_TO_POOL": {
      if (s.pool.some((p) => p.id === a.item.id)) return s;
      return { ...s, pool: [...s.pool, a.item] };
    }

    case "PLACE_INTO_PANEL": {
      if (!isImageInPool(s, a.imageId)) return s;
      if (isImagePlaced(s.panels, a.imageId)) return s;
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined) return s;
      if (target.imageId !== undefined) return s;
      return { ...s, panels: setPanelImage(s.panels, a.panelId, a.imageId) };
    }

    case "SWAP_PANELS": {
      if (a.aPanelId === a.bPanelId) return s;
      const pa = findPanelById(s.panels, a.aPanelId);
      const pb = findPanelById(s.panels, a.bPanelId);
      if (pa === undefined || pb === undefined) return s;
      if (pa.imageId === undefined && pb.imageId === undefined) return s;
      const next = s.panels.map((p) => {
        if (p.id === pa.id) return withImage(p, pb.imageId, pb.transform);
        if (p.id === pb.id) return withImage(p, pa.imageId, pa.transform);
        return p;
      });
      // Relocate annotations bound to either swapped image, against the
      // post-swap state. Order matters only for chaining-readability; the
      // two relocator calls touch disjoint annotation subsets.
      let postSwap: FigureState = { ...s, panels: next };
      if (pa.imageId !== undefined) {
        postSwap = {
          ...postSwap,
          annotations: relocateImageBoundAnnotations(postSwap, pa.imageId),
        };
      }
      if (pb.imageId !== undefined) {
        postSwap = {
          ...postSwap,
          annotations: relocateImageBoundAnnotations(postSwap, pb.imageId),
        };
      }
      return postSwap;
    }

    case "REPLACE_INTO_PANEL": {
      if (!isImageInPool(s, a.imageId)) return s;
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined) return s;
      if (target.imageId === a.imageId) return s;
      // If the new image is already placed in some *other* panel, this is a no-op:
      // a "replace" is from the tray, not a 2-cell move. Use SWAP_PANELS for that.
      const placedElsewhere = s.panels.some(
        (p) => p.id !== a.panelId && p.imageId === a.imageId,
      );
      if (placedElsewhere) return s;
      // Fresh image, fresh framing — overwrite any prior transform.
      const ousted = target.imageId;
      let next: FigureState = {
        ...s,
        panels: setPanelImage(s.panels, a.panelId, a.imageId),
      };
      // Annotations bound to the displaced image now have no host panel —
      // relocate (which drops them when no panel holds the image).
      if (ousted !== undefined) {
        next = {
          ...next,
          annotations: relocateImageBoundAnnotations(next, ousted),
        };
      }
      // Annotations bound to the new image (if previously orphaned and
      // somehow lingering — defensive) re-attach to this panel.
      next = {
        ...next,
        annotations: relocateImageBoundAnnotations(next, a.imageId),
      };
      return next;
    }

    case "UNPLACE_PANEL": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined) return s;
      if (target.imageId === undefined) return s;
      const ousted = target.imageId;
      const panels = s.panels.map((p) =>
        p.id === a.panelId ? omitImage(p) : p,
      );
      // Drop scale bars anchored to the now-empty panel — same logic as
      // REMOVE_FROM_POOL applies to a single panel.
      const annotationsAfterScalebarDrop = s.annotations.filter(
        (an) => !(an.kind === "scalebar" && an.panelId === a.panelId),
      );
      // Then relocate (drop) image-bound annos for the ousted image —
      // since it's no longer placed anywhere, the relocator drops them.
      const next: FigureState = {
        ...s,
        panels,
        annotations: annotationsAfterScalebarDrop,
      };
      return {
        ...next,
        annotations: relocateImageBoundAnnotations(next, ousted),
      };
    }

    case "REMOVE_FROM_POOL": {
      if (!s.pool.some((p) => p.id === a.imageId)) return s;
      // Snapshot panels currently holding this image — used to drop scale
      // bars whose anchor panel just lost its calibration source.
      const affectedPanelIds = new Set(
        s.panels.filter((p) => p.imageId === a.imageId).map((p) => p.id),
      );
      const panels = s.panels.map((p) =>
        p.imageId === a.imageId ? omitImage(p) : p,
      );
      const annotationsAfterScalebarDrop =
        affectedPanelIds.size === 0
          ? s.annotations
          : s.annotations.filter(
              (an) =>
                !(an.kind === "scalebar" && affectedPanelIds.has(an.panelId)),
            );
      // Drop every image-bound anno for the removed image. We can't call
      // the relocator here (it reads pool[imageId]), so filter directly.
      const annotations = annotationsAfterScalebarDrop.filter(
        (an) => an.imageId !== a.imageId,
      );
      return {
        ...s,
        pool: s.pool.filter((p) => p.id !== a.imageId),
        panels,
        annotations,
      };
    }

    case "RESIZE_GRID": {
      const rows = clampInt(a.rows, 1, 10);
      const cols = clampInt(a.cols, 1, 10);
      if (rows === s.rows && cols === s.cols) return s;
      const r = resizePanels(s.panels, s.rows, s.cols, rows, cols);
      // Released imageIds simply stay in the pool unplaced — no pool mutation.
      const keptPanelIds = new Set(r.panels.map((p) => p.id));
      const letterOverrides = filterOverrides(s.letterOverrides, keptPanelIds);
      // Resizing the grid invalidates per-track weights (length changes) and
      // any free-form rects (some panels may not exist in the new dims).
      // Easiest correct behavior: revert to a uniform layout.
      return {
        ...s,
        rows,
        cols,
        panels: r.panels,
        letterOverrides,
        layout: uniformLayoutFor(rows, cols),
      };
    }

    case "SET_GUTTER_PX": {
      const gutterPx = clampInt(a.gutterPx, 0, 40);
      if (gutterPx === s.gutterPx) return s;
      return { ...s, gutterPx };
    }

    case "SET_GUTTER_COLOR": {
      if (!isHexColor(a.gutterColor)) return s;
      if (a.gutterColor === s.gutterColor) return s;
      return { ...s, gutterColor: a.gutterColor };
    }

    case "SET_OUTER_GUTTER": {
      if (a.outerGutter === s.outerGutter) return s;
      return { ...s, outerGutter: a.outerGutter };
    }

    case "MERGE_CELLS": {
      const check = canMergeSelection(s.panels, a.cells);
      if (!check.ok) return s;
      // Capture the top-left panel's override (if any) BEFORE merging,
      // since `mergePanels` mints a fresh id for the merged panel.
      const tl = findPanelByCoord(s.panels, check.rect.row, check.rect.col);
      const tlOverride =
        tl !== undefined ? s.letterOverrides[tl.id] : undefined;
      const nextPanels = mergePanels(s.panels, check.rect);
      // Drop overrides for panels that no longer exist (everyone in the
      // merged rect, including the top-left), then re-attach the captured
      // top-left override to the new merged panel id.
      const keptPanelIds = new Set(nextPanels.map((p) => p.id));
      let letterOverrides = filterOverrides(s.letterOverrides, keptPanelIds);
      if (tlOverride !== undefined) {
        // Safe: panels partition the grid, so at most one panel can match this exact rect.
        const merged = nextPanels.find(
          (p) =>
            p.row === check.rect.row &&
            p.col === check.rect.col &&
            p.rowSpan === check.rect.rowSpan &&
            p.colSpan === check.rect.colSpan,
        );
        if (merged !== undefined) {
          letterOverrides = { ...letterOverrides, [merged.id]: tlOverride };
        }
      }
      // Merge mints a fresh panel id; any free-form rects keyed by old ids
      // would dangle. Reverting to uniform is simpler than rect surgery.
      return {
        ...s,
        panels: nextPanels,
        letterOverrides,
        layout: uniformLayoutFor(s.rows, s.cols),
      };
    }

    case "UNMERGE_PANEL": {
      const next = unmergePanel(s.panels, a.panelId);
      if (next === s.panels) return s;
      const letterOverrides = deleteOverride(s.letterOverrides, a.panelId);
      // Same rationale as MERGE_CELLS: unmerged panels have fresh ids; revert
      // to uniform.
      return {
        ...s,
        panels: next,
        letterOverrides,
        layout: uniformLayoutFor(s.rows, s.cols),
      };
    }

    case "SET_PANEL_TRANSFORM": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.imageId === undefined) return s;
      const r = mapPanel(s.panels, a.panelId, (p) => ({
        ...p,
        transform: a.transform,
      }));
      return r.changed ? { ...s, panels: r.panels } : s;
    }

    case "SET_PANEL_FIT": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.transform === undefined) return s;
      if (target.transform.fit === a.fit) return s;
      const r = mapPanel(s.panels, a.panelId, (p) => {
        if (p.transform === undefined) return p;
        return {
          ...p,
          transform: {
            ...p.transform,
            fit: a.fit,
            panX: 0,
            panY: 0,
            zoom: 1,
          },
        };
      });
      return r.changed ? { ...s, panels: r.panels } : s;
    }

    case "ROTATE_PANEL_90": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.transform === undefined) return s;
      const r = mapPanel(s.panels, a.panelId, (p) => {
        if (p.transform === undefined) return p;
        const next = ((p.transform.rotation + 90) % 360) as Rotation;
        return {
          ...p,
          transform: {
            ...p.transform,
            rotation: next,
            // Reset pan to avoid landing outside the new clamp envelope.
            panX: 0,
            panY: 0,
          },
        };
      });
      if (!r.changed) return s;
      const next: FigureState = { ...s, panels: r.panels };
      const imgId = target.imageId;
      if (imgId === undefined) return next;
      return {
        ...next,
        annotations: relocateImageBoundAnnotations(next, imgId),
      };
    }

    case "FLIP_PANEL_H": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.transform === undefined) return s;
      const r = mapPanel(s.panels, a.panelId, (p) =>
        p.transform === undefined
          ? p
          : { ...p, transform: { ...p.transform, flipH: !p.transform.flipH } },
      );
      if (!r.changed) return s;
      const next: FigureState = { ...s, panels: r.panels };
      const imgId = target.imageId;
      if (imgId === undefined) return next;
      return {
        ...next,
        annotations: relocateImageBoundAnnotations(next, imgId),
      };
    }

    case "FLIP_PANEL_V": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.transform === undefined) return s;
      const r = mapPanel(s.panels, a.panelId, (p) =>
        p.transform === undefined
          ? p
          : { ...p, transform: { ...p.transform, flipV: !p.transform.flipV } },
      );
      if (!r.changed) return s;
      const next: FigureState = { ...s, panels: r.panels };
      const imgId = target.imageId;
      if (imgId === undefined) return next;
      return {
        ...next,
        annotations: relocateImageBoundAnnotations(next, imgId),
      };
    }

    case "RESET_PANEL_TRANSFORM": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.transform === undefined) return s;
      const r = mapPanel(s.panels, a.panelId, (p) =>
        p.transform === undefined ? p : { ...p, transform: DEFAULT_TRANSFORM },
      );
      return r.changed ? { ...s, panels: r.panels } : s;
    }

    case "SET_PANEL_CROP": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.transform === undefined) return s;
      // null is the explicit "remove crop" sentinel; we route it through the
      // RESET_PANEL_CROP path so the on-disk shape stays clean (no `crop` key).
      if (a.crop === null) {
        if (target.transform.crop === undefined) return s;
        const r = mapPanel(s.panels, a.panelId, (p) => {
          if (p.transform === undefined) return p;
          const { crop: _drop, ...rest } = p.transform;
          return { ...p, transform: rest };
        });
        return r.changed ? { ...s, panels: r.panels } : s;
      }
      if (!isValidCrop(a.crop)) return s;
      const existing = target.transform.crop;
      if (
        existing !== undefined &&
        existing.x === a.crop.x &&
        existing.y === a.crop.y &&
        existing.w === a.crop.w &&
        existing.h === a.crop.h
      ) {
        return s;
      }
      const nextCrop: PanelCrop = {
        x: a.crop.x,
        y: a.crop.y,
        w: a.crop.w,
        h: a.crop.h,
      };
      const r = mapPanel(s.panels, a.panelId, (p) =>
        p.transform === undefined
          ? p
          : { ...p, transform: { ...p.transform, crop: nextCrop } },
      );
      return r.changed ? { ...s, panels: r.panels } : s;
    }

    case "RESET_PANEL_CROP": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.transform === undefined) return s;
      if (target.transform.crop === undefined) return s;
      const r = mapPanel(s.panels, a.panelId, (p) => {
        if (p.transform === undefined) return p;
        const { crop: _drop, ...rest } = p.transform;
        return { ...p, transform: rest };
      });
      return r.changed ? { ...s, panels: r.panels } : s;
    }

    case "ADD_ANNOTATION": {
      const ann = a.annotation;
      // Dedup by id.
      if (s.annotations.some((x) => x.id === ann.id)) return s;
      // If anchored to a panel, that panel must exist.
      if (ann.panelId !== undefined) {
        const panel = findPanelById(s.panels, ann.panelId);
        if (panel === undefined) return s;
      }
      // Scale bars require a panelId, an image on that panel, and a
      // calibration on that image.
      if (ann.kind === "scalebar") {
        if (ann.panelId === undefined) return s;
        const panel = findPanelById(s.panels, ann.panelId);
        if (panel === undefined || panel.imageId === undefined) return s;
        const img = s.pool.find((p) => p.id === panel.imageId);
        if (img === undefined || img.calibration === undefined) return s;
      }
      return { ...s, annotations: [...s.annotations, ann] };
    }

    case "UPDATE_ANNOTATION": {
      const idx = s.annotations.findIndex((x) => x.id === a.annotationId);
      if (idx < 0) return s;
      const existing = s.annotations[idx]!;
      // Strip id/kind from the patch — they're immutable for a given annotation.
      const {
        id: _ignoredId,
        kind: _ignoredKind,
        ...rest
      } = a.patch as Partial<Annotation> & {
        id?: string;
        kind?: AnnotationKind;
      };
      // If the patch references a panelId, that panel must exist.
      if (typeof rest.panelId === "string") {
        const panel = findPanelById(s.panels, rest.panelId);
        if (panel === undefined) return s;
        // Scale bars require the new target panel to also have a calibrated image.
        if (existing.kind === "scalebar") {
          if (panel.imageId === undefined) return s;
          const img = s.pool.find((p) => p.id === panel.imageId);
          if (img === undefined || img.calibration === undefined) return s;
        }
      }
      const merged = { ...existing, ...rest } as Annotation;
      const next = s.annotations.slice();
      next[idx] = merged;
      return { ...s, annotations: next };
    }

    case "REMOVE_ANNOTATION": {
      if (!s.annotations.some((x) => x.id === a.annotationId)) return s;
      return {
        ...s,
        annotations: s.annotations.filter((x) => x.id !== a.annotationId),
      };
    }

    case "BULK_UPDATE_ANNOS": {
      if (a.ids.length === 0) return s;
      const idSet = new Set(a.ids);
      // Strip immutable fields. The patch is then narrowed per-kind below
      // by ALLOWED_BULK_KEYS so e.g. setting `stroke` on a text anno is dropped.
      const {
        id: _id,
        kind: _kind,
        ...rawPatch
      } = a.patch as Partial<Annotation> & {
        id?: string;
        kind?: AnnotationKind;
      };
      let touched = false;
      const next = s.annotations.map((existing) => {
        if (!idSet.has(existing.id)) return existing;
        const filteredPatch = filterPatchByKind(rawPatch, existing.kind);
        if (Object.keys(filteredPatch).length === 0) return existing;
        touched = true;
        return { ...existing, ...filteredPatch } as Annotation;
      });
      return touched ? { ...s, annotations: next } : s;
    }

    case "BULK_REMOVE_ANNOS": {
      if (a.ids.length === 0) return s;
      const idSet = new Set(a.ids);
      const next = s.annotations.filter((x) => !idSet.has(x.id));
      if (next.length === s.annotations.length) return s;
      return { ...s, annotations: next };
    }

    case "SET_LETTER_OVERRIDE": {
      if (a.override === null) {
        if (!(a.panelId in s.letterOverrides)) return s;
        return {
          ...s,
          letterOverrides: deleteOverride(s.letterOverrides, a.panelId),
        };
      }
      const normalized = normalizeOverride(a.override);
      // Empty override (no text, no style fields) collapses to a delete so
      // we never persist a useless `{}` entry — keeps the on-disk file lean
      // and the "is this letter overridden" check a simple `panelId in map`.
      if (normalized === null) {
        if (!(a.panelId in s.letterOverrides)) return s;
        return {
          ...s,
          letterOverrides: deleteOverride(s.letterOverrides, a.panelId),
        };
      }
      const existing = s.letterOverrides[a.panelId];
      if (existing !== undefined && overridesEqual(existing, normalized)) {
        return s;
      }
      return {
        ...s,
        letterOverrides: { ...s.letterOverrides, [a.panelId]: normalized },
      };
    }

    case "SET_LETTER_PATTERN": {
      if (s.letterPattern === a.pattern) return s;
      return { ...s, letterPattern: a.pattern };
    }

    case "CLEAR_ALL_LETTER_OVERRIDES": {
      if (Object.keys(s.letterOverrides).length === 0) return s;
      return { ...s, letterOverrides: {} };
    }

    case "SET_GLOBAL_STYLE": {
      const st = a.style;
      if (!isHexColor(st.letters.color)) return s;
      if (st.letters.bgColor !== undefined && !isHexColor(st.letters.bgColor))
        return s;
      if (!isHexColor(st.scalebar.color)) return s;
      if (!isHexColor(st.scalebar.barColor)) return s;
      // Clone sub-objects so we never store frozen references.
      return {
        ...s,
        globalStyle: {
          letters: { ...st.letters },
          scalebar: { ...st.scalebar },
        },
      };
    }

    case "SET_LETTERS_ENABLED": {
      if (s.globalStyle.letters.enabled === a.enabled) return s;
      return {
        ...s,
        globalStyle: {
          letters: { ...s.globalStyle.letters, enabled: a.enabled },
          scalebar: { ...s.globalStyle.scalebar },
        },
      };
    }

    case "SET_IMAGE_CALIBRATION": {
      const idx = s.pool.findIndex((p) => p.id === a.imageId);
      if (idx < 0) return s;
      const item = s.pool[idx]!;
      if (a.calibration === null) {
        if (item.calibration === undefined) return s;
        const next: ImagePoolItem = { ...item };
        delete next.calibration;
        const pool = s.pool.slice();
        pool[idx] = next;
        return { ...s, pool };
      }
      const ppu = a.calibration.pixelsPerUnit;
      if (!Number.isFinite(ppu) || ppu <= 0) return s;
      const next: ImagePoolItem = { ...item, calibration: a.calibration };
      const pool = s.pool.slice();
      pool[idx] = next;
      return { ...s, pool };
    }

    case "SET_PANEL_HIDDEN": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined) return s;
      // Hidden is exclusive with content: an image-bearing panel must
      // be unplaced first (the UI hides the Hide control in that state).
      if (target.imageId !== undefined) return s;
      const current = target.hidden ?? false;
      if (current === a.hidden) return s;
      const r = mapPanel(s.panels, a.panelId, (p) => {
        if (a.hidden) return { ...p, hidden: true };
        // Strip the field rather than storing `hidden: false` so the
        // serialized form stays clean (hidden is `?` ⇔ false).
        const { hidden: _h, ...rest } = p;
        return rest;
      });
      return r.changed ? { ...s, panels: r.panels } : s;
    }

    case "DELETE_PANEL": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined) return s;
      // Same content-exclusion rule as Hide.
      if (target.imageId !== undefined) return s;
      const panels = s.panels.filter((p) => p.id !== a.panelId);
      // Drop the per-panel letter override and any annotations anchored
      // to this panel (text/symbol/box keyed by panelId, plus scale bars
      // — though scale bars require an image and so won't appear here).
      const letterOverrides = deleteOverride(s.letterOverrides, a.panelId);
      const annotations = s.annotations.filter(
        (an) => an.panelId !== a.panelId,
      );
      // Drop the deleted panel's rect entry from a free layout; uniform
      // layouts don't need touching.
      const layout: GridLayout =
        s.layout.kind === "free" && a.panelId in s.layout.rects
          ? { kind: "free", rects: omitKey(s.layout.rects, a.panelId) }
          : s.layout;
      return { ...s, panels, letterOverrides, annotations, layout };
    }

    case "RESTORE_PANEL_AT": {
      if (
        !Number.isInteger(a.row) ||
        !Number.isInteger(a.col) ||
        a.row < 0 ||
        a.col < 0 ||
        a.row >= s.rows ||
        a.col >= s.cols
      ) {
        return s;
      }
      // No-op if the cell is already covered.
      if (findPanelAt(s.panels, a.row, a.col) !== null) return s;
      const fresh: Panel = {
        id: newPanelId(),
        row: a.row,
        col: a.col,
        rowSpan: 1,
        colSpan: 1,
      };
      // Keep the array sorted in row-major order so iteration order is
      // stable for letter-label derivation and rendering.
      const panels = [...s.panels, fresh].sort(
        (p, q) => p.row - q.row || p.col - q.col,
      );
      // A fresh panel has no entry in a free-form rects map; revert to
      // uniform so the renderer has something to draw.
      const layout: GridLayout =
        s.layout.kind === "free" ? uniformLayoutFor(s.rows, s.cols) : s.layout;
      return { ...s, panels, layout };
    }

    case "RESET_TO_STATE": {
      return a.state;
    }

    case "RESET_FIGURE":
      return initialFigureState();

    case "SET_TRACK_WEIGHT": {
      if (s.layout.kind !== "uniform") return s;
      const cur = a.axis === "col" ? s.layout.colWeights : s.layout.rowWeights;
      const next = setTrackWeight(cur, a.index, a.weight);
      // setTrackWeight returns a copy even on no-op; compare values to keep
      // the ===-same-state contract for memoization.
      if (next.length === cur.length && next.every((v, i) => v === cur[i])) {
        return s;
      }
      const layout: GridLayout =
        a.axis === "col"
          ? { ...s.layout, colWeights: next }
          : { ...s.layout, rowWeights: next };
      return { ...s, layout };
    }

    case "RESIZE_PANEL_FREEFORM": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined) return s;

      // Uniform mode: corner-drag adjusts the col/row track weights so the
      // entire gutter line moves uniformly across the figure. Stair-step
      // layouts and gutter invasion are impossible by construction — every
      // gutter stays at the configured `gutterPx`. This is the common path
      // for new projects and the only path users hit going forward.
      if (s.layout.kind === "uniform") {
        const availW =
          a.canvas.widthPx -
          s.gutterPx * ((s.outerGutter ? 2 : 0) + (s.cols - 1));
        const availH =
          a.canvas.heightPx -
          s.gutterPx * ((s.outerGutter ? 2 : 0) + (s.rows - 1));
        const r = resizePanelUniform(
          s.layout.colWeights,
          s.layout.rowWeights,
          target,
          a.corner,
          a.dx,
          a.dy,
          availW,
          availH,
        );
        if (
          r.colWeights === s.layout.colWeights &&
          r.rowWeights === s.layout.rowWeights
        ) {
          return s;
        }
        return {
          ...s,
          layout: {
            kind: "uniform",
            colWeights: r.colWeights,
            rowWeights: r.rowWeights,
          },
        };
      }

      // Legacy free-form layouts (saved from the brief window where corner-
      // drag converted to free): keep the rect-cascade behavior so the user
      // can still adjust those projects. New corner-drags from uniform stay
      // uniform per the branch above.
      const r = resizePanelFreeform(
        s.layout.rects,
        a.panelId,
        a.corner,
        a.dx,
        a.dy,
      );
      if (r.applied.dx === 0 && r.applied.dy === 0) {
        return s;
      }
      return { ...s, layout: { kind: "free", rects: r.rects } };
    }

    case "RESET_TO_UNIFORM_GRID": {
      const fresh = uniformLayoutFor(s.rows, s.cols);
      if (
        s.layout.kind === "uniform" &&
        fresh.kind === "uniform" &&
        arraysEqual(s.layout.colWeights, fresh.colWeights) &&
        arraysEqual(s.layout.rowWeights, fresh.rowWeights)
      ) {
        return s;
      }
      return { ...s, layout: fresh };
    }

    default: {
      // Exhaustiveness guard: TS errors here if a new FigureAction variant is
      // added to the union but not handled in the switch above.
      const _exhaustive: never = a;
      return s;
    }
  }
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function omitKey<T>(map: Record<string, T>, key: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k in map) if (k !== key) out[k] = map[k]!;
  return out;
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  const i = Math.round(n);
  return Math.max(lo, Math.min(hi, i));
}

function isHexColor(s: string): boolean {
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s);
}

/**
 * Return a fresh letterOverrides object containing only entries whose key
 * is in `keepIds`. Always allocates a new object.
 */
function filterOverrides(
  overrides: Record<string, LetterOverride>,
  keepIds: Set<string>,
): Record<string, LetterOverride> {
  const out: Record<string, LetterOverride> = {};
  for (const k in overrides) {
    if (keepIds.has(k)) out[k] = overrides[k]!;
  }
  return out;
}

/**
 * Return a fresh letterOverrides object with `panelId` removed.
 */
function deleteOverride(
  overrides: Record<string, LetterOverride>,
  panelId: string,
): Record<string, LetterOverride> {
  const out: Record<string, LetterOverride> = {};
  for (const k in overrides) {
    if (k !== panelId) out[k] = overrides[k]!;
  }
  return out;
}

/**
 * Strip empty string/object substructure from an override so we don't persist
 * meaningless entries. Returns null when the override carries no actual data
 * (no text, no style fields). Always allocates fresh objects.
 */
function normalizeOverride(o: LetterOverride): LetterOverride | null {
  const out: LetterOverride = {};
  if (typeof o.text === "string" && o.text.length > 0) out.text = o.text;
  if (o.style !== undefined) {
    const s: NonNullable<LetterOverride["style"]> = {};
    let any = false;
    if (o.style.color !== undefined) {
      s.color = o.style.color;
      any = true;
    }
    if (o.style.bgColor !== undefined) {
      s.bgColor = o.style.bgColor;
      any = true;
    }
    if (o.style.font !== undefined) {
      s.font = o.style.font;
      any = true;
    }
    if (o.style.sizePt !== undefined) {
      s.sizePt = o.style.sizePt;
      any = true;
    }
    if (o.style.bold !== undefined) {
      s.bold = o.style.bold;
      any = true;
    }
    if (o.style.italic !== undefined) {
      s.italic = o.style.italic;
      any = true;
    }
    if (any) out.style = s;
  }
  if (out.text === undefined && out.style === undefined) return null;
  return out;
}

/**
 * Shallow-equal compare for two normalized overrides. Used to short-circuit
 * the reducer to a `===` no-op when nothing actually changed (preserves the
 * memoization contract documented in CLAUDE.md).
 */
function overridesEqual(a: LetterOverride, b: LetterOverride): boolean {
  if (a.text !== b.text) return false;
  const sa = a.style;
  const sb = b.style;
  if (sa === undefined && sb === undefined) return true;
  if (sa === undefined || sb === undefined) return false;
  return (
    sa.color === sb.color &&
    sa.bgColor === sb.bgColor &&
    sa.font === sb.font &&
    sa.sizePt === sb.sizePt &&
    sa.bold === sb.bold &&
    sa.italic === sb.italic
  );
}

/**
 * Locate a panel by its top-left coordinate (used by MERGE_CELLS to read
 * the top-left's override before the panel is replaced by a fresh-id merge).
 */
function findPanelByCoord(
  panels: readonly Panel[],
  row: number,
  col: number,
): Panel | undefined {
  return panels.find((p) => p.row === row && p.col === col);
}

/**
 * Per-kind allowlist of mutable patch keys for BULK_UPDATE_ANNOS. We keep
 * this narrow on purpose: bulk forms only ever expose style fields that are
 * unambiguous across multiple selected annos (color, stroke, font, size).
 * Geometry fields (x/y/w/h, panelId, anchors) and identity (id, kind) are
 * excluded — bulk *drag* goes through individual UPDATE_ANNOTATION dispatches
 * which handle re-anchoring per anno.
 */
const ALLOWED_BULK_KEYS: Record<AnnotationKind, ReadonlySet<string>> = {
  text: new Set(["color", "bgColor", "font", "sizePt", "bold", "italic"]),
  symbol: new Set([
    "color",
    "strokeWidthPx",
    "sizePx",
    "symbolId",
    "rotationDeg",
    "fillMode",
    "strokeStyle",
  ]),
  scalebar: new Set(["lengthValue", "lengthUnit", "cornerOverride"]),
  // letters are derived; bulk-update is a no-op for now (spec 08 may revisit).
  letter: new Set(),
};

function filterPatchByKind(
  patch: Record<string, unknown>,
  kind: AnnotationKind,
): Record<string, unknown> {
  const allowed = ALLOWED_BULK_KEYS[kind];
  const out: Record<string, unknown> = {};
  for (const k in patch) {
    if (allowed.has(k)) out[k] = patch[k];
  }
  return out;
}
