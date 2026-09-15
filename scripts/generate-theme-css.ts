import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { BrandEntry } from '../src/utils/brand-colors'
import { mergeStatusDefaults } from '../src/utils/brand-colors'
import Color from 'colorjs.io'
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
  // The colour --color-N-text should use, as an sRGB hex. When omitted,
  // buildScaleBlock measures it from accentScale against the scale's own
  // steps 1–4 — see computeAaaText. Callers building both an sRGB and a
  // wide-gamut block for the *same* underlying scale should measure once
  // from the sRGB values (against every surface the text will sit on) and
  // pass the result to both, so the two gamuts never disagree.
  text?: string
}

/** WCAG 2 AAA for body text. Large text (≥24px, or ≥19px bold) needs 4.5. */
const AAA_RATIO = 7

/**
 * A colour `t` of the way from `from` to `to`, interpolated in oklch so the
 * hue is held and only lightness (and chroma) move — the one dimension that
 * changes contrast. `offset` nudges an already-mixed colour back along the
 * same line (tests use it to prove a result is the LEAST bright that
 * passes). Returned as a gamut-clipped sRGB hex.
 */
export function mixToward(
  from: string,
  to: string,
  at: string | number,
  offset = 0,
): string {
  const range = Color.range(from, to, { space: 'oklch', outputSpace: 'srgb' })
  const t =
    typeof at === 'number'
      ? at
      : // Recover the position of an already-mixed colour by its lightness.
        (() => {
          const l = (c: string) => new Color(c).to('oklch').get('l')
          const span = l(to) - l(from)
          return span === 0 ? 0 : (l(at) - l(from)) / span
        })()
  const clamped = Math.min(1, Math.max(0, t + offset))
  return range(clamped).toGamut().toString({ format: 'hex' })
}

/**
 * The text colour a scale gets: the LEAST bright oklch mix between its step
 * 11 and step 12 that clears WCAG AAA (7:1) on every surface handed in.
 *
 * Why not just step 11 or step 12. Radix tunes step 11 for ~4.5:1 (AA) and
 * step 12 for maximum contrast; most of this product's readers are pilots
 * past sixty, and AA is not enough for them. Step 12 alone would pass, but
 * in a tinted scale it is near-white (dark theme) or near-black (light),
 * and the hue the scale exists to carry — the amber of a warning, the navy
 * of a link — disappears. Walking from 11 toward 12 in oklch keeps the hue
 * and spends only as much lightness as 7:1 costs.
 *
 * Measured, never assumed: `surfaces` is every fill this text is drawn on
 * (the scale's own steps 1–4, and for a tinted scale the neutral surfaces
 * too, since a warning message sits on gray-2 as often as on warning-3).
 * When even step 12 falls short on some surface, step 12 is returned — the
 * palette test then fails loudly rather than the token quietly regressing.
 */
export function computeAaaText(
  accentScale: readonly string[],
  surfaces: readonly string[],
): string {
  const step11 = accentScale[10]
  const step12 = accentScale[11]
  if (!step11 || !step12) throw new Error('computeAaaText: scale has no steps 11–12')
  const clears = (hex: string) =>
    surfaces.every((bg) => checkContrast(hex, bg).ratio >= AAA_RATIO)
  for (let t = 0; t < 1; t += 0.05) {
    const candidate = t === 0 ? step11 : mixToward(step11, step12, t)
    if (clears(candidate)) return candidate
  }
  return step12
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
  const text =
    scale.text ?? computeAaaText(scale.accentScale, scale.accentScale.slice(0, 4))
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
// Measures the AAA text colour from the sRGB scale — against the scale's
// own steps 1–4 plus `neutralSurfaces` (the gray surfaces and page fills
// tinted text also sits on) — so callers can hand the same colour to
// asScaleInputP3 for the wide-gamut block of the same scale.
const asScaleInput = (
  g: GenResult,
  kind: 'gray' | 'accent',
  neutralSurfaces: readonly string[] = [],
): ScaleInput & { text: string } => {
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
  return {
    ...base,
    text: computeAaaText(base.accentScale, [
      ...base.accentScale.slice(0, 4),
      ...neutralSurfaces,
    ]),
  }
}

// Same as asScaleInput but uses wide-gamut (oklch) arrays. `text` must be
// the colour measured from the sRGB scale (asScaleInput) and passed in here
// — never measured independently from the oklch strings — so the sRGB and
// P3 blocks for the same scale always agree on --color-N-text. It stays an
// sRGB hex in the P3 block: the mix was chosen for contrast, not chroma,
// and a wide-gamut variant would buy nothing a reader could see.
const asScaleInputP3 = (
  g: GenResult,
  kind: 'gray' | 'accent',
  text: string,
): ScaleInput =>
  kind === 'gray'
    ? {
        accentScale: g.grayScaleWideGamut,
        accentScaleAlpha: g.grayScaleAlphaWideGamut,
        accentSurface: g.graySurfaceWideGamut,
        text,
      }
    : {
        accentScale: g.accentScaleWideGamut,
        accentScaleAlpha: g.accentScaleAlphaWideGamut,
        accentContrast: g.accentContrast,
        accentSurface: g.accentSurfaceWideGamut,
        text,
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

  // Compute each scale's sRGB ScaleInput (and its measured text colour)
  // once, so the wide-gamut (P3) block below can reuse the same decision
  // rather than re-measuring against the oklch strings. Tinted scales are
  // measured against the neutral surfaces too: an error message sits on
  // gray-2 at least as often as on error-3.
  const lightGrayInput = asScaleInput(lightGray, 'gray', [
    inputs.bg.light,
    inputs.panelBg.light,
  ])
  const darkGrayInput = asScaleInput(darkGray, 'gray', [
    inputs.bg.dark,
    inputs.panelBg.dark,
  ])
  const lightNeutral = [
    ...lightGray.grayScale.slice(0, 4),
    inputs.bg.light,
    inputs.panelBg.light,
  ]
  const darkNeutral = [
    ...darkGray.grayScale.slice(0, 4),
    inputs.bg.dark,
    inputs.panelBg.dark,
  ]
  const lightInputs = light.map(({ name, colors }) => ({
    name,
    colors,
    input: asScaleInput(colors, 'accent', lightNeutral),
  }))
  const darkInputs = dark.map(({ name, colors }) => ({
    name,
    colors,
    input: asScaleInput(colors, 'accent', darkNeutral),
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
      asScaleInputP3(lightGray, 'gray', lightGrayInput.text),
    ),
    ...lightInputs.map(({ name, colors, input }) =>
      buildScaleBlock(name, asScaleInputP3(colors, 'accent', input.text)),
    ),
    '  }',
    '  .dark {',
    buildScaleBlock(
      'gray',
      asScaleInputP3(darkGray, 'gray', darkGrayInput.text),
    ),
    ...darkInputs.map(({ name, colors, input }) =>
      buildScaleBlock(name, asScaleInputP3(colors, 'accent', input.text)),
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
