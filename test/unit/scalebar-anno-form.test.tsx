// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScalebarAnnoForm } from "../../src/renderer/components/Properties/ScalebarAnnoForm";
import type { ScaleBarAnnotation } from "../../src/renderer/model/annotations";

const seed: ScaleBarAnnotation = {
  id: "s1", kind: "scalebar", panelId: "p1", z: 5,
  lengthValue: 50, lengthUnit: "um",
};

describe("ScalebarAnnoForm", () => {
  it("dispatches lengthValue + lengthUnit changes", async () => {
    const dispatch = vi.fn();
    const commit = { markDirty: vi.fn(), flush: vi.fn() };
    render(<ScalebarAnnoForm anno={seed} dispatch={dispatch} commit={commit} />);
    await userEvent.selectOptions(screen.getByLabelText("Unit"), "mm");
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ANNOTATION",
      annotationId: "s1",
      patch: { lengthUnit: "mm" },
    });
    expect(commit.flush).toHaveBeenCalled();
  });

  it("can override the corner per-instance", async () => {
    const dispatch = vi.fn();
    const commit = { markDirty: vi.fn(), flush: vi.fn() };
    render(<ScalebarAnnoForm anno={seed} dispatch={dispatch} commit={commit} />);
    await userEvent.click(screen.getByLabelText("Top-left"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ANNOTATION",
      annotationId: "s1",
      patch: { cornerOverride: "tl" },
    });
  });
});
