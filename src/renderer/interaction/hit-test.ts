import type { PointerHit } from "./intents";

/**
 * Classify a pointer-event target for `resolvePointerDown`. Interactive
 * elements (annotations, handles, chips, popovers, occupied panels) carry a
 * `data-interactive` attribute; occupied panels use the value "panel" so
 * the resolver can route them to native HTML5 drag. No attribute anywhere
 * up the tree means the press landed on pannable background.
 *
 * DOM-flavored on purpose (kept out of resolve.ts so that file stays pure
 * and node-testable).
 */
export function hitFromTarget(target: EventTarget | null): PointerHit {
  if (!(target instanceof Element)) return "background";
  const el = target.closest("[data-interactive]");
  if (el === null) return "background";
  return el.getAttribute("data-interactive") === "panel"
    ? "placed-panel"
    : "interactive";
}
