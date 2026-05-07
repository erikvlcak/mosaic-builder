// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GridCells } from "../../src/renderer/components/Grid/GridCells";
import { initialFigureState } from "../../src/renderer/model/figure-state";
import type { FigureState } from "../../src/renderer/model/figure-state";
import type { PanelInteraction } from "../../src/renderer/model/panel-interaction";

function stateWithImage(): FigureState {
  // Default initialFigureState gives a 2x2 grid of empty panels. Place an
  // imageId on the first panel so it counts as "occupied".
  const s = initialFigureState();
  return {
    ...s,
    pool: [
      {
        id: "img1",
        filename: "a.png",
        filePath: "/a.png",
        mime: "image/png",
        width: 100,
        height: 100,
        bitDepth: 8,
      },
    ],
    panels: s.panels.map((p, i) =>
      i === 0
        ? {
            ...p,
            imageId: "img1",
            transform: {
              fit: "contain",
              panX: 0,
              panY: 0,
              zoom: 1,
              rotation: 0,
              flipH: false,
              flipV: false,
            },
          }
        : p,
    ),
  };
}

function renderGrid(opts: {
  interaction: PanelInteraction;
  onPanelClick?: (id: string) => void;
  onPanelDoubleClick?: (id: string) => void;
}): {
  state: FigureState;
  onPanelClick: ReturnType<typeof vi.fn>;
  onPanelDoubleClick: ReturnType<typeof vi.fn>;
} {
  const state = stateWithImage();
  const onPanelClick = vi.fn(opts.onPanelClick);
  const onPanelDoubleClick = vi.fn(opts.onPanelDoubleClick);
  render(
    <GridCells
      state={state}
      figurePxW={800}
      figurePxH={600}
      cssW={800}
      cssH={600}
      onDrop={vi.fn()}
      selection={new Set<string>()}
      onCellShiftClick={vi.fn()}
      panelInteraction={opts.interaction}
      onPanelClick={onPanelClick}
      onPanelDoubleClick={onPanelDoubleClick}
    />,
  );
  return { state, onPanelClick, onPanelDoubleClick };
}

describe("GridCells — selected vs editing modes", () => {
  it("single-click on image panel calls onPanelClick", () => {
    const { state, onPanelClick } = renderGrid({ interaction: null });
    const p = state.panels[0]!;
    fireEvent.click(screen.getByTestId(`panel-${p.row}-${p.col}`));
    expect(onPanelClick).toHaveBeenCalledWith(p.id);
  });

  it("double-click on image panel calls onPanelDoubleClick", () => {
    const { state, onPanelDoubleClick } = renderGrid({ interaction: null });
    const p = state.panels[0]!;
    fireEvent.doubleClick(screen.getByTestId(`panel-${p.row}-${p.col}`));
    expect(onPanelDoubleClick).toHaveBeenCalledWith(p.id);
  });

  it("image panel is HTML5-draggable when no panel is editing", () => {
    const { state } = renderGrid({ interaction: null });
    const p = state.panels[0]!;
    const el = screen.getByTestId(`panel-${p.row}-${p.col}`);
    expect(el.getAttribute("draggable")).toBe("true");
  });

  it("image panel is HTML5-draggable when it is in selected mode (the bug fix)", () => {
    const s = stateWithImage();
    const p = s.panels[0]!;
    render(
      <GridCells
        state={s}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={{ mode: "selected", panelId: p.id }}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId(`panel-${p.row}-${p.col}`).getAttribute("draggable"),
    ).toBe("true");
  });

  it("image panel is NOT HTML5-draggable when it is in editing mode", () => {
    const s = stateWithImage();
    const p = s.panels[0]!;
    render(
      <GridCells
        state={s}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={{ mode: "editing", panelId: p.id }}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId(`panel-${p.row}-${p.col}`).getAttribute("draggable"),
    ).toBe("false");
  });

  it("selected image panel shows solid focus outline and grab cursor", () => {
    const s = stateWithImage();
    const p = s.panels[0]!;
    render(
      <GridCells
        state={s}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={{ mode: "selected", panelId: p.id }}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
      />,
    );
    const el = screen.getByTestId(`panel-${p.row}-${p.col}`);
    expect(el.style.cursor).toBe("grab");
    // Outline uses the focus-stroke token.
    expect(el.style.outline).toContain("solid");
    expect(el.style.outline).toContain("var(--c-focus-stroke)");
  });

  it("editing image panel shows NO outline from GridCells (PanelInteractionLayer owns it)", () => {
    const s = stateWithImage();
    const p = s.panels[0]!;
    render(
      <GridCells
        state={s}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={{ mode: "editing", panelId: p.id }}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
      />,
    );
    const el = screen.getByTestId(`panel-${p.row}-${p.col}`);
    // Falls through to the transparent dashed default (the "neither" branch).
    expect(el.style.outline).toContain("dashed transparent");
  });

  it("shift-click on 1x1 image panel still toggles merge selection (does NOT enter selected mode)", () => {
    const s = stateWithImage();
    const p = s.panels[0]!;
    const onPanelClick = vi.fn();
    const onPanelDoubleClick = vi.fn();
    const onCellShiftClick = vi.fn();
    render(
      <GridCells
        state={s}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        selection={new Set()}
        onCellShiftClick={onCellShiftClick}
        panelInteraction={null}
        onPanelClick={onPanelClick}
        onPanelDoubleClick={onPanelDoubleClick}
      />,
    );
    fireEvent.click(screen.getByTestId(`panel-${p.row}-${p.col}`), {
      shiftKey: true,
    });
    expect(onCellShiftClick).toHaveBeenCalledWith(p.row, p.col);
    expect(onPanelClick).not.toHaveBeenCalled();
    expect(onPanelDoubleClick).not.toHaveBeenCalled();
  });
});
