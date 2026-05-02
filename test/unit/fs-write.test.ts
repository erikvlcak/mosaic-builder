import { describe, it, expect } from "vitest";
import { writeBytesToPath, writePngFile } from "../../src/main/fs-write";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("writePngFile (back-compat)", () => {
  it("writes bytes to disk at a .png path", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mosaic-test-"));
    const out = path.join(dir, "out.png");
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG sig
    await writePngFile(out, bytes);
    const back = await readFile(out);
    expect(back.equals(Buffer.from(bytes))).toBe(true);
  });

  it("rejects paths whose extension is not .png", async () => {
    await expect(
      writePngFile("/tmp/foo.txt", new Uint8Array([1])),
    ).rejects.toThrow(/\.png/i);
  });
});

describe("writeBytesToPath", () => {
  it("writes bytes when extension is in the allowed list", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mosaic-test-"));
    const out = path.join(dir, "out.jpg");
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
    await writeBytesToPath(out, bytes, [".jpg", ".jpeg"]);
    const back = await readFile(out);
    expect(back.equals(Buffer.from(bytes))).toBe(true);
  });

  it("accepts case-insensitively (uppercase extension)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mosaic-test-"));
    const out = path.join(dir, "out.PDF");
    await writeBytesToPath(out, new Uint8Array([0x25, 0x50, 0x44, 0x46]), [".pdf"]);
    const back = await readFile(out);
    expect(back.length).toBe(4);
  });

  it("refuses extensions not in the allowed list", async () => {
    await expect(
      writeBytesToPath("/tmp/foo.bmp", new Uint8Array([1]), [".png", ".jpg"]),
    ).rejects.toThrow(/\.png/);
  });

  it("refuses paths with no extension", async () => {
    await expect(
      writeBytesToPath("/tmp/foo", new Uint8Array([1]), [".png"]),
    ).rejects.toThrow();
  });
});
