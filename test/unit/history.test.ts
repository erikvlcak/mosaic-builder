import { describe, it, expect } from "vitest";
import {
  emptyHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  MAX_HISTORY,
  type History,
} from "../../src/renderer/state/history";

describe("history ring buffer", () => {
  it("starts empty and reports no undo/redo", () => {
    const h: History<number> = emptyHistory();
    expect(h.past).toEqual([]);
    expect(h.future).toEqual([]);
  });

  it("push records previous state in `past` and clears `future`", () => {
    let h: History<number> = emptyHistory();
    h = pushHistory(h, 1, 2); // prev=1, next=2
    h = pushHistory(h, 2, 3);
    expect(h.past).toEqual([1, 2]);
    expect(h.future).toEqual([]);
  });

  it("undo moves current → future, returns top of past as current", () => {
    let h: History<number> = emptyHistory();
    h = pushHistory(h, 1, 2);
    h = pushHistory(h, 2, 3);
    const u = undoHistory(h, 3);
    expect(u).toEqual({
      next: 2,
      history: { past: [1], future: [3] },
    });
  });

  it("redo is the inverse of undo", () => {
    let h: History<number> = emptyHistory();
    h = pushHistory(h, 1, 2);
    const u = undoHistory(h, 2);
    expect(u).not.toBeNull();
    const r = redoHistory(u!.history, u!.next);
    expect(r).toEqual({
      next: 2,
      history: { past: [1], future: [] },
    });
  });

  it("undo on empty past returns null", () => {
    const h: History<number> = emptyHistory();
    expect(undoHistory(h, 0)).toBeNull();
  });

  it("redo on empty future returns null", () => {
    const h: History<number> = emptyHistory();
    expect(redoHistory(h, 0)).toBeNull();
  });

  it("a new push after undo discards the future", () => {
    let h: History<number> = emptyHistory();
    h = pushHistory(h, 1, 2);
    h = pushHistory(h, 2, 3);
    const u = undoHistory(h, 3)!;
    const next = pushHistory(u.history, u.next, 99);
    expect(next.future).toEqual([]);
    expect(next.past).toEqual([1, 2]);
  });

  it("caps past at MAX_HISTORY (=10), dropping the oldest", () => {
    expect(MAX_HISTORY).toBe(10);
    let h: History<number> = emptyHistory();
    let cur = 0;
    // 12 pushes → past should hold the 10 most-recent prior states (0..11 prev).
    for (let i = 0; i < 12; i++) {
      h = pushHistory(h, cur, cur + 1);
      cur += 1;
    }
    expect(h.past.length).toBe(10);
    expect(h.past[0]).toBe(2);    // oldest retained
    expect(h.past[9]).toBe(11);   // most recent past
  });
});
