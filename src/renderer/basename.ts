/**
 * Last path segment, for both posix and Windows separators. Electron hands
 * back native paths, so a renderer that only split on "/" would show the
 * full path as a filename on Windows.
 */
export function basename(p: string): string {
  const ix = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return ix >= 0 ? p.slice(ix + 1) : p;
}
