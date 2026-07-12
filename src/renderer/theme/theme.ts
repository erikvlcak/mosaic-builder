export type ThemeChoice = "system" | "light" | "dark";
export type EffectiveTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "mosaic-theme";

export function resolveEffectiveTheme(
  choice: ThemeChoice,
  prefersDark: boolean,
): EffectiveTheme {
  if (choice === "system") return prefersDark ? "dark" : "light";
  return choice;
}

function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === "system" || v === "light" || v === "dark";
}

export function readStoredChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(raw) ? raw : "system";
  } catch {
    // localStorage can throw in locked-down contexts; fall back to system.
    return "system";
  }
}

export function writeStoredChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Persistence is best-effort; a failed write must not break theming.
  }
}

export function applyThemeAttr(choice: ThemeChoice): void {
  const root = document.documentElement;
  // "system" carries NO attribute so the prefers-color-scheme media query
  // is what drives the tokens; an explicit choice stamps the override.
  if (choice === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", choice);
  }
}
