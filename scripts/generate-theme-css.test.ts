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
