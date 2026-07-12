// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Thumbnail } from "../../src/renderer/components/Sidebar/Thumbnail";
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

describe("Thumbnail placed badge", () => {
  it("renders a 'placed' check badge on placed thumbnails", () => {
    render(<Thumbnail item={img("a")} bitmap={undefined} placed />);
    expect(screen.getByTestId("thumb-badge-a")).toBeDefined();
  });

  it("does not render the placed badge on unplaced thumbnails", () => {
    render(<Thumbnail item={img("a")} bitmap={undefined} placed={false} />);
    expect(screen.queryByTestId("thumb-badge-a")).toBeNull();
  });
});

describe("Thumbnail click-to-place", () => {
  it("clicking an unplaced thumbnail calls onSelectForPlace with its id", () => {
    const onSelectForPlace = vi.fn();
    render(
      <Thumbnail
        item={img("a")}
        bitmap={undefined}
        placed={false}
        selectedForPlace={false}
        onSelectForPlace={onSelectForPlace}
      />,
    );
    fireEvent.click(screen.getByTestId("thumb-a"));
    expect(onSelectForPlace).toHaveBeenCalledWith("a");
  });

  it("reflects selected-for-place state with an aria-pressed flag", () => {
    render(
      <Thumbnail
        item={img("a")}
        bitmap={undefined}
        placed={false}
        selectedForPlace
        onSelectForPlace={vi.fn()}
      />,
    );
    expect(screen.getByTestId("thumb-a").getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("pressing Enter on a focused unplaced thumbnail calls onPlaceIntoFirstEmpty", () => {
    const onPlaceIntoFirstEmpty = vi.fn();
    render(
      <Thumbnail
        item={img("a")}
        bitmap={undefined}
        placed={false}
        selectedForPlace={false}
        onSelectForPlace={vi.fn()}
        onPlaceIntoFirstEmpty={onPlaceIntoFirstEmpty}
      />,
    );
    fireEvent.keyDown(screen.getByTestId("thumb-a"), { key: "Enter" });
    expect(onPlaceIntoFirstEmpty).toHaveBeenCalledWith("a");
  });

  it("does not wire click-to-place on placed thumbnails", () => {
    const onSelectForPlace = vi.fn();
    render(
      <Thumbnail
        item={img("a")}
        bitmap={undefined}
        placed
        onSelectForPlace={onSelectForPlace}
      />,
    );
    fireEvent.click(screen.getByTestId("thumb-a"));
    expect(onSelectForPlace).not.toHaveBeenCalled();
  });
});

describe("Thumbnail placed-image dragging", () => {
  it("placed thumbnails are draggable", () => {
    render(<Thumbnail item={img("a")} bitmap={undefined} placed />);
    const el = screen.getByTestId("thumb-a");
    expect(el.getAttribute("draggable")).toBe("true");
  });

  it("dragging a placed thumbnail emits a tray payload and reports the source", () => {
    const onDragSourceChange = vi.fn();
    render(
      <Thumbnail
        item={img("a")}
        bitmap={undefined}
        placed
        onDragSourceChange={onDragSourceChange}
      />,
    );
    const el = screen.getByTestId("thumb-a");
    const setData = vi.fn();
    fireEvent.dragStart(el, {
      dataTransfer: { setData, effectAllowed: "" },
    });
    expect(setData).toHaveBeenCalledWith(
      "application/x-mosaic-drag",
      JSON.stringify({ kind: "tray", imageId: "a" }),
    );
    expect(onDragSourceChange).toHaveBeenCalledWith({
      kind: "tray",
      imageId: "a",
    });
  });
});
