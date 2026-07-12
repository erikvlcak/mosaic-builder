import type { ThemeChoice } from "../../theme/theme";

interface Props {
  choice: ThemeChoice;
  onChoice: (next: ThemeChoice) => void;
}

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeToggle({ choice, onChoice }: Props): JSX.Element {
  return (
    <div
      className="seg"
      role="group"
      aria-label="Color theme"
      data-testid="theme-toggle"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className="btn"
          aria-pressed={choice === o.value}
          onClick={() => onChoice(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
