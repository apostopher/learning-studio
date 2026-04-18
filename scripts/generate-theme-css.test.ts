import { describe, expect, it } from 'vitest'
import { parseFontSpecs, parseLogo, sanitizeSvg } from './generate-theme-css'

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

import { buildScaleBlock, buildThemeCss } from './generate-theme-css'
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
    })
    expect(out).toContain('export const fontLinkHref = null')
    expect(out).toContain("export const brandNames = ['solo'] as const")
  })
})
