import { describe, it, expect } from "vitest";
import {
  initialFigureState,
  __resetPanelIdsForTests,
} from "../../src/renderer/model/figure-state";
import {
  addToPool,
  placeIntoPanel,
  setGutterPx,
  resetToState,
} from "../../src/renderer/model/figure-actions";
import { toMosaicFile, fromMosaicFile } from "../../src/renderer/model/serialize";
import { validateMosaicFile } from "../../src/renderer/model/schema";
import { combinedReducer } from "../../src/renderer/state/use-history-reducer";
import type { Combined } from "../../src/renderer/state/use-history-reducer";

const MOSAIC_PATH = "/tmp/proj/fig.mosaic";

describe("M7 round-trip — reducer × history × serialize × validate", () => {
  it("save → undo → save preserves the active state and validates", () => {
    __resetPanelIdsForTests();
    const initial = initialFigureState();
    let combined: Combined = {
      state: initial,
      history: { past: [], future: [] },
      lastCommitted: initial,
    };

    combined = combinedReducer(combined, {
      kind: "dispatch",
      action: addToPool({
        id: "img1", filename: "a.png", filePath: "/tmp/proj/a.png",
        mime: "image/png", width: 100, height: 100, bitDepth: 8,
      }),
    });
    const firstPanel = combined.state.panels[0]!;
    combined = combinedReducer(combined, {
      kind: "dispatch",
      action: placeIntoPanel("img1", firstPanel.id),
    });
    combined = combinedReducer(combined, {
      kind: "dispatch",
      action: setGutterPx(20),
    });
    expect(combined.state.gutterPx).toBe(20);
    expect(combined.history.past.length).toBe(3);

    // Save snapshot 1.
    const file1 = toMosaicFile({
      state: combined.state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: MOSAIC_PATH,
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
    });
    expect(validateMosaicFile(file1).ok).toBe(true);

    // Undo back to gutter=12 and save snapshot 2.
    combined = combinedReducer(combined, { kind: "undo" });
    expect(combined.state.gutterPx).toBe(12);
    const file2 = toMosaicFile({
      state: combined.state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: MOSAIC_PATH,
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:01Z",
    });
    expect(validateMosaicFile(file2).ok).toBe(true);
    expect(file2.state.gutterPx).toBe(12);

    // Reload snapshot 1 via fromMosaicFile + RESET_TO_STATE.
    const r = fromMosaicFile(file1);
    combined = combinedReducer(combined, {
      kind: "dispatch",
      action: resetToState(r.state),
    });
    expect(combined.state.gutterPx).toBe(20);
    expect(combined.state.panels.find((p) => p.id === firstPanel.id)?.imageId).toBe("img1");
    // RESET_TO_STATE clears history.
    expect(combined.history.past.length).toBe(0);
    expect(combined.history.future.length).toBe(0);
  });

  it("relink hint preserves sha256 + relPath through save/load", () => {
    const state = {
      ...initialFigureState(),
      pool: [{
        id: "img1", filename: "a.png", filePath: "/tmp/proj/a.png",
        mime: "image/png" as const, width: 1, height: 1, bitDepth: 8 as const,
      }],
    };
    const file = toMosaicFile({
      state,
      canvas: { widthPx: 800, heightPx: 600, background: "#FFFFFF" },
      mosaicPath: MOSAIC_PATH,
      appVersion: "0.1.0",
      now: () => "2026-05-02T10:00:00Z",
      shaByImageId: { img1: "abc" },
    });
    expect(validateMosaicFile(file).ok).toBe(true);
    const r = fromMosaicFile(file);
    expect(r.relinkHints[0]).toEqual({
      imageId: "img1",
      filePath: "/tmp/proj/a.png",
      relPath: "./a.png",
      sha256: "abc",
    });
  });
});
