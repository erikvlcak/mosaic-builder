import { describe, it, expect } from "vitest";
import {
  validateMosaicFile,
  CURRENT_SCHEMA_VERSION,
  type MosaicFileV1,
} from "../../src/renderer/model/schema";

const MIN_VALID: MosaicFileV1 = {
  schemaVersion: 1,
  app: "mosaic-builder",
  appVersion: "0.1.0",
  createdAt: "2026-05-02T10:00:00Z",
  modifiedAt: "2026-05-02T10:00:00Z",
  canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
  state: {
    pool: [],
    panels: [
      { id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1 },
      { id: "p2", row: 0, col: 1, rowSpan: 1, colSpan: 1 },
      { id: "p3", row: 1, col: 0, rowSpan: 1, colSpan: 1 },
      { id: "p4", row: 1, col: 1, rowSpan: 1, colSpan: 1 },
    ],
    rows: 2,
    cols: 2,
    gutterPx: 12,
    gutterColor: "#FFFFFF",
    annotations: [],
    globalStyle: {
      letters: { enabled: true, font: "Arial", sizePt: 12, color: "#000000",
                 corner: "tl", paddingPx: 6, bold: true },
      scalebar: { font: "Arial", sizePt: 10, color: "#FFFFFF",
                  barColor: "#FFFFFF", thicknessPx: 4, corner: "br",
                  paddingPx: 8, showLabel: true },
    },
    letterOverrides: {},
  },
};

describe("validateMosaicFile", () => {
  it("CURRENT_SCHEMA_VERSION is 1", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });

  it("accepts a minimal valid file", () => {
    const r = validateMosaicFile(MIN_VALID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.schemaVersion).toBe(1);
      expect(r.value.state.rows).toBe(2);
    }
  });

  it("rejects missing schemaVersion with a descriptive error", () => {
    const bad = { ...MIN_VALID } as Record<string, unknown>;
    delete bad.schemaVersion;
    const r = validateMosaicFile(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("schemaVersion");
  });

  it("rejects an unknown future schemaVersion", () => {
    const r = validateMosaicFile({ ...MIN_VALID, schemaVersion: 99 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("schemaVersion");
  });

  it("rejects non-object input (string, null, array)", () => {
    expect(validateMosaicFile("hi").ok).toBe(false);
    expect(validateMosaicFile(null).ok).toBe(false);
    expect(validateMosaicFile([]).ok).toBe(false);
  });

  it("rejects malformed pool entries (missing filename)", () => {
    const bad = {
      ...MIN_VALID,
      state: {
        ...MIN_VALID.state,
        pool: [{ id: "x", filePath: "/x", mime: "image/png",
                 width: 1, height: 1, bitDepth: 8 }],
      },
    };
    const r = validateMosaicFile(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("pool");
  });

  it("accepts pool entries with optional relPath and sha256", () => {
    const ok = {
      ...MIN_VALID,
      state: {
        ...MIN_VALID.state,
        pool: [{
          id: "x", filename: "x.png", filePath: "/abs/x.png",
          relPath: "./images/x.png",
          sha256: "abc123",
          mime: "image/png", width: 10, height: 10, bitDepth: 8,
        }],
      },
    };
    expect(validateMosaicFile(ok).ok).toBe(true);
  });

  it("rejects rows > 10 or rows < 1", () => {
    expect(validateMosaicFile({ ...MIN_VALID, state: { ...MIN_VALID.state, rows: 0 } }).ok).toBe(false);
    expect(validateMosaicFile({ ...MIN_VALID, state: { ...MIN_VALID.state, rows: 11 } }).ok).toBe(false);
  });
});
