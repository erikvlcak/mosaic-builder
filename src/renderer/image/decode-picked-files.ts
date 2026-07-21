import type { OpenedFileDto } from "../../preload/api";
import { newImageId, type ImagePoolItem } from "../model/pool";
import { basename } from "../basename";
import { decodeImageBytes } from "./decode-bytes";

export interface DecodedPick {
  items: ImagePoolItem[];
  /** Keyed by `ImagePoolItem.id`, ready to merge into the renderer cache. */
  bitmaps: Map<string, ImageBitmap>;
  /** Basenames that failed to decode, in input order. */
  failures: string[];
}

/**
 * Shared by both import entry points (the tray's "Add images…" button and
 * the empty-panel browse zone). Failures are collected rather than thrown so
 * one corrupt file in a batch of twenty can't abort the other nineteen; the
 * caller turns `failures` into a single toast.
 */
export async function decodePickedFiles(
  files: readonly OpenedFileDto[],
): Promise<DecodedPick> {
  const items: ImagePoolItem[] = [];
  const bitmaps = new Map<string, ImageBitmap>();
  const failures: string[] = [];

  for (const f of files) {
    let decoded;
    try {
      decoded = await decodeImageBytes(f.bytes, f.mime);
    } catch {
      failures.push(basename(f.filePath));
      continue;
    }
    const { bitmap, bitDepth, calibration } = decoded;
    const item: ImagePoolItem = {
      id: newImageId(),
      filename: basename(f.filePath),
      filePath: f.filePath,
      mime: f.mime,
      width: bitmap.width,
      height: bitmap.height,
      bitDepth,
      ...(calibration !== undefined ? { calibration } : {}),
    };
    items.push(item);
    bitmaps.set(item.id, bitmap);
  }

  return { items, bitmaps, failures };
}
