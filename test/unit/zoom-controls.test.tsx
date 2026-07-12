// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ZoomControls } from "../../src/renderer/components/Toolbar/ZoomControls";

afterEach(() => cleanup());

function setup(overrides = {}) {
  const props = {
    displayPct: 100,
    isFit: false,
    onFit: vi.fn(),
    onActualSize: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onSetPercent: vi.fn(),
    ...overrides,
  };
  render(<ZoomControls {...props} />);
  return props;
}

describe("ZoomControls", () => {
  it("fires onFit / onActualSize / onZoomIn / onZoomOut", () => {
    const p = setup();
    fireEvent.click(screen.getByTestId("zoom-fit"));
    fireEvent.click(screen.getByTestId("zoom-actual"));
    fireEvent.click(screen.getByTestId("zoom-in"));
    fireEvent.click(screen.getByTestId("zoom-out"));
    expect(p.onFit).toHaveBeenCalledOnce();
    expect(p.onActualSize).toHaveBeenCalledOnce();
    expect(p.onZoomIn).toHaveBeenCalledOnce();
    expect(p.onZoomOut).toHaveBeenCalledOnce();
  });

  it("shows the current percent", () => {
    setup({ displayPct: 250 });
    expect(screen.getByTestId<HTMLInputElement>("zoom-pct-input").value).toBe(
      "250",
    );
  });

  it("commits a typed percent on Enter", () => {
    const p = setup();
    const input = screen.getByTestId<HTMLInputElement>("zoom-pct-input");
    fireEvent.change(input, { target: { value: "175" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(p.onSetPercent).toHaveBeenCalledWith(175);
  });

  it("ignores a non-numeric percent entry", () => {
    const p = setup();
    const input = screen.getByTestId<HTMLInputElement>("zoom-pct-input");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(p.onSetPercent).not.toHaveBeenCalled();
  });
});
