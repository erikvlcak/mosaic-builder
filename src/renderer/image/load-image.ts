/**
 * Fetches an image URL and decodes it into an ImageBitmap.
 * Renderer-only (depends on fetch + createImageBitmap).
 */
export async function loadImageBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`loadImageBitmap: ${url} -> HTTP ${res.status}`);
  }
  const blob = await res.blob();
  return createImageBitmap(blob);
}
