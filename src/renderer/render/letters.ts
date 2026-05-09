import type { LetterPattern } from "../model/figure-state";

/**
 * Spreadsheet-style 1-based label for a 0-based row-major cell index.
 * Index 0 → "A", 25 → "Z", 26 → "AA", 99 → "CV".
 */
export function cellLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`cellLabel: invalid index ${index}`);
  }
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Lowercase variant of `cellLabel`. 0 → "a", 25 → "z", 26 → "aa".
 */
function cellLabelLower(index: number): string {
  return cellLabel(index).toLowerCase();
}

/**
 * Resolve a letter label for `(row, col)` under the given pattern. The
 * `cols` argument lets row-major-flattening patterns compute a stable
 * `index = row * cols + col` for merged panels (callers pass the panel's
 * top-left). For `rowcol-mixed`, we ignore `index` and use row+col directly.
 */
export function labelForPattern(
  row: number,
  col: number,
  cols: number,
  pattern: LetterPattern,
): string {
  const flat = row * cols + col;
  switch (pattern) {
    case "uppercase":
      return cellLabel(flat);
    case "lowercase":
      return cellLabelLower(flat);
    case "numeric":
      return String(flat + 1);
    case "uppercase-paren":
      return `(${cellLabel(flat)})`;
    case "uppercase-bracket":
      return `[${cellLabel(flat)}]`;
    case "rowcol-mixed":
      return `${row + 1}${cellLabelLower(col)}`;
    default: {
      const _exhaustive: never = pattern;
      void _exhaustive;
      return cellLabel(flat);
    }
  }
}
