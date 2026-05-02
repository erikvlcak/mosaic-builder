import { describe, it, expect } from "vitest";
import { API_CHANNELS, type MosaicApi } from "../../src/preload/api";

describe("preload API contract", () => {
  it("declares stable channel names", () => {
    expect(API_CHANNELS.ping).toBe("mosaic:ping");
    expect(API_CHANNELS.exportPng).toBe("mosaic:export-png");
    expect(API_CHANNELS.exportJpeg).toBe("mosaic:export-jpeg");
    expect(API_CHANNELS.exportTiff).toBe("mosaic:export-tiff");
    expect(API_CHANNELS.exportPdf).toBe("mosaic:export-pdf");
    expect(API_CHANNELS.openImages).toBe("mosaic:open-images");
  });

  it("export channels are string-typed", () => {
    expect(typeof API_CHANNELS.exportJpeg).toBe("string");
    expect(typeof API_CHANNELS.exportTiff).toBe("string");
    expect(typeof API_CHANNELS.exportPdf).toBe("string");
  });

  it("MosaicApi shape", () => {
    const fake: MosaicApi = {
      ping: () => Promise.resolve(123),
      exportPng: () =>
        Promise.resolve({ ok: true, filePath: "/tmp/x.png", bytesWritten: 0 }),
      exportJpeg: () =>
        Promise.resolve({ ok: true, filePath: "/tmp/x.jpg", bytesWritten: 0 }),
      exportTiff: () =>
        Promise.resolve({ ok: true, filePath: "/tmp/x.tif", bytesWritten: 0 }),
      exportPdf: () =>
        Promise.resolve({ ok: true, filePath: "/tmp/x.pdf", bytesWritten: 0 }),
      openImages: () => Promise.resolve({ canceled: true }),
    };
    expect(typeof fake.ping).toBe("function");
    expect(typeof fake.exportPng).toBe("function");
    expect(typeof fake.exportJpeg).toBe("function");
    expect(typeof fake.exportTiff).toBe("function");
    expect(typeof fake.exportPdf).toBe("function");
    expect(typeof fake.openImages).toBe("function");
  });
});
