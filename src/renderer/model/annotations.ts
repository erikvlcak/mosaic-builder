/**
 * M6 annotation model. All coordinates are in figure-canvas px (top-left
 * origin). The user-facing `Annotation` discriminated union has 4 kinds;
 * `LetterAnnotation` is a derived (resolved) shape produced by
 * `figure-derivations` from `letterOverrides` + grid position, and is not
 * directly editable.
 *
 * `AnnotationKind` includes `"letter"` so derived letters share the same
 * `BaseAnnotation` shape; the user-creatable `Annotation` union below
 * narrows to the 4 editable kinds.
 */

import type { Corner } from "./global-style";

export type AnnotationKind = "text" | "arrow" | "box" | "scalebar" | "letter"; // "letter" is derived-only — not in user-facing Annotation union

export interface BaseAnnotation {
  /** crypto.randomUUID() */
  id: string;
  /**
   * Omit for figure-global text/arrows/boxes. Scale bars REQUIRE panelId
   * (calibration is per-image-on-panel); letters are always per-panel.
   */
  panelId?: string;
  /** Higher draws on top; ties broken by array index. */
  z: number;
  kind: AnnotationKind;
}

export interface TextAnnotation extends BaseAnnotation {
  kind: "text";
  /** figure-canvas px (top-left origin). Anchored at the text's top-left. */
  x: number;
  y: number;
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

export interface ArrowAnnotation extends BaseAnnotation {
  kind: "arrow";
  /** figure-canvas px endpoints. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  thicknessPx: number;
  head: "none" | "open" | "filled";
}

export interface BoxAnnotation extends BaseAnnotation {
  kind: "box";
  /** figure-canvas px (top-left + size). */
  x: number;
  y: number;
  w: number;
  h: number;
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
  | ArrowAnnotation
  | BoxAnnotation
  | ScaleBarAnnotation;
