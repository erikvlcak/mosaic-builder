// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MergeControls } from "../../src/renderer/components/Toolbar/MergeControls";

function renderMerge(
  props: Partial<React.ComponentProps<typeof MergeControls>> = {},
) {
  return render(
    <MergeControls
      canMerge={false}
      canUnmerge={false}
      selectedCount={0}
      onMerge={vi.fn()}
      onUnmerge={vi.fn()}
      {...props}
    />,
  );
}

describe("MergeControls hints", () => {
  // Teaching shift-click belongs to the hint bar (see hint-bar.test.tsx);
  // reserving ribbon width for it here duplicated that guidance on every
  // frame. Only the corrective hint, which the hint bar can't derive, remains.
  it("shows no hint when nothing is selected", () => {
    renderMerge({ selectedCount: 0 });
    expect(screen.queryByTestId("merge-hint")).toBeNull();
  });

  it("shows the 'form a rectangle' hint when cells are selected but not mergeable", () => {
    renderMerge({ selectedCount: 2, canMerge: false });
    expect(screen.getByTestId("merge-hint").textContent).toMatch(
      /adjacent cells forming a rectangle/i,
    );
  });

  it("hides the hint once the selection is mergeable", () => {
    renderMerge({ selectedCount: 2, canMerge: true });
    expect(screen.queryByTestId("merge-hint")).toBeNull();
  });

  it("shows a count badge on the Merge button when 2+ cells are selected", () => {
    renderMerge({ selectedCount: 3, canMerge: true });
    expect(screen.getByTestId("merge-button").textContent).toMatch(/\(3\)/);
  });

  it("shows no count badge for a single selected cell", () => {
    renderMerge({ selectedCount: 1 });
    expect(screen.getByTestId("merge-button").textContent).not.toMatch(/\(/);
  });

  it("keeps the Merge button disabled when the selection can't merge", () => {
    renderMerge({ selectedCount: 2, canMerge: false });
    const btn = screen.getByTestId<HTMLButtonElement>("merge-button");
    expect(btn.disabled).toBe(true);
  });
});
