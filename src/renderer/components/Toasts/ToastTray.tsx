import type { Toast, ToastKind } from "../../hooks/useToasts";

interface Props {
  toasts: ReadonlyArray<Toast>;
  onDismiss: (id: string) => void;
}

const COLORS: Record<ToastKind, { bg: string; border: string; fg: string }> = {
  error:   { bg: "#FFEFEF", border: "#C00", fg: "#700" },
  info:    { bg: "#EEF4FF", border: "#06C", fg: "#024" },
  success: { bg: "#EFFFF4", border: "#063", fg: "#042" },
};

export function ToastTray({ toasts, onDismiss }: Props): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 16, right: 16,
        display: "flex", flexDirection: "column", gap: 8,
        zIndex: 1000, maxWidth: 360,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => {
        const c = COLORS[t.kind];
        return (
          <div key={t.id}
            style={{
              background: c.bg, border: `1px solid ${c.border}`,
              color: c.fg, padding: "8px 10px", borderRadius: 4,
              fontSize: 12, fontFamily: "system-ui, sans-serif",
              display: "flex", gap: 8, alignItems: "flex-start",
              pointerEvents: "auto",
              boxShadow: "0 2px 6px rgba(0,0,0,.08)",
            }}>
            <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>{t.message}</span>
            <button type="button" aria-label="Dismiss"
              onClick={() => onDismiss(t.id)}
              style={{
                background: "transparent", border: "none",
                color: c.fg, cursor: "pointer", fontSize: 14, padding: 0,
              }}>×</button>
          </div>
        );
      })}
    </div>
  );
}
