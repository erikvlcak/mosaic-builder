import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { APP_VERSION } from "../../src/renderer/app-version";

describe("APP_VERSION", () => {
  it("matches package.json version", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, "../../package.json"), "utf8"),
    );
    expect(APP_VERSION).toBe(pkg.version);
  });
});
