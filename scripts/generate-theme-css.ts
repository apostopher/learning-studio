import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { BrandEntry } from '../src/utils/brand-colors'
import { generateRadixColors } from '../src/utils/colors'

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

export type ThemeColorInputs = {
  gray: { light: string; dark: string }
  brandColors: BrandEntry[]
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
    brandColors: env.VITE_BRAND_COLORS,
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
