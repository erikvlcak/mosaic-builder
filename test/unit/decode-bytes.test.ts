import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Mock the worker host so importing decode-bytes doesn't pull in
// `import.meta.url`-based Worker construction during test transform.
vi.mock("../../src/renderer/image/tiff-worker-host", () => ({
  decodeTiffViaWorker: vi.fn(() =>
    Promise.resolve({
      rgba: new Uint8ClampedArray([255, 0, 0, 255]),
      width: 1,
      height: 1,
      bitDepth: 16 as const,
      calibration: {
        unit: "um" as const,
        pixelsPerUnit: 0.000645,
        source: "tiff-meta" as const,
      },
    }),
  ),
}));

import {
  decodeImageBytes,
  type ImageMime,
} from "../../src/renderer/image/decode-bytes";
import { decodeTiffViaWorker } from "../../src/renderer/image/tiff-worker-host";

const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

let originalCreate: unknown;
let originalImageData: unknown;
// Records the options arg of the most recent createImageBitmap call so tests
// can assert EXIF orientation is requested.
let lastCreateOpts: ImageBitmapOptions | undefined;

beforeAll(() => {
  originalCreate = (globalThis as unknown as { createImageBitmap?: unknown })
    .createImageBitmap;
  originalImageData = (globalThis as unknown as { ImageData?: unknown })
    .ImageData;
  (
    globalThis as unknown as {
      createImageBitmap: (
        b: Blob | ImageData,
        opts?: ImageBitmapOptions,
      ) => Promise<ImageBitmap>;
    }
  ).createImageBitmap = (src: Blob | ImageData, opts?: ImageBitmapOptions) => {
    lastCreateOpts = opts;
    const tag =
      src instanceof Blob ? src.type : `imagedata:${src.width}x${src.height}`;
    return Promise.resolve({
      width: 1,
      height: 1,
      _src: tag,
    } as unknown as ImageBitmap);
  };
  (globalThis as unknown as { ImageData: unknown }).ImageData = class {
    constructor(
      public data: Uint8ClampedArray,
      public width: number,
      public height: number,
    ) {}
  };
});

afterAll(() => {
  (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap =
    originalCreate;
  (globalThis as unknown as { ImageData?: unknown }).ImageData =
    originalImageData;
});

describe("decodeImageBytes", () => {
  it("decodes png bytes via createImageBitmap with the given mime", async () => {
    const r = await decodeImageBytes(PNG_SIG, "image/png");
    expect(r.bitmap.width).toBe(1);
    expect(r.bitmap.height).toBe(1);
    expect(r.bitDepth).toBe(8);
    expect(r.calibration).toBeUndefined();
    expect((r.bitmap as unknown as { _src: string })._src).toBe("image/png");
  });

  it("decodes jpeg bytes with bitDepth 8 and no calibration", async () => {
    const r = await decodeImageBytes(PNG_SIG, "image/jpeg");
    expect(r.bitDepth).toBe(8);
    expect(r.calibration).toBeUndefined();
    expect((r.bitmap as unknown as { _src: string })._src).toBe("image/jpeg");
  });

  it("requests EXIF orientation via imageOrientation: from-image (3.3)", async () => {
    lastCreateOpts = undefined;
    await decodeImageBytes(PNG_SIG, "image/jpeg");
    // The mock reassigns `lastCreateOpts` inside the awaited call; annotate the
    // read so control-flow narrowing from the `= undefined` reset above doesn't
    // collapse the optional-chain branch to `never` under exactOptionalPropertyTypes.
    expect(
      (lastCreateOpts as ImageBitmapOptions | undefined)?.imageOrientation,
    ).toBe("from-image");
  });

  it("rejects unsupported mimes", async () => {
    await expect(
      decodeImageBytes(PNG_SIG, "image/gif" as unknown as ImageMime),
    ).rejects.toThrow(/unsupported mime/i);
  });

  it("rejects empty bytes", async () => {
    await expect(
      decodeImageBytes(new Uint8Array(0), "image/png"),
    ).rejects.toThrow(/empty/i);
  });

  it("routes image/tiff through the worker host and returns its metadata", async () => {
    const bytes = new Uint8Array([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    ]);
    const r = await decodeImageBytes(bytes, "image/tiff");
    expect(decodeTiffViaWorker).toHaveBeenCalledTimes(1);
    expect(r.bitDepth).toBe(16);
    expect(r.calibration).toEqual({
      unit: "um",
      pixelsPerUnit: 0.000645,
      source: "tiff-meta",
    });
    expect((r.bitmap as unknown as { _src: string })._src).toBe(
      "imagedata:1x1",
    );
  });

  it("decodeImageBytes propagates TIFF worker errors", async () => {
    const bytes = new Uint8Array([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    ]);
    vi.mocked(decodeTiffViaWorker).mockRejectedValueOnce(
      new Error("tiff-worker boom"),
    );
    await expect(decodeImageBytes(bytes, "image/tiff")).rejects.toThrow(
      /tiff-worker boom/,
    );
  });
});
