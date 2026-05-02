import { describe, it, expect } from "vitest";
import {
  DRAG_MIME,
  serializeDrag,
  parseDrag,
  type DragPayload,
} from "../../src/renderer/dnd/drag-payload";

describe("drag payload", () => {
  it("exposes a stable mime", () => {
    expect(DRAG_MIME).toBe("application/x-mosaic-drag");
  });

  it("round-trips a tray drag", () => {
    const p: DragPayload = { kind: "tray", imageId: "abc" };
    expect(parseDrag(serializeDrag(p))).toEqual(p);
  });

  it("round-trips a cell drag", () => {
    const p: DragPayload = { kind: "cell", row: 1, col: 0 };
    expect(parseDrag(serializeDrag(p))).toEqual(p);
  });

  it("returns null for malformed json", () => {
    expect(parseDrag("not json")).toBe(null);
  });

  it("returns null for unknown kind", () => {
    expect(parseDrag(JSON.stringify({ kind: "wat" }))).toBe(null);
  });

  it("returns null for missing fields", () => {
    expect(parseDrag(JSON.stringify({ kind: "tray" }))).toBe(null);
    expect(parseDrag(JSON.stringify({ kind: "cell", row: 0 }))).toBe(null);
  });
});
