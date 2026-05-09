# 08 — Per-letter text & style overrides + patterns

## Problem

Letters are auto-derived from cell position (`A`, `B`, `C`…) and
share a single global style (`globalStyle.letters`). The user wants:

1. Edit a single letter's **text** (override "A" → "A1") — the schema
   already supports this via `letterOverrides[panelId]`, but no UI
   exists to set it.
2. Edit a single letter's **style** (color, bg, font, size)
   independently of the global style.
3. Apply pre-defined renaming **patterns** to all letters at once:
   - Letters → numbers (1, 2, 3…)
   - Uppercase → lowercase
   - Add brackets ([A], (A))
   - Mixed prefix patterns ("1a", "1b", "1c"… for one row, "2a, 2b…"
     for the next)

## Goal

- Click a letter on the canvas → it becomes selected (today letters
  aren't selectable). The properties panel shows letter-specific
  fields with the global style as the default.
- A "Patterns" picker on the figure-level settings re-derives all
  letters at once.
- Per-letter style is persisted; pattern application is non-destructive
  in the sense that a letter with a manual override is left alone
  unless the user explicitly clears overrides first.

## Design

### Model

Letters today are derived only — they appear in
`Figure.annotations` as `LetterAnnotation` after `figure-derivations`
runs. Overrides are stored as
`figureState.letterOverrides: Record<panelId, string>` (text only).

Extend overrides to a structured shape:

```ts
export interface LetterOverride {
  /** Override for the letter text. Undefined → use derived from pattern. */
  text?: string;
  /** Override for the letter style (any subset of globalStyle.letters). */
  style?: Partial<{
    color: string;
    bgColor: string;
    font: string;
    sizePt: number;
    bold: boolean;
    italic: boolean;
  }>;
}

// figureState.letterOverrides becomes:
letterOverrides: Record<string /* panelId */, LetterOverride>;
```

Add `letterPattern` to figure-state:

```ts
type LetterPattern =
  | "uppercase" // A, B, C, ...
  | "lowercase" // a, b, c, ...
  | "numeric" // 1, 2, 3, ...
  | "uppercase-paren" // (A), (B), ...
  | "uppercase-bracket" // [A], [B], ...
  | "rowcol-mixed"; // 1a, 1b, 1c, 2a, 2b, ...

letterPattern: LetterPattern; // default: "uppercase"
```

`figure-derivations.resolveLetterText(panel, pattern, overrides)`
returns the text for a letter:

1. If `overrides[panelId]?.text` is defined, return it (manual wins).
2. Else, derive from pattern + grid coords.

Style resolution (used by the renderer):

- Start with `globalStyle.letters`.
- Merge `overrides[panelId]?.style` on top.

### Reducer changes

Migration: existing `Record<string, string>` → `Record<string, LetterOverride>`,
where the old string becomes `{ text }`. Bump schema in `serialize.ts`.

New / changed actions:

```ts
| { type: "SET_LETTER_OVERRIDE"; panelId: string; override: LetterOverride | null }
| { type: "SET_LETTER_PATTERN"; pattern: LetterPattern }
| { type: "CLEAR_ALL_LETTER_OVERRIDES" }
```

`SET_LETTER_OVERRIDE` replaces the existing same-named action, with
a richer payload. Passing `null` clears the override (same as today).

### UI

#### Letter selection (new gesture)

Today letters render as part of `drawFigure`, atop panels, with no
hit-test surface in `AnnotationInteractionLayer`. We add letter
hit-rects to that layer, with `kind: "letter"`. Clicking a letter
selects it (single or multi-select per spec 07).

#### Properties panel — single letter selected

A new `LetterAnnoForm.tsx`:

- **Text**: input field, placeholder shows the derived text. Empty →
  no override (use derived). Non-empty → text override.
- **Color** / **Bg** / **Font** / **Size** / **Bold** / **Italic**:
  each input has a "Use global" checkbox. Unchecked → custom override
  shown. Checked → override removed for that field.
- **"Reset to global"** button at the bottom — clears all per-letter
  style and text overrides for this letter.

Multi-select inherits from spec 07: the multi-edit form's color/font
controls apply via `BULK_UPDATE_ANNOS`-equivalent for letters
(internally, this reduces to multiple `SET_LETTER_OVERRIDE` calls).

#### Pattern picker — figure-level

In `CanvasAndGlobalStyleForm.tsx`, add a **Letter pattern** dropdown
(or radio group) with the six options above, plus a button:

> Reset all letter overrides

This calls `CLEAR_ALL_LETTER_OVERRIDES`.

When the user changes the pattern, **only** the derived text changes;
existing manual overrides (`overrides[panelId].text`) are preserved.
The form copy makes this explicit:

> Pattern controls auto-generated labels. Letters with manual overrides
> are unaffected. To re-apply the pattern everywhere, click
> "Reset all letter overrides" first.

### Render

`drawLetters` in `draw-figure.ts` now reads:

- `state.letterPattern` and `state.letterOverrides` (passed through to
  derivations).
- For each letter: derive text via `resolveLetterText`, derive style
  via merged-globalStyle.

Every letter still gets a visible hit-rect for spec 07 selection.

## Files touched

- `src/renderer/model/figure-state.ts` — `LetterOverride` type,
  `letterPattern` field, schema-version bump.
- `src/renderer/model/figure-actions.ts` — replace
  `SET_LETTER_OVERRIDE`, add `SET_LETTER_PATTERN`,
  `CLEAR_ALL_LETTER_OVERRIDES`.
- `src/renderer/model/figure-actions.test.ts` — coverage; migration
  test of the old → new override shape.
- `src/renderer/model/figure-derivations.ts` — `resolveLetterText`,
  per-letter style merge.
- `src/renderer/model/serialize.ts` — schema migration.
- `src/renderer/render/draw-figure.ts` — letter rendering uses merged
  styles.
- `src/renderer/components/Properties/LetterAnnoForm.tsx` — new.
- `src/renderer/components/Properties/PropertiesPanel.tsx` — route to
  `LetterAnnoForm` when a letter annotation is selected.
- `src/renderer/components/Properties/CanvasAndGlobalStyleForm.tsx` —
  pattern picker + reset button.
- `src/renderer/components/Annotations/AnnotationInteractionLayer.tsx`
  — letter hit-rects.

## Acceptance

- Click a letter → properties panel shows letter-specific form.
- Edit color → that single letter is recolored; others stay global.
- Type a new text into the text field → letter renames; pattern
  changes don't overwrite it.
- Pick "Numeric" pattern → un-overridden letters become 1, 2, 3…;
  overridden letters keep their text.
- "Reset all letter overrides" wipes everything; pattern fully
  re-derives.
- Saved + reloaded projects preserve overrides + pattern.

## Out of scope

- Custom user-defined patterns (template strings like "Fig {row}.{col}").
- Letters that span multiple panels visually.
- Conditional letters per row/column.

## Depends on

Spec 07 not strictly required, but landing both together makes the
multi-select experience for letters consistent from day one.
