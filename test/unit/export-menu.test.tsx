// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExportMenu } from "../../src/renderer/components/Toolbar/ExportMenu";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import type { Figure } from "../../src/renderer/model/types";

const figure: Figure = {
  canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
  grid: { rows: 1, cols: 1, gutterPx: 4, gutterColor: "#000000" },
  panels: [{ row: 0, col: 0, kind: "placeholder", label: "A" }],
  annotations: [],
  globalStyle: DEFAULT_GLOBAL_STYLE,
};

function renderMenu(
  overrides: Partial<React.ComponentProps<typeof ExportMenu>> = {},
) {
  render(
    <ExportMenu
      figure={figure}
      exportScale={1}
      status={{ kind: "idle" }}
      jpegQuality={0.92}
      onJpegQualityChange={vi.fn()}
      runPng={vi.fn()}
      runJpeg={vi.fn()}
      runTiff={vi.fn()}
      runPdf={vi.fn()}
      {...overrides}
    />,
  );
}

describe("ExportMenu", () => {
  it("anchors the dropdown to the right edge of the toggle to avoid right-side viewport clipping", () => {
    renderMenu();
    fireEvent.click(screen.getByTestId("export-menu-toggle"));
    const menu = screen.getByRole("menu");
    expect(menu.style.right).toBe("0px");
    expect(menu.style.left).toBe("");
    expect(menu.style.maxHeight).not.toBe("");
    expect(menu.style.overflowY).toBe("auto");
  });

  it("shows the computed PNG output dimensions at the current export scale", () => {
    renderMenu({ exportScale: 4 });
    fireEvent.click(screen.getByTestId("export-menu-toggle"));
    // 800×600 at scale 4 = 3200 × 2400 px.
    expect(screen.getByTestId("export-png-btn").textContent).toContain(
      "3200 × 2400 px",
    );
  });

  it("labels TIFF with its dpi and PDF with a physical size in cm", () => {
    renderMenu({ exportScale: 1 });
    fireEvent.click(screen.getByTestId("export-menu-toggle"));
    expect(screen.getByTestId("export-tiff-btn").textContent).toMatch(/dpi/);
    expect(screen.getByTestId("export-pdf-btn").textContent).toMatch(/cm/);
  });

  it("replaces 'transparent OK' with 'keeps transparency' on PNG", () => {
    renderMenu();
    fireEvent.click(screen.getByTestId("export-menu-toggle"));
    const png = screen.getByTestId("export-png-btn").textContent ?? "";
    expect(png).toContain("keeps transparency");
    expect(png).not.toContain("transparent OK");
  });

  it("calls runPng when the PNG item is clicked", () => {
    const runPng = vi.fn();
    renderMenu({ runPng });
    fireEvent.click(screen.getByTestId("export-menu-toggle"));
    fireEvent.click(screen.getByTestId("export-png-btn"));
    expect(runPng).toHaveBeenCalled();
  });
});
