import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, readFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  saveProjectToPath,
  loadProjectFromPath,
} from "../../src/main/project-io";
import { initialFigureState } from "../../src/renderer/model/figure-state";
import { toMosaicFile } from "../../src/renderer/model/serialize";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "mosaic-io-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("saveProjectToPath", () => {
  it("writes JSON with .mosaic extension; refuses other extensions", async () => {
    const target = path.join(dir, "fig.mosaic");
    const file = toMosaicFile({
      state: initialFigureState(),
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: target,
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    await saveProjectToPath(target, file);
    const text = await readFile(target, "utf8");
    const parsed = JSON.parse(text) as { schemaVersion: number };
    expect(parsed.schemaVersion).toBe(5);

    await expect(
      saveProjectToPath(path.join(dir, "fig.json"), file),
    ).rejects.toThrow(/extension/);
  });

  it("leaves the previous good file intact when the write fails (atomic replace)", async () => {
    const target = path.join(dir, "fig.mosaic");
    // A previous good save the user must not lose.
    const original = '{"schemaVersion":5,"good":true}';
    await writeFile(target, original, "utf8");

    // Force writeFile(`${target}.tmp`) to fail: make the temp path a directory,
    // so the write hits EISDIR before any rename could touch the target.
    await mkdir(`${target}.tmp`);

    const file = toMosaicFile({
      state: initialFigureState(),
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: target,
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    await expect(saveProjectToPath(target, file)).rejects.toThrow();

    // The original file is byte-for-byte untouched.
    expect(await readFile(target, "utf8")).toBe(original);
  });

  it("does not leave a stray .tmp behind on a successful save", async () => {
    const target = path.join(dir, "fig.mosaic");
    const file = toMosaicFile({
      state: initialFigureState(),
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: target,
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    await saveProjectToPath(target, file);
    await expect(stat(`${target}.tmp`)).rejects.toThrow();
  });
});

describe("loadProjectFromPath", () => {
  it("reads + validates the file and resolves images by relPath then filePath", async () => {
    // Set up: save an image and a project that references it relatively.
    const imgRel = "./img.png";
    const imgAbs = path.join(dir, "img.png");
    // Trivial 1-byte file — main-process IO doesn't decode, just passes bytes.
    await writeFile(imgAbs, Buffer.from([0x89]));

    const target = path.join(dir, "fig.mosaic");
    const stateWithImg = {
      ...initialFigureState(),
      pool: [
        {
          id: "img1",
          filename: "img.png",
          filePath: imgAbs,
          mime: "image/png" as const,
          width: 1,
          height: 1,
          bitDepth: 8 as const,
        },
      ],
    };
    const file = toMosaicFile({
      state: stateWithImg,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: target,
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    expect(file.state.pool[0]!.relPath).toBe(imgRel);
    await saveProjectToPath(target, file);

    const r = await loadProjectFromPath(target);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.schemaVersion).toBe(5);
    expect(r.images).toHaveLength(1);
    expect(r.images[0]!.imageId).toBe("img1");
    expect(r.images[0]!.bytes.byteLength).toBe(1);
    expect(r.missing).toHaveLength(0);
  });

  it("flags missing images instead of crashing", async () => {
    const target = path.join(dir, "fig.mosaic");
    const ghostAbs = path.join(dir, "ghost.png");
    const stateWithImg = {
      ...initialFigureState(),
      pool: [
        {
          id: "ghost",
          filename: "ghost.png",
          filePath: ghostAbs,
          mime: "image/png" as const,
          width: 1,
          height: 1,
          bitDepth: 8 as const,
        },
      ],
    };
    const file = toMosaicFile({
      state: stateWithImg,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: target,
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    await saveProjectToPath(target, file);

    const r = await loadProjectFromPath(target);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.images).toHaveLength(0);
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0]!.imageId).toBe("ghost");
    expect(r.missing[0]!.filename).toBe("ghost.png");
    expect(r.missing[0]!.attemptedPaths.length).toBeGreaterThanOrEqual(1);
  });

  it("returns ok:false on schema validation failure", async () => {
    const target = path.join(dir, "fig.mosaic");
    await writeFile(target, JSON.stringify({ not: "valid" }));
    const r = await loadProjectFromPath(target);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("schemaVersion");
  });

  it("warns when sha256 mismatches the loaded bytes", async () => {
    const imgAbs = path.join(dir, "img.png");
    await writeFile(imgAbs, Buffer.from([0x89]));
    const target = path.join(dir, "fig.mosaic");
    const stateWithImg = {
      ...initialFigureState(),
      pool: [
        {
          id: "img1",
          filename: "img.png",
          filePath: imgAbs,
          mime: "image/png" as const,
          width: 1,
          height: 1,
          bitDepth: 8 as const,
        },
      ],
    };
    const file = toMosaicFile({
      state: stateWithImg,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: target,
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
      shaByImageId: { img1: "deadbeef" }, // intentionally wrong
    });
    await saveProjectToPath(target, file);

    const r = await loadProjectFromPath(target);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.images[0]!.shaMismatch).toBe(true);
  });
});
