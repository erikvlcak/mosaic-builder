/**
 * Figure-wide style for derived letter labels and scale bars. Per-instance
 * overrides (e.g. ScaleBarAnnotation.cornerOverride) win over these defaults.
 */

export type Corner = "tl" | "tr" | "bl" | "br";

export interface LetterStyle {
  enabled: boolean;
  font: string;
  sizePt: number;
  color: string;
  bgColor?: string;
  corner: Corner;
  paddingPx: number;
  bold: boolean;
  italic: boolean;
  /**
   * When true, paint a contrasting outline (halo) behind the glyphs so the
   * label stays legible on any background. Optional so pre-halo `.mosaic`
   * files (absent ⇒ false) render pixel-identically. The halo color is
   * derived from the fill luminance — no user knob.
   */
  halo?: boolean;
}

export interface ScaleBarStyle {
  font: string;
  sizePt: number;
  color: string;
  barColor: string;
  thicknessPx: number;
  corner: Corner;
  paddingPx: number;
  showLabel: boolean;
}

export interface GlobalAnnoStyle {
  letters: LetterStyle;
  scalebar: ScaleBarStyle;
}

export const DEFAULT_GLOBAL_STYLE: GlobalAnnoStyle = Object.freeze({
  letters: Object.freeze({
    enabled: true,
    font: "Arial, Helvetica, sans-serif",
    sizePt: 12,
    // White + halo is legible on both dark micrographs and light plots. See
    // the UI/UX refresh spec (Phase 1 — annotation legibility).
    color: "#FFFFFF",
    corner: "tl",
    paddingPx: 6,
    bold: true,
    italic: false,
    halo: true,
  }),
  scalebar: Object.freeze({
    font: "Arial, Helvetica, sans-serif",
    sizePt: 10,
    color: "#FFFFFF",
    barColor: "#FFFFFF",
    thicknessPx: 4,
    corner: "br",
    paddingPx: 8,
    showLabel: true,
  }),
}) as GlobalAnnoStyle;
