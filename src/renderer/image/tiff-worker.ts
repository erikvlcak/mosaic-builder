/// <reference lib="webworker" />
import * as UTIF from "utif";
import type { Calibration } from "../model/pool";
import { decodeTiffToRgba, type UtifLike } from "./tiff-decode";

// UTIF's runtime surface matches UtifLike structurally; the cast documents the
// dependency we inject into the pure decoder.
const utif = UTIF as unknown as UtifLike;

export interface TiffDecodeRequest {
  reqId: string;
  buffer: ArrayBuffer;
}

export interface TiffDecodeOk {
  reqId: string;
  ok: true;
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  bitDepth: 8 | 16;
  calibration?: Calibration;
}

export interface TiffDecodeErr {
  reqId: string;
  ok: false;
  message: string;
}

export type TiffDecodeResponse = TiffDecodeOk | TiffDecodeErr;

const post = (
  self as unknown as {
    postMessage: (m: unknown, t?: Transferable[]) => void;
  }
).postMessage;

self.onmessage = (e: MessageEvent<TiffDecodeRequest>): void => {
  const { reqId } = e.data;
  try {
    const { buffer } = e.data;
    const decoded = decodeTiffToRgba(buffer, utif);
    const rgba = decoded.rgba;
    const clamped = new Uint8ClampedArray(
      rgba.buffer,
      rgba.byteOffset,
      rgba.byteLength,
    );
    const out: TiffDecodeOk = {
      reqId,
      ok: true,
      rgba: clamped,
      width: decoded.width,
      height: decoded.height,
      bitDepth: decoded.bitDepth,
      ...(decoded.calibration !== undefined
        ? { calibration: decoded.calibration }
        : {}),
    };
    post(out, [clamped.buffer]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const errOut: TiffDecodeErr = { reqId, ok: false, message: msg };
    post(errOut);
  }
};
