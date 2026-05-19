// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LetterAnnoForm } from "../../src/renderer/components/Properties/LetterAnnoForm";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";
import type { FigureAction } from "../../src/renderer/model/figure-actions";

type SetLetterOverride = Extract<FigureAction, { type: "SET_LETTER_OVERRIDE" }>;

const COMMIT = { markDirty: vi.fn(), flush: vi.fn() };

function lastCall(
  dispatch: ReturnType<typeof vi.fn>,
): SetLetterOverride | undefined {
  return dispatch.mock.calls.at(-1)?.[0] as SetLetterOverride | undefined;
}

describe("LetterAnnoForm", () => {
  it("dispatches a text override when the Text field changes", () => {
    const dispatch = vi.fn();
    render(
      <LetterAnnoForm
        panelId="p1"
        override={undefined}
        derivedText="A"
        globalLetters={DEFAULT_GLOBAL_STYLE.letters}
        dispatch={dispatch}
        commit={COMMIT}
      />,
    );
    const text = screen.getByLabelText("Text");
    fireEvent.change(text, { target: { value: "Hero" } });
    const last = lastCall(dispatch);
    expect(last?.panelId).toBe("p1");
    expect(last?.override).toEqual({ text: "Hero" });
  });

  it("renders the derived label as the Text placeholder when no override", () => {
    render(
      <LetterAnnoForm
        panelId="p1"
        override={undefined}
        derivedText="A"
        globalLetters={DEFAULT_GLOBAL_STYLE.letters}
        dispatch={vi.fn()}
        commit={COMMIT}
      />,
    );
    const textInput = screen.getByLabelText("Text");
    expect(textInput.getAttribute("placeholder")).toBe("A");
  });

  it("toggling 'Use global color' off seeds the override with the global color", async () => {
    const dispatch = vi.fn();
    render(
      <LetterAnnoForm
        panelId="p1"
        override={undefined}
        derivedText="A"
        globalLetters={DEFAULT_GLOBAL_STYLE.letters}
        dispatch={dispatch}
        commit={COMMIT}
      />,
    );
    // Uncheck "Use global color" — the row's checkbox is labeled "Use global color".
    await userEvent.click(screen.getByLabelText(/use global color/i));
    const last = lastCall(dispatch);
    expect(last?.override).toEqual({
      style: { color: DEFAULT_GLOBAL_STYLE.letters.color },
    });
  });

  it("'Reset to global' dispatches a null override", async () => {
    const dispatch = vi.fn();
    render(
      <LetterAnnoForm
        panelId="p1"
        override={{ text: "X", style: { color: "#FF0000" } }}
        derivedText="A"
        globalLetters={DEFAULT_GLOBAL_STYLE.letters}
        dispatch={dispatch}
        commit={COMMIT}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /reset to global/i }),
    );
    const last = lastCall(dispatch);
    expect(last?.override).toBeNull();
  });

  it("clearing the Text field preserves an existing style override", () => {
    const dispatch = vi.fn();
    render(
      <LetterAnnoForm
        panelId="p1"
        override={{ text: "X", style: { color: "#FF0000" } }}
        derivedText="A"
        globalLetters={DEFAULT_GLOBAL_STYLE.letters}
        dispatch={dispatch}
        commit={COMMIT}
      />,
    );
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "" } });
    const last = lastCall(dispatch);
    expect(last?.override).toEqual({ style: { color: "#FF0000" } });
  });
});
