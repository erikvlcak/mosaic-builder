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
    color: "#000000",
    corner: "tl",
    paddingPx: 6,
    bold: true,
    italic: false,
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
