import { describe, expect, it } from 'vitest'
import { BRAND_NAME_REGEX, parseBrandColorEntries } from './brand-colors'

describe('parseBrandColorEntries', () => {
  it('parses a single entry', () => {
    expect(parseBrandColorEntries('primary:#3D63DD/#5A7FE8')).toEqual([
      { name: 'primary', light: '#3D63DD', dark: '#5A7FE8' },
    ])
  })

  it('parses multiple comma-separated entries and trims whitespace', () => {
    const out = parseBrandColorEntries(
      ' primary:#3D63DD/#5A7FE8 , secondary:#FF6B6B/#FF8787 , tertiary:#10B981/#34D399 ',
    )
    expect(out).toEqual([
      { name: 'primary', light: '#3D63DD', dark: '#5A7FE8' },
      { name: 'secondary', light: '#FF6B6B', dark: '#FF8787' },
      { name: 'tertiary', light: '#10B981', dark: '#34D399' },
    ])
  })

  it('drops empty segments between stray commas', () => {
    expect(parseBrandColorEntries('primary:#3D63DD/#5A7FE8,,')).toEqual([
      { name: 'primary', light: '#3D63DD', dark: '#5A7FE8' },
    ])
  })

  it('throws when an entry is missing the colon', () => {
    expect(() => parseBrandColorEntries('primary#3D63DD/#5A7FE8')).toThrow(
      /missing ":"/,
    )
  })

  it('throws when an entry is missing the light/dark slash', () => {
    expect(() => parseBrandColorEntries('primary:#3D63DD')).toThrow(
      /missing "\/"/,
    )
  })

  it('throws when the name is empty', () => {
    expect(() => parseBrandColorEntries(':#3D63DD/#5A7FE8')).toThrow(
      /empty name/,
    )
  })

  it('throws when light is empty', () => {
    expect(() => parseBrandColorEntries('primary:/#5A7FE8')).toThrow(
      /empty light/,
    )
  })

  it('throws when dark is empty', () => {
    expect(() => parseBrandColorEntries('primary:#3D63DD/')).toThrow(
      /empty dark/,
    )
  })

  it('throws on empty input', () => {
    expect(() => parseBrandColorEntries('')).toThrow(/no entries/)
    expect(() => parseBrandColorEntries('   ')).toThrow(/no entries/)
  })
})

describe('BRAND_NAME_REGEX', () => {
  it('accepts lowercase kebab names', () => {
    expect(BRAND_NAME_REGEX.test('primary')).toBe(true)
    expect(BRAND_NAME_REGEX.test('brand-2')).toBe(true)
    expect(BRAND_NAME_REGEX.test('a1')).toBe(true)
  })

  it('rejects uppercase, leading digits, and non-kebab chars', () => {
    expect(BRAND_NAME_REGEX.test('Primary')).toBe(false)
    expect(BRAND_NAME_REGEX.test('1st')).toBe(false)
    expect(BRAND_NAME_REGEX.test('my_brand')).toBe(false)
    expect(BRAND_NAME_REGEX.test('my brand')).toBe(false)
    expect(BRAND_NAME_REGEX.test('')).toBe(false)
  })
})

describe('formerly-reserved names', () => {
  it('accepts brand, background, accent, and gray as valid name shapes', () => {
    for (const name of ['brand', 'background', 'accent', 'gray']) {
      expect(BRAND_NAME_REGEX.test(name)).toBe(true)
    }
  })

  it('parses an entry named "brand"', () => {
    expect(parseBrandColorEntries('brand:#cb0d39/#f44f5f')).toEqual([
      { name: 'brand', light: '#cb0d39', dark: '#f44f5f' },
    ])
  })
})
