import { describe, it, expect } from "vitest";
import {
  validateMosaicFile,
  CURRENT_SCHEMA_VERSION,
  type MosaicFileV5,
} from "../../src/renderer/model/schema";

const MIN_VALID: MosaicFileV5 = {
  schemaVersion: 5,
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
    outerGutter: true,
    annotations: [],
    globalStyle: {
      letters: {
        enabled: true,
        font: "Arial",
        sizePt: 12,
        color: "#000000",
        corner: "tl",
        paddingPx: 6,
        bold: true,
        italic: false,
      },
      scalebar: {
        font: "Arial",
        sizePt: 10,
        color: "#FFFFFF",
        barColor: "#FFFFFF",
        thicknessPx: 4,
        corner: "br",
        paddingPx: 8,
        showLabel: true,
      },
    },
    letterOverrides: {},
    letterPattern: "uppercase",
    layout: {
      kind: "uniform",
      colWeights: [0.5, 0.5],
      rowWeights: [0.5, 0.5],
    },
  },
};

describe("validateMosaicFile", () => {
  it("CURRENT_SCHEMA_VERSION is 5", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(5);
  });

  it("accepts a minimal valid file", () => {
    const r = validateMosaicFile(MIN_VALID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.schemaVersion).toBe(5);
      expect(r.value.state.rows).toBe(2);
    }
  });

  it("accepts globalStyle.letters.halo when it is a boolean", () => {
    const r = validateMosaicFile({
      ...MIN_VALID,
      state: {
        ...MIN_VALID.state,
        globalStyle: {
          ...MIN_VALID.state.globalStyle,
          letters: { ...MIN_VALID.state.globalStyle.letters, halo: true },
        },
      },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects globalStyle.letters.halo when present but not a boolean", () => {
    const r = validateMosaicFile({
      ...MIN_VALID,
      state: {
        ...MIN_VALID.state,
        globalStyle: {
          ...MIN_VALID.state.globalStyle,
          letters: {
            ...MIN_VALID.state.globalStyle.letters,
            halo: "yes",
          } as unknown as MosaicFileV5["state"]["globalStyle"]["letters"],
        },
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/halo/);
  });

  it("rejects a text annotation whose halo is not a boolean", () => {
    const r = validateMosaicFile({
      ...MIN_VALID,
      state: {
        ...MIN_VALID.state,
        annotations: [
          {
            id: "t1",
            kind: "text",
            z: 0,
            x: 10,
            y: 10,
            text: "hi",
            font: "Arial",
            sizePt: 12,
            bold: false,
            italic: false,
            color: "#000000",
            halo: 1,
          },
        ] as unknown as MosaicFileV5["state"]["annotations"],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/halo/);
  });

  it("rejects schemaVersion 4 with a clear error", () => {
    const r = validateMosaicFile({ ...MIN_VALID, schemaVersion: 4 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(
        /older format that is not supported|schemaVersion/,
      );
    }
  });

  it("accepts schemaVersion 5 when symbol annotations carry fillMode/strokeStyle", () => {
    const r = validateMosaicFile({
      ...MIN_VALID,
      schemaVersion: 5,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a v5 symbol annotation missing fillMode", () => {
    const r = validateMosaicFile({
      ...MIN_VALID,
      schemaVersion: 5,
      state: {
        ...MIN_VALID.state,
        annotations: [
          {
            id: "s1",
            kind: "symbol",
            z: 0,
            symbolId: "arrow-filled-right",
            x: 10,
            y: 10,
            sizePx: 60,
            rotationDeg: 0,
            color: "#FF0000",
            strokeWidthPx: 2,
            strokeStyle: "solid",
          },
        ],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/fillMode/);
  });

  it("rejects a v5 symbol annotation with an invalid strokeStyle", () => {
    const r = validateMosaicFile({
      ...MIN_VALID,
      schemaVersion: 5,
      state: {
        ...MIN_VALID.state,
        annotations: [
          {
            id: "s1",
            kind: "symbol",
            z: 0,
            symbolId: "arrow-filled-right",
            x: 10,
            y: 10,
            sizePx: 60,
            rotationDeg: 0,
            color: "#FF0000",
            strokeWidthPx: 2,
            fillMode: "filled",
            strokeStyle: "wavy",
          },
        ],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/strokeStyle/);
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
        pool: [
          {
            id: "x",
            filePath: "/x",
            mime: "image/png",
            width: 1,
            height: 1,
            bitDepth: 8,
          },
        ],
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
        pool: [
          {
            id: "x",
            filename: "x.png",
            filePath: "/abs/x.png",
            relPath: "./images/x.png",
            sha256: "abc123",
            mime: "image/png",
            width: 10,
            height: 10,
            bitDepth: 8,
          },
        ],
      },
    };
    expect(validateMosaicFile(ok).ok).toBe(true);
  });

  it("rejects rows > 10 or rows < 1", () => {
    expect(
      validateMosaicFile({
        ...MIN_VALID,
        state: { ...MIN_VALID.state, rows: 0 },
      }).ok,
    ).toBe(false);
    expect(
      validateMosaicFile({
        ...MIN_VALID,
        state: { ...MIN_VALID.state, rows: 11 },
      }).ok,
    ).toBe(false);
  });

  it("accepts panels with optional `hidden: true`", () => {
    const ok = {
      ...MIN_VALID,
      state: {
        ...MIN_VALID.state,
        panels: [
          { id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1, hidden: true },
          { id: "p2", row: 0, col: 1, rowSpan: 1, colSpan: 1 },
          { id: "p3", row: 1, col: 0, rowSpan: 1, colSpan: 1 },
          { id: "p4", row: 1, col: 1, rowSpan: 1, colSpan: 1 },
        ],
      },
    };
    expect(validateMosaicFile(ok).ok).toBe(true);
  });

  it("accepts panels with an in-range transform.crop", () => {
    const ok = {
      ...MIN_VALID,
      state: {
        ...MIN_VALID.state,
        panels: [
          {
            id: "p1",
            row: 0,
            col: 0,
            rowSpan: 1,
            colSpan: 1,
            imageId: "img",
            transform: {
              fit: "contain",
              panX: 0,
              panY: 0,
              zoom: 1,
              rotation: 0,
              flipH: false,
              flipV: false,
              crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 },
            },
          },
          { id: "p2", row: 0, col: 1, rowSpan: 1, colSpan: 1 },
          { id: "p3", row: 1, col: 0, rowSpan: 1, colSpan: 1 },
          { id: "p4", row: 1, col: 1, rowSpan: 1, colSpan: 1 },
        ],
      },
    };
    expect(validateMosaicFile(ok).ok).toBe(true);
  });

  it("rejects panels with an out-of-range transform.crop", () => {
    const bad = {
      ...MIN_VALID,
      state: {
        ...MIN_VALID.state,
        panels: [
          {
            id: "p1",
            row: 0,
            col: 0,
            rowSpan: 1,
            colSpan: 1,
            imageId: "img",
            transform: {
              fit: "contain",
              panX: 0,
              panY: 0,
              zoom: 1,
              rotation: 0,
              flipH: false,
              flipV: false,
              crop: { x: 0.6, y: 0, w: 0.5, h: 1 },
            },
          },
          { id: "p2", row: 0, col: 1, rowSpan: 1, colSpan: 1 },
          { id: "p3", row: 1, col: 0, rowSpan: 1, colSpan: 1 },
          { id: "p4", row: 1, col: 1, rowSpan: 1, colSpan: 1 },
        ],
      },
    };
    const r = validateMosaicFile(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("crop");
  });

  it("rejects non-boolean `hidden` field", () => {
    const bad = {
      ...MIN_VALID,
      state: {
        ...MIN_VALID.state,
        panels: [
          { id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1, hidden: "yes" },
          { id: "p2", row: 0, col: 1, rowSpan: 1, colSpan: 1 },
          { id: "p3", row: 1, col: 0, rowSpan: 1, colSpan: 1 },
          { id: "p4", row: 1, col: 1, rowSpan: 1, colSpan: 1 },
        ],
      },
    };
    const r = validateMosaicFile(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("hidden");
  });
});

describe("validateMosaicFile schema versions", () => {
  it("accepts a valid v1 file with arrow annotations", () => {
    const v1 = makeMinimalFile(1, [
      {
        id: "a1",
        kind: "arrow",
        z: 0,
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 0,
        color: "#000000",
        thicknessPx: 2,
        head: "filled",
      },
    ]);
    expect(validateMosaicFile(v1).ok).toBe(true);
  });

  it("accepts a valid v2 file with symbol annotations", () => {
    const v2 = makeMinimalFile(2, [
      {
        id: "a1",
        kind: "symbol",
        z: 0,
        symbolId: "arrow-filled-right",
        x: 50,
        y: 50,
        sizePx: 60,
        rotationDeg: 0,
        color: "#000000",
        strokeWidthPx: 2,
      },
    ]);
    expect(validateMosaicFile(v2).ok).toBe(true);
  });

  it("rejects a v1 file containing symbol annotations", () => {
    const bad = makeMinimalFile(1, [
      {
        id: "a1",
        kind: "symbol",
        z: 0,
        symbolId: "x",
        x: 0,
        y: 0,
        sizePx: 60,
        rotationDeg: 0,
        color: "#000000",
        strokeWidthPx: 2,
      },
    ]);
    const r = validateMosaicFile(bad);
    expect(r.ok).toBe(false);
  });

  it("rejects a v2 file containing arrow annotations", () => {
    const bad = makeMinimalFile(2, [
      {
        id: "a1",
        kind: "arrow",
        z: 0,
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 0,
        color: "#000000",
        thicknessPx: 2,
        head: "filled",
      },
    ]);
    const r = validateMosaicFile(bad);
    expect(r.ok).toBe(false);
  });

  it("rejects schemaVersion 99 (unsupported)", () => {
    const bad = makeMinimalFile(99 as unknown as 1 | 2 | 3, []);
    expect(validateMosaicFile(bad).ok).toBe(false);
  });
});

describe("schema v5 — layout (spec 11, carried into v5)", () => {
  function v5File(layoutOverride?: object): unknown {
    return {
      schemaVersion: 5,
      app: "mosaic-builder",
      appVersion: "0.1.0",
      createdAt: "2026-05-09T00:00:00.000Z",
      modifiedAt: "2026-05-09T00:00:00.000Z",
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      state: {
        rows: 2,
        cols: 2,
        gutterPx: 12,
        gutterColor: "#FFFFFF",
        outerGutter: true,
        pool: [],
        panels: [
          { id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1 },
          { id: "p2", row: 0, col: 1, rowSpan: 1, colSpan: 1 },
          { id: "p3", row: 1, col: 0, rowSpan: 1, colSpan: 1 },
          { id: "p4", row: 1, col: 1, rowSpan: 1, colSpan: 1 },
        ],
        annotations: [],
        globalStyle: {
          letters: {
            enabled: true,
            font: "Arial",
            sizePt: 12,
            color: "#000000",
            corner: "tl",
            paddingPx: 6,
            bold: true,
            italic: false,
          },
          scalebar: {
            font: "Arial",
            sizePt: 10,
            color: "#FFFFFF",
            barColor: "#FFFFFF",
            thicknessPx: 4,
            corner: "br",
            paddingPx: 8,
            showLabel: true,
          },
        },
        letterOverrides: {},
        letterPattern: "uppercase",
        layout: layoutOverride ?? {
          kind: "uniform",
          colWeights: [0.5, 0.5],
          rowWeights: [0.5, 0.5],
        },
      },
    };
  }

  it("accepts a uniform layout with valid weights", () => {
    const r = validateMosaicFile(v5File());
    expect(r.ok).toBe(true);
  });

  it("rejects uniform layout with mismatched colWeights length", () => {
    const r = validateMosaicFile(
      v5File({ kind: "uniform", colWeights: [1.0], rowWeights: [0.5, 0.5] }),
    );
    expect(r.ok).toBe(false);
  });

  it("accepts a free layout with valid rects", () => {
    const r = validateMosaicFile(
      v5File({
        kind: "free",
        rects: {
          p1: { x: 0, y: 0, w: 100, h: 100 },
        },
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("rejects free layout with non-numeric rect", () => {
    const r = validateMosaicFile(
      v5File({
        kind: "free",
        rects: { p1: { x: "wrong", y: 0, w: 100, h: 100 } },
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("rejects unknown layout.kind", () => {
    const r = validateMosaicFile(v5File({ kind: "wat" }));
    expect(r.ok).toBe(false);
  });
});

function makeMinimalFile(
  schemaVersion: 1 | 2 | 3,
  annotations: unknown[],
): unknown {
  return {
    schemaVersion,
    app: "mosaic-builder",
    appVersion: "0.1.0",
    createdAt: "2026-05-09T00:00:00Z",
    modifiedAt: "2026-05-09T00:00:00Z",
    canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
    state: {
      rows: 1,
      cols: 1,
      gutterPx: 0,
      gutterColor: "#FFFFFF",
      pool: [],
      panels: [{ id: "p1", row: 0, col: 0, rowSpan: 1, colSpan: 1 }],
      annotations,
      globalStyle: {
        letters: {
          enabled: true,
          font: "Arial",
          sizePt: 14,
          color: "#000000",
          paddingPx: 4,
          bold: true,
          corner: "tl",
        },
        scalebar: {
          font: "Arial",
          sizePt: 12,
          color: "#000000",
          barColor: "#000000",
          thicknessPx: 4,
          paddingPx: 8,
          showLabel: true,
          corner: "br",
        },
      },
      letterOverrides: {},
    },
  };
}
