export type BrandEntry = { name: string; light: string; dark: string }

export const BRAND_NAME_REGEX = /^[a-z][a-z0-9-]*$/

export const RESERVED_BRAND_NAMES = [
  'gray',
  'accent',
  'brand',
  'background',
] as const

/**
 * Parses "name:#light/#dark, name2:#light/#dark, ..." into structured entries.
 * Validates only the *shape* — name/hex semantic validation is the caller's job
 * (see `src/env.ts`, which pipes this through Zod).
 */
export function parseBrandColorEntries(raw: string): BrandEntry[] {
  const segments = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (segments.length === 0) {
    throw new Error('VITE_BRAND_COLORS has no entries')
  }

  return segments.map((segment, index) => {
    const colonAt = segment.indexOf(':')
    if (colonAt === -1) {
      throw new Error(
        `entry ${index} ("${segment}") missing ":" separator between name and colors`,
      )
    }
    const name = segment.slice(0, colonAt).trim()
    const rest = segment.slice(colonAt + 1).trim()

    if (name.length === 0) {
      throw new Error(`entry ${index} ("${segment}") has empty name`)
    }

    const slashAt = rest.indexOf('/')
    if (slashAt === -1) {
      throw new Error(
        `entry ${index} ("${segment}") missing "/" separator between light and dark`,
      )
    }
    const light = rest.slice(0, slashAt).trim()
    const dark = rest.slice(slashAt + 1).trim()

    if (light.length === 0) {
      throw new Error(`entry ${index} ("${segment}") has empty light color`)
    }
    if (dark.length === 0) {
      throw new Error(`entry ${index} ("${segment}") has empty dark color`)
    }

    return { name, light, dark }
  })
}
