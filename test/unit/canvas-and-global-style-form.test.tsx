// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CanvasAndGlobalStyleForm } from "../../src/renderer/components/Properties/CanvasAndGlobalStyleForm";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import { initialFigureState } from "../../src/renderer/model/figure-state";
import type { FigureAction } from "../../src/renderer/model/figure-actions";

type SetGlobalStyleAction = Extract<FigureAction, { type: "SET_GLOBAL_STYLE" }>;

describe("CanvasAndGlobalStyleForm", () => {
  it("dispatches SET_GLOBAL_STYLE when the letters font size changes", () => {
    const dispatch = vi.fn<(a: FigureAction) => void>();
    render(
      <CanvasAndGlobalStyleForm
        state={initialFigureState()}
        globalStyle={DEFAULT_GLOBAL_STYLE}
        dispatch={dispatch}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
      />,
    );
    // The form groups letters/scalebar fields in <fieldset> elements with a
    // legend providing context; the bare label inside is "Size (pt)".
    const input = screen.getByLabelText("Size (pt)");
    // NumberField is a controlled component — fireEvent.change to set the
    // final value in one shot rather than per-keystroke (jsdom number-input limitation).
    fireEvent.change(input, { target: { value: "16" } });
    const last = dispatch.mock.calls.at(-1)?.[0] as SetGlobalStyleAction | undefined;
    expect(last?.type).toBe("SET_GLOBAL_STYLE");
    expect(last?.style.letters.sizePt).toBe(16);
  });

  it("dispatches when the scalebar corner changes", async () => {
    const dispatch = vi.fn<(a: FigureAction) => void>();
    const commit = { markDirty: vi.fn(), flush: vi.fn() };
    render(
      <CanvasAndGlobalStyleForm
        state={initialFigureState()}
        globalStyle={DEFAULT_GLOBAL_STYLE} dispatch={dispatch} commit={commit}
      />,
    );
    const tlButtons = screen.getAllByLabelText("Top-left");
    // tlButtons[0] is letters' corner; tlButtons[1] is scalebar's.
    await userEvent.click(tlButtons[1]!);
    const last = dispatch.mock.calls.at(-1)?.[0] as SetGlobalStyleAction | undefined;
    expect(last?.style.scalebar.corner).toBe("tl");
    expect(commit.flush).toHaveBeenCalled();
  });

  it("dispatches SET_LETTER_PATTERN when the pattern dropdown changes", () => {
    const dispatch = vi.fn<(a: FigureAction) => void>();
    const commit = { markDirty: vi.fn(), flush: vi.fn() };
    render(
      <CanvasAndGlobalStyleForm
        state={initialFigureState()}
        globalStyle={DEFAULT_GLOBAL_STYLE}
        dispatch={dispatch}
        commit={commit}
      />,
    );
    const select = screen.getByLabelText("Letter pattern");
    fireEvent.change(select, { target: { value: "numeric" } });
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_LETTER_PATTERN",
      pattern: "numeric",
    });
    expect(commit.flush).toHaveBeenCalled();
  });

  it("dispatches CLEAR_ALL_LETTER_OVERRIDES from the reset button (when overrides exist)", async () => {
    const dispatch = vi.fn<(a: FigureAction) => void>();
    const commit = { markDirty: vi.fn(), flush: vi.fn() };
    const stateWithOverrides = {
      ...initialFigureState(),
      letterOverrides: { p1: { text: "Z" } },
    };
    render(
      <CanvasAndGlobalStyleForm
        state={stateWithOverrides}
        globalStyle={DEFAULT_GLOBAL_STYLE}
        dispatch={dispatch}
        commit={commit}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /reset all letter overrides/i }),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "CLEAR_ALL_LETTER_OVERRIDES",
    });
  });

  it("disables the reset button when no overrides exist", () => {
    render(
      <CanvasAndGlobalStyleForm
        state={initialFigureState()}
        globalStyle={DEFAULT_GLOBAL_STYLE}
        dispatch={vi.fn()}
        commit={{ markDirty: vi.fn(), flush: vi.fn() }}
      />,
    );
    const btn = screen.getByRole("button", {
      name: /reset all letter overrides/i,
    });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});
