import { describe, it, expect } from "vitest";
import { sha256OfBytes } from "../../src/main/sha256";

describe("sha256OfBytes", () => {
  it("hashes empty input deterministically", () => {
    const h = sha256OfBytes(new Uint8Array());
    expect(h).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("hashes 'abc' to the known sha256", () => {
    const bytes = new TextEncoder().encode("abc");
    expect(sha256OfBytes(bytes)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
