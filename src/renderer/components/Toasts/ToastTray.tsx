import type { Toast, ToastKind } from "../../hooks/useToasts";

interface Props {
  toasts: ReadonlyArray<Toast>;
  onDismiss: (id: string) => void;
}

const ICONS: Record<ToastKind, string> = {
  error: "!",
  info: "i",
  success: "✓",
};

const A11Y_ROLE: Record<ToastKind, "alert" | "status"> = {
  error: "alert",
  info: "status",
  success: "status",
};

export function ToastTray({ toasts, onDismiss }: Props): JSX.Element {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 1000,
        maxWidth: 380,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div key={t.id} role={A11Y_ROLE[t.kind]} className={`toast toast--${t.kind}`}>
          <span
            aria-hidden="true"
            style={{
              flex: "0 0 auto",
              width: 18,
              height: 18,
              borderRadius: "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "Georgia, serif",
              background: "currentColor",
              marginTop: 1,
            }}
          >
            <span style={{ color: "var(--c-surface)" }}>{ICONS[t.kind]}</span>
          </span>
          <span style={{ flex: 1, whiteSpace: "pre-wrap", paddingTop: 1 }}>
            {t.message}
          </span>
          <button
            type="button"
            aria-label="Dismiss notification"
            className="toast-dismiss"
            onClick={() => onDismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
