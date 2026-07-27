export type BrandEntry = { name: string; light: string; dark: string }

export const BRAND_NAME_REGEX = /^[a-z][a-z0-9-]*$/

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

/**
 * Status hues the generator always produces, so `--color-success` and friends
 * can never resolve to nothing. Declaring any of these in VITE_BRAND_COLORS
 * overrides the seed below.
 */
export const RESERVED_BRAND_NAMES = ['success', 'warning', 'error'] as const

export const STATUS_DEFAULTS: readonly BrandEntry[] = [
  { name: 'success', light: '#30a46c', dark: '#3dd68c' },
  { name: 'warning', light: '#f5a524', dark: '#ffb224' },
  { name: 'error', light: '#cb0d39', dark: '#f44f5f' },
]

/**
 * Appends any status hue the caller did not declare. User entries stay first
 * so `accent` keeps aliasing the first declared brand rather than a status.
 */
export function mergeStatusDefaults(entries: BrandEntry[]): BrandEntry[] {
  const declared = new Set(entries.map((e) => e.name))
  return [
    ...entries,
    ...STATUS_DEFAULTS.filter((d) => !declared.has(d.name)),
  ]
}
