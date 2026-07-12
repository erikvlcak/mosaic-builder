import { useEffect, useRef } from "react";

export interface ShortcutHandlers {
  onMerge: () => void;
  onUnmerge: () => void;
  onEscape: () => void;
  onRotate90?: () => void;
  onFlipH?: () => void;
  onFlipV?: () => void;
  onResetTransform?: () => void;
  /**
   * Delete / Backspace removes the currently-selected annotation. Returns
   * true when the keystroke was consumed (annotations keep priority over
   * panel unplacing).
   */
  onDeleteAnnotation?: () => boolean;
  /** Delete / Backspace with a placed panel selected and NO annotation
   *  selected: unplace the image back to the tray. */
  onUnplacePanel?: () => void;
  /** Enter with a placed panel selected: enter Frame mode. */
  onEnterFrame?: () => void;
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
  const hRef = useRef(h);
  hRef.current = h;
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const handlers = hRef.current;
      // Cmd/Ctrl-Z and Cmd/Ctrl-Shift-Z come first — they intentionally
      // require a modifier and would otherwise be filtered out below.
      const isModZ =
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        (e.key === "z" || e.key === "Z");
      if (isModZ) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) {
          if (handlers.onRedo) handlers.onRedo();
        } else {
          if (handlers.onUndo) handlers.onUndo();
        }
        return;
      }
      // ⌘+/⌘−/⌘0/⌘1 are NOT handled here: viewport zoom is single-bound to
      // the View menu (accelerators consume the keystroke and arrive as
      // MENU_EVENTS). A second in-page binding would double-fire.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        handlers.onMerge();
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        handlers.onUnmerge();
      } else if (e.key === "r" || e.key === "R") {
        if (handlers.onRotate90) {
          e.preventDefault();
          handlers.onRotate90();
        }
      } else if (e.key === "h" || e.key === "H") {
        if (handlers.onFlipH) {
          e.preventDefault();
          handlers.onFlipH();
        }
      } else if (e.key === "v" || e.key === "V") {
        if (handlers.onFlipV) {
          e.preventDefault();
          handlers.onFlipV();
        }
      } else if (e.key === "0") {
        if (handlers.onResetTransform) {
          e.preventDefault();
          handlers.onResetTransform();
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (handlers.onDeleteAnnotation || handlers.onUnplacePanel) {
          e.preventDefault();
          const consumed = handlers.onDeleteAnnotation?.() === true;
          if (!consumed) handlers.onUnplacePanel?.();
        }
      } else if (e.key === "Enter") {
        // Don't hijack Enter from focusable controls (buttons, tray
        // thumbnails) — their own activation semantics win.
        const t = e.target;
        if (
          t instanceof HTMLElement &&
          (t.tagName === "BUTTON" || t.tagName === "A" || t.tabIndex >= 0)
        ) {
          return;
        }
        if (handlers.onEnterFrame) handlers.onEnterFrame();
      } else if (e.key === "Escape") {
        handlers.onEscape();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
