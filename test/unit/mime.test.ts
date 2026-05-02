import { describe, it, expect } from "vitest";
import { mimeFromExt } from "../../src/main/mime";

describe("mimeFromExt", () => {
  it("recognizes png (any case)", () => {
    expect(mimeFromExt("/x/foo.png")).toBe("image/png");
    expect(mimeFromExt("/x/FOO.PNG")).toBe("image/png");
  });

  it("recognizes jpg and jpeg", () => {
    expect(mimeFromExt("/x/foo.jpg")).toBe("image/jpeg");
    expect(mimeFromExt("/x/foo.jpeg")).toBe("image/jpeg");
    expect(mimeFromExt("/x/FOO.JPEG")).toBe("image/jpeg");
  });

  it("returns null for anything else", () => {
    expect(mimeFromExt("/x/foo.tif")).toBe(null);
    expect(mimeFromExt("/x/foo.tiff")).toBe(null);
    expect(mimeFromExt("/x/foo.gif")).toBe(null);
    expect(mimeFromExt("/x/foo")).toBe(null);
    expect(mimeFromExt("")).toBe(null);
  });
});
