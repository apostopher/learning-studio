# Multiple Named Brand Colors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single `accent`/`brand` theme slots with `VITE_BRAND_COLORS` — a comma-separated list of named light/dark brand colors. First entry aliases to `--color-accent-*` via CSS `var()`.

**Architecture:** A new `src/utils/brand-colors.ts` module owns the pure parser + shared constants (name regex, reserved names). `src/env.ts` pipes the parser through Zod for full validation. `scripts/generate-theme-css.ts` replaces its fixed `accent`/`brand` inputs with a loop over `BrandEntry[]`, and emits a separate accent-alias block of `var()` references into the root `@theme` only.

**Tech Stack:** TypeScript (strict), Zod v4, `colorjs.io`, `@t3-oss/env-core`, Vitest, Tailwind v4 `@theme`, existing `generateRadixColors` from `src/utils/colors.ts`.

**Spec:** `docs/superpowers/specs/2026-04-18-multi-brand-colors-design.md`

---

## File inventory

**Create:**
- `src/utils/brand-colors.ts` — pure parser + shared constants/types
- `src/utils/brand-colors.test.ts` — unit tests for the parser

**Modify:**
- `src/env.ts` — drop 4 vars, add `VITE_BRAND_COLORS` wired through the parser
- `scripts/generate-theme-css.ts` — replace `accent`+`brand` input with `brandColors` list; add `buildAliasBlock`; emit `brandNames` from `buildThemeModule`
- `scripts/generate-theme-css.test.ts` — update `buildThemeCss` test to use list input; drop `--color-brand-*` assertions; add accent-alias and multi-brand assertions
- `.env.local` — replace the four removed color vars with one `VITE_BRAND_COLORS`

---

## Task 1: Pure parser module — name/light/dark splitter

**Files:**
- Create: `src/utils/brand-colors.ts`
- Test: `src/utils/brand-colors.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/brand-colors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  BRAND_NAME_REGEX,
  RESERVED_BRAND_NAMES,
  parseBrandColorEntries,
} from './brand-colors'

describe('parseBrandColorEntries', () => {
  it('parses a single entry', () => {
    expect(parseBrandColorEntries('primary:#3D63DD/#5A7FE8')).toEqual([
      { name: 'primary', light: '#3D63DD', dark: '#5A7FE8' },
    ])
  })

  it('parses multiple comma-separated entries and trims whitespace', () => {
    const out = parseBrandColorEntries(
      ' primary:#3D63DD/#5A7FE8 , secondary:#FF6B6B/#FF8787 , tertiary:#10B981/#34D399 ',
    )
    expect(out).toEqual([
      { name: 'primary', light: '#3D63DD', dark: '#5A7FE8' },
      { name: 'secondary', light: '#FF6B6B', dark: '#FF8787' },
      { name: 'tertiary', light: '#10B981', dark: '#34D399' },
    ])
  })

  it('drops empty segments between stray commas', () => {
    expect(parseBrandColorEntries('primary:#3D63DD/#5A7FE8,,')).toEqual([
      { name: 'primary', light: '#3D63DD', dark: '#5A7FE8' },
    ])
  })

  it('throws when an entry is missing the colon', () => {
    expect(() => parseBrandColorEntries('primary#3D63DD/#5A7FE8')).toThrow(
      /missing ":"/,
    )
  })

  it('throws when an entry is missing the light/dark slash', () => {
    expect(() => parseBrandColorEntries('primary:#3D63DD')).toThrow(
      /missing "\/"/,
    )
  })

  it('throws when the name is empty', () => {
    expect(() => parseBrandColorEntries(':#3D63DD/#5A7FE8')).toThrow(
      /empty name/,
    )
  })

  it('throws when light is empty', () => {
    expect(() => parseBrandColorEntries('primary:/#5A7FE8')).toThrow(
      /empty light/,
    )
  })

  it('throws when dark is empty', () => {
    expect(() => parseBrandColorEntries('primary:#3D63DD/')).toThrow(
      /empty dark/,
    )
  })

  it('throws on empty input', () => {
    expect(() => parseBrandColorEntries('')).toThrow(/no entries/)
    expect(() => parseBrandColorEntries('   ')).toThrow(/no entries/)
  })
})

describe('BRAND_NAME_REGEX', () => {
  it('accepts lowercase kebab names', () => {
    expect(BRAND_NAME_REGEX.test('primary')).toBe(true)
    expect(BRAND_NAME_REGEX.test('brand-2')).toBe(true)
    expect(BRAND_NAME_REGEX.test('a1')).toBe(true)
  })

  it('rejects uppercase, leading digits, and non-kebab chars', () => {
    expect(BRAND_NAME_REGEX.test('Primary')).toBe(false)
    expect(BRAND_NAME_REGEX.test('1st')).toBe(false)
    expect(BRAND_NAME_REGEX.test('my_brand')).toBe(false)
    expect(BRAND_NAME_REGEX.test('my brand')).toBe(false)
    expect(BRAND_NAME_REGEX.test('')).toBe(false)
  })
})

describe('RESERVED_BRAND_NAMES', () => {
  it('covers the four reserved tokens', () => {
    expect(RESERVED_BRAND_NAMES).toEqual(['gray', 'accent', 'brand', 'background'])
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run src/utils/brand-colors.test.ts`
Expected: FAIL — module `./brand-colors` not found.

- [ ] **Step 3: Implement the parser module**

Create `src/utils/brand-colors.ts`:

```ts
export type BrandEntry = { name: string; light: string; dark: string }

export const BRAND_NAME_REGEX = /^[a-z][a-z0-9-]*$/

export const RESERVED_BRAND_NAMES = [
  'gray',
  'accent',
  'brand',
  'background',
] as const

/**
 * Parses "name:#light/#dark, name2:#light/#dark, ..." into structured entries.
 * Validates only the *shape* — name/hex semantic validation is the caller's job
 * (see `src/env.ts`, which pipes this through Zod).
 */
export function parseBrandColorEntries(raw: string): BrandEntry[] {
  const segments = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (segments.length === 0) {
    throw new Error('VITE_BRAND_COLORS has no entries')
  }

  return segments.map((segment, index) => {
    const colonAt = segment.indexOf(':')
    if (colonAt === -1) {
      throw new Error(
        `entry ${index} ("${segment}") missing ":" separator between name and colors`,
      )
    }
    const name = segment.slice(0, colonAt).trim()
    const rest = segment.slice(colonAt + 1).trim()

    if (name.length === 0) {
      throw new Error(`entry ${index} ("${segment}") has empty name`)
    }

    const slashAt = rest.indexOf('/')
    if (slashAt === -1) {
      throw new Error(
        `entry ${index} ("${segment}") missing "/" separator between light and dark`,
      )
    }
    const light = rest.slice(0, slashAt).trim()
    const dark = rest.slice(slashAt + 1).trim()

    if (light.length === 0) {
      throw new Error(`entry ${index} ("${segment}") has empty light color`)
    }
    if (dark.length === 0) {
      throw new Error(`entry ${index} ("${segment}") has empty dark color`)
    }

    return { name, light, dark }
  })
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm vitest run src/utils/brand-colors.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/brand-colors.ts src/utils/brand-colors.test.ts
git commit -m "feat(theme): add parseBrandColorEntries parser and shared constants"
```

---

## Task 2: Wire the parser into `src/env.ts`

**Files:**
- Modify: `src/env.ts`

- [ ] **Step 1: Open `src/env.ts` and locate the `client` block**

The current relevant lines (approximately `src/env.ts:57-77`):

```ts
client: {
  VITE_APP_TITLE: z.string().min(1),

  VITE_GRAY_LIGHT: colorStr,
  VITE_GRAY_DARK: colorStr,
  VITE_ACCENT_LIGHT: colorStr,
  VITE_ACCENT_DARK: colorStr,
  VITE_BRAND_LIGHT: colorStr,
  VITE_BRAND_DARK: colorStr,

  VITE_BG_LIGHT: colorStr.default('#ffffff'),
  VITE_BG_DARK: colorStr.default('#111111'),
  ...
},
```

- [ ] **Step 2: Add the brand-colors schema above `createEnv`**

Add this block after the existing `const fontStr = ...` line and before `export const env = createEnv({`:

```ts
import {
  BRAND_NAME_REGEX,
  RESERVED_BRAND_NAMES,
  parseBrandColorEntries,
} from './utils/brand-colors';

const reservedNames = new Set<string>(RESERVED_BRAND_NAMES);

const brandColorsSchema = z
  .string()
  .min(1)
  .transform((raw, ctx) => {
    try {
      return parseBrandColorEntries(raw);
    } catch (err) {
      ctx.addIssue({
        code: 'custom',
        message: (err as Error).message,
      });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .array(
        z.object({
          name: z
            .string()
            .regex(BRAND_NAME_REGEX, {
              message: 'brand name must match /^[a-z][a-z0-9-]*$/',
            })
            .refine((n) => !reservedNames.has(n), {
              message: `brand name is reserved (${[...reservedNames].join(', ')})`,
            }),
          light: colorStr,
          dark: colorStr,
        }),
      )
      .min(1, 'VITE_BRAND_COLORS must contain at least one entry')
      .max(12, 'VITE_BRAND_COLORS supports at most 12 entries')
      .refine(
        (arr) => new Set(arr.map((e) => e.name)).size === arr.length,
        { message: 'brand names must be unique' },
      ),
  );
```

Move the `import` line to the top of the file with the other imports.

- [ ] **Step 3: Replace the four accent/brand vars with `VITE_BRAND_COLORS`**

In the `client: { ... }` block, replace these four lines:

```ts
VITE_ACCENT_LIGHT: colorStr,
VITE_ACCENT_DARK: colorStr,
VITE_BRAND_LIGHT: colorStr,
VITE_BRAND_DARK: colorStr,
```

with:

```ts
VITE_BRAND_COLORS: brandColorsSchema,
```

Leave `VITE_GRAY_LIGHT`, `VITE_GRAY_DARK`, `VITE_BG_LIGHT`, `VITE_BG_DARK`, and every other var unchanged.

- [ ] **Step 4: Update `.env.local` so the build succeeds under the new schema**

Replace these four lines in `.env.local`:

```
VITE_ACCENT_LIGHT='#3D63DD'
VITE_ACCENT_DARK='#3D63DD'
VITE_BRAND_LIGHT='#E5484D'
VITE_BRAND_DARK='#E5484D'
```

with:

```
VITE_BRAND_COLORS='primary:#3D63DD/#3D63DD,danger:#E5484D/#E5484D'
```

Rationale for the choice: the old config had accent `#3D63DD` and brand `#E5484D`. Naming the first entry `primary` (the new accent alias) and the second `danger` preserves both hues under sensible names.

- [ ] **Step 5: Type-check to confirm env.ts compiles**

Run: `pnpm tsc --noEmit`
Expected: fails only inside `scripts/generate-theme-css.ts` (it still reads the deleted `VITE_ACCENT_*` / `VITE_BRAND_*` vars). Those errors are fixed in Task 3. Any other errors mean the schema is wrong — investigate before moving on.

- [ ] **Step 6: Commit**

```bash
git add src/env.ts .env.local
git commit -m "feat(theme): replace accent/brand env vars with VITE_BRAND_COLORS"
```

---

## Task 3: Refactor `buildThemeCss` to loop over `brandColors`

**Files:**
- Modify: `scripts/generate-theme-css.ts` (replace `ThemeColorInputs` and `buildThemeCss`; update `generateTheme()` at bottom)
- Modify: `scripts/generate-theme-css.test.ts` (update the existing `buildThemeCss` test)

- [ ] **Step 1: Update the existing `buildThemeCss` test to use the new shape**

Open `scripts/generate-theme-css.test.ts`. Locate the `describe('buildThemeCss', ...)` block (starts around line 102). Replace the entire `it(...)` inside it with:

```ts
import type { BrandEntry } from '../src/utils/brand-colors'

describe('buildThemeCss', () => {
  const baseInputs = {
    gray: { light: '#8B8D98', dark: '#8B8D98' },
    bg: { light: '#ffffff', dark: '#111111' },
    fontFamilies: {
      sans: 'Inter',
      mono: 'IBM Plex Mono',
      display: 'Bebas Neue',
    },
  } as const

  it('emits named scales, accent aliases, fonts, background, and .dark/P3 blocks', () => {
    const brandColors: BrandEntry[] = [
      { name: 'primary', light: '#3D63DD', dark: '#3D63DD' },
      { name: 'danger', light: '#E5484D', dark: '#E5484D' },
    ]

    const css = buildThemeCss({ ...baseInputs, brandColors })

    // Header + root @theme
    expect(css).toMatch(/^\/\* GENERATED\. Do not edit\. Source: scripts\/generate-theme-css\.ts \*\/\n@theme \{/)

    // Gray scale
    expect(css).toContain('--color-gray-1:')
    expect(css).toContain('--color-gray-12:')

    // Named brand scales (concrete hex values)
    expect(css).toContain('--color-primary-1:')
    expect(css).toContain('--color-primary-12:')
    expect(css).toContain('--color-primary-contrast:')
    expect(css).toContain('--color-primary-surface:')
    expect(css).toContain('--color-danger-1:')
    expect(css).toContain('--color-danger-surface:')

    // Accent aliases — var() references, NOT concrete hex
    expect(css).toContain('--color-accent-1: var(--color-primary-1);')
    expect(css).toContain('--color-accent-12: var(--color-primary-12);')
    expect(css).toContain('--color-accent-a1: var(--color-primary-a1);')
    expect(css).toContain('--color-accent-a12: var(--color-primary-a12);')
    expect(css).toContain('--color-accent-contrast: var(--color-primary-contrast);')
    expect(css).toContain('--color-accent-surface: var(--color-primary-surface);')

    // --color-brand-* must be entirely gone
    expect(css).not.toMatch(/--color-brand-/)

    // Background + fonts
    expect(css).toContain('--color-background: #ffffff;')
    expect(css).toContain('--font-sans: Inter,')
    expect(css).toContain('--font-mono: IBM Plex Mono,')
    expect(css).toContain('--font-display: Bebas Neue,')

    // .dark block — has primary/danger concrete overrides, no accent aliases
    const darkBlock = css.slice(css.indexOf('.dark {'), css.indexOf('@supports'))
    expect(darkBlock).toContain('--color-background: #111111;')
    expect(darkBlock).toContain('--color-primary-1:')
    expect(darkBlock).toContain('--color-danger-1:')
    expect(darkBlock).not.toMatch(/--color-accent-/)

    // P3 block — same rule: named scales only, no accent
    const p3Block = css.slice(css.indexOf('@supports'))
    expect(p3Block).toContain('--color-primary-1:')
    expect(p3Block).not.toMatch(/--color-accent-/)
  })

  it('handles a single brand entry (accent aliases it)', () => {
    const css = buildThemeCss({
      ...baseInputs,
      brandColors: [{ name: 'solo', light: '#3D63DD', dark: '#3D63DD' }],
    })

    expect(css).toContain('--color-solo-1:')
    expect(css).toContain('--color-accent-1: var(--color-solo-1);')
    expect(css).not.toMatch(/--color-brand-/)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: FAIL — either a type error (if the old `accent`/`brand` keys are still required) or assertion failures (`--color-accent-1: var(--color-...` not found).

- [ ] **Step 3: Update the `ThemeColorInputs` type**

Open `scripts/generate-theme-css.ts`. Replace the existing `ThemeColorInputs` (around line 100):

```ts
export type ThemeColorInputs = {
  gray: { light: string; dark: string }
  accent: { light: string; dark: string }
  brand: { light: string; dark: string }
  bg: { light: string; dark: string }
  fontFamilies: Record<FontSlotKey, string>
}
```

with:

```ts
import type { BrandEntry } from '../src/utils/brand-colors'

export type ThemeColorInputs = {
  gray: { light: string; dark: string }
  brandColors: BrandEntry[]
  bg: { light: string; dark: string }
  fontFamilies: Record<FontSlotKey, string>
}
```

Move the `import type` line to sit with the other top-of-file imports.

- [ ] **Step 4: Refactor `buildThemeCss` to loop over `brandColors`**

Replace the current body of `buildThemeCss` (entire function, roughly lines 146-228) with:

```ts
export function buildThemeCss(inputs: ThemeColorInputs): string {
  if (inputs.brandColors.length === 0) {
    throw new Error('buildThemeCss: brandColors must contain at least one entry')
  }

  const lightGray = generateRadixColors({
    appearance: 'light',
    accent: inputs.gray.light,
    gray: inputs.gray.light,
    background: inputs.bg.light,
  })
  const darkGray = generateRadixColors({
    appearance: 'dark',
    accent: inputs.gray.dark,
    gray: inputs.gray.dark,
    background: inputs.bg.dark,
  })

  const light = inputs.brandColors.map((entry) => ({
    name: entry.name,
    colors: generateRadixColors({
      appearance: 'light',
      accent: entry.light,
      gray: inputs.gray.light,
      background: inputs.bg.light,
    }),
  }))
  const dark = inputs.brandColors.map((entry) => ({
    name: entry.name,
    colors: generateRadixColors({
      appearance: 'dark',
      accent: entry.dark,
      gray: inputs.gray.dark,
      background: inputs.bg.dark,
    }),
  }))

  const fontVars = [
    `  --font-sans: ${inputs.fontFamilies.sans}, ui-sans-serif, system-ui, sans-serif;`,
    `  --font-mono: ${inputs.fontFamilies.mono}, ui-monospace, monospace;`,
    `  --font-display: ${inputs.fontFamilies.display}, ui-sans-serif, sans-serif;`,
  ].join('\n')

  const header =
    '/* GENERATED. Do not edit. Source: scripts/generate-theme-css.ts */'

  const firstName = inputs.brandColors[0]!.name

  const lightThemeBlock = [
    '@theme {',
    buildScaleBlock('gray', asScaleInput(lightGray, 'gray')),
    ...light.map(({ name, colors }) =>
      buildScaleBlock(name, asScaleInput(colors, 'accent')),
    ),
    buildAliasBlock('accent', firstName),
    `  --color-background: ${inputs.bg.light};`,
    fontVars,
    '}',
  ].join('\n')

  const darkThemeBlock = [
    '.dark {',
    buildScaleBlock('gray', asScaleInput(darkGray, 'gray')),
    ...dark.map(({ name, colors }) =>
      buildScaleBlock(name, asScaleInput(colors, 'accent')),
    ),
    `  --color-background: ${inputs.bg.dark};`,
    '}',
  ].join('\n')

  const p3Block = [
    '@supports (color: oklch(0 0 0)) {',
    '  @theme {',
    buildScaleBlock('gray', asScaleInputP3(lightGray, 'gray')),
    ...light.map(({ name, colors }) =>
      buildScaleBlock(name, asScaleInputP3(colors, 'accent')),
    ),
    '  }',
    '  .dark {',
    buildScaleBlock('gray', asScaleInputP3(darkGray, 'gray')),
    ...dark.map(({ name, colors }) =>
      buildScaleBlock(name, asScaleInputP3(colors, 'accent')),
    ),
    '  }',
    '}',
  ].join('\n')

  return `${header}\n${lightThemeBlock}\n\n${darkThemeBlock}\n\n${p3Block}\n`
}
```

- [ ] **Step 5: Add `buildAliasBlock` helper next to `buildScaleBlock`**

Insert this function immediately after `buildScaleBlock` (around line 98, right after its closing `}`):

```ts
/**
 * Emits `--color-<from>-<suffix>: var(--color-<to>-<suffix>);` for every
 * suffix a scale block produces (1..12, a1..a12, contrast, surface).
 * Used to alias `accent` to the first brand entry in one place — dark/P3
 * swaps propagate automatically via `var()`.
 */
export function buildAliasBlock(fromName: string, toName: string): string {
  const lines: string[] = []
  for (let i = 1; i <= 12; i += 1) {
    lines.push(`  --color-${fromName}-${i}: var(--color-${toName}-${i});`)
  }
  for (let i = 1; i <= 12; i += 1) {
    lines.push(`  --color-${fromName}-a${i}: var(--color-${toName}-a${i});`)
  }
  lines.push(`  --color-${fromName}-contrast: var(--color-${toName}-contrast);`)
  lines.push(`  --color-${fromName}-surface: var(--color-${toName}-surface);`)
  return lines.join('\n')
}
```

- [ ] **Step 6: Update `generateTheme()` at the bottom of the file**

Replace the current `buildThemeCss({ ... })` call inside `generateTheme()` (around line 272):

```ts
const css = buildThemeCss({
  gray: { light: env.VITE_GRAY_LIGHT, dark: env.VITE_GRAY_DARK },
  accent: { light: env.VITE_ACCENT_LIGHT, dark: env.VITE_ACCENT_DARK },
  brand: { light: env.VITE_BRAND_LIGHT, dark: env.VITE_BRAND_DARK },
  bg: { light: env.VITE_BG_LIGHT, dark: env.VITE_BG_DARK },
  fontFamilies: fonts.families,
})
```

with:

```ts
const css = buildThemeCss({
  gray: { light: env.VITE_GRAY_LIGHT, dark: env.VITE_GRAY_DARK },
  brandColors: env.VITE_BRAND_COLORS,
  bg: { light: env.VITE_BG_LIGHT, dark: env.VITE_BG_DARK },
  fontFamilies: fonts.families,
})
```

- [ ] **Step 7: Run the updated tests to confirm they pass**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: PASS — all `buildThemeCss` assertions, including accent `var()` aliases and absence of `--color-brand-*`.

- [ ] **Step 8: Run the full suite**

Run: `pnpm vitest run`
Expected: all tests PASS (font/logo/SVG tests are untouched; only the generator test block changed).

- [ ] **Step 9: Commit**

```bash
git add scripts/generate-theme-css.ts scripts/generate-theme-css.test.ts
git commit -m "feat(theme): generate scales per VITE_BRAND_COLORS entry, alias accent via var()"
```

---

## Task 4: Export `brandNames` from the generated theme module

**Files:**
- Modify: `scripts/generate-theme-css.ts` (`ThemeModuleInputs`, `buildThemeModule`, `generateTheme`)
- Modify: `scripts/generate-theme-css.test.ts` (extend `buildThemeModule` tests)

- [ ] **Step 1: Extend the `buildThemeModule` test with a `brandNames` assertion**

In `scripts/generate-theme-css.test.ts`, edit both existing `buildThemeModule` tests so their inputs include `brandNames: ['primary', 'danger']` (first test) and `brandNames: ['solo']` (second test), and add:

```ts
expect(out).toContain("export const brandNames = ['primary', 'danger'] as const")
```

to the first test and:

```ts
expect(out).toContain("export const brandNames = ['solo'] as const")
```

to the second. The full updated first test looks like:

```ts
it('serializes font hrefs, logo data, app title, and brand names as TS exports', () => {
  const out = buildThemeModule({
    appTitle: 'Test Studio',
    fonts: {
      googleHref: 'https://fonts.googleapis.com/css2?family=Inter&display=swap',
      extraHrefs: ['https://cdn.example.com/mono.css'],
    },
    logos: {
      light: { kind: 'svg', svg: '<svg/>' },
      dark: { kind: 'url', src: '/logo-dark.svg' },
    },
    brandNames: ['primary', 'danger'],
  })

  expect(out).toContain("export const appTitle = 'Test Studio'")
  expect(out).toContain(
    "export const fontLinkHref = 'https://fonts.googleapis.com/css2?family=Inter&display=swap'",
  )
  expect(out).toContain(
    "export const extraFontLinks = ['https://cdn.example.com/mono.css']",
  )
  expect(out).toContain('export const logoLight = {')
  expect(out).toContain("kind: 'svg'")
  expect(out).toContain("kind: 'url'")
  expect(out).toContain("src: '/logo-dark.svg'")
  expect(out).toContain("export const brandNames = ['primary', 'danger'] as const")
})
```

And update the second test the same way.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: FAIL — either type error (`brandNames` not in `ThemeModuleInputs`) or missing assertion.

- [ ] **Step 3: Extend `ThemeModuleInputs` and `buildThemeModule`**

In `scripts/generate-theme-css.ts`, update the type (around line 230):

```ts
export type ThemeModuleInputs = {
  appTitle: string
  fonts: { googleHref: string | null; extraHrefs: string[] }
  logos: { light: LogoData; dark: LogoData }
  brandNames: readonly string[]
}
```

Then update `buildThemeModule` (around line 243) to append one more export line. Insert this entry in the `lines` array immediately after the `logoDark` line:

```ts
`export const brandNames = [${inputs.brandNames.map(q).join(', ')}] as const`,
```

- [ ] **Step 4: Pass `brandNames` from `generateTheme()`**

Inside `generateTheme()` at the bottom of the file, update the `buildThemeModule({ ... })` call so it passes the names:

```ts
const mod = buildThemeModule({
  appTitle: env.VITE_APP_TITLE,
  fonts: { googleHref: fonts.googleHref, extraHrefs: fonts.extraHrefs },
  logos: {
    light: parseLogo(env.VITE_LOGO_LIGHT),
    dark: parseLogo(env.VITE_LOGO_DARK),
  },
  brandNames: env.VITE_BRAND_COLORS.map((e) => e.name),
})
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: PASS — all `buildThemeModule` assertions including `brandNames`.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-theme-css.ts scripts/generate-theme-css.test.ts
git commit -m "feat(theme): export brandNames from generated theme module"
```

---

## Task 5: End-to-end verification

**Files:** (no changes — verification only)

- [ ] **Step 1: Regenerate the theme files from the current `.env.local`**

Run: `pnpm tsx scripts/generate-theme-css.ts`
Expected: prints `Theme written to: …/theme.generated.css …/theme.generated.ts` with no errors.

- [ ] **Step 2: Inspect the generated CSS**

Open `src/styles/theme.generated.css`. Verify by eye:
- Root `@theme` block contains `--color-primary-*`, `--color-danger-*`, and `--color-accent-*: var(--color-primary-*)` aliases.
- No `--color-brand-*` anywhere in the file.
- `.dark` block contains dark `--color-primary-*` / `--color-danger-*` but **no** `--color-accent-*` lines.
- P3 `@supports` block contains wide-gamut `--color-primary-*` / `--color-danger-*` but **no** `--color-accent-*` lines.

If any bullet fails, return to Task 3 step 4.

- [ ] **Step 3: Inspect the generated TS module**

Open `src/styles/theme.generated.ts`. Verify `export const brandNames = ['primary', 'danger'] as const` is present.

- [ ] **Step 4: Run the full vitest suite**

Run: `pnpm vitest run`
Expected: all tests PASS (parser + generator + module).

- [ ] **Step 5: Run the TypeScript build**

Run: `pnpm tsc --noEmit`
Expected: zero errors. The previous stray references to `env.VITE_ACCENT_LIGHT` etc. are now gone.

- [ ] **Step 6: Run the Vite build end-to-end**

Run: `pnpm build`
Expected: build completes with no theme-related errors. The theme plugin (`plugins/vite-theme.ts`) invokes `generateTheme()` in `buildStart` — if env is malformed, it fails fast with a Zod message.

- [ ] **Step 7: Smoke-test the dev server**

Run: `pnpm dev`
In the browser devtools, on the root page:
- `getComputedStyle(document.documentElement).getPropertyValue('--color-primary-9')` returns a hex/oklch value.
- `getComputedStyle(document.documentElement).getPropertyValue('--color-accent-9')` returns the **same** value (propagated through the `var()` alias).
- `getComputedStyle(document.documentElement).getPropertyValue('--color-danger-9')` returns a different hex/oklch value.
- Toggle `.dark` on `<html>` (via the existing theme toggle). Re-check: both primary and accent update together.

Kill the dev server.

- [ ] **Step 8: Final commit (only if any doc/lint fixups were made during verification)**

```bash
git status
# if anything is modified:
git add -A
git commit -m "chore(theme): finalize multi-brand rollout"
```

If `git status` is clean, skip this step.

---

## Self-review notes

- Spec coverage: env schema (Task 2), generator loop (Task 3), accent `var()` alias (Task 3), dropped `--color-brand-*` (Tasks 2 + 3), `brandNames` export (Task 4), `.env.local` migration (Task 2 step 4), testing strategy (Tasks 1, 3, 4), end-to-end build + browser smoke (Task 5). All items from the spec are covered.
- No placeholders: every step contains either code, a command + expected output, or a concrete inspection bullet.
- Type consistency: `BrandEntry` from `src/utils/brand-colors.ts` is the single type threaded through `env.ts`, `ThemeColorInputs.brandColors`, and `buildThemeCss`. Function names (`parseBrandColorEntries`, `buildAliasBlock`, `buildThemeCss`, `buildThemeModule`) match across tasks.
