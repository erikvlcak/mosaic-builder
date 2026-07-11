// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  combinedReducer,
  useHistoryReducer,
  type Combined,
} from "../../src/renderer/state/use-history-reducer";
import {
  initialFigureState,
  type FigureState,
} from "../../src/renderer/model/figure-state";
import {
  setGutterPx,
  setPanelTransform,
  setGlobalStyle,
  addAnnotation,
  updateAnnotation,
  setTrackWeightAction,
  resizePanelFreeformAction,
  type FigureAction,
} from "../../src/renderer/model/figure-actions";
import { TRANSIENT_ACTIONS } from "../../src/renderer/state/use-history-reducer";
import { DEFAULT_TRANSFORM } from "../../src/renderer/model/panels";
import { DEFAULT_GLOBAL_STYLE } from "../../src/renderer/model/global-style";

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

  it("redo flushes an uncommitted transient instead of baking it into past", () => {
    // Reproduces the 1.2 defect: commit B → undo → A → start a transient drag
    // (uncommitted) → redo. Without the flush guard, `redo` would push the
    // mid-drag transient onto `past` as if committed, so a following undo would
    // restore that mid-drag state.
    let c = startCombined();
    // Commit a real change (state "B"): gutter 20.
    c = combinedReducer(c, { kind: "dispatch", action: setGutterPx(20) });
    // Undo back to "A" (initial gutter 12); "B" now sits in future (redoable).
    c = combinedReducer(c, { kind: "undo" });
    expect(c.state.gutterPx).toBe(12);
    expect(c.history.future).toHaveLength(1);

    // Begin a transient drag: scrub the global style with no commit().
    const variant = {
      ...DEFAULT_GLOBAL_STYLE,
      letters: { ...DEFAULT_GLOBAL_STYLE.letters, sizePt: 99 },
    };
    c = combinedReducer(c, {
      kind: "dispatch",
      action: setGlobalStyle(variant),
    });
    expect(c.state !== c.lastCommitted).toBe(true);

    // Redo now. The uncommitted transient is flushed (sealing the scrub as its
    // own step) and future is cleared, so redo is a no-op on the timeline.
    c = combinedReducer(c, { kind: "redo" });
    expect(c.state.globalStyle.letters.sizePt).toBe(99);
    expect(c.history.future).toHaveLength(0);

    // The next undo backs out the flushed transient scrub, landing on the
    // committed pre-drag state (gutter 12) — NOT a mid-drag artifact.
    c = combinedReducer(c, { kind: "undo" });
    expect(c.state.globalStyle.letters.sizePt).toBe(
      initialFigureState().globalStyle.letters.sizePt,
    );
    expect(c.state.gutterPx).toBe(12);
  });

  it("transient SET_PANEL_TRANSFORM does not push a history entry", () => {
    // Place an image first so the panel has a transform to update.
    let c = startCombined();
    const panelId = c.state.panels[0]!.id;
    // Manually inject a placed image — we just want a panel with a transform.
    const stateWithImage: FigureState = {
      ...c.state,
      pool: [
        {
          id: "img1",
          filename: "x.png",
          filePath: "/x.png",
          mime: "image/png",
          width: 100,
          height: 100,
          bitDepth: 8,
        },
      ],
      panels: c.state.panels.map((p) =>
        p.id === panelId
          ? { ...p, imageId: "img1", transform: DEFAULT_TRANSFORM }
          : p,
      ),
    };
    c = {
      state: stateWithImage,
      history: { past: [], future: [] },
      lastCommitted: stateWithImage,
    };

    c = combinedReducer(c, {
      kind: "dispatch",
      action: setPanelTransform(panelId, { ...DEFAULT_TRANSFORM, panX: 5 }),
    });
    expect(c.history.past).toHaveLength(0);
    expect(c.state.panels.find((p) => p.id === panelId)!.transform!.panX).toBe(
      5,
    );

    // commit() pushes the pre-drag state.
    c = combinedReducer(c, { kind: "commit" });
    expect(c.history.past).toHaveLength(1);
    expect(
      c.history.past[0]!.panels.find((p) => p.id === panelId)!.transform!.panX,
    ).toBe(0);
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

describe("transient actions coalesce until commit", () => {
  it("UPDATE_ANNOTATION dispatches do not push history until commit()", () => {
    const { result } = renderHook(() =>
      useHistoryReducer(initialFigureState()),
    );
    const seedAnno = {
      id: "t1",
      kind: "text" as const,
      x: 10,
      y: 10,
      text: "hi",
      font: "Arial",
      sizePt: 12,
      bold: false,
      italic: false,
      color: "#000",
      z: 1,
    };
    act(() => result.current[1](addAnnotation(seedAnno)));
    act(() => result.current[2].commit());
    // Three transient dispatches; no commit() between them.
    act(() => {
      result.current[1](updateAnnotation("t1", { text: "h" }));
      result.current[1](updateAnnotation("t1", { text: "hi" }));
      result.current[1](updateAnnotation("t1", { text: "hii" }));
    });
    expect(result.current[0].annotations[0]?.text).toBe("hii");
    // One undo flushes the three transient updates into a single step and
    // restores the prior committed state (text "hi" from addAnnotation).
    act(() => result.current[2].undo());
    expect(result.current[0].annotations[0]?.text).toBe("hi");
    // A second undo backs out the addAnnotation itself.
    act(() => result.current[2].undo());
    expect(result.current[0].annotations).toEqual([]);
  });

  it("SET_GLOBAL_STYLE is transient", () => {
    const { result } = renderHook(() =>
      useHistoryReducer(initialFigureState()),
    );
    const variantA = {
      ...DEFAULT_GLOBAL_STYLE,
      letters: { ...DEFAULT_GLOBAL_STYLE.letters, sizePt: 14 },
    };
    const variantB = {
      ...DEFAULT_GLOBAL_STYLE,
      letters: { ...DEFAULT_GLOBAL_STYLE.letters, sizePt: 16 },
    };
    act(() => result.current[1](setGlobalStyle(variantA)));
    act(() => result.current[1](setGlobalStyle(variantB)));
    act(() => result.current[2].commit());
    expect(result.current[0].globalStyle.letters.sizePt).toBe(16);
    act(() => result.current[2].undo());
    // Both transient dispatches collapse into one history step.
    expect(result.current[0].globalStyle.letters.sizePt).toBe(
      initialFigureState().globalStyle.letters.sizePt,
    );
  });

  it("a multi-move SET_TRACK_WEIGHT drag + commit is one undo step and preserves prior history", () => {
    const { result } = renderHook(() =>
      useHistoryReducer(initialFigureState()),
    );
    // Pre-existing committed history entry that must survive the drag.
    act(() => result.current[1](setGutterPx(20)));
    act(() => result.current[2].commit());
    expect(result.current[0].gutterPx).toBe(20);

    // Simulate a track-handle drag: many pointermove-driven dispatches,
    // no commit() between them (the real commit fires on pointerup).
    act(() => {
      result.current[1](setTrackWeightAction("col", 0, 0.4));
      result.current[1](setTrackWeightAction("col", 0, 0.45));
      result.current[1](setTrackWeightAction("col", 0, 0.6));
    });
    act(() => result.current[2].commit());

    // Undo #1 backs out the whole drag in a single step, landing on the
    // pre-drag (but post-gutter) state.
    act(() => result.current[2].undo());
    expect(result.current[0].layout).toEqual(initialFigureState().layout);
    expect(result.current[0].gutterPx).toBe(20);

    // Undo #2 backs out the pre-existing gutter change — it was never
    // evicted by the drag's interim positions.
    act(() => result.current[2].undo());
    expect(result.current[0].gutterPx).toBe(12);
  });

  it("a multi-move RESIZE_PANEL_FREEFORM drag + commit is one undo step and preserves prior history", () => {
    const { result } = renderHook(() =>
      useHistoryReducer(initialFigureState()),
    );
    act(() => result.current[1](setGutterPx(20)));
    act(() => result.current[2].commit());
    const panelId = result.current[0].panels[0]!.id;
    const canvas = { widthPx: 400, heightPx: 400 };

    act(() => {
      result.current[1](
        resizePanelFreeformAction(panelId, "br", 10, 10, canvas),
      );
      result.current[1](
        resizePanelFreeformAction(panelId, "br", 20, 15, canvas),
      );
      result.current[1](
        resizePanelFreeformAction(panelId, "br", 30, 25, canvas),
      );
    });
    act(() => result.current[2].commit());

    act(() => result.current[2].undo());
    expect(result.current[0].layout).toEqual(initialFigureState().layout);
    expect(result.current[0].gutterPx).toBe(20);

    act(() => result.current[2].undo());
    expect(result.current[0].gutterPx).toBe(12);
  });
});

describe("TRANSIENT_ACTIONS categorization is exhaustive", () => {
  // Table-driven guard: every FigureAction["type"] must be explicitly
  // categorized here. TypeScript enforces exhaustiveness on this Record —
  // adding a new FigureAction variant without adding a key is a compile
  // error, which pnpm typecheck/lint catches. That forces a conscious
  // transient/history decision for every new action instead of silently
  // defaulting to "pushes history on every dispatch".
  const CATEGORIZATION: Record<FigureAction["type"], "transient" | "history"> =
    {
      ADD_TO_POOL: "history",
      PLACE_INTO_PANEL: "history",
      SWAP_PANELS: "history",
      REPLACE_INTO_PANEL: "history",
      UNPLACE_PANEL: "history",
      REMOVE_FROM_POOL: "history",
      RESIZE_GRID: "history",
      SET_GUTTER_PX: "history",
      SET_GUTTER_COLOR: "history",
      SET_OUTER_GUTTER: "history",
      MERGE_CELLS: "history",
      UNMERGE_PANEL: "history",
      // Drag-driven: dispatched on every pointermove of a pan/zoom drag,
      // coalesced into one undo step by commit() on pointerup.
      SET_PANEL_TRANSFORM: "transient",
      SET_PANEL_FIT: "history",
      ROTATE_PANEL_90: "history",
      FLIP_PANEL_H: "history",
      FLIP_PANEL_V: "history",
      RESET_PANEL_TRANSFORM: "history",
      SET_PANEL_CROP: "history",
      RESET_PANEL_CROP: "history",
      ADD_ANNOTATION: "history",
      // Drag-driven: dispatched on every pointermove while dragging/resizing
      // an annotation or typing in its inline editor; coalesced on commit().
      UPDATE_ANNOTATION: "transient",
      REMOVE_ANNOTATION: "history",
      BULK_UPDATE_ANNOS: "history",
      BULK_REMOVE_ANNOS: "history",
      SET_LETTER_OVERRIDE: "history",
      SET_LETTER_PATTERN: "history",
      CLEAR_ALL_LETTER_OVERRIDES: "history",
      // Drag-driven: dispatched continuously while scrubbing a style control
      // (e.g. a color/size slider with live preview); coalesced on commit().
      SET_GLOBAL_STYLE: "transient",
      SET_LETTERS_ENABLED: "history",
      SET_IMAGE_CALIBRATION: "history",
      SET_PANEL_HIDDEN: "history",
      DELETE_PANEL: "history",
      RESTORE_PANEL_AT: "history",
      // Not routed through TRANSIENT_ACTIONS at all — handled specially in
      // combinedReducer, which clears history wholesale on project load.
      RESET_TO_STATE: "history",
      RESET_FIGURE: "history",
      // Drag-driven: dispatched on every pointermove of a track-handle drag,
      // coalesced into one undo step by commit() on pointerup.
      SET_TRACK_WEIGHT: "transient",
      // Drag-driven: dispatched on every pointermove of a corner-handle
      // free-form resize, coalesced into one undo step by commit() on
      // pointerup.
      RESIZE_PANEL_FREEFORM: "transient",
      RESET_TO_UNIFORM_GRID: "history",
    };

  it("agrees with TRANSIENT_ACTIONS for every action type", () => {
    for (const [type, expected] of Object.entries(CATEGORIZATION)) {
      const isTransient = TRANSIENT_ACTIONS.has(type as FigureAction["type"]);
      expect(isTransient ? "transient" : "history").toBe(expected);
    }
  });

  it("TRANSIENT_ACTIONS has no entries missing from the categorization table", () => {
    for (const type of TRANSIENT_ACTIONS) {
      expect(CATEGORIZATION[type]).toBe("transient");
    }
  });
});
