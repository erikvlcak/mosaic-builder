import { useEffect, useRef } from "react";

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
  /** Cmd/Ctrl-'='/'+'. */
  onZoomIn?: () => void;
  /** Cmd/Ctrl-'-'. */
  onZoomOut?: () => void;
  /** Cmd/Ctrl-'0'. */
  onZoomFit?: () => void;
  /** Cmd/Ctrl-'1'. */
  onZoomActual?: () => void;
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
      // Zoom shortcuts also require a modifier and would otherwise be
      // filtered out by the "no modifier" guard below.
      const isZoomMod = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
      if (isZoomMod && (e.key === "=" || e.key === "+")) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        if (handlers.onZoomIn) handlers.onZoomIn();
        return;
      }
      if (isZoomMod && e.key === "-") {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        if (handlers.onZoomOut) handlers.onZoomOut();
        return;
      }
      if (isZoomMod && e.key === "0") {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        if (handlers.onZoomFit) handlers.onZoomFit();
        return;
      }
      if (isZoomMod && e.key === "1") {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        if (handlers.onZoomActual) handlers.onZoomActual();
        return;
      }
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
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        handlers.onDeleteAnnotation
      ) {
        e.preventDefault();
        handlers.onDeleteAnnotation();
      } else if (e.key === "Escape") {
        handlers.onEscape();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
