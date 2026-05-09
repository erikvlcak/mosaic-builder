/**
 * M6 annotation model. All coordinates are in figure-canvas px (top-left
 * origin). The user-facing `Annotation` discriminated union has 4
 * user-creatable kinds — text/symbol/box/scalebar; `LetterAnnotation` is a
 * derived (resolved) shape produced by `figure-derivations` from
 * `letterOverrides` + grid position, and is not directly editable.
 *
 * `AnnotationKind` includes `"letter"` so derived letters share the same
 * `BaseAnnotation` shape; the user-creatable `Annotation` union below
 * narrows to the 4 editable kinds.
 */

import type { Corner } from "./global-style";

export type AnnotationKind = "text" | "symbol" | "box" | "scalebar" | "letter"; // "letter" is derived-only — not in user-facing Annotation union

export interface BaseAnnotation {
  /** crypto.randomUUID() */
  id: string;
  /**
   * Omit for figure-global text/symbols/boxes. Scale bars REQUIRE panelId
   * (calibration is per-image-on-panel); letters are always per-panel.
   */
  panelId?: string;
  /**
   * When set, this annotation is bound to the image with this id and
   * follows it to whatever panel currently holds it. The relocator
   * (`relocateImageBoundAnnotations`) keeps `panelId` and the kind-specific
   * geometry (`x/y/w/h`/center) in sync with the bound image's current
   * panel + transform on each move/rotate/flip. If the image is unplaced
   * or removed, image-bound annotations are dropped. Letters never carry
   * an `imageId`; scale bars optionally do (their meaningful binding is
   * the calibration on the image underneath).
   */
  imageId?: string;
  /** Higher draws on top; ties broken by array index. */
  z: number;
  kind: AnnotationKind;
}

/**
 * Source-image anchor for one point of an image-bound annotation. Stored
 * as a 0..1 fraction of the image's source extent so it survives rotation,
 * flip, and resize: 0,0 is image top-left in source-pixel space, 1,1 is
 * image bottom-right. We re-project this through the panel's current
 * transform to recompute figure-px on each move.
 */
export interface ImageAnchor {
  imgU: number;
  imgV: number;
}

export interface TextAnnotation extends BaseAnnotation {
  kind: "text";
  /** figure-canvas px (top-left origin). Anchored at the text's top-left. */
  x: number;
  y: number;
  /**
   * Image-anchor for the text's top-left, in 0..1 source-image space.
   * Present iff `imageId` is set; the relocator uses it to reproject `x/y`
   * when the image moves to a new panel.
   */
  anchor?: ImageAnchor;
  text: string;
  /** CSS font-family. */
  font: string;
  /** Points; converted to px via dpi at draw time (px = pt * dpi/72). */
  sizePt: number;
  bold: boolean;
  italic: boolean;
  /** "#RRGGBB" or "#RRGGBBAA". */
  color: string;
  /** Optional pad-rect fill. */
  bgColor?: string;
}

export interface SymbolAnnotation extends BaseAnnotation {
  kind: "symbol";
  /** Id into SYMBOL_LIBRARY (see src/renderer/symbols/library.ts). */
  symbolId: string;
  /** Anchor (center of the symbol) in figure-canvas px. */
  x: number;
  y: number;
  /**
   * Image-anchor for the symbol's center, in 0..1 source-image space.
   * Present iff `imageId` is set; the relocator uses it to reproject `x/y`
   * when the image moves to a new panel.
   */
  anchor?: ImageAnchor;
  /** The larger of width/height in figure-canvas px. Square hit-rect side. */
  sizePx: number;
  /** Degrees clockwise. 0 = library default orientation. */
  rotationDeg: number;
  color: string;
  /** Stroke width for stroke-only symbols. Ignored at draw time for filled symbols. */
  strokeWidthPx: number;
}

export interface BoxAnnotation extends BaseAnnotation {
  kind: "box";
  /** figure-canvas px (top-left + size). */
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Image-anchors for the box's top-left and bottom-right corners.
   * Present iff `imageId` is set. We anchor opposite corners (rather than
   * top-left + size) so rotation re-projects correctly: a box rotated 90°
   * with the panel keeps its on-image footprint.
   */
  anchor1?: ImageAnchor;
  anchor2?: ImageAnchor;
  stroke: string;
  strokeWidthPx: number;
  fill?: string;
}

export interface ScaleBarAnnotation extends BaseAnnotation {
  kind: "scalebar";
  /** REQUIRED — calibration is per-image-on-panel. */
  panelId: string;
  /** Bar length in `lengthUnit`. e.g. 50, 100, 1.0. */
  lengthValue: number;
  lengthUnit: "um" | "mm" | "px";
  /** Override globalStyle.scalebar.corner just for this instance. */
  cornerOverride?: Corner;
}

/**
 * Derived (resolved) per-panel letter label. Not user-creatable; produced
 * by `figure-derivations` from `letterOverrides` + cell position.
 */
export interface LetterAnnotation extends BaseAnnotation {
  kind: "letter";
  panelId: string;
  /** Resolved: override || cellLabel(...). */
  text: string;
}

/** User-creatable annotations. `LetterAnnotation` is derived, not in this union. */
export type Annotation =
  | TextAnnotation
  | SymbolAnnotation
  | BoxAnnotation
  | ScaleBarAnnotation;
