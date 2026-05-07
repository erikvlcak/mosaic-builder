import { describe, it, expect } from "vitest";
import {
  selectedIdOf,
  editingIdOf,
  focusedIdOf,
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
    }
  });
});
