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
  onPanelBrowseClick: ReturnType<typeof vi.fn>;
} {
  const state = stateWithImage();
  const onPanelClick = vi.fn(opts.onPanelClick);
  const onPanelDoubleClick = vi.fn(opts.onPanelDoubleClick);
  const onPanelBrowseClick = vi.fn();
  render(
    <GridCells
      state={state}
      figurePxW={800}
      figurePxH={600}
      cssW={800}
      cssH={600}
      onDrop={vi.fn()}
      hoverPanelId={null}
      onHoverPanelChange={vi.fn()}
      dragSource={null}
      onDragSourceChange={vi.fn()}
      selection={new Set<string>()}
      onCellShiftClick={vi.fn()}
      panelInteraction={opts.interaction}
      onPanelClick={onPanelClick}
      onPanelDoubleClick={onPanelDoubleClick}
      onHoleClick={vi.fn()}
      onPanelBrowseClick={onPanelBrowseClick}
    />,
  );
  return { state, onPanelClick, onPanelDoubleClick, onPanelBrowseClick };
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

  it("occupied panel is HTML5-draggable without pre-selection (drag = pick up the image)", () => {
    const { state } = renderGrid({ interaction: null });
    const p = state.panels[0]!;
    const el = screen.getByTestId(`panel-${p.row}-${p.col}`);
    expect(el.getAttribute("draggable")).toBe("true");
    // Stamped as an interactive panel so the viewport pan owner never
    // starts a pan on it.
    expect(el.getAttribute("data-interactive")).toBe("panel");
  });

  it("empty panel is NOT draggable and is pannable background (no data-interactive)", () => {
    const { state } = renderGrid({ interaction: null });
    const empty = state.panels.find((p) => p.imageId === undefined)!;
    const el = screen.getByTestId(`panel-${empty.row}-${empty.col}`);
    expect(el.getAttribute("draggable")).toBe("false");
    expect(el.getAttribute("data-interactive")).toBeNull();
    // Pannable background shows the grab cursor (Part 3 cursor spec).
    expect(el.style.cursor).toBe("grab");
  });

  it("dragstart on an occupied panel writes the tray payload and reports the drag source", () => {
    const state = stateWithImage();
    const p = state.panels[0]!;
    const onDragSourceChange = vi.fn();
    render(
      <GridCells
        state={state}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        hoverPanelId={null}
        onHoverPanelChange={vi.fn()}
        dragSource={null}
        onDragSourceChange={onDragSourceChange}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={null}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
        onHoleClick={vi.fn()}
      />,
    );
    const setData = vi.fn();
    fireEvent.dragStart(screen.getByTestId(`panel-${p.row}-${p.col}`), {
      dataTransfer: { setData, effectAllowed: "uninitialized" },
    });
    // Same payload a tray thumbnail writes — dispatchDrop resolves a
    // placed image to SWAP_PANELS (move or swap) with no pipeline changes.
    expect(setData).toHaveBeenCalledWith(
      "application/x-mosaic-drag",
      JSON.stringify({ kind: "tray", imageId: "img1" }),
    );
    expect(onDragSourceChange).toHaveBeenCalledWith({
      kind: "tray",
      imageId: "img1",
    });
  });

  it("selected image panel shows solid focus outline (no grab cursor — drag pans)", () => {
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
        hoverPanelId={null}
        onHoverPanelChange={vi.fn()}
        dragSource={null}
        onDragSourceChange={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={{ mode: "selected", panelId: p.id }}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
        onHoleClick={vi.fn()}
      />,
    );
    const el = screen.getByTestId(`panel-${p.row}-${p.col}`);
    expect(el.style.cursor).toBe("default");
    // Selected outline is a solid accent stroke (unified selection chrome).
    expect(el.style.outline).toContain("solid");
    expect(el.style.outline).toContain("var(--c-accent)");
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
        hoverPanelId={null}
        onHoverPanelChange={vi.fn()}
        dragSource={null}
        onDragSourceChange={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={{ mode: "editing", panelId: p.id }}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
        onHoleClick={vi.fn()}
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
        hoverPanelId={null}
        onHoverPanelChange={vi.fn()}
        dragSource={null}
        onDragSourceChange={vi.fn()}
        selection={new Set()}
        onCellShiftClick={onCellShiftClick}
        panelInteraction={null}
        onPanelClick={onPanelClick}
        onPanelDoubleClick={onPanelDoubleClick}
        onHoleClick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId(`panel-${p.row}-${p.col}`), {
      shiftKey: true,
    });
    expect(onCellShiftClick).toHaveBeenCalledWith(p.row, p.col);
    expect(onPanelClick).not.toHaveBeenCalled();
    expect(onPanelDoubleClick).not.toHaveBeenCalled();
  });

  it("empty panel in selected mode shows NO green outline (only image panels do)", () => {
    const s = stateWithImage();
    // The state has 4 panels (default 2x2). panel index 1 is empty (no imageId).
    const emptyPanel = s.panels.find((p) => p.imageId === undefined);
    if (emptyPanel === undefined) {
      expect.fail("test setup expects at least one empty panel");
    }
    render(
      <GridCells
        state={s}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        hoverPanelId={null}
        onHoverPanelChange={vi.fn()}
        dragSource={null}
        onDragSourceChange={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={{ mode: "selected", panelId: emptyPanel.id }}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
        onHoleClick={vi.fn()}
      />,
    );
    const el = screen.getByTestId(`panel-${emptyPanel.row}-${emptyPanel.col}`);
    // Falls through to the transparent dashed default — no accent selection stroke.
    expect(el.style.outline).toContain("dashed transparent");
    expect(el.style.outline).not.toContain("var(--c-accent)");
  });
});

describe("GridCells — hidden panels and holes (spec 02)", () => {
  it("renders the 'hidden' badge for a hidden panel", () => {
    const s = stateWithImage();
    s.panels = s.panels.map((p, i) => (i === 1 ? { ...p, hidden: true } : p));
    const hiddenPanel = s.panels[1]!;
    render(
      <GridCells
        state={s}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        hoverPanelId={null}
        onHoverPanelChange={vi.fn()}
        dragSource={null}
        onDragSourceChange={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={null}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
        onHoleClick={vi.fn()}
      />,
    );
    const el = screen.getByTestId(
      `panel-${hiddenPanel.row}-${hiddenPanel.col}`,
    );
    expect(el.getAttribute("data-hidden")).toBe("true");
    expect(el.querySelector(".grid-panel-hidden-badge")).not.toBeNull();
  });

  it("renders a hole cell when a panel is missing for a coord", () => {
    const s = stateWithImage();
    // Drop the (1,1) panel.
    s.panels = s.panels.filter((p) => !(p.row === 1 && p.col === 1));
    render(
      <GridCells
        state={s}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        hoverPanelId={null}
        onHoverPanelChange={vi.fn()}
        dragSource={null}
        onDragSourceChange={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={null}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
        onHoleClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId("hole-1-1")).toBeTruthy();
  });

  it("clicking a hole calls onHoleClick with the cell coords", () => {
    const s = stateWithImage();
    s.panels = s.panels.filter((p) => !(p.row === 1 && p.col === 1));
    const onHoleClick = vi.fn();
    render(
      <GridCells
        state={s}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        hoverPanelId={null}
        onHoverPanelChange={vi.fn()}
        dragSource={null}
        onDragSourceChange={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={null}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
        onHoleClick={onHoleClick}
      />,
    );
    fireEvent.click(screen.getByTestId("hole-1-1"));
    expect(onHoleClick).toHaveBeenCalledWith(1, 1);
  });
});

describe("GridCells — track-resize handles (spec 11)", () => {
  it("renders cols-1 vertical handles and rows-1 horizontal handles in uniform mode", () => {
    const state = initialFigureState();
    render(
      <GridCells
        state={state}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        hoverPanelId={null}
        onHoverPanelChange={vi.fn()}
        dragSource={null}
        onDragSourceChange={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={null}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
        onHoleClick={vi.fn()}
        onTrackWeightChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("track-handle-col-0")).toBeTruthy();
    expect(screen.getByTestId("track-handle-row-0")).toBeTruthy();
    expect(screen.queryByTestId("track-handle-col-1")).toBeNull();
  });

  it("does not render track handles in free mode", () => {
    const state: FigureState = {
      ...initialFigureState(),
      layout: {
        kind: "free",
        rects: {},
      },
    };
    render(
      <GridCells
        state={state}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        hoverPanelId={null}
        onHoverPanelChange={vi.fn()}
        dragSource={null}
        onDragSourceChange={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={null}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
        onHoleClick={vi.fn()}
        onTrackWeightChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("track-handle-col-0")).toBeNull();
  });

  it("dragging a column handle calls onTrackWeightChange with axis col, index 0, and a weight", () => {
    const onTrackWeightChange = vi.fn();
    const state = initialFigureState();
    render(
      <GridCells
        state={state}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        hoverPanelId={null}
        onHoverPanelChange={vi.fn()}
        dragSource={null}
        onDragSourceChange={vi.fn()}
        selection={new Set()}
        onCellShiftClick={vi.fn()}
        panelInteraction={null}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
        onHoleClick={vi.fn()}
        onTrackWeightChange={onTrackWeightChange}
      />,
    );
    const handle = screen.getByTestId("track-handle-col-0");
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      clientX: 400,
      clientY: 300,
      button: 0,
    });
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: 500,
      clientY: 300,
    });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 500, clientY: 300 });
    expect(onTrackWeightChange).toHaveBeenCalled();
    const call = onTrackWeightChange.mock.calls[0]!;
    expect(call[0]).toBe("col");
    expect(call[1]).toBe(0);
    expect(typeof call[2]).toBe("number");
  });
});

describe("GridCells — empty-panel browse zone", () => {
  it("renders a browse zone on empty panels only", () => {
    const { state } = renderGrid({ interaction: null });
    const occupied = state.panels.find((p) => p.imageId !== undefined)!;
    const empty = state.panels.find((p) => p.imageId === undefined)!;
    expect(
      screen.queryByTestId(`browse-zone-${occupied.row}-${occupied.col}`),
    ).toBeNull();
    expect(
      screen.getByTestId(`browse-zone-${empty.row}-${empty.col}`),
    ).toBeTruthy();
  });

  it("clicking the browse zone calls onPanelBrowseClick and not onPanelClick", () => {
    const { state, onPanelBrowseClick, onPanelClick } = renderGrid({
      interaction: null,
    });
    const empty = state.panels.find((p) => p.imageId === undefined)!;
    fireEvent.click(
      screen.getByTestId(`browse-zone-${empty.row}-${empty.col}`),
    );
    expect(onPanelBrowseClick).toHaveBeenCalledWith(empty.id);
    expect(onPanelClick).not.toHaveBeenCalled();
  });

  it("stamps the browse zone data-interactive so the pan owner skips it", () => {
    const { state } = renderGrid({ interaction: null });
    const empty = state.panels.find((p) => p.imageId === undefined)!;
    const el = screen.getByTestId(`browse-zone-${empty.row}-${empty.col}`);
    expect(el.getAttribute("data-interactive")).toBe("browse");
    expect(el.tagName).toBe("BUTTON");
  });

  it("centres the zone inside its panel at 70% x 60%", () => {
    // 2x2 grid over 800x600 with the default gutter; assert the zone's box is
    // centred within the panel rather than hard-coding gutter arithmetic.
    const { state } = renderGrid({ interaction: null });
    const empty = state.panels.find((p) => p.imageId === undefined)!;
    const zone = screen.getByTestId(`browse-zone-${empty.row}-${empty.col}`);
    const panel = screen.getByTestId(`panel-${empty.row}-${empty.col}`);
    const px = (v: string): number => Number(v.replace("px", ""));
    const panelW = px(panel.style.width);
    const panelH = px(panel.style.height);
    expect(px(zone.style.width)).toBeCloseTo(Math.min(panelW * 0.7, 280), 5);
    expect(px(zone.style.height)).toBeCloseTo(Math.min(panelH * 0.6, 120), 5);
    // Offsets are panel-relative, so left == (panelW - zoneW) / 2.
    expect(px(zone.style.left)).toBeCloseTo(
      (panelW - px(zone.style.width)) / 2,
      5,
    );
    expect(px(zone.style.top)).toBeCloseTo(
      (panelH - px(zone.style.height)) / 2,
      5,
    );
  });

  it("renders no browse zone on a hidden panel", () => {
    const base = stateWithImage();
    const hiddenTarget = base.panels.find((p) => p.imageId === undefined)!;
    const state: FigureState = {
      ...base,
      panels: base.panels.map((p) =>
        p.id === hiddenTarget.id ? { ...p, hidden: true } : p,
      ),
    };
    render(
      <GridCells
        state={state}
        figurePxW={800}
        figurePxH={600}
        cssW={800}
        cssH={600}
        onDrop={vi.fn()}
        hoverPanelId={null}
        onHoverPanelChange={vi.fn()}
        dragSource={null}
        onDragSourceChange={vi.fn()}
        selection={new Set<string>()}
        onCellShiftClick={vi.fn()}
        panelInteraction={null}
        onPanelClick={vi.fn()}
        onPanelDoubleClick={vi.fn()}
        onHoleClick={vi.fn()}
        onPanelBrowseClick={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId(
        `browse-zone-${hiddenTarget.row}-${hiddenTarget.col}`,
      ),
    ).toBeNull();
  });
});
