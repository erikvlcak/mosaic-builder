import { describe, it, expect } from "vitest";
import { nextCmdHeld } from "../../src/renderer/hooks/useTemporarySelect";

describe("nextCmdHeld", () => {
  it("Meta keydown sets held true", () => {
    expect(
      nextCmdHeld(false, { key: "Meta", metaKey: true, ctrlKey: false }),
    ).toBe(true);
  });

  it("Control keydown sets held true", () => {
    expect(
      nextCmdHeld(false, { key: "Control", metaKey: false, ctrlKey: true }),
    ).toBe(true);
  });

  it("a chord (metaKey + z) cancels held", () => {
    expect(
      nextCmdHeld(true, { key: "z", metaKey: true, ctrlKey: false }),
    ).toBe(false);
  });

  it("a chord (metaKey + n) cancels held", () => {
    expect(
      nextCmdHeld(true, { key: "n", metaKey: true, ctrlKey: false }),
    ).toBe(false);
  });

  it("an unmodified key leaves held unchanged", () => {
    expect(
      nextCmdHeld(true, { key: "a", metaKey: false, ctrlKey: false }),
    ).toBe(true);
  });
});
