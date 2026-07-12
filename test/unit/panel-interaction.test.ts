import { describe, it, expect } from "vitest";
import {
  selectedIdOf,
  editingIdOf,
  focusedIdOf,
  demoteEditingIfUnframable,
  type PanelInteraction,
} from "../../src/renderer/model/panel-interaction";

describe("PanelInteraction helpers", () => {
  it("selectedIdOf returns id only when mode is selected", () => {
    expect(selectedIdOf(null)).toBeNull();
    expect(selectedIdOf({ mode: "selected", panelId: "p1" })).toBe("p1");
    expect(selectedIdOf({ mode: "editing", panelId: "p1" })).toBeNull();
  });

  it("editingIdOf returns id only when mode is editing", () => {
    expect(editingIdOf(null)).toBeNull();
    expect(editingIdOf({ mode: "selected", panelId: "p1" })).toBeNull();
    expect(editingIdOf({ mode: "editing", panelId: "p1" })).toBe("p1");
  });

  it("focusedIdOf returns id for either mode, null otherwise", () => {
    expect(focusedIdOf(null)).toBeNull();
    expect(focusedIdOf({ mode: "selected", panelId: "p1" })).toBe("p1");
    expect(focusedIdOf({ mode: "editing", panelId: "p2" })).toBe("p2");
  });

  it("PanelInteraction narrows by mode", () => {
    const x: PanelInteraction = { mode: "selected", panelId: "p1" };
    if (x !== null && x.mode === "selected") {
      expect(x.panelId).toBe("p1");
    } else {
      expect.fail("narrowing failed — union type has regressed");
    }
  });
});

describe("demoteEditingIfUnframable", () => {
  it("demotes editing → selected when the panel can no longer be framed", () => {
    // Switching a framed panel's fit to Stretch removes its framing degrees of
    // freedom. Frame mode must end AND the interaction must drop to `selected`
    // — otherwise the panel is stuck in a zombie `editing` state with no frame
    // chrome, and single-click (which no-ops on the already-editing panel) can
    // never re-select it.
    const pi: PanelInteraction = { mode: "editing", panelId: "p1" };
    expect(demoteEditingIfUnframable(pi, false)).toEqual({
      mode: "selected",
      panelId: "p1",
    });
  });

  it("keeps editing untouched while the panel is still framable", () => {
    const pi: PanelInteraction = { mode: "editing", panelId: "p1" };
    // Same reference back so `===` short-circuits skip a needless setState.
    expect(demoteEditingIfUnframable(pi, true)).toBe(pi);
  });

  it("leaves a selected interaction alone regardless of framability", () => {
    const pi: PanelInteraction = { mode: "selected", panelId: "p1" };
    expect(demoteEditingIfUnframable(pi, false)).toBe(pi);
    expect(demoteEditingIfUnframable(pi, true)).toBe(pi);
  });

  it("leaves null alone", () => {
    expect(demoteEditingIfUnframable(null, false)).toBeNull();
    expect(demoteEditingIfUnframable(null, true)).toBeNull();
  });
});
