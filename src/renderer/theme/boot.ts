import { applyThemeAttr, readStoredChoice } from "./theme";

/**
 * Stamp the persisted theme onto <html> synchronously, before React renders.
 * The app CSP is `script-src 'self'`, which forbids an inline <head> script,
 * so this runs at the very top of the renderer entry module instead. The
 * <body> is an empty #root until React mounts, so stamping here beats first
 * meaningful paint and avoids a light→dark flash. "system" leaves the
 * attribute off so prefers-color-scheme drives the tokens.
 */
export function applyStoredTheme(): void {
  applyThemeAttr(readStoredChoice());
}
