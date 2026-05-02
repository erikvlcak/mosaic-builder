import { useEffect } from "react";

export interface ShortcutHandlers {
  onMerge: () => void;
  onUnmerge: () => void;
  onEscape: () => void;
  onRotate90?: () => void;
  onFlipH?: () => void;
  onFlipV?: () => void;
  onResetTransform?: () => void;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function useKeyboardShortcuts(h: ShortcutHandlers): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        h.onMerge();
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        h.onUnmerge();
      } else if (e.key === "r" || e.key === "R") {
        if (h.onRotate90) {
          e.preventDefault();
          h.onRotate90();
        }
      } else if (e.key === "h" || e.key === "H") {
        if (h.onFlipH) {
          e.preventDefault();
          h.onFlipH();
        }
      } else if (e.key === "v" || e.key === "V") {
        if (h.onFlipV) {
          e.preventDefault();
          h.onFlipV();
        }
      } else if (e.key === "0") {
        if (h.onResetTransform) {
          e.preventDefault();
          h.onResetTransform();
        }
      } else if (e.key === "Escape") {
        h.onEscape();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [h]);
}
