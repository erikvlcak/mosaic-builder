import type { ImagePoolItem, Calibration } from "./pool";
import type { Panel, PanelTransform, FitMode, Rotation } from "./panels";
import { DEFAULT_TRANSFORM } from "./panels";
import type { FigureState } from "./figure-state";
import { resizePanels } from "./grid-resize";
import { canMergeSelection, mergePanels, unmergePanel, type CellCoord } from "./merge";
import type { Annotation, AnnotationKind } from "./annotations";
import type { GlobalAnnoStyle } from "./global-style";

export type FigureAction =
  | { type: "ADD_TO_POOL"; item: ImagePoolItem }
  | { type: "PLACE_INTO_PANEL"; imageId: string; panelId: string }
  | { type: "SWAP_PANELS"; aPanelId: string; bPanelId: string }
  | { type: "REPLACE_INTO_PANEL"; imageId: string; panelId: string }
  | { type: "REMOVE_FROM_POOL"; imageId: string }
  | { type: "RESIZE_GRID"; rows: number; cols: number }
  | { type: "SET_GUTTER_PX"; gutterPx: number }
  | { type: "SET_GUTTER_COLOR"; gutterColor: string }
  | { type: "MERGE_CELLS"; cells: CellCoord[] }
  | { type: "UNMERGE_PANEL"; panelId: string }
  | { type: "SET_PANEL_TRANSFORM"; panelId: string; transform: PanelTransform }
  | { type: "SET_PANEL_FIT"; panelId: string; fit: FitMode }
  | { type: "ROTATE_PANEL_90"; panelId: string }
  | { type: "FLIP_PANEL_H"; panelId: string }
  | { type: "FLIP_PANEL_V"; panelId: string }
  | { type: "RESET_PANEL_TRANSFORM"; panelId: string }
  | { type: "ADD_ANNOTATION"; annotation: Annotation }
  | { type: "UPDATE_ANNOTATION"; annotationId: string; patch: Partial<Annotation> }
  | { type: "REMOVE_ANNOTATION"; annotationId: string }
  | { type: "SET_LETTER_OVERRIDE"; panelId: string; override: string | null }
  | { type: "SET_GLOBAL_STYLE"; style: GlobalAnnoStyle }
  | { type: "SET_LETTERS_ENABLED"; enabled: boolean }
  | { type: "SET_IMAGE_CALIBRATION"; imageId: string; calibration: Calibration | null }
  | { type: "RESET_TO_STATE"; state: FigureState };

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
export const setLetterOverride = (
  panelId: string,
  override: string | null,
): FigureAction => ({ type: "SET_LETTER_OVERRIDE", panelId, override });
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
export const resetToState = (state: FigureState): FigureAction => ({
  type: "RESET_TO_STATE",
  state,
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
        : { ...p, imageId, transform: DEFAULT_TRANSFORM }
      : p,
  );
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
  return { ...p, imageId, transform };
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
      return { ...s, panels: next };
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
      return { ...s, panels: setPanelImage(s.panels, a.panelId, a.imageId) };
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
      const annotations =
        affectedPanelIds.size === 0
          ? s.annotations
          : s.annotations.filter(
              (an) =>
                !(an.kind === "scalebar" && affectedPanelIds.has(an.panelId)),
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
      return { ...s, rows, cols, panels: r.panels, letterOverrides };
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
      return { ...s, panels: nextPanels, letterOverrides };
    }

    case "UNMERGE_PANEL": {
      const next = unmergePanel(s.panels, a.panelId);
      if (next === s.panels) return s;
      const letterOverrides = deleteOverride(s.letterOverrides, a.panelId);
      return { ...s, panels: next, letterOverrides };
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
      return r.changed ? { ...s, panels: r.panels } : s;
    }

    case "FLIP_PANEL_H": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.transform === undefined) return s;
      const r = mapPanel(s.panels, a.panelId, (p) =>
        p.transform === undefined
          ? p
          : { ...p, transform: { ...p.transform, flipH: !p.transform.flipH } },
      );
      return r.changed ? { ...s, panels: r.panels } : s;
    }

    case "FLIP_PANEL_V": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.transform === undefined) return s;
      const r = mapPanel(s.panels, a.panelId, (p) =>
        p.transform === undefined
          ? p
          : { ...p, transform: { ...p.transform, flipV: !p.transform.flipV } },
      );
      return r.changed ? { ...s, panels: r.panels } : s;
    }

    case "RESET_PANEL_TRANSFORM": {
      const target = findPanelById(s.panels, a.panelId);
      if (target === undefined || target.transform === undefined) return s;
      const r = mapPanel(s.panels, a.panelId, (p) =>
        p.transform === undefined ? p : { ...p, transform: DEFAULT_TRANSFORM },
      );
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _ignoredId, kind: _ignoredKind, ...rest } = a.patch as Partial<Annotation> & {
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

    case "SET_LETTER_OVERRIDE": {
      if (a.override === null) {
        if (!(a.panelId in s.letterOverrides)) return s;
        return { ...s, letterOverrides: deleteOverride(s.letterOverrides, a.panelId) };
      }
      if (s.letterOverrides[a.panelId] === a.override) return s;
      return {
        ...s,
        letterOverrides: { ...s.letterOverrides, [a.panelId]: a.override },
      };
    }

    case "SET_GLOBAL_STYLE": {
      const st = a.style;
      if (!isHexColor(st.letters.color)) return s;
      if (st.letters.bgColor !== undefined && !isHexColor(st.letters.bgColor)) return s;
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

    case "RESET_TO_STATE": {
      return a.state;
    }

    default: {
      // Exhaustiveness guard: TS errors here if a new FigureAction variant is
      // added to the union but not handled in the switch above.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _exhaustive: never = a;
      return s;
    }
  }
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
  overrides: Record<string, string>,
  keepIds: Set<string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k in overrides) {
    if (keepIds.has(k)) out[k] = overrides[k]!;
  }
  return out;
}

/**
 * Return a fresh letterOverrides object with `panelId` removed.
 */
function deleteOverride(
  overrides: Record<string, string>,
  panelId: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k in overrides) {
    if (k !== panelId) out[k] = overrides[k]!;
  }
  return out;
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
