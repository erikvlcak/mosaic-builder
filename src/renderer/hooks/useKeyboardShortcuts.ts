import { useEffect } from "react";

export interface ShortcutHandlers {
  onMerge: () => void;
  onUnmerge: () => void;
  onEscape: () => void;
  onRotate90?: () => void;
  onFlipH?: () => void;
  onFlipV?: () => void;
  onResetTransform?: () => void;
  /** Delete / Backspace removes the currently-selected annotation. */
  onDeleteAnnotation?: () => void;
  /** Cmd/Ctrl-Z. */
  onUndo?: () => void;
  /** Cmd/Ctrl-Shift-Z. */
  onRedo?: () => void;
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
      // Cmd/Ctrl-Z and Cmd/Ctrl-Shift-Z come first — they intentionally
      // require a modifier and would otherwise be filtered out below.
      const isModZ =
        (e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "z" || e.key === "Z");
      if (isModZ) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) {
          if (h.onRedo) h.onRedo();
        } else {
          if (h.onUndo) h.onUndo();
        }
        return;
      }
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
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        h.onDeleteAnnotation
      ) {
        e.preventDefault();
        h.onDeleteAnnotation();
      } else if (e.key === "Escape") {
        h.onEscape();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [h]);
}
