import type { Calibration } from "../model/pool";
import type { PanelTransform } from "../model/panels";
import {
  effectivePanelScale,
  rotatedImageDims,
  type PanelRect,
} from "./coords";

/**
 * Compute the figure-pixel length of the scale bar.
 *
 *   barLengthFigurePx = lengthValue_in_µm * pixelsPerUnit_(src_px_per_µm) * S
 *
 * where S = effective panel scale = zoom * baseScale_for_fit (rotated dims).
 *
 * - `lengthUnit` is normalised to µm (mm → ×1000) before multiplying.
 * - `lengthUnit === "px"` skips calibration entirely: barLengthFigurePx = lengthValue * S.
 * - Stretch fit uses min(panelW/imgW, panelH/imgH) as a defensive S — scale bars
 *   on stretched images are visually wrong by definition, but we still draw something.
 * - Returns 0 for malformed inputs (NaN/non-finite, negative length, missing
 *   calibration when one is required, or `calibration.unit === "px"` with a
 *   physical-length request — absolute pixel calibration cannot resolve µm).
 */
export function scaleBarFigurePx(
  lengthValue: number,
  lengthUnit: "um" | "mm" | "px",
  calibration: Calibration | undefined,
  panelTransform: PanelTransform,
  panelW: number,
  panelH: number,
  imgW: number,
  imgH: number,
): number {
  if (!Number.isFinite(lengthValue) || lengthValue < 0) return 0;
  if (
    !Number.isFinite(panelW) ||
    !Number.isFinite(panelH) ||
    !Number.isFinite(imgW) ||
    !Number.isFinite(imgH) ||
    panelW <= 0 ||
    panelH <= 0 ||
    imgW <= 0 ||
    imgH <= 0
  ) {
    return 0;
  }

  const { w: rw, h: rh } = rotatedImageDims(imgW, imgH, panelTransform.rotation);
  const S = effectivePanelScale(panelTransform, panelW, panelH, rw, rh);
  if (!Number.isFinite(S) || S < 0) return 0;

  if (lengthUnit === "px") {
    return lengthValue * S;
  }

  if (calibration === undefined) return 0;

  let srcPxPerUm: number;
  if (calibration.unit === "um") {
    srcPxPerUm = calibration.pixelsPerUnit;
  } else if (calibration.unit === "mm") {
    srcPxPerUm = calibration.pixelsPerUnit / 1000;
  } else {
    // calibration.unit === "px": absolute pixel calibration cannot resolve µm/mm.
    return 0;
  }

  if (!Number.isFinite(srcPxPerUm) || srcPxPerUm <= 0) return 0;

  const valueInUm = lengthUnit === "mm" ? lengthValue * 1000 : lengthValue;
  return valueInUm * srcPxPerUm * S;
}

/**
 * Compute the {x, y, w, h} rect for the scale bar, anchored to a panel
 * corner with padding. The bar lies horizontally; its end (the side
 * closer to the corner) is exactly `paddingPx` from the panel edge.
 *
 * The rect's bottom edge ("br"/"bl") or top edge ("tr"/"tl") sits at the
 * padding line, leaving room for a label on the opposite side.
 */
export function scaleBarRect(
  corner: "tl" | "tr" | "bl" | "br",
  paddingPx: number,
  panelRect: PanelRect,
  barLengthPx: number,
  thicknessPx: number,
): { x: number; y: number; w: number; h: number } {
  switch (corner) {
    case "tl":
      return {
        x: panelRect.x + paddingPx,
        y: panelRect.y + paddingPx,
        w: barLengthPx,
        h: thicknessPx,
      };
    case "tr":
      return {
        x: panelRect.x + panelRect.w - paddingPx - barLengthPx,
        y: panelRect.y + paddingPx,
        w: barLengthPx,
        h: thicknessPx,
      };
    case "bl":
      return {
        x: panelRect.x + paddingPx,
        y: panelRect.y + panelRect.h - paddingPx - thicknessPx,
        w: barLengthPx,
        h: thicknessPx,
      };
    case "br":
      return {
        x: panelRect.x + panelRect.w - paddingPx - barLengthPx,
        y: panelRect.y + panelRect.h - paddingPx - thicknessPx,
        w: barLengthPx,
        h: thicknessPx,
      };
  }
}
