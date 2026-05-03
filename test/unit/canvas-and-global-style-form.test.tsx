// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CanvasAndGlobalStyleForm } from "../../src/renderer/components/Properties/CanvasAndGlobalStyleForm";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";

describe("CanvasAndGlobalStyleForm", () => {
  it("dispatches SET_GLOBAL_STYLE when the letters font size changes", () => {
    const dispatch = vi.fn();
    render(
      <CanvasAndGlobalStyleForm
        globalStyle={DEFAULT_GLOBAL_STYLE}
        dispatch={dispatch}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
      />,
    );
    const input = screen.getByLabelText("Letters size (pt)") as HTMLInputElement;
    // NumberField is a controlled component — fireEvent.change to set the
    // final value in one shot rather than per-keystroke (jsdom number-input limitation).
    fireEvent.change(input, { target: { value: "16" } });
    const last = dispatch.mock.calls.at(-1)?.[0];
    expect(last.type).toBe("SET_GLOBAL_STYLE");
    expect(last.style.letters.sizePt).toBe(16);
  });

  it("dispatches when the scalebar corner changes", async () => {
    const dispatch = vi.fn();
    const commit = { markDirty: vi.fn(), flush: vi.fn() };
    render(
      <CanvasAndGlobalStyleForm
        globalStyle={DEFAULT_GLOBAL_STYLE} dispatch={dispatch} commit={commit}
      />,
    );
    const tlButtons = screen.getAllByLabelText("Top-left");
    // tlButtons[0] is letters' corner; tlButtons[1] is scalebar's.
    await userEvent.click(tlButtons[1]!);
    const last = dispatch.mock.calls.at(-1)?.[0];
    expect(last.style.scalebar.corner).toBe("tl");
    expect(commit.flush).toHaveBeenCalled();
  });
});
