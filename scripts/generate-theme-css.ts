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
