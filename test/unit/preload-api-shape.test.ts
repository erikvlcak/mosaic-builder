import { describe, it, expect } from "vitest";
import { API_CHANNELS, type MosaicApi } from "../../src/preload/api";

describe("preload API contract", () => {
  it("declares a stable channel name for ping", () => {
    expect(API_CHANNELS.ping).toBe("mosaic:ping");
  });

  it("MosaicApi.ping returns a Promise<number>", () => {
    // Type-level assertion via a no-op assignable check.
    const fake: MosaicApi = {
      ping: () => Promise.resolve(123),
    };
    expect(typeof fake.ping).toBe("function");
  });
});
