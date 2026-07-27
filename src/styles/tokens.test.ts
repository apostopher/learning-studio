import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildThemeCss } from '../../scripts/generate-theme-css'
import { mergeStatusDefaults } from '../utils/brand-colors'

const tokensCss = readFileSync(
  resolve(process.cwd(), 'src/styles/tokens.css'),
  'utf8',
)

const generatedCss = buildThemeCss({
  gray: { light: '#8B8D98', dark: '#8B8D98' },
  bg: { light: '#ffffff', dark: '#111111' },
  panelBg: { light: '#ffffff', dark: '#111111' },
  shellBg: { light: '#ffffff', dark: '#111111' },
  fontFamilies: { sans: 'Inter', mono: 'IBM Plex Mono', display: 'Inter' },
  brandColors: mergeStatusDefaults([
    { name: 'gold', light: '#E9E28F', dark: '#E9E28F' },
    { name: 'apple', light: '#1A2F40', dark: '#F2F9FF' },
    { name: 'link', light: '#0066cc', dark: '#2997ff' },
  ]),
})

/** Every custom property tokens.css DEFINES, e.g. `--color-primary`. */
const defined = new Set(
  [...tokensCss.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]!),
)

/** Every custom property tokens.css REFERENCES via var(). */
const referenced = [
  ...tokensCss.matchAll(/var\((--[a-z0-9-]+)\)/g),
].map((m) => m[1]!)

describe('tokens.css referential integrity', () => {
  it('references at least one primitive (guards against a broken regex)', () => {
    expect(referenced.length).toBeGreaterThan(20)
    expect(defined.size).toBeGreaterThan(50)
  })

  it('every var() reference resolves to a generated primitive or a local token', () => {
    // Declared on `html` in styles.css's base layer, not in @theme.
    const externalPrimitives = new Set(['--ease-out-cubic', '--spacing'])
    const unresolved = [...new Set(referenced)].filter(
      (name) =>
        !defined.has(name) &&
        !externalPrimitives.has(name) &&
        !generatedCss.includes(`${name}:`),
    )
    expect(unresolved, `unresolved: ${unresolved.join(', ')}`).toEqual([])
  })

  it('defines the semantic classes the codemod targets', () => {
    for (const name of [
      '--color-primary',
      '--color-secondary',
      '--color-tertiary',
    ]) {
      expect(defined.has(name)).toBe(true)
    }
  })

  it('does not retune the --text-* t-shirt ramp', () => {
    for (const name of ['--text-xs', '--text-sm', '--text-base', '--text-lg']) {
      expect(
        defined.has(name),
        `${name} must keep its Tailwind default — see the spec`,
      ).toBe(false)
    }
  })
})
