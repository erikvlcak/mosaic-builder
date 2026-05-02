import { describe, it, expect } from "vitest";
import { cellLabel } from "../../src/renderer/render/letters";

describe("cellLabel", () => {
  it("labels first 26 cells A..Z", () => {
    expect(cellLabel(0)).toBe("A");
    expect(cellLabel(1)).toBe("B");
    expect(cellLabel(25)).toBe("Z");
  });
  it("rolls over to AA after Z", () => {
    expect(cellLabel(26)).toBe("AA");
    expect(cellLabel(27)).toBe("AB");
    expect(cellLabel(51)).toBe("AZ");
    expect(cellLabel(52)).toBe("BA");
  });
  it("handles the 10x10 max (index 99)", () => {
    expect(cellLabel(99)).toBe("CV");
  });
  it("throws on negative input", () => {
    expect(() => cellLabel(-1)).toThrow();
  });
});
