import { describe, it, expect, vi, beforeEach } from "vitest";

interface SaveOpts {
  title?: string;
  defaultPath?: string;
  filters: { name: string; extensions: string[] }[];
}

const showSaveDialog = vi.fn();
const showOpenDialog = vi.fn();

vi.mock("electron", () => ({
  dialog: { showSaveDialog, showOpenDialog },
}));

beforeEach(() => {
  showSaveDialog.mockReset();
  showOpenDialog.mockReset();
});

function callOpts(callIndex = 0): SaveOpts {
  const args = showSaveDialog.mock.calls[callIndex];
  if (args === undefined) throw new Error("showSaveDialog not called");
  return args[0] as SaveOpts;
}

describe("pickPngSavePath", () => {
  it("forwards filters and returns canonical shape", async () => {
    showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: "/tmp/x.png",
    });
    const { pickPngSavePath } = await import("../../src/main/dialogs");
    const r = await pickPngSavePath({
      parentWindow: null,
      defaultName: "x.png",
    });
    expect(r).toEqual({ canceled: false, filePath: "/tmp/x.png" });
    expect(callOpts().filters).toEqual([
      { name: "PNG image", extensions: ["png"] },
    ]);
  });
});

describe("pickJpegSavePath", () => {
  it("uses jpg + jpeg extensions", async () => {
    showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: "/tmp/x.jpg",
    });
    const { pickJpegSavePath } = await import("../../src/main/dialogs");
    const r = await pickJpegSavePath({
      parentWindow: null,
      defaultName: "x.jpg",
    });
    expect(r.canceled).toBe(false);
    expect(callOpts().filters).toEqual([
      { name: "JPEG image", extensions: ["jpg", "jpeg"] },
    ]);
  });
});

describe("pickTiffSavePath", () => {
  it("uses tif + tiff extensions", async () => {
    showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: "/tmp/x.tif",
    });
    const { pickTiffSavePath } = await import("../../src/main/dialogs");
    const r = await pickTiffSavePath({
      parentWindow: null,
      defaultName: "x.tif",
    });
    expect(r.canceled).toBe(false);
    expect(callOpts().filters).toEqual([
      { name: "TIFF image", extensions: ["tif", "tiff"] },
    ]);
  });
});

describe("pickPdfSavePath", () => {
  it("uses pdf extension", async () => {
    showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: "/tmp/x.pdf",
    });
    const { pickPdfSavePath } = await import("../../src/main/dialogs");
    const r = await pickPdfSavePath({
      parentWindow: null,
      defaultName: "x.pdf",
    });
    expect(r.canceled).toBe(false);
    expect(callOpts().filters).toEqual([
      { name: "PDF document", extensions: ["pdf"] },
    ]);
  });

  it("propagates canceled state", async () => {
    showSaveDialog.mockResolvedValueOnce({
      canceled: true,
      filePath: undefined,
    });
    const { pickPdfSavePath } = await import("../../src/main/dialogs");
    const r = await pickPdfSavePath({
      parentWindow: null,
      defaultName: "x.pdf",
    });
    expect(r.canceled).toBe(true);
  });
});

describe("pickMosaicSavePath", () => {
  it("uses .mosaic extension and the Mosaic project filter", async () => {
    showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: "/tmp/figure.mosaic",
    });
    const { pickMosaicSavePath } = await import("../../src/main/dialogs");
    const r = await pickMosaicSavePath({
      parentWindow: null,
      defaultName: "figure.mosaic",
    });
    expect(r).toEqual({ canceled: false, filePath: "/tmp/figure.mosaic" });
    expect(callOpts().filters).toEqual([
      { name: "Mosaic project", extensions: ["mosaic"] },
    ]);
  });
});

describe("pickMosaicOpenPath", () => {
  it("returns the picked file path", async () => {
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/tmp/figure.mosaic"],
    });
    const { pickMosaicOpenPath } = await import("../../src/main/dialogs");
    const r = await pickMosaicOpenPath({ parentWindow: null });
    expect(r).toEqual({ canceled: false, filePath: "/tmp/figure.mosaic" });
  });

  it("returns canceled when user dismisses the dialog", async () => {
    showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });
    const { pickMosaicOpenPath } = await import("../../src/main/dialogs");
    const r = await pickMosaicOpenPath({ parentWindow: null });
    expect(r.canceled).toBe(true);
  });
});
