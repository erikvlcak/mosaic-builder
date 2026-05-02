import { useCallback, useState } from "react";
import { cellKey } from "../model/figure-state";

export interface MergeSelection {
  selected: ReadonlySet<string>;
  isSelected: (row: number, col: number) => boolean;
  toggle: (row: number, col: number) => void;
  clear: () => void;
  asCoords: () => { row: number; col: number }[];
}

export function useMergeSelection(): MergeSelection {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((row: number, col: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = cellKey(row, col);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback(
    (row: number, col: number) => selected.has(cellKey(row, col)),
    [selected],
  );

  const asCoords = useCallback(() => {
    return Array.from(selected).map((k) => {
      const [r, c] = k.split(",").map(Number);
      return { row: r ?? 0, col: c ?? 0 };
    });
  }, [selected]);

  return { selected, isSelected, toggle, clear, asCoords };
}
