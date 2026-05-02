import { describe, it, expect } from "vitest";
import { API_CHANNELS, type MosaicApi } from "../../src/preload/api";

describe("preload API contract", () => {
  it("declares stable channel names", () => {
    expect(API_CHANNELS.ping).toBe("mosaic:ping");
    expect(API_CHANNELS.exportPng).toBe("mosaic:export-png");
  });

  it("MosaicApi shape", () => {
    const fake: MosaicApi = {
      ping: () => Promise.resolve(123),
      exportPng: () =>
        Promise.resolve({ ok: true, filePath: "/tmp/x.png", bytesWritten: 0 }),
    };
    expect(typeof fake.ping).toBe("function");
    expect(typeof fake.exportPng).toBe("function");
  });
});
