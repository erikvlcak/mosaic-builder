import { describe, it, expect } from "vitest";
import { parseDrag, serializeDrag } from "../../src/renderer/dnd/drag-payload";

describe("drag-payload", () => {
  it("round-trips a tray drag", () => {
    const p = { kind: "tray" as const, imageId: "abc" };
    expect(parseDrag(serializeDrag(p))).toEqual(p);
  });

  it("round-trips a panel drag", () => {
    const p = { kind: "panel" as const, panelId: "panel-7" };
    expect(parseDrag(serializeDrag(p))).toEqual(p);
  });

  it("rejects malformed JSON", () => {
    expect(parseDrag("not-json")).toBe(null);
  });

  it("rejects unknown kind", () => {
    expect(parseDrag(JSON.stringify({ kind: "ghost" }))).toBe(null);
  });

  it("rejects missing panelId on panel kind", () => {
    expect(parseDrag(JSON.stringify({ kind: "panel" }))).toBe(null);
  });

  it("rejects non-string imageId on tray kind", () => {
    expect(parseDrag(JSON.stringify({ kind: "tray", imageId: 7 }))).toBe(null);
  });
});
