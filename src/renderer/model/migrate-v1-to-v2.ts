/**
 * One-way migration from `.mosaic` v1 to v2: arrow annotations become
 * symbol annotations. All other kinds pass through unchanged.
 *
 * Mapping from spec 06:
 *   head=filled → arrow-filled-right
 *   head=open   → arrow-open-right
 *   head=none   → arrow-line-right
 *   x = (x1+x2)/2, y = (y1+y2)/2
 *   sizePx = max(8, sqrt((x2-x1)^2 + (y2-y1)^2))
 *   rotationDeg = atan2(y2-y1, x2-x1) * 180 / PI
 *   strokeWidthPx = thicknessPx (preserved; ignored for filled symbols at draw time)
 *   anchor = midpoint of (anchor1, anchor2) when image-bound
 */

import type { Annotation, ImageAnchor, SymbolAnnotation } from "./annotations";

interface V1ArrowAnnotation {
  id: string;
  kind: "arrow";
  z: number;
  panelId?: string;
  imageId?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  anchor1?: ImageAnchor;
  anchor2?: ImageAnchor;
  color: string;
  thicknessPx: number;
  head: "none" | "open" | "filled";
}

type V1Annotation = Annotation | V1ArrowAnnotation;

const HEAD_TO_SYMBOL: Record<V1ArrowAnnotation["head"], string> = {
  filled: "arrow-filled-right",
  open: "arrow-open-right",
  none: "arrow-line-right",
};

export function migrateAnnotationsV1ToV2(
  annotations: readonly V1Annotation[],
): Annotation[] {
  // Reference-equality short-circuit when no arrows are present — load-bearing
  // for the no-op case (v2 files that round-trip should keep their array
  // identity through `fromMosaicFile`).
  if (!annotations.some((a) => a.kind === "arrow")) {
    return annotations as Annotation[];
  }
  return annotations.map((a): Annotation => {
    if (a.kind !== "arrow") return a;
    return migrateArrow(a);
  });
}

function migrateArrow(a: V1ArrowAnnotation): SymbolAnnotation {
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  // Floor at 8px so a degenerate zero-length legacy arrow doesn't disappear.
  const sizePx = Math.max(8, len);
  // For zero-length arrows atan2(0,0) === 0; that's fine.
  const rotationDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const x = (a.x1 + a.x2) / 2;
  const y = (a.y1 + a.y2) / 2;
  const out: SymbolAnnotation = {
    id: a.id,
    kind: "symbol",
    z: a.z,
    symbolId: HEAD_TO_SYMBOL[a.head],
    x,
    y,
    sizePx,
    rotationDeg,
    color: a.color,
    strokeWidthPx: a.thicknessPx,
  };
  if (a.panelId !== undefined) out.panelId = a.panelId;
  if (a.imageId !== undefined) out.imageId = a.imageId;
  if (a.anchor1 !== undefined && a.anchor2 !== undefined) {
    out.anchor = {
      imgU: (a.anchor1.imgU + a.anchor2.imgU) / 2,
      imgV: (a.anchor1.imgV + a.anchor2.imgV) / 2,
    };
  }
  return out;
}
