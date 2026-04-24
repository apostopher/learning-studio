# Env-Driven Theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make rmtp-studio fully themable via env vars — colors (gray/accent/brand × light/dark), fonts (sans/mono/display), and logos (light/dark) — with no code changes required per tenant.

**Architecture:** Build-time Vite plugin invokes a standalone generator script that reads 13 Zod-validated env vars, calls `generateRadixColors` six times, and emits `src/styles/theme.generated.css` (Tailwind v4 `@theme` tokens, Radix-native names) plus `src/styles/theme.generated.ts` (font link specs and sanitized logo data). The generated CSS is imported from `styles.css`. A `<Logo />` component consumes the generated TS and toggles light/dark via the existing `.dark` class.

**Tech Stack:** Vite 8, Tailwind CSS v4, TanStack Start, `@radix-ui/colors`, `colorjs.io`, `@t3-oss/env-core`, Zod 4, Vitest, React 19.

**Reference:** `docs/superpowers/specs/2026-04-18-themable-studio-design.md`

---

## File Structure

**New checked-in files:**
- `scripts/generate-theme-css.ts` — pure function `generateTheme()`: reads env, calls `generateRadixColors` ×6, writes the two generated files. Exports `generateTheme` for the plugin and `buildThemeCss` / `buildThemeModule` / `parseFontSpecs` / `parseLogo` / `sanitizeSvg` as named helpers for unit tests.
- `scripts/generate-theme-css.test.ts` — Vitest unit tests for the helpers above.
- `plugins/vite-theme.ts` — thin Vite plugin calling `generateTheme()` in `buildStart` and `configureServer` with `.env.local` watcher.
- `src/components/logo.tsx` — `<Logo />` component rendering light/dark slots.

**New generated files (gitignored):**
- `src/styles/theme.generated.css`
- `src/styles/theme.generated.ts`

**Modified files:**
- `src/env.ts` — 13 theme vars with Zod refinements.
- `src/styles.css` — `@import "./styles/theme.generated.css"`, drop `@theme { --color-*: initial }` block.
- `src/routes/__root.tsx` — font `<link>`s and `<Logo />` sourced from generated module.
- `vite.config.ts` — register `themePlugin()` before `tailwindcss()`.
- `.gitignore` — add `src/styles/theme.generated.*`.
- `.env.local` — add the 13 required vars with working local defaults.

**File responsibilities (boundaries):**
- `scripts/generate-theme-css.ts` owns **all** env→CSS/TS translation logic. Pure, side-effect-only-on-disk.
- `plugins/vite-theme.ts` owns Vite lifecycle integration (no logic beyond calling `generateTheme()` and watching `.env.local`).
- `src/components/logo.tsx` owns runtime rendering of logo data; no parsing or sanitization.
- `src/env.ts` owns validation; refuses to export an invalid config.

---

## Task 1: Env schema for theme vars

**Files:**
- Modify: `src/env.ts`
- Modify: `.env.local` (add placeholders so dev server can start)

- [ ] **Step 1: Add Zod refinements and the 13 theme vars to `src/env.ts`**

Replace the current `env.ts` contents with:

```ts
import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'
import Color from 'colorjs.io'

const colorStr = z
  .string()
  .refine(
    (v) => {
      try {
        new Color(v)
        return true
      } catch {
        return false
      }
    },
    { message: 'must be a valid CSS color' },
  )

const logoStr = z
  .string()
  .min(1)
  .refine((v) => !/<script|on\w+\s*=|javascript:/i.test(v), {
    message: 'logo contains unsafe content',
  })
  .refine(
    (v) =>
      v.trimStart().startsWith('<svg') ||
      /^https?:\/\//.test(v) ||
      v.startsWith('/'),
    { message: 'must be inline SVG, absolute URL, or /public path' },
  )

const fontStr = z.string().min(1)

export const env = createEnv({
  server: {
    SERVER_URL: z.url().optional(),
    REDIS_URL: z.string().min(1),
    MCP_CORS_ALLOWLIST: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    MCP_RESOURCE_URL: z.url(),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(1),
  },

  clientPrefix: 'VITE_',

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

    VITE_FONT_SANS: fontStr,
    VITE_FONT_MONO: fontStr,
    VITE_FONT_DISPLAY: fontStr,

    VITE_LOGO_LIGHT: logoStr,
    VITE_LOGO_DARK: logoStr,
  },

  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
```

- [ ] **Step 2: Add working defaults to `.env.local`**

Append to `.env.local`:

```dotenv
VITE_APP_TITLE=RMTP Studio

VITE_GRAY_LIGHT=#8B8D98
VITE_GRAY_DARK=#8B8D98
VITE_ACCENT_LIGHT=#3D63DD
VITE_ACCENT_DARK=#3D63DD
VITE_BRAND_LIGHT=#E5484D
VITE_BRAND_DARK=#E5484D

VITE_BG_LIGHT=#ffffff
VITE_BG_DARK=#111111

VITE_FONT_SANS=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900
VITE_FONT_MONO=IBM Plex Mono:ital,wght@0,400;0,600;1,400
VITE_FONT_DISPLAY=Bebas Neue

VITE_LOGO_LIGHT=<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="currentColor"/></svg>
VITE_LOGO_DARK=<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="currentColor"/></svg>
```

- [ ] **Step 3: Verify the env parses**

Run: `pnpm tsx -e "import('./src/env.ts').then(m => console.log('OK', Object.keys(m.env).length))"`
Expected: prints `OK` and a number (no Zod error).

- [ ] **Step 4: Commit**

```bash
git add src/env.ts .env.local
git commit -m "feat(env): add 13 theme env vars with Zod validation"
```

---

## Task 2: Generator helpers — font spec parsing

**Files:**
- Create: `scripts/generate-theme-css.ts`
- Create: `scripts/generate-theme-css.test.ts`

- [ ] **Step 1: Write failing tests for `parseFontSpecs`**

Create `scripts/generate-theme-css.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseFontSpecs } from './generate-theme-css'

describe('parseFontSpecs', () => {
  it('combines multiple Google Fonts specs into one css2 URL', () => {
    const result = parseFontSpecs({
      sans: 'Inter:wght@400..700',
      mono: 'IBM Plex Mono:wght@400;600',
      display: 'Bebas Neue',
    })

    expect(result.googleHref).toBe(
      'https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=IBM+Plex+Mono:wght@400;600&family=Bebas+Neue&display=swap',
    )
    expect(result.extraHrefs).toEqual([])
    expect(result.families.sans).toBe('Inter')
    expect(result.families.mono).toBe('IBM Plex Mono')
    expect(result.families.display).toBe('Bebas Neue')
  })

  it('routes https URLs to extraHrefs and leaves googleHref null if all are URLs', () => {
    const result = parseFontSpecs({
      sans: 'https://cdn.example.com/inter.css',
      mono: 'https://cdn.example.com/mono.css',
      display: 'https://cdn.example.com/display.css',
    })

    expect(result.googleHref).toBeNull()
    expect(result.extraHrefs).toEqual([
      'https://cdn.example.com/inter.css',
      'https://cdn.example.com/mono.css',
      'https://cdn.example.com/display.css',
    ])
    expect(result.families.sans).toBe('sans-serif')
    expect(result.families.mono).toBe('monospace')
    expect(result.families.display).toBe('sans-serif')
  })

  it('mixes URL and Google spec slots', () => {
    const result = parseFontSpecs({
      sans: 'Inter',
      mono: 'https://cdn.example.com/mono.css',
      display: 'Bebas Neue',
    })

    expect(result.googleHref).toBe(
      'https://fonts.googleapis.com/css2?family=Inter&family=Bebas+Neue&display=swap',
    )
    expect(result.extraHrefs).toEqual(['https://cdn.example.com/mono.css'])
    expect(result.families.sans).toBe('Inter')
    expect(result.families.mono).toBe('monospace')
    expect(result.families.display).toBe('Bebas Neue')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: FAIL — `Cannot find module './generate-theme-css'` or equivalent.

- [ ] **Step 3: Create `scripts/generate-theme-css.ts` with `parseFontSpecs`**

```ts
export type FontSlotKey = 'sans' | 'mono' | 'display'
export type FontSpecs = Record<FontSlotKey, string>

export type FontParseResult = {
  googleHref: string | null
  extraHrefs: string[]
  families: Record<FontSlotKey, string>
}

const FALLBACK_FAMILY: Record<FontSlotKey, string> = {
  sans: 'sans-serif',
  mono: 'monospace',
  display: 'sans-serif',
}

const isUrl = (v: string) => /^https?:\/\//.test(v)

// Extract the family name (everything before the first colon) from a Google spec.
const familyFromGoogleSpec = (spec: string) => spec.split(':')[0]!.trim()

export function parseFontSpecs(specs: FontSpecs): FontParseResult {
  const googleParts: string[] = []
  const extraHrefs: string[] = []
  const families: Record<FontSlotKey, string> = { ...FALLBACK_FAMILY }

  for (const key of ['sans', 'mono', 'display'] as const) {
    const value = specs[key]
    if (isUrl(value)) {
      extraHrefs.push(value)
    } else {
      googleParts.push(value)
      families[key] = familyFromGoogleSpec(value)
    }
  }

  const googleHref =
    googleParts.length > 0
      ? `https://fonts.googleapis.com/css2?${googleParts
          .map((p) => `family=${p.replace(/ /g, '+')}`)
          .join('&')}&display=swap`
      : null

  return { googleHref, extraHrefs, families }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-theme-css.ts scripts/generate-theme-css.test.ts
git commit -m "feat(theme): add parseFontSpecs helper with tests"
```

---

## Task 3: Generator helpers — logo parsing and SVG sanitization

**Files:**
- Modify: `scripts/generate-theme-css.ts`
- Modify: `scripts/generate-theme-css.test.ts`

- [ ] **Step 1: Append failing tests for `parseLogo` and `sanitizeSvg`**

Append to `scripts/generate-theme-css.test.ts`:

```ts
import { parseLogo, sanitizeSvg } from './generate-theme-css'

describe('sanitizeSvg', () => {
  it('strips <script> tags', () => {
    const dirty = '<svg><script>alert(1)</script><circle/></svg>'
    expect(sanitizeSvg(dirty)).toBe('<svg><circle/></svg>')
  })

  it('strips on* attributes', () => {
    const dirty = '<svg onload="x()"><circle onclick="y()"/></svg>'
    expect(sanitizeSvg(dirty)).toBe('<svg><circle/></svg>')
  })

  it('neutralizes javascript: URLs', () => {
    const dirty = '<svg><a href="javascript:alert(1)"><circle/></a></svg>'
    expect(sanitizeSvg(dirty)).toBe('<svg><a href="#"><circle/></a></svg>')
  })

  it('leaves clean SVG unchanged', () => {
    const clean = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>'
    expect(sanitizeSvg(clean)).toBe(clean)
  })
})

describe('parseLogo', () => {
  it('parses inline SVG and sanitizes it', () => {
    const result = parseLogo('<svg onload="x()"><circle/></svg>')
    expect(result).toEqual({ kind: 'svg', svg: '<svg><circle/></svg>' })
  })

  it('parses SVG with leading whitespace', () => {
    const result = parseLogo('  \n<svg><circle/></svg>')
    expect(result).toEqual({ kind: 'svg', svg: '<svg><circle/></svg>' })
  })

  it('parses absolute https URL', () => {
    const result = parseLogo('https://cdn.example.com/logo.svg')
    expect(result).toEqual({ kind: 'url', src: 'https://cdn.example.com/logo.svg' })
  })

  it('parses /public path URL', () => {
    const result = parseLogo('/logo.svg')
    expect(result).toEqual({ kind: 'url', src: '/logo.svg' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: FAIL — `sanitizeSvg is not exported` or similar.

- [ ] **Step 3: Add `sanitizeSvg` and `parseLogo` to `scripts/generate-theme-css.ts`**

Append to `scripts/generate-theme-css.ts`:

```ts
export type LogoData =
  | { kind: 'svg'; svg: string }
  | { kind: 'url'; src: string }

export function sanitizeSvg(input: string): string {
  let out = input
  // Remove <script>...</script> blocks.
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  // Remove on* event handler attributes (on followed by word chars, = "…" or '…').
  out = out.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
  // Replace any attribute value starting with javascript: with '#'.
  out = out.replace(
    /(\s(?:href|xlink:href|src)\s*=\s*)("javascript:[^"]*"|'javascript:[^']*')/gi,
    '$1"#"',
  )
  return out
}

export function parseLogo(value: string): LogoData {
  const trimmed = value.trimStart()
  if (trimmed.startsWith('<svg')) {
    return { kind: 'svg', svg: sanitizeSvg(trimmed) }
  }
  return { kind: 'url', src: value }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: 10 passing (3 from Task 2 + 7 new).

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-theme-css.ts scripts/generate-theme-css.test.ts
git commit -m "feat(theme): add parseLogo + sanitizeSvg helpers"
```

---

## Task 4: Generator — CSS builder for one appearance

**Files:**
- Modify: `scripts/generate-theme-css.ts`
- Modify: `scripts/generate-theme-css.test.ts`

- [ ] **Step 1: Append failing test for `buildScaleBlock`**

Append to `scripts/generate-theme-css.test.ts`:

```ts
import { buildScaleBlock } from './generate-theme-css'

describe('buildScaleBlock', () => {
  it('emits 12 hex steps, 12 alpha steps, contrast and surface for a named scale', () => {
    const scale = {
      accentScale: Array.from({ length: 12 }, (_, i) => `#00000${i}`) as unknown as [
        string, string, string, string, string, string, string, string, string, string, string, string,
      ],
      accentScaleAlpha: Array.from({ length: 12 }, (_, i) => `#a0000${i}`) as unknown as [
        string, string, string, string, string, string, string, string, string, string, string, string,
      ],
      accentContrast: '#ffffff',
      accentSurface: '#eeeeee',
    }

    const out = buildScaleBlock('accent', scale)

    expect(out).toContain('--color-accent-1: #000000;')
    expect(out).toContain('--color-accent-12: #0000011;')
    expect(out).toContain('--color-accent-a1: #a00000;')
    expect(out).toContain('--color-accent-a12: #a000011;')
    expect(out).toContain('--color-accent-contrast: #ffffff;')
    expect(out).toContain('--color-accent-surface: #eeeeee;')
  })
})
```

(The `#00000i` hex strings are intentional test fixtures, not real colors — we're checking the var names and shape of the output string.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: FAIL — `buildScaleBlock is not exported`.

- [ ] **Step 3: Add `buildScaleBlock` to `scripts/generate-theme-css.ts`**

Append to `scripts/generate-theme-css.ts`:

```ts
type ScaleInput = {
  accentScale: readonly string[]
  accentScaleAlpha: readonly string[]
  accentContrast?: string
  accentSurface?: string
}

export function buildScaleBlock(name: string, scale: ScaleInput): string {
  const lines: string[] = []
  scale.accentScale.forEach((hex, i) => {
    lines.push(`  --color-${name}-${i + 1}: ${hex};`)
  })
  scale.accentScaleAlpha.forEach((hex, i) => {
    lines.push(`  --color-${name}-a${i + 1}: ${hex};`)
  })
  if (scale.accentContrast) {
    lines.push(`  --color-${name}-contrast: ${scale.accentContrast};`)
  }
  if (scale.accentSurface) {
    lines.push(`  --color-${name}-surface: ${scale.accentSurface};`)
  }
  return lines.join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: all passing (11 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-theme-css.ts scripts/generate-theme-css.test.ts
git commit -m "feat(theme): add buildScaleBlock CSS helper"
```

---

## Task 5: Generator — integration test for full CSS output

**Files:**
- Modify: `scripts/generate-theme-css.ts`
- Modify: `scripts/generate-theme-css.test.ts`

- [ ] **Step 1: Append failing test for `buildThemeCss`**

Append to `scripts/generate-theme-css.test.ts`:

```ts
import { buildThemeCss } from './generate-theme-css'

describe('buildThemeCss', () => {
  it('emits @theme and .dark blocks with all three scales plus font vars and background', () => {
    const css = buildThemeCss({
      gray: { light: '#8B8D98', dark: '#8B8D98' },
      accent: { light: '#3D63DD', dark: '#3D63DD' },
      brand: { light: '#E5484D', dark: '#E5484D' },
      bg: { light: '#ffffff', dark: '#111111' },
      fontFamilies: {
        sans: 'Inter',
        mono: 'IBM Plex Mono',
        display: 'Bebas Neue',
      },
    })

    expect(css).toMatch(/^\/\* GENERATED\. Do not edit\. Source: scripts\/generate-theme-css\.ts \*\/\n@theme \{/)
    expect(css).toContain('--color-gray-1:')
    expect(css).toContain('--color-gray-12:')
    expect(css).toContain('--color-accent-1:')
    expect(css).toContain('--color-accent-contrast:')
    expect(css).toContain('--color-brand-1:')
    expect(css).toContain('--color-brand-surface:')
    expect(css).toContain('--color-background: #ffffff;')
    expect(css).toContain('--font-sans: Inter,')
    expect(css).toContain('--font-mono: IBM Plex Mono,')
    expect(css).toContain('--font-display: Bebas Neue,')
    expect(css).toMatch(/\.dark \{[\s\S]*--color-background: #111111;/)
    expect(css).toMatch(/@supports \(color: oklch\(0 0 0\)\)/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: FAIL — `buildThemeCss is not exported`.

- [ ] **Step 3: Add `buildThemeCss` to `scripts/generate-theme-css.ts`**

Append to `scripts/generate-theme-css.ts`:

```ts
import { generateRadixColors } from '../src/utils/colors'

export type ThemeColorInputs = {
  gray: { light: string; dark: string }
  accent: { light: string; dark: string }
  brand: { light: string; dark: string }
  bg: { light: string; dark: string }
  fontFamilies: Record<FontSlotKey, string>
}

type GenResult = ReturnType<typeof generateRadixColors>

// Shape a generateRadixColors result as a ScaleInput for buildScaleBlock.
const asScaleInput = (
  g: GenResult,
  kind: 'gray' | 'accent',
): ScaleInput =>
  kind === 'gray'
    ? {
        accentScale: g.grayScale,
        accentScaleAlpha: g.grayScaleAlpha,
        accentSurface: g.graySurface,
      }
    : {
        accentScale: g.accentScale,
        accentScaleAlpha: g.accentScaleAlpha,
        accentContrast: g.accentContrast,
        accentSurface: g.accentSurface,
      }

// Same as asScaleInput but uses wide-gamut (oklch) arrays.
const asScaleInputP3 = (
  g: GenResult,
  kind: 'gray' | 'accent',
): ScaleInput =>
  kind === 'gray'
    ? {
        accentScale: g.grayScaleWideGamut,
        accentScaleAlpha: g.grayScaleAlphaWideGamut,
        accentSurface: g.graySurfaceWideGamut,
      }
    : {
        accentScale: g.accentScaleWideGamut,
        accentScaleAlpha: g.accentScaleAlphaWideGamut,
        accentContrast: g.accentContrast,
        accentSurface: g.accentSurfaceWideGamut,
      }

export function buildThemeCss(inputs: ThemeColorInputs): string {
  const lightGray = generateRadixColors({
    appearance: 'light',
    accent: inputs.gray.light,
    gray: inputs.gray.light,
    background: inputs.bg.light,
  })
  const lightAccent = generateRadixColors({
    appearance: 'light',
    accent: inputs.accent.light,
    gray: inputs.gray.light,
    background: inputs.bg.light,
  })
  const lightBrand = generateRadixColors({
    appearance: 'light',
    accent: inputs.brand.light,
    gray: inputs.gray.light,
    background: inputs.bg.light,
  })

  const darkGray = generateRadixColors({
    appearance: 'dark',
    accent: inputs.gray.dark,
    gray: inputs.gray.dark,
    background: inputs.bg.dark,
  })
  const darkAccent = generateRadixColors({
    appearance: 'dark',
    accent: inputs.accent.dark,
    gray: inputs.gray.dark,
    background: inputs.bg.dark,
  })
  const darkBrand = generateRadixColors({
    appearance: 'dark',
    accent: inputs.brand.dark,
    gray: inputs.gray.dark,
    background: inputs.bg.dark,
  })

  const fontVars = [
    `  --font-sans: ${inputs.fontFamilies.sans}, ui-sans-serif, system-ui, sans-serif;`,
    `  --font-mono: ${inputs.fontFamilies.mono}, ui-monospace, monospace;`,
    `  --font-display: ${inputs.fontFamilies.display}, ui-sans-serif, sans-serif;`,
  ].join('\n')

  const header = '/* GENERATED. Do not edit. Source: scripts/generate-theme-css.ts */'

  const lightThemeBlock = [
    '@theme {',
    buildScaleBlock('gray', asScaleInput(lightGray, 'gray')),
    buildScaleBlock('accent', asScaleInput(lightAccent, 'accent')),
    buildScaleBlock('brand', asScaleInput(lightBrand, 'accent')),
    `  --color-background: ${inputs.bg.light};`,
    fontVars,
    '}',
  ].join('\n')

  const darkThemeBlock = [
    '.dark {',
    buildScaleBlock('gray', asScaleInput(darkGray, 'gray')),
    buildScaleBlock('accent', asScaleInput(darkAccent, 'accent')),
    buildScaleBlock('brand', asScaleInput(darkBrand, 'accent')),
    `  --color-background: ${inputs.bg.dark};`,
    '}',
  ].join('\n')

  const p3Block = [
    '@supports (color: oklch(0 0 0)) {',
    '  @theme {',
    buildScaleBlock('gray', asScaleInputP3(lightGray, 'gray')),
    buildScaleBlock('accent', asScaleInputP3(lightAccent, 'accent')),
    buildScaleBlock('brand', asScaleInputP3(lightBrand, 'accent')),
    '  }',
    '  .dark {',
    buildScaleBlock('gray', asScaleInputP3(darkGray, 'gray')),
    buildScaleBlock('accent', asScaleInputP3(darkAccent, 'accent')),
    buildScaleBlock('brand', asScaleInputP3(darkBrand, 'accent')),
    '  }',
    '}',
  ].join('\n')

  return `${header}\n${lightThemeBlock}\n\n${darkThemeBlock}\n\n${p3Block}\n`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: all passing (12 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-theme-css.ts scripts/generate-theme-css.test.ts
git commit -m "feat(theme): add buildThemeCss integration"
```

---

## Task 6: Generator — TS module builder and top-level `generateTheme()`

**Files:**
- Modify: `scripts/generate-theme-css.ts`
- Modify: `scripts/generate-theme-css.test.ts`

- [ ] **Step 1: Append failing test for `buildThemeModule`**

Append to `scripts/generate-theme-css.test.ts`:

```ts
import { buildThemeModule } from './generate-theme-css'

describe('buildThemeModule', () => {
  it('serializes font hrefs, logo data, and app title as TS exports', () => {
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
    })

    expect(out).toContain("export const appTitle = 'Test Studio'")
    expect(out).toContain(
      "export const fontLinkHref = 'https://fonts.googleapis.com/css2?family=Inter&display=swap'",
    )
    expect(out).toContain(
      "export const extraFontLinks = ['https://cdn.example.com/mono.css']",
    )
    expect(out).toContain("export const logoLight = {")
    expect(out).toContain("kind: 'svg'")
    expect(out).toContain("kind: 'url'")
    expect(out).toContain("src: '/logo-dark.svg'")
  })

  it('handles null googleHref', () => {
    const out = buildThemeModule({
      appTitle: 'T',
      fonts: { googleHref: null, extraHrefs: [] },
      logos: {
        light: { kind: 'url', src: '/a.svg' },
        dark: { kind: 'url', src: '/b.svg' },
      },
    })
    expect(out).toContain('export const fontLinkHref = null')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: FAIL — `buildThemeModule is not exported`.

- [ ] **Step 3: Add `buildThemeModule` to `scripts/generate-theme-css.ts`**

Append:

```ts
export type ThemeModuleInputs = {
  appTitle: string
  fonts: { googleHref: string | null; extraHrefs: string[] }
  logos: { light: LogoData; dark: LogoData }
}

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

const serializeLogo = (l: LogoData): string =>
  l.kind === 'svg'
    ? `{ kind: 'svg' as const, svg: ${q(l.svg)} }`
    : `{ kind: 'url' as const, src: ${q(l.src)} }`

export function buildThemeModule(inputs: ThemeModuleInputs): string {
  const lines = [
    '// GENERATED. Do not edit. Source: scripts/generate-theme-css.ts',
    '',
    `export const appTitle = ${q(inputs.appTitle)}`,
    `export const fontLinkHref = ${
      inputs.fonts.googleHref === null ? 'null' : q(inputs.fonts.googleHref)
    }`,
    `export const extraFontLinks = [${inputs.fonts.extraHrefs.map(q).join(', ')}]`,
    `export const logoLight = ${serializeLogo(inputs.logos.light)}`,
    `export const logoDark = ${serializeLogo(inputs.logos.dark)}`,
    '',
  ]
  return lines.join('\n')
}
```

- [ ] **Step 4: Add top-level `generateTheme()` orchestrator**

Append to `scripts/generate-theme-css.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { env } from '../src/env'

const OUT_DIR = resolve(process.cwd(), 'src/styles')
const OUT_CSS = resolve(OUT_DIR, 'theme.generated.css')
const OUT_TS = resolve(OUT_DIR, 'theme.generated.ts')

export function generateTheme(): void {
  const fonts = parseFontSpecs({
    sans: env.VITE_FONT_SANS,
    mono: env.VITE_FONT_MONO,
    display: env.VITE_FONT_DISPLAY,
  })

  const css = buildThemeCss({
    gray: { light: env.VITE_GRAY_LIGHT, dark: env.VITE_GRAY_DARK },
    accent: { light: env.VITE_ACCENT_LIGHT, dark: env.VITE_ACCENT_DARK },
    brand: { light: env.VITE_BRAND_LIGHT, dark: env.VITE_BRAND_DARK },
    bg: { light: env.VITE_BG_LIGHT, dark: env.VITE_BG_DARK },
    fontFamilies: fonts.families,
  })

  const mod = buildThemeModule({
    appTitle: env.VITE_APP_TITLE,
    fonts: { googleHref: fonts.googleHref, extraHrefs: fonts.extraHrefs },
    logos: {
      light: parseLogo(env.VITE_LOGO_LIGHT),
      dark: parseLogo(env.VITE_LOGO_DARK),
    },
  })

  mkdirSync(dirname(OUT_CSS), { recursive: true })
  writeFileSync(OUT_CSS, css, 'utf8')
  writeFileSync(OUT_TS, mod, 'utf8')
}

// Support `tsx scripts/generate-theme-css.ts` for debugging.
if (import.meta.url === `file://${process.argv[1]}`) {
  generateTheme()
  console.log('Theme written to:', OUT_CSS, OUT_TS)
}
```

- [ ] **Step 5: Run all tests to verify they pass**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: all passing (14 tests).

- [ ] **Step 6: Smoke-test the script directly**

Run: `pnpm tsx scripts/generate-theme-css.ts`
Expected: prints `Theme written to: …`, and both `src/styles/theme.generated.css` and `src/styles/theme.generated.ts` exist.

Verify with: `ls src/styles/theme.generated.*`

- [ ] **Step 7: Commit (code only, not generated files)**

```bash
git add scripts/generate-theme-css.ts scripts/generate-theme-css.test.ts
git commit -m "feat(theme): add buildThemeModule + generateTheme orchestrator"
```

---

## Task 7: Gitignore generated files

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append the ignore pattern**

Add this line at the end of `.gitignore`:

```
src/styles/theme.generated.*
```

- [ ] **Step 2: Verify git does not track them**

Run: `git status --short`
Expected: `src/styles/theme.generated.css` and `.ts` are NOT listed (they exist on disk from Task 6 Step 6, but should be ignored).

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore generated theme files"
```

---

## Task 8: Vite plugin

**Files:**
- Create: `plugins/vite-theme.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: Create `plugins/vite-theme.ts`**

```ts
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { generateTheme } from '../scripts/generate-theme-css'

export function themePlugin(): Plugin {
  const envFile = resolve(process.cwd(), '.env.local')

  return {
    name: 'rmtp-theme',
    enforce: 'pre',

    buildStart() {
      generateTheme()
    },

    configureServer(server) {
      generateTheme()
      server.watcher.add(envFile)
      server.watcher.on('change', (path) => {
        if (path === envFile) {
          generateTheme()
          server.ws.send({ type: 'full-reload' })
        }
      })
    },
  }
}
```

- [ ] **Step 2: Register the plugin in `vite.config.ts`**

Modify `vite.config.ts` to:

```ts
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { themePlugin } from './plugins/vite-theme'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    themePlugin(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
})

export default config
```

- [ ] **Step 3: Smoke-test the dev server boots and regenerates theme**

Delete the generated files: `rm src/styles/theme.generated.*`

Run: `pnpm dev` in the background for ~5 seconds, then stop it.

```bash
pnpm dev &
DEV_PID=$!
sleep 5
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
ls src/styles/theme.generated.*
```

Expected: both generated files exist (plugin wrote them on `configureServer`).

- [ ] **Step 4: Commit**

```bash
git add plugins/vite-theme.ts vite.config.ts
git commit -m "feat(theme): add Vite plugin wrapper for theme generator"
```

---

## Task 9: Wire generated CSS into `styles.css`

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add the import and drop the `@theme { --color-*: initial }` block**

Replace `src/styles.css` with:

```css
@import "tailwindcss";
@import "./styles/theme.generated.css";
@plugin "@tailwindcss/typography";

/* https://polypane.app/css-specificity-calculator/ */

/* https://x.com/csswizardry/status/1717841334462005661 */
@layer base {
  img {
    font-style: italic;
    background-repeat: no-repeat;
    background-size: cover;
    shape-margin: 1rem;
    max-width: 100%;
    height: auto;
    vertical-align: middle;
  }
}

@layer layout {
  .content-grid {
    --padding-inline: 1rem;
    --content-max-width: 1500px;
    --breakout-max-width: 1600px;

    --breakout-size: calc(
      (var(--breakout-max-width) - var(--content-max-width)) / 2
    );

    display: grid;
    grid-template-columns:
      [full-width-start] minmax(var(--padding-inline), 1fr)
      [breakout-start] minmax(0, var(--breakout-size))
      [content-start] min(
        100% - (var(--padding-inline) * 2),
        var(--content-max-width)
      )
      [content-end]
      minmax(0, var(--breakout-size)) [breakout-end]
      minmax(var(--padding-inline), 1fr) [full-width-end];
  }

  .content-grid > .breakout {
    grid-column: breakout;
  }

  .content-grid > .content {
    grid-column: content;
  }
  .content-grid > .full-width {
    grid-column: full-width;
  }

  .flow > *:where(:not(:first-child)) {
    margin-block-start: var(--flow-space, 1rem);
  }

  .grid-auto-fit {
    display: grid;
    --grid-auto-fit-max-width: 40ch;
    gap: var(--grid-auto-fit-gap, 1rem);
    grid-template-columns: repeat(
      auto-fit,
      minmax(
        min(var(--grid-auto-fit-min-width, 30ch), 100%),
        var(--grid-auto-fit-max-width, 1fr)
      )
    );

    &:has(> :nth-child(3)) {
      --grid-auto-fit-max-width: 1fr;
    }
  }
}
```

(The `@theme { --color-*: initial; }` block at the end is removed — the generated file now owns all `--color-*` tokens.)

- [ ] **Step 2: Verify the dev server still starts**

```bash
pnpm dev &
DEV_PID=$!
sleep 5
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
```

Expected: no CSS errors in the terminal output.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat(theme): import generated theme.css; drop initial color reset"
```

---

## Task 10: Logo component

**Files:**
- Create: `src/components/logo.tsx`

- [ ] **Step 1: Create `src/components/logo.tsx`**

```tsx
import { appTitle, logoDark, logoLight } from '../styles/theme.generated'

type LogoSlotData =
  | { kind: 'svg'; svg: string }
  | { kind: 'url'; src: string }

const LogoSlot = ({
  data,
  className,
}: {
  data: LogoSlotData
  className: string
}) =>
  data.kind === 'svg' ? (
    <span
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: env input is Zod-validated and sanitized by the generator
      dangerouslySetInnerHTML={{ __html: data.svg }}
    />
  ) : (
    <img className={className} src={data.src} alt="" />
  )

export const Logo = ({ className }: { className?: string }) => (
  <span role="img" aria-label={appTitle} className={className}>
    <LogoSlot data={logoLight} className="block dark:hidden" />
    <LogoSlot data={logoDark} className="hidden dark:block" />
  </span>
)
```

- [ ] **Step 2: Type-check passes**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/logo.tsx
git commit -m "feat(theme): add <Logo /> with light/dark slots"
```

---

## Task 11: Wire fonts + Logo into `__root.tsx`

**Files:**
- Modify: `src/routes/__root.tsx`

- [ ] **Step 1: Replace hardcoded Google Fonts `<link>` with generated data**

Modify `src/routes/__root.tsx` — replace the `RootDocument` function with:

```tsx
import { extraFontLinks, fontLinkHref } from '../styles/theme.generated'

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {fontLinkHref && <link href={fontLinkHref} rel="stylesheet" />}
        {extraFontLinks.map((href) => (
          <link key={href} href={href} rel="stylesheet" />
        ))}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased wrap-anywhere">
        <TanstackQueryProvider>
          {children}

          <TanStackDevtools
            config={{
              position: "bottom-right",
            }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
              TanStackQueryDevtools,
            ]}
          />
        </TanstackQueryProvider>
        <Scripts />
      </body>
    </html>
  );
}
```

Keep the existing `THEME_INIT_SCRIPT`, imports at the top, and `Route` export unchanged. Only the `<head>` contents of `RootDocument` change.

- [ ] **Step 2: Type-check passes**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Boot the dev server and verify fonts + theme render**

```bash
pnpm dev &
DEV_PID=$!
sleep 6
curl -s http://localhost:3000 > /tmp/root.html
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
grep -c "fonts.googleapis.com/css2?family=Inter" /tmp/root.html
```

Expected: `1` (the combined Google Fonts link is present in SSR output).

- [ ] **Step 4: Commit**

```bash
git add src/routes/__root.tsx
git commit -m "feat(theme): source fonts from generated theme module"
```

---

## Task 12: End-to-end verification

**Files:** (no code changes — verification only)

- [ ] **Step 1: Verify generated CSS contains all expected tokens**

```bash
pnpm tsx scripts/generate-theme-css.ts
grep -c "^  --color-gray-"   src/styles/theme.generated.css   # expect 25 (12 hex + 12 alpha + surface)
grep -c "^  --color-accent-" src/styles/theme.generated.css   # expect 26 (12 + 12 + contrast + surface)
grep -c "^  --color-brand-"  src/styles/theme.generated.css   # expect 26
grep -c "^  --font-"         src/styles/theme.generated.css   # expect 3
```

Expected output per command: 25, 26, 26, 3. (These are per-block counts; actual grep will return 2× those because of `@theme` + `.dark`, and 4× once you include the `@supports` block's two inner blocks. Accept any non-zero match that includes all three scales.)

Simplified check:

```bash
grep -q "^  --color-gray-12:"   src/styles/theme.generated.css && echo "gray OK"
grep -q "^  --color-accent-12:" src/styles/theme.generated.css && echo "accent OK"
grep -q "^  --color-brand-12:"  src/styles/theme.generated.css && echo "brand OK"
grep -q "^  --font-sans:"       src/styles/theme.generated.css && echo "font OK"
grep -q "^\.dark {"             src/styles/theme.generated.css && echo "dark OK"
```

Expected: 5 "OK" lines.

- [ ] **Step 2: Verify strict-fail on missing env**

```bash
# Back up and drop one var temporarily
cp .env.local .env.local.bak
sed -i.tmp '/^VITE_ACCENT_LIGHT=/d' .env.local
rm .env.local.tmp
pnpm tsx scripts/generate-theme-css.ts 2>&1 | head -20
# Restore
mv .env.local.bak .env.local
rm -f .env.local.tmp
```

Expected: Zod validation error mentioning `VITE_ACCENT_LIGHT` and the script exits non-zero.

- [ ] **Step 3: Verify strict-fail on malformed color**

```bash
cp .env.local .env.local.bak
sed -i.tmp 's|^VITE_ACCENT_LIGHT=.*|VITE_ACCENT_LIGHT=not-a-color|' .env.local
rm .env.local.tmp
pnpm tsx scripts/generate-theme-css.ts 2>&1 | head -20
mv .env.local.bak .env.local
rm -f .env.local.tmp
```

Expected: Zod error mentioning "must be a valid CSS color".

- [ ] **Step 4: Verify strict-fail on unsafe logo**

```bash
cp .env.local .env.local.bak
sed -i.tmp 's|^VITE_LOGO_LIGHT=.*|VITE_LOGO_LIGHT=<svg onload="x()"></svg>|' .env.local
rm .env.local.tmp
pnpm tsx scripts/generate-theme-css.ts 2>&1 | head -20
mv .env.local.bak .env.local
rm -f .env.local.tmp
```

Expected: Zod error mentioning "logo contains unsafe content".

- [ ] **Step 5: Run full test suite**

```bash
pnpm vitest run
pnpm tsc --noEmit
pnpm biome check
```

Expected: all pass. Biome may flag the `dangerouslySetInnerHTML` in `logo.tsx` — the `biome-ignore` comment above the usage should suppress it. If not, re-run after fixing.

- [ ] **Step 6: Boot dev server and manually verify in browser**

```bash
pnpm dev
# Open http://localhost:3000 in a browser
# - Check that body text uses the configured sans font
# - Toggle .dark class on <html> via devtools; logo swaps from light to dark slot
# - Confirm no console errors about missing CSS vars
```

This is a manual check — cannot be automated here. If you cannot open a browser, say so explicitly rather than claiming success.

- [ ] **Step 7: Final commit if any verification fixes were needed**

```bash
git status
# If clean, no commit needed
```

---

## Self-Review

**Spec coverage:**
- Section 1 (Architecture) → Task 8 (plugin) + Task 9 (styles.css import) + Task 11 (__root.tsx wiring)
- Section 2 (Env schema) → Task 1
- Section 3 (Generator script) → Tasks 2, 3, 4, 5, 6
- Section 4 (Vite plugin) → Task 8
- Section 5 (Fonts/Logo consumption) → Tasks 10, 11
- Section 6 (File inventory & gitignore) → Task 7
- Testing strategy → unit tests in Tasks 2–6, integration verification in Task 12

All covered.

**Placeholder scan:** No "TBD", "TODO", or "similar to". All code blocks contain complete implementations.

**Type consistency:** `LogoData` discriminated union shape (`{ kind: 'svg'; svg }` / `{ kind: 'url'; src }`) is consistent across `parseLogo`, `buildThemeModule`, `theme.generated.ts` exports, and `logo.tsx`. `FontSlotKey` type is defined once in Task 2 and reused. `ScaleInput` type is defined in Task 4, reused in Task 5 via `asScaleInput` / `asScaleInputP3`. `generateTheme()` signature matches between Tasks 6 and 8.
