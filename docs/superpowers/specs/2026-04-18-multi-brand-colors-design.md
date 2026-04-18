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
| 2 | First entry's role | **First entry is the accent.** Emits `--color-<name>-*` with concrete values; `--color-accent-*` defined as `var()` aliases pointing at the first entry (one source of truth, dark/P3 swaps propagate automatically) |
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
2. Emit `buildScaleBlock(entry.name, …)` with concrete hex / oklch values in `@theme`, `.dark`, and their P3 counterparts.

**Accent alias.** After the loop, emit one `@theme` block of `var()` aliases pointing at the first entry's tokens:

```css
@theme {
  --color-accent-1:  var(--color-primary-1);
  --color-accent-2:  var(--color-primary-2);
  /* …through 12 + a1..a12 + contrast + surface */
}
```

These aliases live **only** in the root `@theme` block — not in `.dark` and not in the P3 `@supports` block. `var()` resolves at use-time, so when `.dark` redefines `--color-primary-*` or the P3 block swaps to oklch, `--color-accent-*` follows automatically. Single source of truth, no duplicated hex.

A small `buildAliasBlock(fromName: string, toName: string): string` helper emits the 28 `var()` lines (`1..12`, `a1..a12`, `contrast`, `surface`) and is called once with `("accent", firstEntry.name)`.

### Removed

- `brand: { light, dark }` parameter and the three `generateRadixColors` calls tied to it per theme.
- `--color-brand-*` output in the CSS generator and in any existing generated fixtures.

### Test updates (`scripts/generate-theme-css.test.ts`)

- Drop assertions referencing `--color-brand-*`.
- Add: given `brandColors: [{ name: "primary", ... }, { name: "secondary", ... }]`, generated CSS contains `--color-primary-*`, `--color-secondary-*`, and `--color-accent-*` aliases (of form `var(--color-primary-N)`), but **no** `--color-brand-*`.
- Add: given only one brand entry, `--color-<name>-*` and `--color-accent-*` both present; accent entries are all `var()` references.
- Add: the `.dark` block and the P3 `@supports` block do **not** contain any `--color-accent-*` redefinitions.

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

  /* concrete values per named entry */
  --color-primary-1..12, --color-primary-a1..12,
  --color-primary-contrast, --color-primary-surface;
  --color-secondary-1..12, --color-secondary-a1..12,
  --color-secondary-contrast, --color-secondary-surface;
  --color-tertiary-1..12, ...;

  /* accent aliases — var() references to the first entry, only block */
  --color-accent-1:  var(--color-primary-1);
  --color-accent-2:  var(--color-primary-2);
  /* … through 12, a1..a12, contrast, surface */

  --color-background: <VITE_BG_LIGHT>;

  --font-sans: ...;
  --font-mono: ...;
  --font-display: ...;
}

.dark {
  /* concrete dark scales for gray + each named brand; NO accent redefinition */
  --color-gray-1: ...;
  --color-primary-1: ...;
  --color-secondary-1: ...;
  ...
  --color-background: <VITE_BG_DARK>;
}

@supports (color: oklch(0 0 0)) {
  /* wide-gamut named scales only — accent aliases in base @theme already follow */
  @theme { ... }
  .dark   { ... }
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
