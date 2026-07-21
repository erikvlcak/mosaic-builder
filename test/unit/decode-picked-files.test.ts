import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OpenedFileDto } from "../../src/preload/api";

// vi.hoisted is required: vi.mock is hoisted above every const, so a factory
// that closed over a plain `const decodeImageBytes = vi.fn()` would hit a TDZ
// error. vi.hoisted runs the initializer at hoist time instead.
const { decodeImageBytes } = vi.hoisted(() => ({ decodeImageBytes: vi.fn() }));
vi.mock("../../src/renderer/image/decode-bytes", () => ({ decodeImageBytes }));

import { decodePickedFiles } from "../../src/renderer/image/decode-picked-files";

function file(filePath: string): OpenedFileDto {
  return { filePath, bytes: new Uint8Array([1, 2, 3]), mime: "image/png" };
}

function bitmap(w: number, h: number): ImageBitmap {
  return { width: w, height: h } as unknown as ImageBitmap;
}

beforeEach(() => {
  decodeImageBytes.mockReset();
});

describe("decodePickedFiles", () => {
  it("builds one pool item per file, in input order", async () => {
    decodeImageBytes
      .mockResolvedValueOnce({ bitmap: bitmap(10, 20), bitDepth: 8 })
      .mockResolvedValueOnce({ bitmap: bitmap(30, 40), bitDepth: 16 });

    const r = await decodePickedFiles([file("/x/a.png"), file("/y/b.png")]);

    expect(r.items).toHaveLength(2);
    expect(r.items.map((i) => i.filename)).toEqual(["a.png", "b.png"]);
    expect(r.items[0]).toMatchObject({
      filePath: "/x/a.png",
      mime: "image/png",
      width: 10,
      height: 20,
      bitDepth: 8,
    });
    expect(r.items[1]).toMatchObject({ width: 30, height: 40, bitDepth: 16 });
    expect(r.failures).toEqual([]);
  });

  it("keys the bitmap map by the generated item id", async () => {
    const bm = bitmap(10, 20);
    decodeImageBytes.mockResolvedValueOnce({ bitmap: bm, bitDepth: 8 });

    const r = await decodePickedFiles([file("/x/a.png")]);

    const id = r.items[0]!.id;
    expect(r.bitmaps.get(id)).toBe(bm);
    expect(r.bitmaps.size).toBe(1);
  });

  it("includes calibration only when the decoder returns it", async () => {
    decodeImageBytes
      .mockResolvedValueOnce({ bitmap: bitmap(1, 1), bitDepth: 8 })
      .mockResolvedValueOnce({
        bitmap: bitmap(1, 1),
        bitDepth: 8,
        calibration: { pixelsPerUnit: 4, unit: "µm" },
      });

    const r = await decodePickedFiles([file("/a.png"), file("/b.png")]);

    expect("calibration" in r.items[0]!).toBe(false);
    expect(r.items[1]!.calibration).toEqual({ pixelsPerUnit: 4, unit: "µm" });
  });

  it("reports a failing file without aborting the rest of the batch", async () => {
    decodeImageBytes
      .mockResolvedValueOnce({ bitmap: bitmap(1, 1), bitDepth: 8 })
      .mockRejectedValueOnce(new Error("corrupt"))
      .mockResolvedValueOnce({ bitmap: bitmap(2, 2), bitDepth: 8 });

    const r = await decodePickedFiles([
      file("/ok1.png"),
      file("/bad.png"),
      file("/ok2.png"),
    ]);

    expect(r.items.map((i) => i.filename)).toEqual(["ok1.png", "ok2.png"]);
    expect(r.failures).toEqual(["bad.png"]);
  });

  it("handles Windows-style paths when deriving the filename", async () => {
    decodeImageBytes.mockResolvedValueOnce({
      bitmap: bitmap(1, 1),
      bitDepth: 8,
    });
    const r = await decodePickedFiles([
      {
        filePath: "C:\\imgs\\scan.png",
        bytes: new Uint8Array(),
        mime: "image/png",
      },
    ]);
    expect(r.items[0]!.filename).toBe("scan.png");
  });

  it("returns empty results for an empty file list", async () => {
    const r = await decodePickedFiles([]);
    expect(r.items).toEqual([]);
    expect(r.failures).toEqual([]);
    expect(r.bitmaps.size).toBe(0);
  });
});
