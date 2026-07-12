// A chord (any non-modifier key pressed while Cmd/Ctrl is down) expresses a
// shortcut intent (⌘Z/⌘N/⌘S…), not a temporary-select hold — it must cancel
// cmdHeld immediately so the SELECT MODE chip doesn't flash mid-shortcut.
export function nextCmdHeld(
  prev: boolean,
  e: { key: string; metaKey: boolean; ctrlKey: boolean },
): boolean {
  if (e.key === "Meta" || e.key === "Control") return true;
  if (e.metaKey || e.ctrlKey) return false;
  return prev;
}
