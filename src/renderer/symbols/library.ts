/**
 * Curated symbol library. Each symbol is one Path2D-compatible string in
 * a 100×100 design viewport centered at (50, 50). The renderer translates
 * to the annotation's (x, y), rotates, scales by sizePx/100, then translates
 * by -50,-50 so the symbol's center sits at the user's anchor point.
 *
 * fill=true symbols are painted with ctx.fill(path) and use the annotation
 * color for fill. fill=false symbols are stroked with ctx.stroke(path) and
 * use strokeWidthPx; the renderer divides strokeWidthPx by the path scale
 * so stroke width is constant in figure-px regardless of sizePx.
 *
 * "Right"-orientation convention: arrows point at +x, brackets open to the
 * right. The user picks rotation independently (0 = library default).
 */

export type SymbolCategory = "arrow" | "shape" | "marker" | "bracket";

export const SYMBOL_CATEGORIES: readonly SymbolCategory[] = [
  "arrow",
  "shape",
  "marker",
  "bracket",
] as const;

export interface SymbolDef {
  /** Stable id; persisted in `.mosaic` files. */
  id: string;
  /** Human label shown in the gallery. */
  label: string;
  category: SymbolCategory;
  /** Path data in a 100×100 viewport centered at (50, 50). */
  pathD: string;
  /** True → ctx.fill(path); false → ctx.stroke(path). */
  fill: boolean;
}

export const SYMBOL_LIBRARY: readonly SymbolDef[] = [
  // Arrow
  {
    id: "arrow-open-right",
    label: "Open arrow",
    category: "arrow",
    fill: false,
    pathD: "M 15 50 L 75 50 M 75 50 L 60 35 M 75 50 L 60 65",
  },
  {
    id: "arrow-filled-right",
    label: "Filled arrow",
    category: "arrow",
    fill: true,
    pathD: "M 15 45 L 65 45 L 65 30 L 85 50 L 65 70 L 65 55 L 15 55 Z",
  },
  {
    id: "arrow-line-right",
    label: "Line",
    category: "arrow",
    fill: false,
    pathD: "M 15 50 L 85 50",
  },
  {
    id: "arrow-double-right",
    label: "Double arrow",
    category: "arrow",
    fill: false,
    pathD: "M 15 50 L 75 50 M 60 35 L 75 50 L 60 65 M 45 35 L 60 50 L 45 65",
  },
  {
    id: "arrow-thin-right",
    label: "Thin arrow",
    category: "arrow",
    fill: true,
    pathD: "M 15 48 L 70 48 L 70 38 L 85 50 L 70 62 L 70 52 L 15 52 Z",
  },
  {
    id: "arrow-thick-right",
    label: "Thick arrow",
    category: "arrow",
    fill: true,
    pathD: "M 15 38 L 60 38 L 60 20 L 90 50 L 60 80 L 60 62 L 15 62 Z",
  },

  // Shape
  {
    id: "shape-circle",
    label: "Circle",
    category: "shape",
    fill: true,
    pathD: "M 85 50 A 35 35 0 1 1 15 50 A 35 35 0 1 1 85 50 Z",
  },
  {
    id: "shape-square",
    label: "Square",
    category: "shape",
    fill: true,
    pathD: "M 15 15 L 85 15 L 85 85 L 15 85 Z",
  },
  {
    id: "shape-triangle",
    label: "Triangle",
    category: "shape",
    fill: true,
    pathD: "M 50 15 L 85 80 L 15 80 Z",
  },
  {
    id: "shape-diamond",
    label: "Diamond",
    category: "shape",
    fill: true,
    pathD: "M 50 15 L 85 50 L 50 85 L 15 50 Z",
  },
  {
    id: "shape-star",
    label: "Star",
    category: "shape",
    fill: true,
    pathD:
      "M 50 15 L 60 40 L 87 40 L 65 57 L 73 84 L 50 68 L 27 84 L 35 57 L 13 40 L 40 40 Z",
  },
  {
    id: "shape-plus",
    label: "Plus",
    category: "shape",
    fill: true,
    pathD:
      "M 42 20 L 58 20 L 58 42 L 80 42 L 80 58 L 58 58 L 58 80 L 42 80 L 42 58 L 20 58 L 20 42 L 42 42 Z",
  },
  {
    id: "shape-cross",
    label: "Cross (X)",
    category: "shape",
    fill: true,
    pathD:
      "M 22 30 L 30 22 L 50 42 L 70 22 L 78 30 L 58 50 L 78 70 L 70 78 L 50 58 L 30 78 L 22 70 L 42 50 Z",
  },
  {
    id: "shape-asterisk",
    label: "Asterisk",
    category: "shape",
    fill: true,
    pathD:
      "M 47 20 L 53 20 L 53 47 L 80 47 L 80 53 L 53 53 L 53 80 L 47 80 L 47 53 L 20 53 L 20 47 L 47 47 Z M 31 27 L 35 23 L 54 42 L 50 46 Z M 65 23 L 69 27 L 50 46 L 46 42 Z M 31 73 L 27 69 L 46 50 L 50 54 Z M 65 77 L 69 73 L 50 54 L 46 58 Z",
  },

  // Marker
  {
    id: "marker-dot",
    label: "Dot",
    category: "marker",
    fill: true,
    pathD: "M 65 50 A 15 15 0 1 1 35 50 A 15 15 0 1 1 65 50 Z",
  },
  {
    id: "marker-ring",
    label: "Ring",
    category: "marker",
    fill: false,
    pathD: "M 65 50 A 15 15 0 1 1 35 50 A 15 15 0 1 1 65 50 Z",
  },
  {
    id: "marker-tick",
    label: "Tick",
    category: "marker",
    fill: false,
    pathD: "M 25 55 L 45 75 L 80 30",
  },
  {
    id: "marker-x",
    label: "X",
    category: "marker",
    fill: false,
    pathD: "M 25 25 L 75 75 M 75 25 L 25 75",
  },

  // Bracket
  {
    id: "bracket-curly-left",
    label: "Curly {",
    category: "bracket",
    fill: false,
    pathD: "M 60 15 Q 40 15 40 35 Q 40 50 30 50 Q 40 50 40 65 Q 40 85 60 85",
  },
  {
    id: "bracket-curly-right",
    label: "Curly }",
    category: "bracket",
    fill: false,
    pathD: "M 40 15 Q 60 15 60 35 Q 60 50 70 50 Q 60 50 60 65 Q 60 85 40 85",
  },
  {
    id: "bracket-square-left",
    label: "Square [",
    category: "bracket",
    fill: false,
    pathD: "M 70 15 L 30 15 L 30 85 L 70 85",
  },
  {
    id: "bracket-square-right",
    label: "Square ]",
    category: "bracket",
    fill: false,
    pathD: "M 30 15 L 70 15 L 70 85 L 30 85",
  },
  {
    id: "bracket-angle-left",
    label: "Angle <",
    category: "bracket",
    fill: false,
    pathD: "M 70 15 L 30 50 L 70 85",
  },
  {
    id: "bracket-angle-right",
    label: "Angle >",
    category: "bracket",
    fill: false,
    pathD: "M 30 15 L 70 50 L 30 85",
  },
] as const;

export const SYMBOL_LIBRARY_BY_ID: ReadonlyMap<string, SymbolDef> = new Map(
  SYMBOL_LIBRARY.map((d) => [d.id, d]),
);

export const DEFAULT_SYMBOL_ID = "arrow-filled-right";
