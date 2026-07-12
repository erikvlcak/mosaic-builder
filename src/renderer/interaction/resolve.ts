/**
 * THE routing table. Every global gesture owner resolves its intent here;
 * precedence is written once, in order, instead of emerging from listener
 * registration order and `e.defaultPrevented` handshakes:
 *
 *   1. Outside the canvas pane → native (tray/properties scroll normally).
 *   2. Space / middle button → viewport pan (the hand tool wins over
 *      everything, including object drags).
 *   3. Frame mode → gestures retarget onto the framed image, regardless
 *      of which pixel the cursor is over inside the pane.
 *   4. Hit-test: interactive object → its local handler; placed panel →
 *      native HTML5 drag; anything else → viewport pan.
 *
 * Pure functions only — no DOM types — so the table is unit-testable in
 * the node environment.
 */

import type { PointerHit, PointerIntent, WheelIntent } from "./intents";

export function resolveWheel(input: {
  frameMode: boolean;
  /** ⌘/Ctrl held, or a trackpad pinch (which arrives as ctrlKey+wheel). */
  zoomModifier: boolean;
  overCanvasPane: boolean;
}): WheelIntent {
  if (!input.overCanvasPane) return "native";
  if (input.zoomModifier) return input.frameMode ? "zoom-image" : "zoom-view";
  return input.frameMode ? "pan-image" : "pan-view";
}

export function resolvePointerDown(input: {
  frameMode: boolean;
  spaceHeld: boolean;
  /** PointerEvent.button: 0 = left, 1 = middle, 2 = right. */
  button: number;
  hit: PointerHit;
}): PointerIntent {
  if (input.button === 1) return "pan-view";
  if (input.button !== 0) return "click-through";
  if (input.spaceHeld) return "pan-view";
  if (input.frameMode) return "frame-drag";
  switch (input.hit) {
    case "interactive":
      return "object-drag-passthrough";
    case "placed-panel":
      return "native-dnd";
    case "background":
      return "pan-view";
  }
}

export type EscapeIntent =
  | "disarm-tool"
  | "exit-frame"
  | "clear-selections"
  | "none";

/**
 * Esc unwinds ONE level per press. Modals, the inline text editor, and
 * the scale-bar popover consume Esc locally before it reaches the global
 * handler; this resolves the remaining order: armed placement tool →
 * Frame mode → selections (all) → nothing.
 */
export function resolveEscape(input: {
  frameMode: boolean;
  toolArmed: boolean;
  hasSelection: boolean;
}): EscapeIntent {
  if (input.toolArmed) return "disarm-tool";
  if (input.frameMode) return "exit-frame";
  if (input.hasSelection) return "clear-selections";
  return "none";
}

/**
 * Normalize a wheel event into 2-D pan deltas. Line-mode deltas
 * (deltaMode === 1, mice on Firefox/Windows) are scaled ×16 to
 * approximate pixels; `Shift`+wheel turns a mouse's vertical-only wheel
 * horizontal (trackpads already pan 2-D via deltaX, so the swap only
 * applies when deltaX is zero).
 */
export function normalizeWheelPan(e: {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  shiftKey: boolean;
}): { dx: number; dy: number } {
  const k = e.deltaMode === 1 ? 16 : 1;
  let dx = e.deltaX * k;
  let dy = e.deltaY * k;
  if (e.shiftKey && dx === 0) {
    dx = dy;
    dy = 0;
  }
  return { dx, dy };
}
