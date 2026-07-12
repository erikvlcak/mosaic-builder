import { useCallback, useEffect, useState } from "react";
import {
  applyThemeAttr,
  readStoredChoice,
  resolveEffectiveTheme,
  writeStoredChoice,
  type EffectiveTheme,
  type ThemeChoice,
} from "./theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function prefersDark(): boolean {
  return (
    typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches === true
  );
}

export interface UseTheme {
  choice: ThemeChoice;
  effectiveTheme: EffectiveTheme;
  setChoice(next: ThemeChoice): void;
}

export function useTheme(): UseTheme {
  const [choice, setChoiceState] = useState<ThemeChoice>(() =>
    readStoredChoice(),
  );
  const [osDark, setOsDark] = useState<boolean>(() => prefersDark());

  // When following the OS, re-render if the OS theme flips while we're open.
  // When pinned, the listener is attached but osDark simply doesn't feed the
  // resolved theme, so it's inert.
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent): void => setOsDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Keep the <html> attribute in sync with the current choice (covers the
  // mount case too, reinforcing the boot stamp in main.tsx).
  useEffect(() => {
    applyThemeAttr(choice);
  }, [choice]);

  const setChoice = useCallback((next: ThemeChoice): void => {
    setChoiceState(next);
    writeStoredChoice(next);
    applyThemeAttr(next);
  }, []);

  const effectiveTheme = resolveEffectiveTheme(choice, osDark);
  return { choice, effectiveTheme, setChoice };
}
