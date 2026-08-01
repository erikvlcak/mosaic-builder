/**
 * Platform-correct glyphs for user-facing shortcut hints.
 *
 * The *bindings* are already cross-platform — `useKeyboardShortcuts` and
 * `useViewportGestures` test `metaKey || ctrlKey`, and the Electron menu uses
 * `CommandOrControl+` accelerators. Only the printed labels differ, so this
 * module is presentation-only: nothing here may influence gesture routing.
 *
 * Mac uses bare glyphs that read as a unit (`⌘Z`, `⇧⌘Z`). Windows/Linux have
 * no such convention — the names are words, so they need a separator (`Ctrl+Z`)
 * and, in prose, a trailing space would read as two hints. Hence every label is
 * built through `chord()` rather than string-concatenated at the call site.
 */

/**
 * Detects macOS from whatever the environment exposes. Exported for tests —
 * production reads `IS_MAC`.
 *
 * Both sources are checked, and case-insensitively, because they disagree in
 * ways that are easy to get wrong:
 *
 * - `userAgentData.platform` reports "macOS" (lowercase m); the UA string
 *   reports "Macintosh" (capital M). A case-sensitive /Mac/ matches only the
 *   second, which silently mis-detects a real Mac as a PC.
 * - `userAgentData` is gated to secure contexts: present under the dev
 *   server's http://localhost, absent under a packaged build's file:// URL.
 *   Preferring it via `??` would therefore take different branches in dev and
 *   production, so neither source may be trusted alone.
 */
export function detectMac(nav: {
  userAgentData?: { platform?: string };
  userAgent?: string;
}): boolean {
  const candidates = [nav.userAgentData?.platform, nav.userAgent];
  return candidates.some((s) => !!s && /mac|iphone|ipad/i.test(s));
}

/**
 * True on macOS. Electron exposes no `process` to a contextIsolated renderer,
 * so this reads navigator — the platform cannot change mid-session, making a
 * module-level constant safe and keeping every consumer synchronous.
 */
export const IS_MAC: boolean = detectMac(navigator);

export interface ShortcutGlyphs {
  /** Primary modifier: ⌘ on Mac, Ctrl on Windows/Linux. */
  mod: string;
  /** Shift. */
  shift: string;
  /** Alt/Option. */
  alt: string;
  /**
   * The key that removes the selection. Mac keyboards label the key ⌫ and have
   * no dedicated forward-delete, so ⌫ is the honest glyph; PC keyboards label
   * it Delete, and Windows users do not read ⌫ as a key at all.
   */
  del: string;
  /**
   * Zoom-in / zoom-out key names. Spelled out on Windows/Linux because
   * `chord("Ctrl", "+")` renders "Ctrl++", which reads as a typo; Microsoft's
   * own UI writes these as "Ctrl+Plus" / "Ctrl+Minus". Mac keeps the compact
   * typographic glyphs it has always used.
   */
  plus: string;
  minus: string;
  /**
   * Joins a modifier to a key. Mac sets glyphs flush (`⌘Z`); elsewhere the
   * words need a `+` to read as a chord (`Ctrl+Z`).
   */
  chord: (...parts: string[]) => string;
}

export const MAC_GLYPHS: ShortcutGlyphs = {
  mod: "⌘",
  shift: "⇧",
  alt: "⌥",
  del: "⌫",
  plus: "+",
  minus: "−",
  chord: (...parts) => parts.join(""),
};

export const PC_GLYPHS: ShortcutGlyphs = {
  mod: "Ctrl",
  shift: "Shift",
  alt: "Alt",
  del: "Delete",
  plus: "Plus",
  minus: "Minus",
  chord: (...parts) => parts.join("+"),
};

export function glyphsFor(isMac: boolean): ShortcutGlyphs {
  return isMac ? MAC_GLYPHS : PC_GLYPHS;
}

/** The glyph set for the machine this renderer is running on. */
export const GLYPHS: ShortcutGlyphs = glyphsFor(IS_MAC);
