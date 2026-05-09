/**
 * Properties form for a single derived letter (spec 08). Letters are not
 * stored on `state.annotations` — they're synthesised from the panel grid
 * + `letterOverrides[panelId]` by `figure-derivations`. This form mutates
 * the override map directly via `setLetterOverride`.
 *
 * UX contract:
 *  - The text input shows the current text override (or empty with the
 *    derived label as placeholder). Empty input clears the text override
 *    but preserves any style override (so a recolored letter doesn't lose
 *    its color when the user wipes the text).
 *  - Each style field has a paired "Use global" checkbox. Checked ⇒ field
 *    falls back to `globalStyle.letters`. Unchecking starts an override at
 *    the current global value so the user has a sensible starting point.
 */

import type { Dispatch } from "react";
import type { LetterOverride } from "../../model/figure-state";
import type { LetterStyle } from "../../model/global-style";
import type { FigureAction } from "../../model/figure-actions";
import { setLetterOverride } from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { TextField } from "./inputs/TextField";

type StyleField = "color" | "bgColor" | "font" | "sizePt" | "bold" | "italic";

interface Props {
  panelId: string;
  /** Current override (may be undefined if the letter is fully derived). */
  override: LetterOverride | undefined;
  /** Derived label for this letter — shown as placeholder when no text override. */
  derivedText: string;
  /** Figure-wide letter style; supplies fallback values for un-overridden fields. */
  globalLetters: LetterStyle;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

const FONT_OPTIONS = [
  "Arial, Helvetica, sans-serif",
  "Helvetica, Arial, sans-serif",
  "Times New Roman, serif",
  "Georgia, serif",
  "Courier New, monospace",
];

export function LetterAnnoForm({
  panelId,
  override,
  derivedText,
  globalLetters,
  dispatch,
  commit,
}: Props): JSX.Element {
  const overrideStyle = override?.style;
  const overrideText = override?.text;

  /**
   * Build a fresh override that updates one style field, then dispatch.
   * Passing `undefined` removes that key (i.e. switches that field back to
   * "use global"). The reducer's `normalizeOverride` collapses an empty
   * override to a delete, so a fully-cleared form drops the entry.
   */
  function patchStyle<K extends StyleField>(
    key: K,
    value: NonNullable<LetterOverride["style"]>[K] | undefined,
    immediate = false,
  ): void {
    const prevStyle = overrideStyle ?? {};
    const nextStyle: NonNullable<LetterOverride["style"]> = { ...prevStyle };
    if (value === undefined) {
      delete nextStyle[key];
    } else {
      nextStyle[key] = value;
    }
    const next: LetterOverride = {};
    if (overrideText !== undefined) next.text = overrideText;
    if (Object.keys(nextStyle).length > 0) next.style = nextStyle;
    dispatch(setLetterOverride(panelId, next));
    if (immediate) commit.flush();
    else commit.markDirty();
  }

  function patchText(s: string): void {
    const next: LetterOverride = {};
    if (s !== "") next.text = s;
    if (overrideStyle !== undefined) next.style = overrideStyle;
    dispatch(setLetterOverride(panelId, next));
    commit.markDirty();
  }

  function resetToGlobal(): void {
    dispatch(setLetterOverride(panelId, null));
    commit.flush();
  }

  function setOverrideEnabled<K extends StyleField>(
    key: K,
    enabled: boolean,
  ): void {
    if (!enabled) {
      patchStyle(key, undefined, true);
      return;
    }
    // Seed the override with the current global value so the visible field
    // doesn't jump on toggle (e.g. enabling color override starts from the
    // current global color, not from an arbitrary default).
    if (key === "bgColor") {
      patchStyle("bgColor", globalLetters.bgColor ?? "#FFFFFF00", true);
    } else {
      patchStyle(
        key,
        globalLetters[key] as NonNullable<LetterOverride["style"]>[K],
        true,
      );
    }
  }

  const colorOverridden = overrideStyle?.color !== undefined;
  const bgOverridden = overrideStyle?.bgColor !== undefined;
  const fontOverridden = overrideStyle?.font !== undefined;
  const sizeOverridden = overrideStyle?.sizePt !== undefined;
  const boldOverridden = overrideStyle?.bold !== undefined;
  const italicOverridden = overrideStyle?.italic !== undefined;

  // Effective values shown in disabled (non-overridden) fields fall back
  // to the global style.
  const effColor = overrideStyle?.color ?? globalLetters.color;
  const effBg = overrideStyle?.bgColor ?? globalLetters.bgColor ?? "#FFFFFF00";
  const effFont = overrideStyle?.font ?? globalLetters.font;
  const effSize = overrideStyle?.sizePt ?? globalLetters.sizePt;
  const effBold = overrideStyle?.bold ?? globalLetters.bold;
  const effItalic = overrideStyle?.italic ?? globalLetters.italic;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <TextField
        label="Text"
        value={overrideText ?? ""}
        placeholder={derivedText}
        onChange={patchText}
        onBlur={commit.flush}
      />

      <OverrideRow
        label="Font"
        overridden={fontOverridden}
        onToggle={(on) => setOverrideEnabled("font", on)}
      >
        <select
          aria-label="Font"
          className="input"
          disabled={!fontOverridden}
          value={effFont}
          onChange={(e) => patchStyle("font", e.currentTarget.value, true)}
          style={{ width: "100%" }}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f.split(",")[0]}
            </option>
          ))}
        </select>
      </OverrideRow>

      <OverrideRow
        label="Size (pt)"
        overridden={sizeOverridden}
        onToggle={(on) => setOverrideEnabled("sizePt", on)}
      >
        <input
          type="number"
          aria-label="Size (pt)"
          className="input"
          value={effSize}
          min={4}
          max={144}
          disabled={!sizeOverridden}
          onChange={(e) => {
            const raw = e.currentTarget.value;
            if (raw === "") return;
            const n = Number(raw);
            if (!Number.isFinite(n)) return;
            const clamped = Math.max(4, Math.min(144, n));
            patchStyle("sizePt", clamped);
          }}
          onBlur={commit.flush}
          style={{ width: "100%" }}
        />
      </OverrideRow>

      <OverrideRow
        label="Style"
        overridden={boldOverridden || italicOverridden}
        onToggle={(on) => {
          if (!on) {
            // Toggle off both bold + italic overrides at once. Doing this in
            // two patchStyle calls would emit two history entries; we tolerate
            // that since the form is already debounced via commit.markDirty.
            patchStyle("bold", undefined);
            patchStyle("italic", undefined, true);
          } else {
            patchStyle("bold", globalLetters.bold);
            patchStyle("italic", globalLetters.italic, true);
          }
        }}
      >
        <div className="seg" role="group" aria-label="Letter style">
          <button
            type="button"
            className="btn"
            aria-label="Bold"
            aria-pressed={effBold}
            disabled={!(boldOverridden || italicOverridden)}
            title="Bold"
            onClick={() => patchStyle("bold", !effBold, true)}
            style={{ fontWeight: 700, minWidth: 32 }}
          >
            B
          </button>
          <button
            type="button"
            className="btn"
            aria-label="Italic"
            aria-pressed={effItalic}
            disabled={!(boldOverridden || italicOverridden)}
            title="Italic"
            onClick={() => patchStyle("italic", !effItalic, true)}
            style={{ fontStyle: "italic", minWidth: 32 }}
          >
            I
          </button>
        </div>
      </OverrideRow>

      <OverrideRow
        label="Color"
        overridden={colorOverridden}
        onToggle={(on) => setOverrideEnabled("color", on)}
      >
        <HexInput
          label="Color"
          value={effColor}
          disabled={!colorOverridden}
          onChange={(c) => patchStyle("color", c)}
          onBlur={commit.flush}
        />
      </OverrideRow>

      <OverrideRow
        label="Background"
        overridden={bgOverridden}
        onToggle={(on) => setOverrideEnabled("bgColor", on)}
      >
        <HexInput
          label="Background"
          value={effBg}
          disabled={!bgOverridden}
          allowAlpha
          onChange={(c) => patchStyle("bgColor", c)}
          onBlur={commit.flush}
        />
      </OverrideRow>

      <button
        type="button"
        className="btn"
        onClick={resetToGlobal}
        style={{ marginTop: 4 }}
      >
        Reset to global
      </button>
    </div>
  );
}

interface RowProps {
  label: string;
  overridden: boolean;
  onToggle: (on: boolean) => void;
  children: React.ReactNode;
}

function OverrideRow({
  label,
  overridden,
  onToggle,
  children,
}: RowProps): JSX.Element {
  return (
    <div
      className="field"
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span className="field-label">{label}</span>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "var(--c-text-muted)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            aria-label={`Use global ${label.toLowerCase()}`}
            checked={!overridden}
            onChange={(e) => onToggle(!e.currentTarget.checked)}
          />
          Use global
        </label>
      </div>
      {children}
    </div>
  );
}

interface HexInputProps {
  label: string;
  value: string;
  disabled: boolean;
  allowAlpha?: boolean;
  onChange: (hex: string) => void;
  onBlur: () => void;
}

const HEX6 = /^#[0-9A-Fa-f]{6}$/;
const HEX8 = /^#[0-9A-Fa-f]{8}$/;

/**
 * Inline color picker for the override form. Mirrors the swatch+hex layout
 * of `ColorField` but supports `disabled` so the field can be greyed out
 * when "Use global" is checked. We don't reach for ColorField because it
 * has no disabled prop and adding one ripples through every other form.
 */
function HexInput({
  label,
  value,
  disabled,
  allowAlpha = false,
  onChange,
  onBlur,
}: HexInputProps): JSX.Element {
  const swatch = value.length >= 7 ? value.slice(0, 7) : "#000000";
  return (
    <span style={{ display: "flex", gap: 6 }}>
      <input
        type="color"
        aria-label={label}
        className="input-color"
        value={swatch}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.value)}
        onBlur={onBlur}
      />
      <input
        type="text"
        aria-label={`${label} hex`}
        className="input"
        value={value}
        spellCheck={false}
        disabled={disabled}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (HEX6.test(v) || (allowAlpha && HEX8.test(v))) onChange(v);
        }}
        onBlur={onBlur}
        style={{ flex: 1, fontVariantNumeric: "tabular-nums" }}
      />
    </span>
  );
}
