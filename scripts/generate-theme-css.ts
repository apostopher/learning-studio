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
