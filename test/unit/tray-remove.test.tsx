// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Tray } from "../../src/renderer/components/Sidebar/Tray";
import type { ImagePoolItem } from "../../src/renderer/model/pool";

function img(id: string): ImagePoolItem {
  return {
    id,
    filename: `${id}.png`,
    filePath: `/x/${id}.png`,
    mime: "image/png",
    width: 10,
    height: 10,
    bitDepth: 8,
  };
}

function renderTray(placedIds: Set<string>, onRemoveImage = vi.fn()) {
  render(
    <Tray
      pool={[img("a"), img("b")]}
      bitmaps={new Map()}
      placedIds={placedIds}
      onAddImagesClick={() => {}}
      onUnplacePanel={() => {}}
      onRemoveImage={onRemoveImage}
    />,
  );
  return { onRemoveImage };
}

describe("Tray image removal (4.4)", () => {
  it("clicking an unplaced thumbnail's × calls onRemoveImage with its id", () => {
    const { onRemoveImage } = renderTray(new Set());
    fireEvent.click(screen.getByTestId("thumb-remove-a"));
    expect(onRemoveImage).toHaveBeenCalledTimes(1);
    expect(onRemoveImage).toHaveBeenCalledWith("a");
  });

  it("does not render a remove button on placed thumbnails", () => {
    renderTray(new Set(["a"])); // 'a' placed, 'b' unplaced
    expect(screen.queryByTestId("thumb-remove-a")).toBeNull();
    expect(screen.getByTestId("thumb-remove-b")).toBeDefined();
  });
});
