# Multiple Named Brand Colors

**Date:** 2026-04-18
**Status:** Approved, pending implementation plan
**Supersedes:** brand-color portion of `2026-04-18-themable-studio-design.md`

## Goal

Support an arbitrary number of named brand color scales per deployment (think Google's blue/red/yellow/green) instead of a single brand slot. The first entry also drives `--color-accent-*`, so there is exactly one "primary" per deployment and any number of additional named scales available for marketing surfaces, badges, categories, etc.

## Key decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Env shape | **Single var** `VITE_BRAND_COLORS`, comma-separated entries of form `<name>:<lightHex>/<darkHex>` |
| 2 | First entry's role | **First entry is the accent.** Emits both `--color-<name>-*` and `--color-accent-*` (same scale, duplicated as literal tokens — not `var()` references) |
| 3 | `--color-brand-*` | **Dropped.** Avoids a third alias for the same scale |
| 4 | Existing `VITE_ACCENT_*` / `VITE_BRAND_*` env vars | **Removed.** Accent is no longer independently configurable |
| 5 | Name rules | Strict regex `/^[a-z][a-z0-9-]*$/`; reserved names (`gray`, `accent`, `brand`, `background`) rejected; unique within list |
| 6 | Count bounds | 1–12 entries. Lower bound ensures there's always an accent; upper bound keeps generated CSS bounded |
| 7 | Color validation | Both light and dark parsed through `colorjs.io` `new Color()` — accepts any valid CSS color, same as existing `colorStr` |
| 8 | Runtime enumeration | Generator exports `brandNames: readonly string[]` from `theme.generated.ts` for UIs that need the list |

`generateRadixColors` is still called twice per entry (light + dark), using the existing `VITE_GRAY_*` and `VITE_BG_*` as `gray` and `background` anchors.

## Env schema changes (`src/env.ts`)

**Removed:** `VITE_ACCENT_LIGHT`, `VITE_ACCENT_DARK`, `VITE_BRAND_LIGHT`, `VITE_BRAND_DARK`.

**Added:** `VITE_BRAND_COLORS`, validated and transformed into a parsed array:

```ts
const brandNameRegex = /^[a-z][a-z0-9-]*$/
const reservedNames = new Set(['gray', 'accent', 'brand', 'background'])

const brandEntrySchema = z
  .string()
  .transform((raw, ctx) => {
    // "name:#light/#dark"
    const [name, rest] = raw.split(':', 2)
    if (!rest || !name) {
      ctx.addIssue({ code: 'custom', message: `malformed brand entry: "${raw}"` })
      return z.NEVER
    }
    const [light, dark] = rest.split('/', 2)
    if (!light || !dark) {
      ctx.addIssue({ code: 'custom', message: `brand "${name}" missing light/dark: "${raw}"` })
      return z.NEVER
    }
    return { name: name.trim(), light: light.trim(), dark: dark.trim() }
  })
  .pipe(
    z.object({
      name: z
        .string()
        .regex(brandNameRegex, 'name must match /^[a-z][a-z0-9-]*$/')
        .refine((n) => !reservedNames.has(n), {
          message: `name is reserved (${[...reservedNames].join(', ')})`,
        }),
      light: colorStr,
      dark: colorStr,
    }),
  )

const brandColorsSchema = z
  .string()
  .min(1)
  .transform((s) => s.split(',').map((e) => e.trim()).filter(Boolean))
  .pipe(z.array(brandEntrySchema).min(1).max(12))
  .refine(
    (arr) => new Set(arr.map((e) => e.name)).size === arr.length,
    { message: 'brand names must be unique' },
  )

client: {
  // ...existing vars
  VITE_BRAND_COLORS: brandColorsSchema,
}
```

Parsed result: `env.VITE_BRAND_COLORS: Array<{ name: string; light: string; dark: string }>`.

## Generator changes (`scripts/generate-theme-css.ts`)

### Type changes

```ts
export type BrandEntry = { name: string; light: string; dark: string }

export type ThemeColorInputs = {
  gray: { light: string; dark: string }
  brandColors: BrandEntry[]        // was: accent + brand, both { light, dark }
  bg: { light: string; dark: string }
  fontFamilies: Record<FontSlotKey, string>
}
```

### Emission rules (inside `buildThemeCss`)

For each `entry` in `brandColors`:
1. Call `generateRadixColors` once with `appearance: "light"` and once with `"dark"`, using `gray` and `bg` as anchors.
2. Emit `buildScaleBlock(entry.name, …)` in both the `@theme` and `.dark` blocks (and their P3 counterparts).
3. If `index === 0`, emit the same scale a second time under the name `"accent"`.

The second emission is literal duplication of the token values (not CSS `var(--color-<name>-9)`), because Tailwind v4 `@theme` resolves tokens at build time and needs each token to be concrete.

### Removed

- `brand: { light, dark }` parameter and the three `generateRadixColors` calls tied to it per theme.
- `--color-brand-*` output in the CSS generator and in any existing generated fixtures.

### Test updates (`scripts/generate-theme-css.test.ts`)

- Drop assertions referencing `--color-brand-*`.
- Add: given `brandColors: [{ name: "primary", ... }, { name: "secondary", ... }]`, generated CSS contains `--color-primary-*`, `--color-secondary-*`, and `--color-accent-*` (aliasing `primary`), but **no** `--color-brand-*`.
- Add: given only one brand entry, `--color-<name>-*` and `--color-accent-*` both present.
- Add: alias scale values are byte-equal to the first entry's scale values.

## Theme module (`src/styles/theme.generated.ts`)

Existing exports unchanged. Add one:

```ts
export const brandNames: readonly string[]  // e.g. ["primary", "secondary", "tertiary"]
```

Populated from `env.VITE_BRAND_COLORS.map((e) => e.name)` inside `buildThemeModule`. Consumers (e.g. a future brand picker or legend) import this to render swatches tied to `--color-<name>-*` tokens.

## CSS output shape

```css
/* GENERATED. Do not edit. Source: scripts/generate-theme-css.ts */
@theme {
  --color-gray-1..12, --color-gray-a1..12, --color-gray-surface;

  /* first entry — emitted twice (named + accent alias) */
  --color-primary-1..12, --color-primary-a1..12,
  --color-primary-contrast, --color-primary-surface;
  --color-accent-1..12, --color-accent-a1..12,
  --color-accent-contrast, --color-accent-surface;

  /* remaining entries — named only */
  --color-secondary-1..12, --color-secondary-a1..12,
  --color-secondary-contrast, --color-secondary-surface;
  --color-tertiary-1..12, ...;

  --color-background: <VITE_BG_LIGHT>;

  --font-sans: ...;
  --font-mono: ...;
  --font-display: ...;
}

.dark {
  /* all scales overridden with dark hex values; same name set */
  --color-gray-1: ...;
  --color-primary-1: ...;
  --color-accent-1: ...;
  --color-secondary-1: ...;
  ...
  --color-background: <VITE_BG_DARK>;
}

@supports (color: oklch(0 0 0)) {
  @theme { /* wide-gamut copies of every scale above */ }
  .dark   { /* wide-gamut dark copies */ }
}
```

## File inventory

**Modified:**
- `src/env.ts` — drop 4 vars, add `VITE_BRAND_COLORS` with parsing + validation
- `scripts/generate-theme-css.ts` — replace `{ accent, brand }` inputs with `brandColors: BrandEntry[]`; alias first entry as `accent`; emit loop over list
- `scripts/generate-theme-css.test.ts` — swap brand/accent assertions for the list-based model
- `.env.local` — replace four color lines with one `VITE_BRAND_COLORS=...` line
- `docs/superpowers/specs/2026-04-18-themable-studio-design.md` — add a "Superseded by" banner at the top of the brand/accent sections (single-line pointer, not a rewrite)

**Unchanged:**
- `src/utils/colors.ts` (`generateRadixColors` — called with same arguments, just more times)
- `plugins/vite-theme.ts` — still a thin `buildStart` wrapper
- `src/styles.css` — still just imports `theme.generated.css`
- `src/components/logo.tsx`, font `<link>` wiring in `__root.tsx`

## Migration notes

Existing `.env.local` values need a single-line swap. Before:

```
VITE_ACCENT_LIGHT=#3D63DD
VITE_ACCENT_DARK=#5A7FE8
VITE_BRAND_LIGHT=#3D63DD
VITE_BRAND_DARK=#5A7FE8
```

After:

```
VITE_BRAND_COLORS=primary:#3D63DD/#5A7FE8
```

Any component code referencing `--color-brand-*` (none in the repo as of this writing — the variables exist but are unused in `src/`) must be updated to `--color-accent-*` or to a specific named brand.

## Testing strategy

- **Unit (vitest):**
  - Parser: round-trip fixtures for 1, 3, and 12 entries; reject malformed (`"foo:#abc"`, `"foo:#abc/"`, missing name, duplicate names, reserved names, invalid hex).
  - Generator: for each of the above (valid) fixtures, assert the expected set of `--color-*` tokens is present in both `@theme` and `.dark` blocks; assert first-entry scale is byte-equal to the `accent` alias.
- **Integration:** `vite build` with a valid `VITE_BRAND_COLORS` succeeds; `vite build` with a malformed value fails with a Zod error that names the offending entry.
- **Visual smoke:** dev server renders a page with `bg-accent-9 text-accent-contrast`, `bg-secondary-9`, `bg-tertiary-9` swatches; verify dark mode toggle swaps all three correctly.

## Out of scope

- Per-brand `contrast` / `surface` overrides beyond what `generateRadixColors` produces.
- Runtime brand switching (all scales are baked at build time).
- Existing `gray`, background, font, logo env handling — untouched.
- A brand-picker UI component. `brandNames` is exported so one can be added later without re-touching the generator.
