import { describe, it, expect } from "vitest";
import {
  snapDelta,
  SNAP_PX,
  type SnapRect,
  type Guideline,
} from "../../src/renderer/render/snap";

function rect(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
): SnapRect {
  return { id, x, y, w, h };
}

function findGuideline(
  guidelines: Guideline[],
  axis: "x" | "y",
  pos: number,
  otherId: string,
): Guideline | undefined {
  return guidelines.find(
    (g) =>
      g.axis === axis && g.otherId === otherId && Math.abs(g.pos - pos) < 1e-6,
  );
}

describe("snapDelta", () => {
  it("returns zero deltas + no guidelines with no candidates", () => {
    const r = snapDelta(rect("m", 100, 100, 50, 50), []);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
    expect(r.guidelines).toEqual([]);
  });

  it("returns zero deltas when no candidate edges fall within SNAP_PX", () => {
    const moving = rect("m", 100, 100, 50, 50);
    const other = rect("o", 300, 300, 50, 50);
    const r = snapDelta(moving, [other]);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
    expect(r.guidelines).toEqual([]);
  });

  it("snaps left edges when within SNAP_PX (positive correction)", () => {
    // moving.x = 102, other.x = 100. left-edge diff = -2, abs ≤ 4 → snap.
    const moving = rect("m", 102, 200, 50, 50);
    const other = rect("o", 100, 50, 50, 50);
    const r = snapDelta(moving, [other]);
    expect(r.dx).toBe(-2);
    expect(r.dy).toBe(0);
    expect(r.guidelines.length).toBeGreaterThanOrEqual(1);
    const g = findGuideline(r.guidelines, "x", 100, "o");
    expect(g).toBeDefined();
    // Span covers both rects vertically (other.y=50 → moving.y+h=250).
    expect(g?.start).toBe(50);
    expect(g?.end).toBe(250);
  });

  it("snaps top edges when within SNAP_PX", () => {
    // moving.y = 53, other.y = 50. top-edge diff = -3, abs ≤ 4 → snap.
    const moving = rect("m", 200, 53, 50, 50);
    const other = rect("o", 50, 50, 50, 50);
    const r = snapDelta(moving, [other]);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(-3);
    const g = findGuideline(r.guidelines, "y", 50, "o");
    expect(g).toBeDefined();
    expect(g?.start).toBe(50);
    expect(g?.end).toBe(250);
  });

  it("snaps center-x to center-x when only the centers are within range", () => {
    // moving has w=20, center-x = 92. other has w=80, center-x = 90.
    // Edge candidates between moving (min=82, mid=92, max=102) and other (min=50, mid=90, max=130):
    // closest pair = (mid 92, mid 90) → diff -2. Other pairings are all > SNAP_PX.
    const moving = rect("m", 82, 200, 20, 50);
    const other = rect("o", 50, 50, 80, 50);
    const r = snapDelta(moving, [other]);
    expect(r.dx).toBe(-2);
    const g = findGuideline(r.guidelines, "x", 90, "o");
    expect(g).toBeDefined();
  });

  it("snaps right-edge of moving to left-edge of other (cross-edge)", () => {
    // moving.x + w = 100, other.x = 102. diff = 2 → snap +2 on x.
    const moving = rect("m", 50, 200, 50, 50);
    const other = rect("o", 102, 50, 50, 50);
    const r = snapDelta(moving, [other]);
    expect(r.dx).toBe(2);
    const g = findGuideline(r.guidelines, "x", 102, "o");
    expect(g).toBeDefined();
  });

  it("does NOT snap when the diff exceeds SNAP_PX", () => {
    // diff = 5, SNAP_PX = 4 → out of range.
    const moving = rect("m", 105, 100, 50, 50);
    const other = rect("o", 100, 100, 50, 50);
    const r = snapDelta(moving, [other]);
    expect(r.dx).toBe(0);
    // Same x → top-edge alignment exists already, so y-axis snap is 0 too,
    // but a y guideline can still appear (top edges already match).
    expect(r.dy).toBe(0);
  });

  it("picks the closest candidate when multiple are within SNAP_PX", () => {
    const moving = rect("m", 102, 200, 50, 50);
    const closer = rect("close", 103, 50, 50, 50); // diff = 1
    const farther = rect("far", 100, 50, 50, 50); // diff = -2
    const r = snapDelta(moving, [closer, farther]);
    expect(r.dx).toBe(1);
  });

  it("emits multiple x-axis guidelines when several candidates align after snap", () => {
    // Three boxes with left edges at 100, plus moving at 102. After snap dx = -2,
    // moving's left edge = 100 — every "other" with left = 100 should produce a guideline.
    const moving = rect("m", 102, 400, 50, 50);
    const a = rect("a", 100, 50, 50, 50);
    const b = rect("b", 100, 150, 50, 50);
    const c = rect("c", 100, 250, 50, 50);
    const r = snapDelta(moving, [a, b, c]);
    expect(r.dx).toBe(-2);
    const xLines = r.guidelines.filter((g) => g.axis === "x" && g.pos === 100);
    expect(xLines.map((g) => g.otherId).sort()).toEqual(["a", "b", "c"]);
  });

  it("snaps both axes simultaneously when both align", () => {
    const moving = rect("m", 102, 53, 50, 50);
    const other = rect("o", 100, 50, 50, 50);
    const r = snapDelta(moving, [other]);
    expect(r.dx).toBe(-2);
    expect(r.dy).toBe(-3);
  });

  it("disabled=true returns dx=dy=0 but still emits guidelines at snap positions", () => {
    const moving = rect("m", 102, 200, 50, 50);
    const other = rect("o", 100, 50, 50, 50);
    const r = snapDelta(moving, [other], { disabled: true });
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
    // Guideline still appears at the snapped position (100), so the user
    // sees the alignment opportunity.
    const g = findGuideline(r.guidelines, "x", 100, "o");
    expect(g).toBeDefined();
  });

  it("guideline span covers both rects on the perpendicular axis", () => {
    // moving below other; the vertical guideline should span from other's top to moving's bottom.
    const moving = rect("m", 100, 300, 50, 60); // y range 300..360
    const other = rect("o", 100, 50, 50, 40); // y range 50..90
    const r = snapDelta(moving, [other]);
    const g = findGuideline(r.guidelines, "x", 100, "o");
    expect(g).toBeDefined();
    expect(g?.start).toBe(50);
    expect(g?.end).toBe(360);
  });

  it("treats edges exactly at SNAP_PX as a valid snap (boundary condition)", () => {
    const moving = rect("m", 100 + SNAP_PX, 200, 50, 50);
    const other = rect("o", 100, 50, 50, 50);
    const r = snapDelta(moving, [other]);
    expect(r.dx).toBe(-SNAP_PX);
  });

  it("treats edges just outside SNAP_PX as no snap", () => {
    const moving = rect("m", 100 + SNAP_PX + 0.01, 200, 50, 50);
    const other = rect("o", 100, 50, 50, 50);
    const r = snapDelta(moving, [other]);
    expect(r.dx).toBe(0);
  });

  it("ignores rects identified as the moving rect when caller filters them out", () => {
    // Caller is responsible for filtering — verify that not filtering produces
    // a self-aligned guideline (the moving rect aligns with itself trivially).
    // This test documents the contract: pass `others` that excludes the moving id.
    const moving = rect("m", 100, 100, 50, 50);
    const r = snapDelta(moving, [moving]);
    // Self-comparison produces zero correction (every edge matches its own
    // edge with diff = 0) and a self-guideline. The interaction layer must
    // exclude the moving rect from the candidate list.
    expect(r.dx).toBe(0);
    expect(r.guidelines.find((g) => g.otherId === "m")).toBeDefined();
  });
});
