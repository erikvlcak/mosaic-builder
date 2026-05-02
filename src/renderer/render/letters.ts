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
