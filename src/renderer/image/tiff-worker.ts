/// <reference lib="webworker" />
import * as UTIF from "utif";
import type { Calibration } from "../model/pool";
import { readCalibrationFromIFD, type UtifIfd } from "./tiff-decode";

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

const post = (self as unknown as {
  postMessage: (m: unknown, t?: Transferable[]) => void;
}).postMessage;

self.onmessage = (e: MessageEvent<TiffDecodeRequest>): void => {
  const { reqId } = e.data;
  try {
    const { buffer } = e.data;
    const ifds = UTIF.decode(buffer);
    if (ifds.length === 0) throw new Error("no IFD");
    const ifd0 = ifds[0]!;
    UTIF.decodeImage(buffer, ifd0);
    const rgba = UTIF.toRGBA8(ifd0);
    const width = ifd0.width;
    const height = ifd0.height;
    const bps = (ifd0.t258 as number[] | undefined)?.[0] ?? 8;
    const bitDepth: 8 | 16 = bps >= 16 ? 16 : 8;
    // Intentional structural cast: UTIF.IFD carries `data: Uint8Array` and a
    // permissive index signature; UtifIfd is our minimal subset of the tags
    // we actually read (t258/t282/t283/t296 + width/height).
    const calibration = readCalibrationFromIFD(
      ifd0 as unknown as UtifIfd,
    );
    const clamped = new Uint8ClampedArray(
      rgba.buffer,
      rgba.byteOffset,
      rgba.byteLength,
    );
    const out: TiffDecodeOk = {
      reqId,
      ok: true,
      rgba: clamped,
      width,
      height,
      bitDepth,
      ...(calibration !== undefined ? { calibration } : {}),
    };
    post(out, [clamped.buffer]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const errOut: TiffDecodeErr = { reqId, ok: false, message: msg };
    post(errOut);
  }
};
