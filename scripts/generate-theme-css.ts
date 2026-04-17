import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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
