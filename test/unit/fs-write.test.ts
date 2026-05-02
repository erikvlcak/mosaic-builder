import { describe, it, expect } from "vitest";
import { writePngFile } from "../../src/main/fs-write";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("writePngFile", () => {
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
