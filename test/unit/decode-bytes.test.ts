import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  decodeImageBytes,
  type ImageMime,
} from "../../src/renderer/image/decode-bytes";

const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

let originalCreate: unknown;

beforeAll(() => {
  originalCreate = (globalThis as unknown as { createImageBitmap?: unknown })
    .createImageBitmap;
  (
    globalThis as unknown as {
      createImageBitmap: (b: Blob) => Promise<ImageBitmap>;
    }
  ).createImageBitmap = (blob: Blob) =>
    Promise.resolve(
      {
        width: 1,
        height: 1,
        _mime: blob.type,
      } as unknown as ImageBitmap,
    );
});

afterAll(() => {
  (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap =
    originalCreate;
});

describe("decodeImageBytes", () => {
  it("decodes png bytes via createImageBitmap with the given mime", async () => {
    const bm = await decodeImageBytes(PNG_SIG, "image/png");
    expect(bm.width).toBe(1);
    expect(bm.height).toBe(1);
    expect((bm as unknown as { _mime: string })._mime).toBe("image/png");
  });

  it("rejects unsupported mimes", async () => {
    await expect(
      decodeImageBytes(PNG_SIG, "image/tiff" as unknown as ImageMime),
    ).rejects.toThrow(/unsupported mime/i);
  });

  it("rejects empty bytes", async () => {
    await expect(
      decodeImageBytes(new Uint8Array(0), "image/png"),
    ).rejects.toThrow(/empty/i);
  });
});
