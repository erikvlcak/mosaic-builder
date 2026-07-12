// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { EditorCanvas } from "../../src/renderer/components/Canvas/EditorCanvas";
import * as rendererModule from "../../src/renderer/render/editor-renderer";
import type { Figure } from "../../src/renderer/model/types";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";

const FIG: Figure = {
  canvas: { widthPx: 800, heightPx: 600, background: "#fff" },
  grid: { rows: 1, cols: 1, gutterPx: 0, gutterColor: "#000" },
  panels: [{ row: 0, col: 0, kind: "placeholder", label: "" }],
  annotations: [],
  globalStyle: DEFAULT_GLOBAL_STYLE,
};

afterEach(() => cleanup());

describe("EditorCanvas: editorScale plumbing", () => {
  it("forwards editorScale to the renderer's setEditorScale", () => {
    const setEditorScale = vi.fn();
    vi.spyOn(rendererModule, "createEditorRenderer").mockReturnValue({
      setFigure: vi.fn(),
      setImages: vi.fn(),
      setPool: vi.fn(),
      setEditorScale,
      setTheme: vi.fn(),
      dispose: vi.fn(),
    });
    render(
      <EditorCanvas
        figure={FIG}
        images={new Map()}
        pool={new Map()}
        editorScale={4}
        theme="light"
      />,
    );
    expect(setEditorScale).toHaveBeenCalledWith(4);
  });
});
