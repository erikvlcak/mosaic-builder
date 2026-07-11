import { describe, it, expect } from "vitest";
import { isDirty } from "../../src/renderer/state/dirty";
import {
  figureReducer,
  setGutterPx,
} from "../../src/renderer/model/figure-actions";
import { initialFigureState } from "../../src/renderer/model/figure-state";

describe("isDirty (unsaved-changes derivation)", () => {
  it("is clean when the live state is the same reference as the saved marker", () => {
    const s = initialFigureState();
    expect(isDirty(s, s)).toBe(false);
  });

  it("is dirty after a real change produces a new state reference", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, setGutterPx(20));
    expect(s1).not.toBe(s0);
    expect(isDirty(s1, s0)).toBe(true);
  });

  it("returns clean again once the saved marker advances to the current state", () => {
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, setGutterPx(20));
    // Simulate a save: the marker is set to the just-saved state.
    expect(isDirty(s1, s1)).toBe(false);
  });

  it("stays clean across a no-op reducer step (=== same reference)", () => {
    const s0 = initialFigureState();
    // setGutterPx to the current value is a no-op; reducer returns === state.
    const same = figureReducer(s0, setGutterPx(s0.gutterPx));
    expect(same).toBe(s0);
    expect(isDirty(same, s0)).toBe(false);
  });

  it("is dirty when an undo lands on a reference distinct from the saved marker", () => {
    // Reference identity, not structural equality: a state that is structurally
    // equal to the marker but a different reference reads dirty. That is the
    // safe direction for a guard (one extra confirm, never silent loss).
    const s0 = initialFigureState();
    const s1 = figureReducer(s0, setGutterPx(20));
    const s2 = figureReducer(s1, setGutterPx(s0.gutterPx)); // back to 12, new ref
    expect(s2).not.toBe(s0);
    expect(isDirty(s2, s0)).toBe(true);
  });
});
