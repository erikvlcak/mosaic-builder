import { describe, it, expect } from "vitest";
import { resolveWindowConfig } from "../../src/main/window";

describe("resolveWindowConfig", () => {
  it("enforces secure defaults", () => {
    const cfg = resolveWindowConfig({
      preloadPath: "/tmp/preload.js",
      devServerUrl: undefined,
    });

    expect(cfg.webPreferences.contextIsolation).toBe(true);
    expect(cfg.webPreferences.nodeIntegration).toBe(false);
    expect(cfg.webPreferences.sandbox).toBe(true);
    expect(cfg.webPreferences.webSecurity).toBe(true);
    expect(cfg.webPreferences.preload).toBe("/tmp/preload.js");
  });

  it("sets a sensible initial size", () => {
    const cfg = resolveWindowConfig({
      preloadPath: "/tmp/preload.js",
      devServerUrl: undefined,
    });

    expect(cfg.width).toBeGreaterThanOrEqual(1280);
    expect(cfg.height).toBeGreaterThanOrEqual(800);
    expect(cfg.show).toBe(false); // Show only after ready-to-show.
  });

  it("returns dev URL when one is provided, else null (caller loads file)", () => {
    const dev = resolveWindowConfig({
      preloadPath: "/tmp/p.js",
      devServerUrl: "http://localhost:5173",
    });
    expect(dev.loadTarget).toEqual({
      kind: "url",
      url: "http://localhost:5173",
    });

    const prod = resolveWindowConfig({
      preloadPath: "/tmp/p.js",
      devServerUrl: undefined,
    });
    expect(prod.loadTarget).toEqual({ kind: "file" });
  });
});
