// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextStylePickerPanel } from "../../src/renderer/components/Properties/TextStylePickerPanel";
import { initialDefaultTextStyle } from "../../src/renderer/model/default-text-style";

describe("TextStylePickerPanel", () => {
  it("reflects the current halo state in the checkbox", () => {
    const onChange = vi.fn();
    render(
      <TextStylePickerPanel
        value={{ ...initialDefaultTextStyle(), halo: true }}
        onChange={onChange}
      />,
    );
    const box = screen.getByLabelText<HTMLInputElement>(/halo/i);
    expect(box.checked).toBe(true);
  });

  it("toggles halo off via the checkbox", async () => {
    const onChange = vi.fn();
    render(
      <TextStylePickerPanel
        value={{ ...initialDefaultTextStyle(), halo: true }}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByLabelText(/halo/i));
    const last = onChange.mock.calls.at(-1)?.[0] as
      | { halo?: boolean }
      | undefined;
    expect(last?.halo).toBe(false);
  });
});
