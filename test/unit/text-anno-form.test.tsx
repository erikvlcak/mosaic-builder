// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextAnnoForm } from "../../src/renderer/components/Properties/TextAnnoForm";
import type { TextAnnotation } from "../../src/renderer/model/annotations";

const seed: TextAnnotation = {
  id: "t1",
  kind: "text",
  x: 10,
  y: 20,
  text: "hello",
  font: "Arial",
  sizePt: 12,
  bold: false,
  italic: false,
  color: "#000000",
  z: 1,
};

describe("TextAnnoForm", () => {
  it("dispatches updateAnnotation on text edit and markDirty on each change", () => {
    const dispatch = vi.fn();
    const markDirty = vi.fn();
    const flush = vi.fn();
    render(
      <TextAnnoForm
        anno={seed}
        dispatch={dispatch}
        commit={{ markDirty, flush }}
      />,
    );
    const text = screen.getByLabelText("Text");
    // <TextField> is a controlled component (no internal state). Per-character
    // userEvent.type fights the controlled value, so we use fireEvent.change
    // to simulate a single change to the final value.
    fireEvent.change(text, { target: { value: "hello!" } });
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ANNOTATION",
      annotationId: "t1",
      patch: { text: "hello!" },
    });
    expect(markDirty).toHaveBeenCalled();
  });

  it("toggles bold via button and emits one dispatch + one commit per toggle", async () => {
    const dispatch = vi.fn();
    const markDirty = vi.fn();
    const flush = vi.fn();
    render(
      <TextAnnoForm
        anno={seed}
        dispatch={dispatch}
        commit={{ markDirty, flush }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /bold/i }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ANNOTATION",
      annotationId: "t1",
      patch: { bold: true },
    });
    expect(flush).toHaveBeenCalled();
  });

  it("clears bgColor when the user picks transparent on an already-set color", () => {
    const dispatch = vi.fn();
    const commit = { markDirty: vi.fn(), flush: vi.fn() };
    const seedWithBg: TextAnnotation = { ...seed, bgColor: "#FF0000FF" };
    render(
      <TextAnnoForm anno={seedWithBg} dispatch={dispatch} commit={commit} />,
    );
    const text = screen.getByLabelText("Background hex");
    fireEvent.change(text, { target: { value: "#FFFFFF00" } });
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ANNOTATION",
      annotationId: "t1",
      patch: { bgColor: undefined },
    });
  });

  it("does NOT dispatch when the user picks transparent on an unset bgColor (no-op)", () => {
    const dispatch = vi.fn();
    const commit = { markDirty: vi.fn(), flush: vi.fn() };
    // seed has bgColor undefined by default
    render(<TextAnnoForm anno={seed} dispatch={dispatch} commit={commit} />);
    const text = screen.getByLabelText("Background hex");
    fireEvent.change(text, { target: { value: "#FFFFFF00" } });
    // No dispatch should have happened FROM THE BG color picker.
    // (Dispatches from other onChange events in the form aren't possible without other interactions.)
    const bgRelatedDispatches = dispatch.mock.calls.filter((call) => {
      const action = call[0] as {
        type?: string;
        patch?: Record<string, unknown>;
      };
      return (
        action.type === "UPDATE_ANNOTATION" && "bgColor" in (action.patch ?? {})
      );
    });
    expect(bgRelatedDispatches.length).toBe(0);
  });
});
