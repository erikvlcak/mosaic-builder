import type { Dispatch } from "react";
import { decodeImageBytes } from "../image/decode-bytes";
import type { FigureAction } from "../model/figure-actions";
import { resetToState } from "../model/figure-actions";
import { fromMosaicFile } from "../model/serialize";
import type { LoadProjectResult, ResolvedImageDto } from "../../preload/api";

export interface LoadOutcome {
  /** Image ids whose bytes failed to decode after disk read. */
  decodeFailures: { imageId: string; message: string }[];
  /** Per-image bitmaps to merge into the App's bitmap-cache state. */
  bitmaps: Map<string, ImageBitmap>;
}

/**
 * Apply a successful LoadProjectResult to the renderer:
 *   1. Decode every ResolvedImageDto.bytes into an ImageBitmap.
 *   2. Dispatch RESET_TO_STATE with the deserialized FigureState.
 *
 * Caller is responsible for replacing the bitmap cache map AND surfacing
 * `decodeFailures` and the loader's `missing` array (caller already has
 * the latter from the IPC result).
 */
export async function applyLoadedProject(
  result: Extract<LoadProjectResult, { ok: true }>,
  dispatch: Dispatch<FigureAction>,
): Promise<LoadOutcome> {
  const bitmaps = new Map<string, ImageBitmap>();
  const decodeFailures: LoadOutcome["decodeFailures"] = [];

  for (const img of result.images) {
    try {
      const decoded = await decodeImageBytes(img.bytes, img.mime);
      bitmaps.set(img.imageId, decoded.bitmap);
    } catch (e) {
      decodeFailures.push({
        imageId: img.imageId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const r = fromMosaicFile(result.file);
  dispatch(resetToState(r.state));

  return { bitmaps, decodeFailures };
}

export type { ResolvedImageDto };
