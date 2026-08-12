import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { BrandEntry } from '../src/utils/brand-colors'
import { mergeStatusDefaults } from '../src/utils/brand-colors'
import { checkContrast, generateRadixColors } from '../src/utils/colors'

export type FontSlotKey = 'sans' | 'mono' | 'display' | 'serif'
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
  serif: 'serif',
}

const isUrl = (v: string) => /^https?:\/\//.test(v)

// Extract the family name (everything before the first colon) from a Google spec.
const familyFromGoogleSpec = (spec: string) => spec.split(':')[0]!.trim()

export function parseFontSpecs(specs: FontSpecs): FontParseResult {
  const googleParts: string[] = []
  const extraHrefs: string[] = []
  const families: Record<FontSlotKey, string> = { ...FALLBACK_FAMILY }

  for (const key of ['sans', 'mono', 'display', 'serif'] as const) {
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
  // Which step (11 or 12) --color-N-text should use. When omitted,
  // buildScaleBlock measures it from accentScale itself — see
  // computeTextStep. Callers building both an sRGB and a wide-gamut block
  // for the *same* underlying scale should measure once from the sRGB
  // values and pass the result to both, so the two gamuts never disagree.
  textStep?: 11 | 12
}

/**
 * Radix's contrast guarantee for step 11 only holds against steps 1–2, not
 * step 3 (`subtle`). For hues with a narrow light-mode lightness range
 * (pale yellows, light saturated greens/oranges), step 11 on step 3 can land
 * just under WCAG AA. Measure it, and fall back to step 12 — never lower
 * the threshold or hand-tune the palette to dodge this.
 */
export function computeTextStep(accentScale: readonly string[]): 11 | 12 {
  const step3 = accentScale[2]
  const step11 = accentScale[10]
  if (step3 && step11 && checkContrast(step11, step3).wcagAA) return 11
  return 12
}

/**
 * `generateRadixColors` returns an `accentContrast` that is not guaranteed to
 * clear WCAG AA — dark-theme red-9 and link-9 both come back as #fff at ~3.4
 * and ~3.0. Measure it, and fall back to whichever of black/white scores
 * higher.
 *
 * This cannot fail: white-vs-black contrast against any fill bottoms out at
 * 4.58 where the two curves cross, which is above the 4.5 threshold.
 */
export function resolveContrast(step9: string, candidate: string): string {
  if (checkContrast(candidate, step9).wcagAA) return candidate
  return checkContrast('#000', step9).ratio >= checkContrast('#fff', step9).ratio
    ? '#000'
    : '#fff'
}

export function buildScaleBlock(name: string, scale: ScaleInput): string {
  const lines: string[] = []
  scale.accentScale.forEach((hex, i) => {
    lines.push(`  --color-${name}-${i + 1}: ${hex};`)
  })
  scale.accentScaleAlpha.forEach((hex, i) => {
    lines.push(`  --color-${name}-a${i + 1}: ${hex};`)
  })

  // Step-role aliases. Radix steps are 1-indexed; these arrays are 0-indexed.
  const step = (n: number) => scale.accentScale[n - 1]
  const subtle = step(3)
  const border = step(6)
  const solid = step(9)
  const textStep = scale.textStep ?? computeTextStep(scale.accentScale)
  const text = step(textStep)
  if (subtle) lines.push(`  --color-${name}-subtle: ${subtle};`)
  if (border) lines.push(`  --color-${name}-border: ${border};`)
  if (solid) lines.push(`  --color-${name}-solid: ${solid};`)
  if (text) lines.push(`  --color-${name}-text: ${text};`)

  if (scale.accentContrast) {
    // Never emit accentContrast unchecked — see resolveContrast.
    const contrast = solid
      ? resolveContrast(solid, scale.accentContrast)
      : scale.accentContrast
    lines.push(`  --color-${name}-contrast: ${contrast};`)
  }
  if (scale.accentSurface) {
    lines.push(`  --color-${name}-surface: ${scale.accentSurface};`)
  }
  return lines.join('\n')
}

/**
 * Emits `--color-<from>-<suffix>: var(--color-<to>-<suffix>);` for every
 * suffix a scale block produces (1..12, a1..a12, subtle, border, solid, text, contrast, surface).
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
  for (const suffix of ['subtle', 'border', 'solid', 'text']) {
    lines.push(`  --color-${fromName}-${suffix}: var(--color-${toName}-${suffix});`)
  }
  lines.push(`  --color-${fromName}-contrast: var(--color-${toName}-contrast);`)
  lines.push(`  --color-${fromName}-surface: var(--color-${toName}-surface);`)
  return lines.join('\n')
}

export type ThemeColorInputs = {
  gray: { light: string; dark: string }
  brandColors: BrandEntry[]
  bg: { light: string; dark: string }
  panelBg: { light: string; dark: string }
  shellBg: { light: string; dark: string }
  /** Optional. When absent, no --color-alert-bar is emitted at all. */
  alertBar?: string
  fontFamilies: Record<FontSlotKey, string>
}

type GenResult = ReturnType<typeof generateRadixColors>

// Shape a generateRadixColors result as a ScaleInput for buildScaleBlock.
// Computes textStep from the sRGB scale so callers can hand the same
// decision to asScaleInputP3 for the wide-gamut block of the same scale.
const asScaleInput = (
  g: GenResult,
  kind: 'gray' | 'accent',
): ScaleInput & { textStep: 11 | 12 } => {
  const base =
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
  return { ...base, textStep: computeTextStep(base.accentScale) }
}

// Same as asScaleInput but uses wide-gamut (oklch) arrays. `textStep` must
// be measured from the sRGB scale (asScaleInput) and passed in here — never
// measured independently from the oklch strings — so the sRGB and P3 blocks
// for the same scale always agree on which step --color-N-text uses.
const asScaleInputP3 = (
  g: GenResult,
  kind: 'gray' | 'accent',
  textStep: 11 | 12,
): ScaleInput =>
  kind === 'gray'
    ? {
        accentScale: g.grayScaleWideGamut,
        accentScaleAlpha: g.grayScaleAlphaWideGamut,
        accentSurface: g.graySurfaceWideGamut,
        textStep,
      }
    : {
        accentScale: g.accentScaleWideGamut,
        accentScaleAlpha: g.accentScaleAlphaWideGamut,
        accentContrast: g.accentContrast,
        accentSurface: g.accentSurfaceWideGamut,
        textStep,
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
    // Editorial serif. Used by the News page for headlines and standfirsts;
    // the ui-serif fallback keeps that page readable if the webfont fails.
    `  --font-serif: ${inputs.fontFamilies.serif}, ui-serif, Georgia, serif;`,
  ].join('\n')

  const header =
    '/* GENERATED. Do not edit. Source: scripts/generate-theme-css.ts */'

  const firstName = inputs.brandColors[0]!.name

  // Compute each scale's sRGB ScaleInput (and its textStep) once, so the
  // wide-gamut (P3) block below can reuse the same textStep decision rather
  // than re-measuring against the oklch strings.
  const lightGrayInput = asScaleInput(lightGray, 'gray')
  const darkGrayInput = asScaleInput(darkGray, 'gray')
  const lightInputs = light.map(({ name, colors }) => ({
    name,
    colors,
    input: asScaleInput(colors, 'accent'),
  }))
  const darkInputs = dark.map(({ name, colors }) => ({
    name,
    colors,
    input: asScaleInput(colors, 'accent'),
  }))

  // Emitted into the light @theme block only — the .dark block overrides just
  // the properties it redefines, so one emit resolves in both scopes. Absent
  // rather than empty when unconfigured: src/styles/tokens.test.ts asserts
  // every var() in tokens.css resolves, so a conditional token must never be
  // referenced from there. .alert-bar in styles.css consumes it instead.
  const alertBarVar =
    inputs.alertBar === undefined
      ? []
      : [`  --color-alert-bar: ${inputs.alertBar};`]

  const lightThemeBlock = [
    '@theme {',
    buildScaleBlock('gray', lightGrayInput),
    ...lightInputs.map(({ name, input }) => buildScaleBlock(name, input)),
    buildAliasBlock('accent', firstName),
    `  --color-background: ${inputs.bg.light};`,
    `  --color-panel-bg: ${inputs.panelBg.light};`,
    `  --color-shell-bg: ${inputs.shellBg.light};`,
    ...alertBarVar,
    fontVars,
    '}',
  ].join('\n')

  const darkThemeBlock = [
    '.dark {',
    buildScaleBlock('gray', darkGrayInput),
    ...darkInputs.map(({ name, input }) => buildScaleBlock(name, input)),
    `  --color-background: ${inputs.bg.dark};`,
    `  --color-panel-bg: ${inputs.panelBg.dark};`,
    `  --color-shell-bg: ${inputs.shellBg.dark};`,
    '}',
  ].join('\n')

  const p3Block = [
    '@supports (color: oklch(0 0 0)) {',
    '  @theme {',
    buildScaleBlock(
      'gray',
      asScaleInputP3(lightGray, 'gray', lightGrayInput.textStep),
    ),
    ...lightInputs.map(({ name, colors, input }) =>
      buildScaleBlock(name, asScaleInputP3(colors, 'accent', input.textStep)),
    ),
    '  }',
    '  .dark {',
    buildScaleBlock(
      'gray',
      asScaleInputP3(darkGray, 'gray', darkGrayInput.textStep),
    ),
    ...darkInputs.map(({ name, colors, input }) =>
      buildScaleBlock(name, asScaleInputP3(colors, 'accent', input.textStep)),
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
  brandNames: readonly string[]
  /** null when VITE_ALERT_BAR_COLOR is unset. Read by src/routes/_authed.tsx. */
  alertBarColor: string | null
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
    `export const brandNames = [${inputs.brandNames.map(q).join(', ')}] as const`,
    `export const alertBarColor = ${
      inputs.alertBarColor === null ? 'null' : q(inputs.alertBarColor)
    }`,
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
    serif: env.VITE_FONT_SERIF,
  })

  const css = buildThemeCss({
    gray: { light: env.VITE_GRAY_LIGHT, dark: env.VITE_GRAY_DARK },
    brandColors: mergeStatusDefaults(env.VITE_BRAND_COLORS),
    bg: { light: env.VITE_BG_LIGHT, dark: env.VITE_BG_DARK },
    panelBg: { light: env.VITE_PANEL_BG_LIGHT, dark: env.VITE_PANEL_BG_DARK },
    shellBg: { light: env.VITE_SHELL_BG_LIGHT, dark: env.VITE_SHELL_BG_DARK },
    alertBar: env.VITE_ALERT_BAR_COLOR,
    fontFamilies: fonts.families,
  })

  const mod = buildThemeModule({
    appTitle: env.VITE_APP_TITLE,
    fonts: { googleHref: fonts.googleHref, extraHrefs: fonts.extraHrefs },
    logos: {
      light: parseLogo(env.VITE_LOGO_LIGHT),
      dark: parseLogo(env.VITE_LOGO_DARK),
    },
    brandNames: env.VITE_BRAND_COLORS.map((e) => e.name),
    alertBarColor: env.VITE_ALERT_BAR_COLOR ?? null,
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
