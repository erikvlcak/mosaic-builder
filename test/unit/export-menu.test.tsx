// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
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

describe("ExportMenu", () => {
  it("anchors the dropdown to the right edge of the toggle to avoid right-side viewport clipping", () => {
    render(
      <ExportMenu
        figure={figure}
        images={new Map()}
        poolList={[]}
        rows={1}
        cols={1}
        gutterPx={4}
      />,
    );
    fireEvent.click(screen.getByTestId("export-menu-toggle"));
    const menu = screen.getByRole("menu");
    expect(menu.style.right).toBe("0px");
    expect(menu.style.left).toBe("");
    expect(menu.style.maxHeight).not.toBe("");
    expect(menu.style.overflowY).toBe("auto");
  });
});
