/**
 * Helpers for the multi-annotation selection state. Selection is held as a
 * `ReadonlySet<string>` (annotation ids) so callers can rely on referential
 * equality for "no-op" updates: every helper returns the same set instance
 * when nothing changes, letting React effects skip.
 *
 * The annotation layer treats a 1-element set the same as the legacy
 * single-id selection — properties panel, chrome, drag-to-move all work
 * unchanged for `size === 1`. Multi-select only kicks in past that.
 */

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

export function emptySelection(): ReadonlySet<string> {
  return EMPTY_SELECTION;
}

export function selectionContains(
  selection: ReadonlySet<string>,
  id: string,
): boolean {
  return selection.has(id);
}

export function singleSelectedId(
  selection: ReadonlySet<string>,
): string | null {
  if (selection.size !== 1) return null;
  // Sets preserve insertion order; iterator yields the only entry.
  const it = selection.values();
  const first = it.next();
  return first.done ? null : first.value;
}

export function replaceSelection(id: string): ReadonlySet<string> {
  return new Set([id]);
}

export function clearSelection(): ReadonlySet<string> {
  return EMPTY_SELECTION;
}

export function addToSelection(
  selection: ReadonlySet<string>,
  id: string,
): ReadonlySet<string> {
  if (selection.has(id)) return selection;
  const next = new Set(selection);
  next.add(id);
  return next;
}

export function removeFromSelection(
  selection: ReadonlySet<string>,
  id: string,
): ReadonlySet<string> {
  if (!selection.has(id)) return selection;
  const next = new Set(selection);
  next.delete(id);
  return next;
}

export function toggleInSelection(
  selection: ReadonlySet<string>,
  id: string,
): ReadonlySet<string> {
  return selection.has(id)
    ? removeFromSelection(selection, id)
    : addToSelection(selection, id);
}

export function setSelection(ids: Iterable<string>): ReadonlySet<string> {
  return new Set(ids);
}

export function unionSelection(
  selection: ReadonlySet<string>,
  ids: Iterable<string>,
): ReadonlySet<string> {
  const next = new Set(selection);
  let changed = false;
  for (const id of ids) {
    if (!next.has(id)) {
      next.add(id);
      changed = true;
    }
  }
  return changed ? next : selection;
}
