import { describe, it, expect } from "vitest";
import {
  emptySelection,
  selectionContains,
  singleSelectedId,
  replaceSelection,
  clearSelection,
  addToSelection,
  removeFromSelection,
  toggleInSelection,
  setSelection,
  unionSelection,
} from "../../src/renderer/state/anno-selection";

describe("anno-selection helpers", () => {
  it("emptySelection() returns a stable empty set", () => {
    const a = emptySelection();
    const b = emptySelection();
    expect(a.size).toBe(0);
    expect(a).toBe(b);
  });

  it("singleSelectedId returns the id for a 1-set, null otherwise", () => {
    expect(singleSelectedId(emptySelection())).toBeNull();
    expect(singleSelectedId(new Set(["a"]))).toBe("a");
    expect(singleSelectedId(new Set(["a", "b"]))).toBeNull();
  });

  it("selectionContains is true exactly when the id is present", () => {
    const s = new Set(["a", "b"]);
    expect(selectionContains(s, "a")).toBe(true);
    expect(selectionContains(s, "c")).toBe(false);
  });

  it("replaceSelection drops prior ids and keeps the new one", () => {
    const next = replaceSelection("x");
    expect(next.size).toBe(1);
    expect(next.has("x")).toBe(true);
  });

  it("clearSelection produces the same empty set instance as emptySelection", () => {
    expect(clearSelection()).toBe(emptySelection());
  });

  it("addToSelection: adds a new id and allocates a fresh set", () => {
    const before: ReadonlySet<string> = new Set(["a"]);
    const after = addToSelection(before, "b");
    expect(after).not.toBe(before);
    expect(after.has("a")).toBe(true);
    expect(after.has("b")).toBe(true);
  });

  it("addToSelection: returns the same set on duplicate add", () => {
    const before: ReadonlySet<string> = new Set(["a"]);
    expect(addToSelection(before, "a")).toBe(before);
  });

  it("removeFromSelection: drops an existing id and allocates a fresh set", () => {
    const before: ReadonlySet<string> = new Set(["a", "b"]);
    const after = removeFromSelection(before, "a");
    expect(after).not.toBe(before);
    expect(after.has("a")).toBe(false);
    expect(after.has("b")).toBe(true);
  });

  it("removeFromSelection: returns the same set when id is not present", () => {
    const before: ReadonlySet<string> = new Set(["a"]);
    expect(removeFromSelection(before, "z")).toBe(before);
  });

  it("toggleInSelection: adds when absent, removes when present", () => {
    const a = toggleInSelection(emptySelection(), "x");
    expect(a.has("x")).toBe(true);
    const b = toggleInSelection(a, "x");
    expect(b.has("x")).toBe(false);
  });

  it("setSelection: creates a fresh set from an iterable", () => {
    const s = setSelection(["a", "b", "a"]);
    expect(s.size).toBe(2);
    expect(s.has("a")).toBe(true);
    expect(s.has("b")).toBe(true);
  });

  it("unionSelection: adds all missing ids, returns same set when no-op", () => {
    const before: ReadonlySet<string> = new Set(["a"]);
    const after = unionSelection(before, ["a", "b"]);
    expect(after).not.toBe(before);
    expect(after.has("a")).toBe(true);
    expect(after.has("b")).toBe(true);
    expect(unionSelection(before, ["a"])).toBe(before);
    expect(unionSelection(before, [])).toBe(before);
  });
});
