import { createContext, useContext, useEffect, useState } from "react";

/**
 * `Space` = the hand tool (as in Figma/Photoshop/Excalidraw): while held,
 * every drag pans the viewport, overriding object-local gestures. Exposed
 * via context so deep handlers (annotation drags, track/corner handles)
 * can yield to the override without prop-threading.
 *
 * Components rendered outside the provider (unit tests) read the default:
 * not held.
 */
const SpaceHeldContext = createContext(false);

export function useSpaceHeld(): boolean {
  return useContext(SpaceHeldContext);
}

export function InteractionProvider({
  spaceHeld,
  children,
}: {
  spaceHeld: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <SpaceHeldContext.Provider value={spaceHeld}>
      {children}
    </SpaceHeldContext.Provider>
  );
}

/**
 * Owns the global Space-key listeners and returns the live held state.
 * We don't steal Space from form fields (text input, scalebar number,
 * etc.); a window blur clears the held state defensively in case keyup
 * is missed.
 */
export function useSpaceHeldState(): boolean {
  const [spaceHeld, setSpaceHeld] = useState(false);
  useEffect(() => {
    function isFormElementFocused(): boolean {
      const el = document.activeElement;
      if (el === null) return false;
      if (el instanceof HTMLInputElement) return true;
      if (el instanceof HTMLTextAreaElement) return true;
      if (el instanceof HTMLSelectElement) return true;
      if (el instanceof HTMLElement && el.isContentEditable) return true;
      return false;
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.code !== "Space") return;
      if (isFormElementFocused()) return;
      if (e.repeat) return;
      e.preventDefault();
      setSpaceHeld(true);
    }
    function onKeyUp(e: KeyboardEvent): void {
      if (e.code !== "Space") return;
      setSpaceHeld(false);
    }
    function onBlur(): void {
      setSpaceHeld(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  return spaceHeld;
}
