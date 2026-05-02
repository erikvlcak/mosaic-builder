import { describe, it, expect, vi } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  pickAndReadImages,
  type ShowOpenDialog,
} from "../../src/main/open-images";

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe("pickAndReadImages", () => {
  it("returns canceled when the dialog is canceled", async () => {
    const showOpenDialog: ShowOpenDialog = vi
      .fn()
      .mockResolvedValue({ canceled: true, filePaths: [] });
    const r = await pickAndReadImages({
      parentWindow: null,
      showOpenDialog,
    });
    expect(r).toEqual({ canceled: true });
  });

  it("reads bytes for each picked file and tags with mime", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mosaic-open-"));
    const a = path.join(dir, "a.png");
    const b = path.join(dir, "b.JPG");
    await writeFile(a, PNG_SIG);
    await writeFile(b, Buffer.from([0xff, 0xd8, 0xff]));

    const showOpenDialog: ShowOpenDialog = vi
      .fn()
      .mockResolvedValue({ canceled: false, filePaths: [a, b] });
    const r = await pickAndReadImages({
      parentWindow: null,
      showOpenDialog,
    });
    expect(r.canceled).toBe(false);
    if (r.canceled) return;
    expect(r.files).toHaveLength(2);
    expect(r.files[0]?.filePath).toBe(a);
    expect(r.files[0]?.mime).toBe("image/png");
    expect(r.files[0]?.bytes.byteLength).toBe(PNG_SIG.byteLength);
    expect(r.files[1]?.mime).toBe("image/jpeg");
  });

  it("skips files whose extension is not png/jpeg", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mosaic-open-"));
    const ok = path.join(dir, "ok.png");
    const bad = path.join(dir, "bad.gif");
    await writeFile(ok, PNG_SIG);
    await writeFile(bad, Buffer.from([0]));

    const showOpenDialog: ShowOpenDialog = vi
      .fn()
      .mockResolvedValue({ canceled: false, filePaths: [ok, bad] });
    const r = await pickAndReadImages({
      parentWindow: null,
      showOpenDialog,
    });
    if (r.canceled) throw new Error("expected not canceled");
    expect(r.files).toHaveLength(1);
    expect(r.files[0]?.filePath).toBe(ok);
  });
});
