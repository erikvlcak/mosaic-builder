import { useCallback, useEffect, useRef, useState } from "react";

export type ToastKind = "error" | "info" | "success";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

export interface UseToasts {
  toasts: ReadonlyArray<Toast>;
  push: (this: void, t: Omit<Toast, "id">) => string;
  dismiss: (this: void, id: string) => void;
}

/** Cap the visible tray so a burst (e.g. 20 failed imports) can't grow past
 *  the viewport with no scroll. The oldest toasts are evicted first. */
export const MAX_TOASTS = 5;

let counter = 0;
function newId(): string {
  counter += 1;
  return `t${counter}-${Date.now()}`;
}

export function useToasts(ttlMs = 5000): UseToasts {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismiss = useCallback((id: string): void => {
    const t = timersRef.current.get(id);
    if (t !== undefined) clearTimeout(t);
    timersRef.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">): string => {
      const id = newId();
      const toast: Toast = { id, ...t };
      setToasts((prev) => {
        const next = [...prev, toast];
        // Evict oldest beyond the cap, clearing their timers so they don't
        // fire a stale dismiss for an id no longer in the list.
        while (next.length > MAX_TOASTS) {
          const evicted = next.shift();
          if (evicted !== undefined) {
            const timer = timersRef.current.get(evicted.id);
            if (timer !== undefined) clearTimeout(timer);
            timersRef.current.delete(evicted.id);
          }
        }
        return next;
      });
      const timer = setTimeout(() => dismiss(id), ttlMs);
      timersRef.current.set(id, timer);
      return id;
    },
    [ttlMs, dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  return { toasts, push, dismiss };
}
