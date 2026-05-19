/**
 * Curated symbol library. Each symbol is one Path2D-compatible string in
 * a 100×100 design viewport centered at (50, 50). The renderer translates
 * to the annotation's (x, y), rotates, scales by sizePx/100, then translates
 * by -50,-50 so the symbol's center sits at the user's anchor point.
 *
 * `geometry: "closed"` symbols are paths that bound a region — they may be
 * filled OR stroked at draw time, controlled per-annotation by `fillMode`.
 * `geometry: "stroke-only"` symbols are open strokes — the picker disables
 * the Filled toggle for these and the renderer always strokes them.
 *
 * "Right"-orientation convention: arrows point at +x. The user picks
 * rotation independently (0 = library default).
 */

import type { FillMode, StrokeStyle } from "../model/annotations";

export interface SymbolDef {
  /** Stable id; persisted in `.mosaic` files. */
  id: string;
  /** Human label shown in the picker tooltip. */
  label: string;
  /** Path data in a 100×100 viewport centered at (50, 50). */
  pathD: string;
  /**
   * "closed" — path forms a closed region; supports both fill and stroke.
   * "stroke-only" — path is an open stroke; the picker disables the Filled
   * toggle and the renderer falls back to outlined rendering if asked to fill.
   */
  geometry: "closed" | "stroke-only";
}

export const SYMBOL_LIBRARY: readonly SymbolDef[] = [
  // Arrows
  {
    id: "arrow-open-right",
    label: "Open arrow",
    geometry: "stroke-only",
    pathD: "M 15 50 L 75 50 M 75 50 L 60 35 M 75 50 L 60 65",
  },
  {
    id: "arrow-filled-right",
    label: "Filled arrow",
    geometry: "closed",
    pathD: "M 15 45 L 65 45 L 65 30 L 85 50 L 65 70 L 65 55 L 15 55 Z",
  },
  {
    id: "arrow-line-right",
    label: "Line",
    geometry: "stroke-only",
    pathD: "M 15 50 L 85 50",
  },
  {
    id: "arrow-double-right",
    label: "Double arrow",
    geometry: "stroke-only",
    pathD: "M 15 50 L 75 50 M 60 35 L 75 50 L 60 65 M 45 35 L 60 50 L 45 65",
  },
  {
    id: "arrow-thin-right",
    label: "Thin arrow",
    geometry: "closed",
    pathD: "M 15 48 L 70 48 L 70 38 L 85 50 L 70 62 L 70 52 L 15 52 Z",
  },
  {
    id: "arrow-thick-right",
    label: "Thick arrow",
    geometry: "closed",
    pathD: "M 15 38 L 60 38 L 60 20 L 90 50 L 60 80 L 60 62 L 15 62 Z",
  },

  // Shapes — existing 8
  {
    id: "shape-circle",
    label: "Circle",
    geometry: "closed",
    pathD: "M 85 50 A 35 35 0 1 1 15 50 A 35 35 0 1 1 85 50 Z",
  },
  {
    id: "shape-square",
    label: "Square",
    geometry: "closed",
    pathD: "M 15 15 L 85 15 L 85 85 L 15 85 Z",
  },
  {
    id: "shape-triangle",
    label: "Triangle",
    geometry: "closed",
    pathD: "M 50 15 L 85 80 L 15 80 Z",
  },
  {
    id: "shape-diamond",
    label: "Diamond",
    geometry: "closed",
    pathD: "M 50 15 L 85 50 L 50 85 L 15 50 Z",
  },
  {
    id: "shape-star",
    label: "Star",
    geometry: "closed",
    pathD:
      "M 50 15 L 60 40 L 87 40 L 65 57 L 73 84 L 50 68 L 27 84 L 35 57 L 13 40 L 40 40 Z",
  },
  {
    id: "shape-plus",
    label: "Plus",
    geometry: "closed",
    pathD:
      "M 42 20 L 58 20 L 58 42 L 80 42 L 80 58 L 58 58 L 58 80 L 42 80 L 42 58 L 20 58 L 20 42 L 42 42 Z",
  },
  {
    id: "shape-cross",
    label: "Cross (X)",
    geometry: "closed",
    pathD:
      "M 22 30 L 30 22 L 50 42 L 70 22 L 78 30 L 58 50 L 78 70 L 70 78 L 50 58 L 30 78 L 22 70 L 42 50 Z",
  },
  {
    id: "shape-asterisk",
    label: "Asterisk",
    geometry: "stroke-only",
    pathD: "M 20 50 L 80 50 M 50 20 L 50 80 M 28 28 L 72 72 M 72 28 L 28 72",
  },

  // Shapes — new 12
  {
    id: "shape-hexagon",
    label: "Hexagon",
    geometry: "closed",
    pathD: "M 25 22 L 75 22 L 90 50 L 75 78 L 25 78 L 10 50 Z",
  },
  {
    id: "shape-pentagon",
    label: "Pentagon",
    geometry: "closed",
    pathD: "M 50 12 L 88 40 L 73 84 L 27 84 L 12 40 Z",
  },
  {
    id: "shape-octagon",
    label: "Octagon",
    geometry: "closed",
    pathD: "M 32 12 L 68 12 L 88 32 L 88 68 L 68 88 L 32 88 L 12 68 L 12 32 Z",
  },
  {
    id: "shape-oval",
    label: "Oval",
    geometry: "closed",
    pathD: "M 90 50 A 40 28 0 1 1 10 50 A 40 28 0 1 1 90 50 Z",
  },
  {
    id: "shape-rounded-square",
    label: "Rounded square",
    geometry: "closed",
    pathD:
      "M 25 15 L 75 15 Q 85 15 85 25 L 85 75 Q 85 85 75 85 L 25 85 Q 15 85 15 75 L 15 25 Q 15 15 25 15 Z",
  },
  {
    id: "shape-parallelogram",
    label: "Parallelogram",
    geometry: "closed",
    pathD: "M 25 20 L 90 20 L 75 80 L 10 80 Z",
  },
  {
    id: "shape-trapezoid",
    label: "Trapezoid",
    geometry: "closed",
    pathD: "M 25 20 L 75 20 L 90 80 L 10 80 Z",
  },
  {
    id: "shape-right-triangle",
    label: "Right triangle",
    geometry: "closed",
    pathD: "M 15 15 L 85 85 L 15 85 Z",
  },
  {
    id: "shape-heart",
    label: "Heart",
    geometry: "closed",
    pathD:
      "M 50 82 C 18 60 18 28 38 28 C 46 28 50 36 50 40 C 50 36 54 28 62 28 C 82 28 82 60 50 82 Z",
  },
  {
    id: "shape-lightning",
    label: "Lightning",
    geometry: "closed",
    pathD: "M 55 10 L 25 55 L 45 55 L 35 90 L 70 40 L 50 40 L 60 10 Z",
  },
  {
    id: "shape-speech-bubble",
    label: "Speech bubble",
    geometry: "closed",
    pathD:
      "M 20 20 L 80 20 Q 90 20 90 30 L 90 60 Q 90 70 80 70 L 50 70 L 35 88 L 38 70 L 20 70 Q 10 70 10 60 L 10 30 Q 10 20 20 20 Z",
  },
  {
    id: "shape-chevron",
    label: "Chevron",
    geometry: "closed",
    pathD: "M 20 20 L 50 20 L 80 50 L 50 80 L 20 80 L 50 50 Z",
  },
];

export const SYMBOL_LIBRARY_BY_ID: ReadonlyMap<string, SymbolDef> = new Map(
  SYMBOL_LIBRARY.map((d) => [d.id, d]),
);

export const DEFAULT_SYMBOL_ID = "arrow-filled-right";
export const DEFAULT_FILL_MODE: FillMode = "filled";
export const DEFAULT_STROKE_STYLE: StrokeStyle = "solid";
export const DEFAULT_SYMBOL_COLOR = "#000000";
export const DEFAULT_SYMBOL_STROKE = 2;
