// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "../../src/renderer/components/Toolbar/ThemeToggle";

describe("ThemeToggle", () => {
  it("marks the active choice pressed and fires onChoice on click", async () => {
    const onChoice = vi.fn();
    render(<ThemeToggle choice="system" onChoice={onChoice} />);

    const dark = screen.getByRole("button", { name: /dark/i });
    expect(dark.getAttribute("aria-pressed")).toBe("false");
    const system = screen.getByRole("button", { name: /system/i });
    expect(system.getAttribute("aria-pressed")).toBe("true");

    await userEvent.click(dark);
    expect(onChoice).toHaveBeenCalledWith("dark");
  });
});
