import { describe, expect, it } from 'vitest'
import { parseFontSpecs, parseLogo, sanitizeSvg } from './generate-theme-css'
import Color from 'colorjs.io'
import { checkContrast, generateRadixColors } from '../src/utils/colors'

describe('parseFontSpecs', () => {
  it('combines multiple Google Fonts specs into one css2 URL', () => {
    const result = parseFontSpecs({
      sans: 'Inter:wght@400..700',
      mono: 'IBM Plex Mono:wght@400;600',
      display: 'Bebas Neue',
      serif: 'Newsreader:opsz@6..72',
    })

    expect(result.googleHref).toBe(
      'https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=IBM+Plex+Mono:wght@400;600&family=Bebas+Neue&family=Newsreader:opsz@6..72&display=swap',
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
      serif: 'https://cdn.example.com/serif.css',
    })

    expect(result.googleHref).toBeNull()
    expect(result.extraHrefs).toEqual([
      'https://cdn.example.com/inter.css',
      'https://cdn.example.com/mono.css',
      'https://cdn.example.com/display.css',
      'https://cdn.example.com/serif.css',
    ])
    expect(result.families.sans).toBe('sans-serif')
    expect(result.families.mono).toBe('monospace')
    expect(result.families.display).toBe('sans-serif')
    // Falls back to the generic family, so the News page still gets A serif.
    expect(result.families.serif).toBe('serif')
  })

  it('mixes URL and Google spec slots', () => {
    const result = parseFontSpecs({
      sans: 'Inter',
      mono: 'https://cdn.example.com/mono.css',
      display: 'Bebas Neue',
      serif: 'Newsreader',
    })

    expect(result.googleHref).toBe(
      'https://fonts.googleapis.com/css2?family=Inter&family=Bebas+Neue&family=Newsreader&display=swap',
    )
    expect(result.extraHrefs).toEqual(['https://cdn.example.com/mono.css'])
    expect(result.families.sans).toBe('Inter')
    expect(result.families.mono).toBe('monospace')
    expect(result.families.display).toBe('Bebas Neue')
  })
})

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

import {
  buildScaleBlock,
  buildThemeCss,
  buildAliasBlock,
  computeAaaText,
  mixToward,
} from './generate-theme-css'
import type { BrandEntry } from '../src/utils/brand-colors'

describe('buildThemeCss', () => {
  const baseInputs = {
    gray: { light: '#8B8D98', dark: '#8B8D98' },
    bg: { light: '#ffffff', dark: '#111111' },
    panelBg: { light: '#fafafa', dark: '#1a1a1a' },
    shellBg: { light: '#eeeeee', dark: '#222222' },
    fontFamilies: {
      sans: 'Inter',
      mono: 'IBM Plex Mono',
      display: 'Bebas Neue',
      serif: 'Newsreader',
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

    // Background + explicit panel/shell chrome + fonts
    expect(css).toContain('--color-background: #ffffff;')
    expect(css).toContain('--color-panel-bg: #fafafa;')
    expect(css).toContain('--color-shell-bg: #eeeeee;')
    expect(css).toContain('--font-sans: Inter,')
    expect(css).toContain('--font-mono: IBM Plex Mono,')
    expect(css).toContain('--font-display: Bebas Neue,')

    // .dark block — has primary/danger concrete overrides, no accent aliases
    const darkBlock = css.slice(css.indexOf('.dark {'), css.indexOf('@supports'))
    expect(darkBlock).toContain('--color-background: #111111;')
    expect(darkBlock).toContain('--color-panel-bg: #1a1a1a;')
    expect(darkBlock).toContain('--color-shell-bg: #222222;')
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

  it('emits --color-alert-bar in the light @theme block when alertBar is set', () => {
    const css = buildThemeCss({
      ...baseInputs,
      brandColors: [{ name: 'solo', light: '#3D63DD', dark: '#3D63DD' }],
      alertBar: '#cb0d39',
    })

    // Light @theme block only: one emit resolves in .dark too, because the
    // .dark block overrides only the properties it redefines.
    const lightBlock = css.slice(0, css.indexOf('.dark {'))
    expect(lightBlock).toContain('--color-alert-bar: #cb0d39;')

    const darkBlock = css.slice(css.indexOf('.dark {'), css.indexOf('@supports'))
    expect(darkBlock).not.toMatch(/--color-alert-bar/)
  })

  it('omits --color-alert-bar entirely when alertBar is not set', () => {
    const css = buildThemeCss({
      ...baseInputs,
      brandColors: [{ name: 'solo', light: '#3D63DD', dark: '#3D63DD' }],
    })

    // The token must be absent, not empty: tokens.css referential integrity
    // depends on nothing referencing a property the generator did not emit.
    expect(css).not.toMatch(/--color-alert-bar/)
  })
})

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
      // These fixture steps aren't real colors (7-hex-digit strings), so
      // skip computeAaaText's measurement — this test only exercises hex
      // emission, not the text-step fallback.
      text: '#00001010',
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

import { buildThemeModule } from './generate-theme-css'

describe('buildThemeModule', () => {
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
      alertBarColor: null,
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

  it('handles null googleHref', () => {
    const out = buildThemeModule({
      appTitle: 'T',
      fonts: { googleHref: null, extraHrefs: [] },
      logos: {
        light: { kind: 'url', src: '/a.svg' },
        dark: { kind: 'url', src: '/b.svg' },
      },
      brandNames: ['solo'],
      alertBarColor: null,
    })
    expect(out).toContain('export const fontLinkHref = null')
    expect(out).toContain("export const brandNames = ['solo'] as const")
  })

  it('exports alertBarColor as a quoted string when configured', () => {
    const out = buildThemeModule({
      appTitle: 'T',
      fonts: { googleHref: null, extraHrefs: [] },
      logos: {
        light: { kind: 'url', src: '/a.svg' },
        dark: { kind: 'url', src: '/b.svg' },
      },
      brandNames: ['solo'],
      alertBarColor: '#cb0d39',
    })
    expect(out).toContain("export const alertBarColor = '#cb0d39'")
  })

  it('exports alertBarColor as null when not configured', () => {
    const out = buildThemeModule({
      appTitle: 'T',
      fonts: { googleHref: null, extraHrefs: [] },
      logos: {
        light: { kind: 'url', src: '/a.svg' },
        dark: { kind: 'url', src: '/b.svg' },
      },
      brandNames: ['solo'],
      alertBarColor: null,
    })
    expect(out).toContain('export const alertBarColor = null')
  })
})

import { resolveContrast } from './generate-theme-css'

describe('resolveContrast', () => {
  it('keeps the candidate when it already clears AA', () => {
    // light red-9 #cb0d39 with #fff measures 5.74
    expect(resolveContrast('#cb0d39', '#fff')).toBe('#fff')
  })

  it('replaces a failing candidate on dark red-9 with black', () => {
    // dark red-9 #f44f5f with #fff measures 3.43; black measures 6.13
    expect(resolveContrast('#f44f5f', '#fff')).toBe('#000')
  })

  it('replaces a failing candidate on dark link-9 with black', () => {
    // dark link-9 #2997ff with #fff measures 3.02; black measures 6.96
    expect(resolveContrast('#2997ff', '#fff')).toBe('#000')
  })

  it('picks white when the fill is dark', () => {
    expect(resolveContrast('#1a2f40', '#808080')).toBe('#fff')
  })

  it('always returns a colour clearing AA, for any fill', () => {
    // Regression set: real-world Radix colours that previously failed AA
    const regressionFills = [
      '#cb0d39', '#f44f5f', '#2997ff', '#e9e28f', '#1a2f40',
      '#808080', '#767676', '#000000', '#ffffff', '#30a46c',
    ]

    // Systematic sweep: generate fills across the colour space using OKLCH
    // to verify the guarantee holds across hue, lightness, and chroma dimensions
    const Color = require('colorjs.io').default
    const generatedFills: string[] = []

    // Sweep hue 0-350° in 10° steps, at multiple lightness levels
    for (let hue = 0; hue < 360; hue += 10) {
      // Low lightness (dark colours, L=0.25)
      generatedFills.push(
        new Color('oklch', [0.25, 0.1, hue]).to('srgb').toString({ format: 'hex' }),
      )
      // Mid lightness (L=0.5)
      generatedFills.push(
        new Color('oklch', [0.5, 0.15, hue]).to('srgb').toString({ format: 'hex' }),
      )
      // High lightness (light colours, L=0.75)
      generatedFills.push(
        new Color('oklch', [0.75, 0.12, hue]).to('srgb').toString({ format: 'hex' }),
      )
    }

    // Combine regression set and generated fills
    const allFills = [...regressionFills, ...generatedFills]

    // Verify every fill returns AA-safe contrast
    for (const fill of allFills) {
      const out = resolveContrast(fill, '#fff')
      expect(checkContrast(out, fill).wcagAA).toBe(true)
    }
  })
})

describe('step-role tokens', () => {
  const scale = {
    accentScale: Array.from({ length: 12 }, (_, i) => `#0000${i}${i}`),
    accentScaleAlpha: Array.from({ length: 12 }, (_, i) => `#a000${i}${i}`),
    accentContrast: '#fff',
    accentSurface: '#eeeeee',
    // These fixture steps aren't real colors, so the AAA text mix cannot be
    // measured from them — pin `text` so this test continues to exercise
    // the 3/6/9 index mapping specifically.
    text: '#00001010',
  }

  it('maps subtle/border/solid onto Radix steps 3/6/9 and emits the given text', () => {
    const out = buildScaleBlock('demo', scale)
    // The builder above produces `#0000` + index + index, so index 2 (step 3)
    // is #000022.
    expect(out).toContain('--color-demo-subtle: #000022;')
    expect(out).toContain('--color-demo-border: #000055;')
    expect(out).toContain('--color-demo-solid: #000088;')
    expect(out).toContain('--color-demo-text: #00001010;')
  })

  it('measures an AAA text colour when none is given: the least-bright oklch mix of steps 11→12 clearing 7:1 on every surface', () => {
    // gold light scale: step 11 vs step 3 measures 4.246 — not even AA —
    // so the mix has to travel a long way toward step 12.
    const { accentScale, accentScaleAlpha, accentContrast, accentSurface } =
      generateRadixColors({
        appearance: 'light',
        accent: '#E9E28F',
        gray: '#8B8D98',
        background: '#ffffff',
      })
    expect(checkContrast(accentScale[10]!, accentScale[2]!).wcagAA).toBe(false)

    const surfaces = accentScale.slice(0, 4)
    const text = computeAaaText(accentScale, surfaces)
    for (const bg of surfaces) {
      expect(
        checkContrast(text, bg).ratio,
        `${text} on ${bg}`,
      ).toBeGreaterThanOrEqual(7)
    }
    // Least-bright: one notch back toward step 11 must fail somewhere,
    // otherwise the search stopped late and threw away tint for nothing.
    // (A result equal to step 11 itself has no notch back.)
    if (text !== accentScale[10]) {
      const notchBack = mixToward(accentScale[10]!, accentScale[11]!, text, -0.05)
      expect(surfaces.some((bg) => checkContrast(notchBack, bg).ratio < 7)).toBe(true)
    }

    const out = buildScaleBlock('gold', {
      accentScale,
      accentScaleAlpha,
      accentContrast,
      accentSurface,
    })
    expect(out).toContain(`--color-gold-text: ${text};`)
  })

  it('corrects a contrast token that fails against its own step 9', () => {
    // step 9 here is a light yellow; #fff against it fails, black passes.
    const failing = {
      ...scale,
      accentScale: [
        ...Array.from({ length: 8 }, () => '#111111'),
        '#e9e28f',
        ...Array.from({ length: 3 }, () => '#111111'),
      ],
      accentContrast: '#fff',
    }
    const out = buildScaleBlock('demo', failing)
    expect(out).toContain('--color-demo-contrast: #000;')
  })

  it('aliases the four step-role suffixes so accent resolves', () => {
    const out = buildAliasBlock('accent', 'gold')
    expect(out).toContain('--color-accent-subtle: var(--color-gold-subtle);')
    expect(out).toContain('--color-accent-border: var(--color-gold-border);')
    expect(out).toContain('--color-accent-solid: var(--color-gold-solid);')
    expect(out).toContain('--color-accent-text: var(--color-gold-text);')
  })
})

import { mergeStatusDefaults } from '../src/utils/brand-colors'

describe('palette contrast (WCAG AA is a hard requirement)', () => {
  // The real configured palette, plus the status hues the generator adds.
  // 'warning' is a user override (ITPS's real orange) — this must stay in
  // sync with .env's VITE_BRAND_COLORS, or this suite silently stops
  // exercising the deployed value and falls back to testing the generic
  // STATUS_DEFAULTS seed instead.
  const userBrands: BrandEntry[] = [
    { name: 'gold', light: '#E9E28F', dark: '#E9E28F' },
    { name: 'apple', light: '#1A2F40', dark: '#F2F9FF' },
    { name: 'link', light: '#0066cc', dark: '#2997ff' },
    { name: 'warning', light: '#FAA74A', dark: '#FAA74A' },
  ]

  const css = buildThemeCss({
    gray: { light: '#8B8D98', dark: '#8B8D98' },
    bg: { light: '#ffffff', dark: '#111111' },
    panelBg: { light: '#fafafa', dark: '#1a1a1a' },
    shellBg: { light: '#ffffff', dark: '#111111' },
    fontFamilies: {
    sans: 'Inter',
    mono: 'IBM Plex Mono',
    display: 'Inter',
    serif: 'Newsreader',
  },
    brandColors: mergeStatusDefaults(userBrands),
  })

  const lightBlock = css.slice(0, css.indexOf('.dark {'))
  const darkBlock = css.slice(css.indexOf('.dark {'), css.indexOf('@supports'))

  const token = (block: string, name: string): string => {
    const m = block.match(new RegExp(`--color-${name}:\\s*([^;]+);`))
    if (!m) throw new Error(`token --color-${name} not found`)
    return m[1]!.trim()
  }

  const scales = ['gold', 'apple', 'link', 'success', 'warning', 'error']
  const blocks: [string, string][] = [
    ['light', lightBlock],
    ['dark', darkBlock],
  ]

  it('generates the three status scales even though only 3 brands were declared', () => {
    for (const name of ['success', 'warning', 'error']) {
      expect(lightBlock).toContain(`--color-${name}-9:`)
      expect(darkBlock).toContain(`--color-${name}-9:`)
    }
  })

  it('every contrast token clears AA against its own solid fill', () => {
    for (const [label, block] of blocks) {
      for (const name of scales) {
        const solid = token(block, `${name}-solid`)
        const contrast = token(block, `${name}-contrast`)
        const { ratio } = checkContrast(contrast, solid)
        expect(
          ratio,
          `${label} ${name}: ${contrast} on ${solid} = ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('body text tokens clear AAA (7:1) on every neutral surface', () => {
    // --color-primary resolves to gray-12; -secondary and -tertiary to
    // gray-text. Most SMEs are pilots over sixty: 7:1 is the floor, and it
    // has to hold on gray-4 (a hovered row) as much as on the page.
    for (const [label, block] of blocks) {
      const surfaces = [
        token(block, 'background'),
        token(block, 'panel-bg'),
        ...[1, 2, 3, 4].map((n) => token(block, `gray-${n}`)),
      ]
      for (const name of ['gray-12', 'gray-text']) {
        for (const bg of surfaces) {
          const { ratio } = checkContrast(token(block, name), bg)
          expect(
            ratio,
            `${label} ${name} on ${bg} = ${ratio.toFixed(2)}`,
          ).toBeGreaterThanOrEqual(7)
        }
      }
    }
  })

  it('the measured text colour keeps its scale’s hue — a mix along the 11→12 ramp, never a jump to white or black', () => {
    // Mutant this catches: computeAaaText returning step 12 (or #fff/#000)
    // whenever step 11 fails, which passes every contrast test above and
    // throws away the tint the scale exists to carry.
    const hue = (hex: string) => new Color(hex).to('oklch').get('h')
    const chroma = (hex: string) => new Color(hex).to('oklch').get('c')
    for (const [label, block] of blocks) {
      for (const name of ['apple', 'warning', 'error', 'link']) {
        const text = token(block, `${name}-text`)
        const step11 = token(block, `${name}-11`)
        // Achromatic results have no meaningful hue; only compare when the
        // mix still carries colour.
        if (chroma(text) < 0.02) continue
        const drift = Math.abs(((hue(text) - hue(step11) + 540) % 360) - 180)
        expect(drift, `${label} ${name}-text ${text} vs step 11 ${step11}`).toBeLessThan(10)
      }
    }
  })

  it('each scale’s text clears AAA (7:1) on its own steps 1–4, the gray surfaces, and the page', () => {
    for (const [label, block] of blocks) {
      const neutral = [
        token(block, 'background'),
        token(block, 'panel-bg'),
        ...[1, 2, 3, 4].map((n) => token(block, `gray-${n}`)),
      ]
      for (const name of scales) {
        const text = token(block, `${name}-text`)
        const own = [1, 2, 3, 4].map((n) => token(block, `${name}-${n}`))
        for (const value of [...own, ...neutral]) {
          const { ratio } = checkContrast(text, value)
          expect(
            ratio,
            `${label} ${name}-text (${text}) on ${value} = ${ratio.toFixed(2)}`,
          ).toBeGreaterThanOrEqual(7)
        }
      }
    }
  })

  it('sRGB and wide-gamut (P3) blocks emit the SAME measured text colour for every scale', () => {
    // The mix is measured once, from the sRGB scale, and handed to the P3
    // block verbatim — never re-measured against the oklch strings, which
    // could disagree near the 7:1 boundary and leave the two blocks
    // choosing different colours for one token.
    const p3Block = css.slice(css.indexOf('@supports'))
    const p3LightBlock = p3Block.slice(0, p3Block.indexOf('.dark {'))
    const p3DarkBlock = p3Block.slice(p3Block.indexOf('.dark {'))
    for (const name of ['gray', ...scales]) {
      expect(token(p3LightBlock, `${name}-text`)).toBe(
        token(lightBlock, `${name}-text`),
      )
      expect(token(p3DarkBlock, `${name}-text`)).toBe(
        token(darkBlock, `${name}-text`),
      )
    }
  })

  // WCAG 1.4.11 (non-text contrast): graphical objects — icons, chart
  // strokes, focus rings — need only 3:1, not the 4.5:1 that applies to
  // text. But status '-solid' (step 9) is tuned as a *fill* color, and
  // yellow/orange hues in particular land far short of 3:1 against a light
  // page even though their '-text' step clears 4.5:1 easily. Any consumer
  // that strokes a graphical element with '-solid' instead of '-text' (as
  // score-ring.tsx used to) can silently ship an illegible warning ring.
  it('status -text (not -solid) clears the 3:1 non-text minimum against body and panel — the reason graphical strokes must use -text', () => {
    for (const [label, block] of blocks) {
      const bg = token(block, 'background')
      const panel = token(block, 'panel-bg')
      for (const name of ['success', 'warning', 'error']) {
        const text = token(block, `${name}-text`)
        for (const [surface, value] of [
          ['background', bg],
          ['panel', panel],
        ] as const) {
          const { ratio } = checkContrast(text, value)
          expect(
            ratio,
            `${label} ${name}-text on ${surface} (${value}) = ${ratio.toFixed(2)}`,
          ).toBeGreaterThanOrEqual(3)
        }
      }
    }
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * A generated token that nothing reads is dead code, and this codebase's most
 * common defect shape. Pin both ends of the seam: the generator must emit the
 * property, and styles.css must consume it under exactly that name. Renaming
 * either side fails this test.
 */
describe('alert bar token consumer seam', () => {
  const stylesCss = readFileSync(
    resolve(process.cwd(), 'src/styles.css'),
    'utf8',
  )

  it('styles.css consumes the property the generator emits', () => {
    const css = buildThemeCss({
      gray: { light: '#8B8D98', dark: '#8B8D98' },
      bg: { light: '#ffffff', dark: '#111111' },
      panelBg: { light: '#ffffff', dark: '#111111' },
      shellBg: { light: '#ffffff', dark: '#111111' },
      fontFamilies: {
        sans: 'Inter',
        mono: 'IBM Plex Mono',
        display: 'Inter',
        serif: 'Newsreader',
      },
      brandColors: [{ name: 'solo', light: '#3D63DD', dark: '#3D63DD' }],
      alertBar: '#cb0d39',
    })

    expect(css).toContain('--color-alert-bar:')
    expect(stylesCss).toContain('var(--color-alert-bar)')
  })

  /**
   * The `.alert-bar` declarations with comments stripped. Comments must go:
   * the rule's own prose explains why it sets no z-index by naming
   * `z-index: auto`, and a naive text scan would match that and report a
   * declaration the rule does not have.
   */
  const alertBarDeclarations = () => {
    const start = stylesCss.indexOf('.alert-bar {')
    expect(start).toBeGreaterThan(-1)
    const rule = stylesCss.slice(start, stylesCss.indexOf('}', start))
    const declarations = rule.replace(/\/\*[\s\S]*?\*\//g, '')
    // Guard the slice: without this, every toContain below could pass
    // vacuously against an empty string.
    expect(declarations).toContain('.alert-bar {')
    return declarations
  }

  it('.alert-bar positions itself with logical properties only', () => {
    const declarations = alertBarDeclarations()

    // fixed, NOT absolute: /app and /admin/* scroll at page level, so an
    // absolute bar scrolls out of view on two of the three authed layouts.
    expect(declarations).toContain('position: fixed')
    expect(declarations).toContain('inset-block-start: 0')
    expect(declarations).toContain('inset-inline: 0')
    expect(declarations).toContain(
      'min-block-size: var(--alert-bar-min-block-size)',
    )
    // Physical equivalents are a hard project rule violation.
    expect(declarations).not.toMatch(/\b(top|left|right|bottom|min-height):/)
  })

  it('.alert-bar sets no z-index, so Base UI dialogs always paint above it', () => {
    // Seven admin dialogs render `fixed inset-0` backdrops with no z-index.
    // A positioned element at z-index: auto paints below ANY positive
    // z-index regardless of DOM order, so a positive z-index here would
    // show the bar through those backdrops.
    expect(alertBarDeclarations()).not.toMatch(/z-index:/)
  })

  it('--alert-bar-min-block-size tracks --shell-padding rather than repeating 12px', () => {
    // The shell tokens are overridable per theme; a hardcoded 12px here
    // would silently drift from the gutter it is supposed to match.
    expect(stylesCss).toContain(
      '--alert-bar-min-block-size: var(--shell-padding);',
    )
  })
})
