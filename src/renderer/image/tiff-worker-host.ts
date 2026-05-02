import type { Calibration } from "../model/pool";
import type { TiffDecodeResponse } from "./tiff-worker";

export interface DecodedTiff {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  bitDepth: 8 | 16;
  calibration?: Calibration;
}

interface PendingEntry {
  resolve: (r: DecodedTiff) => void;
  reject: (e: Error) => void;
}

let worker: Worker | null = null;
const pending = new Map<string, PendingEntry>();

function getWorker(): Worker {
  if (worker !== null) return worker;
  // Vite resolves this URL relative to the importing module at build time.
  worker = new Worker(new URL("./tiff-worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (e: MessageEvent<TiffDecodeResponse>): void => {
    const data = e.data;
    const entry = pending.get(data.reqId);
    if (entry === undefined) return;
    pending.delete(data.reqId);
    if (data.ok) {
      const out: DecodedTiff = {
        rgba: data.rgba,
        width: data.width,
        height: data.height,
        bitDepth: data.bitDepth,
        ...(data.calibration !== undefined
          ? { calibration: data.calibration }
          : {}),
      };
      entry.resolve(out);
    } else {
      entry.reject(new Error(data.message));
    }
  };
  worker.onerror = (ev: ErrorEvent): void => {
    // Worker-level failure: reject all in-flight requests.
    const err = new Error(ev.message || "tiff-worker error");
    for (const [, p] of pending) p.reject(err);
    pending.clear();
  };
  return worker;
}

/**
 * Decodes a TIFF buffer in the singleton worker. Resolves with raw RGBA
 * bytes plus extracted bit-depth/calibration metadata. The buffer is
 * transferred (zero-copy) into the worker — callers MUST NOT reuse it.
 */
export async function decodeTiffViaWorker(
  buffer: ArrayBuffer,
): Promise<DecodedTiff> {
  const reqId = crypto.randomUUID();
  return new Promise<DecodedTiff>((resolve, reject) => {
    pending.set(reqId, { resolve, reject });
    getWorker().postMessage({ reqId, buffer }, [buffer]);
  });
}
