import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
  dialog: {
    showSaveDialog: vi
      .fn()
      .mockResolvedValue({ canceled: false, filePath: "/tmp/x.png" }),
  },
}));

describe("pickPngSavePath", () => {
  it("forwards filters and returns canonical shape", async () => {
    const { pickPngSavePath } = await import("../../src/main/dialogs");
    const r = await pickPngSavePath({ parentWindow: null, defaultName: "x.png" });
    expect(r).toEqual({ canceled: false, filePath: "/tmp/x.png" });
  });
});
