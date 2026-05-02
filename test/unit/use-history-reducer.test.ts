import { describe, it, expect } from "vitest";
import {
  combinedReducer,
  type Combined,
} from "../../src/renderer/state/use-history-reducer";
import {
  initialFigureState,
  type FigureState,
} from "../../src/renderer/model/figure-state";
import { setGutterPx, setPanelTransform } from "../../src/renderer/model/figure-actions";
import { DEFAULT_TRANSFORM } from "../../src/renderer/model/panels";

function startCombined(): Combined {
  const s = initialFigureState();
  return { state: s, history: { past: [], future: [] }, lastCommitted: s };
}

describe("combinedReducer — undo/redo", () => {
  it("non-transient action pushes prev state onto past", () => {
    const c0 = startCombined();
    const c1 = combinedReducer(c0, {
      kind: "dispatch",
      action: setGutterPx(20),
    });
    expect(c1.state.gutterPx).toBe(20);
    expect(c1.history.past).toHaveLength(1);
    expect(c1.history.past[0]!.gutterPx).toBe(c0.state.gutterPx);
  });

  it("undo restores prior state", () => {
    let c = startCombined();
    c = combinedReducer(c, { kind: "dispatch", action: setGutterPx(20) });
    c = combinedReducer(c, { kind: "undo" });
    expect(c.state.gutterPx).toBe(12); // initialFigureState default
    expect(c.history.future).toHaveLength(1);
  });

  it("redo replays the undone state", () => {
    let c = startCombined();
    c = combinedReducer(c, { kind: "dispatch", action: setGutterPx(20) });
    c = combinedReducer(c, { kind: "undo" });
    c = combinedReducer(c, { kind: "redo" });
    expect(c.state.gutterPx).toBe(20);
    expect(c.history.future).toHaveLength(0);
  });

  it("transient SET_PANEL_TRANSFORM does not push a history entry", () => {
    // Place an image first so the panel has a transform to update.
    let c = startCombined();
    const panelId = c.state.panels[0]!.id;
    // Manually inject a placed image — we just want a panel with a transform.
    const stateWithImage: FigureState = {
      ...c.state,
      pool: [{
        id: "img1", filename: "x.png", filePath: "/x.png", mime: "image/png",
        width: 100, height: 100, bitDepth: 8,
      }],
      panels: c.state.panels.map((p) =>
        p.id === panelId ? { ...p, imageId: "img1", transform: DEFAULT_TRANSFORM } : p,
      ),
    };
    c = { state: stateWithImage, history: { past: [], future: [] }, lastCommitted: stateWithImage };

    c = combinedReducer(c, {
      kind: "dispatch",
      action: setPanelTransform(panelId, { ...DEFAULT_TRANSFORM, panX: 5 }),
    });
    expect(c.history.past).toHaveLength(0);
    expect(c.state.panels.find((p) => p.id === panelId)!.transform!.panX).toBe(5);

    // commit() pushes the pre-drag state.
    c = combinedReducer(c, { kind: "commit" });
    expect(c.history.past).toHaveLength(1);
    expect(c.history.past[0]!.panels.find((p) => p.id === panelId)!.transform!.panX).toBe(0);
  });

  it("RESET_TO_STATE clears history", () => {
    let c = startCombined();
    c = combinedReducer(c, { kind: "dispatch", action: setGutterPx(20) });
    expect(c.history.past).toHaveLength(1);
    const fresh = initialFigureState();
    c = combinedReducer(c, {
      kind: "dispatch",
      action: { type: "RESET_TO_STATE", state: fresh },
    });
    expect(c.history.past).toHaveLength(0);
    expect(c.history.future).toHaveLength(0);
  });
});
