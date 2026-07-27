# Astryx Token Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a semantic token tier modelled on the Astryx token system over the existing generated Radix primitives, and repair three latent accessibility defects along the way.

**Architecture:** The theme splits into two artefacts. `scripts/generate-theme-css.ts` emits only env-dependent output (Radix scales, per-brand step-role tokens, status scales, fonts) into the gitignored `src/styles/theme.generated.css`. A new committed `src/styles/tokens.css` defines the semantic layer purely in terms of those primitives, so design decisions become reviewable in git. Because every semantic token is a `var()` onto a primitive that the generated `.dark` block already re-binds, the semantic layer needs no dark-mode duplication.

**Tech Stack:** TypeScript (strict), Tailwind CSS v4, Vitest, colorjs.io, `generateRadixColors` from `src/utils/colors.ts`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-astryx-tokens-design.md`. Read it before Task 1.
- Branch: `feat/astryx-tokens`. Already created and checked out.
- **WCAG AA (4.5:1) is a hard product requirement, not a tradeoff.** Never resolve a contrast failure by lowering the threshold or documenting it as accepted. The sole exemption is genuinely disabled controls (WCAG 1.4.3).
- **Do not adopt Astryx's font sizes.** Only its semantic type vocabulary. `--text-xs` … `--text-5xl` keep their Tailwind defaults.
- Astryx tokens are *copied*, not depended on. No new packages. No StyleX.
- All CSS uses logical properties (`margin-inline-start`, not `margin-left`).
- **Never `git add -A` or `git add .`** — stage explicit paths only. The working tree contains unrelated user modifications to `scripts/generate-theme-css.ts`, `scripts/generate-theme-css.test.ts`, `src/env.ts`, `src/styles.css`, `src/utils/brand-colors.ts`, `src/utils/brand-colors.test.ts`, and an untracked `src/common/config.ts`. Those files are also edited by this plan — stage only them, and never `src/common/config.ts`.
- Every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```
- Test imports use **relative paths** (`./brand-colors`, `../src/utils/colors`). Vitest cannot resolve the `@/` alias in this repo.
- Run the full suite with `pnpm test`. A single file: `pnpm vitest run <path>`.
- Biome is the formatter/linter: `pnpm check`.

---

## File Structure

**Modified:**
- `src/utils/brand-colors.ts` — gains `RESERVED_BRAND_NAMES`, `STATUS_DEFAULTS`, `mergeStatusDefaults()`. Stays a pure parsing/data module with no I/O.
- `src/utils/brand-colors.test.ts` — tests for the above.
- `src/env.ts` — cap message wording only.
- `scripts/generate-theme-css.ts` — gains `resolveContrast()`; `buildScaleBlock` and `buildAliasBlock` gain the four step-role tokens; `generateTheme` merges status defaults.
- `scripts/generate-theme-css.test.ts` — tests for the above, plus the contrast suite.
- `src/styles.css` — imports `tokens.css`; the two stranded `@theme` blocks move out.
- ~72 `.tsx` files under `src/` — codemod of raw colour-step classes.
- `src/components/admin/delete-module-confirm-form.tsx` — drop the `text-black` workaround.

**Created:**
- `src/styles/tokens.css` — the committed semantic layer. Single responsibility: map Astryx's vocabulary onto our primitives. No component rules ever go here.
- `src/styles/tokens.test.ts` — referential-integrity test for `tokens.css`.

---

### Task 1: Status colour defaults

`success`, `warning`, and `error` become reserved names with built-in seeds, so status tokens can never be missing. User declarations win.

**Files:**
- Modify: `src/utils/brand-colors.ts`
- Modify: `src/env.ts:63` (message wording only)
- Test: `src/utils/brand-colors.test.ts`

**Interfaces:**
- Consumes: `BrandEntry` (already exported from `src/utils/brand-colors.ts` as `{ name: string; light: string; dark: string }`).
- Produces: `RESERVED_BRAND_NAMES: readonly ['success','warning','error']`, `STATUS_DEFAULTS: readonly BrandEntry[]`, `mergeStatusDefaults(entries: BrandEntry[]): BrandEntry[]`. Task 4 calls `mergeStatusDefaults`.

- [ ] **Step 1: Write the failing test**

Append to `src/utils/brand-colors.test.ts`:

```ts
import {
  mergeStatusDefaults,
  RESERVED_BRAND_NAMES,
  STATUS_DEFAULTS,
} from './brand-colors'

describe('mergeStatusDefaults', () => {
  it('appends all three status defaults when none are declared', () => {
    const out = mergeStatusDefaults([
      { name: 'gold', light: '#E9E28F', dark: '#E9E28F' },
    ])
    expect(out.map((e) => e.name)).toEqual([
      'gold',
      'success',
      'warning',
      'error',
    ])
  })

  it('keeps user-declared entries first so accent still aliases the first one', () => {
    const out = mergeStatusDefaults([
      { name: 'gold', light: '#E9E28F', dark: '#E9E28F' },
      { name: 'apple', light: '#1A2F40', dark: '#F2F9FF' },
    ])
    expect(out[0]!.name).toBe('gold')
  })

  it('lets a user-declared status entry win over the default', () => {
    const out = mergeStatusDefaults([
      { name: 'error', light: '#ff0000', dark: '#ff0000' },
    ])
    const error = out.filter((e) => e.name === 'error')
    expect(error).toHaveLength(1)
    expect(error[0]!.light).toBe('#ff0000')
  })

  it('fills only the gaps when some statuses are declared', () => {
    const out = mergeStatusDefaults([
      { name: 'success', light: '#00ff00', dark: '#00ff00' },
    ])
    expect(out.map((e) => e.name)).toEqual(['success', 'warning', 'error'])
    expect(out[0]!.light).toBe('#00ff00')
  })

  it('does not mutate the input array', () => {
    const input = [{ name: 'gold', light: '#E9E28F', dark: '#E9E28F' }]
    mergeStatusDefaults(input)
    expect(input).toHaveLength(1)
  })

  it('exposes the three reserved names and a default for each', () => {
    expect(RESERVED_BRAND_NAMES).toEqual(['success', 'warning', 'error'])
    for (const name of RESERVED_BRAND_NAMES) {
      expect(STATUS_DEFAULTS.some((d) => d.name === name)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/utils/brand-colors.test.ts`
Expected: FAIL — `mergeStatusDefaults is not a function` / no matching export.

- [ ] **Step 3: Write minimal implementation**

Append to `src/utils/brand-colors.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/utils/brand-colors.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Clarify the env cap message**

In `src/env.ts`, the `.max(12, …)` on the brand array already applies to user-declared entries only, because status merging happens later in `generateTheme()`. Only the message is misleading. Change:

```ts
      .max(12, 'VITE_BRAND_COLORS supports at most 12 entries')
```

to:

```ts
      .max(
        12,
        'VITE_BRAND_COLORS supports at most 12 user-declared entries (success/warning/error are added automatically)',
      )
```

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: PASS. No behaviour changed yet — this step guards against a typo in `env.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/utils/brand-colors.ts src/utils/brand-colors.test.ts src/env.ts
git commit -m "feat(theme): reserve success/warning/error brand names with defaults"
```

---

### Task 2: AA-safe contrast resolution

`generateRadixColors` returns an `accentContrast` that is not guaranteed to clear 4.5:1 — measured, dark-theme `red-9` scores 3.43 and dark `link-9` scores 3.02 against their `#fff` token. The generator must measure and correct.

**Files:**
- Modify: `scripts/generate-theme-css.ts`
- Test: `scripts/generate-theme-css.test.ts`

**Interfaces:**
- Consumes: `checkContrast(foreground: string, background: string): { wcagAA: boolean; wcagAALarge: boolean; ratio: number }` from `src/utils/colors.ts`.
- Produces: `resolveContrast(step9: string, candidate: string): string`. Task 3 calls it inside `buildScaleBlock`.

**Why this always succeeds, so there is no error path:** white-vs-black contrast against any colour bottoms out where the two are equal, at a ratio of 4.58 — above the 4.5 threshold. Picking the better of black/white therefore always clears AA.

- [ ] **Step 1: Write the failing test**

Append to `scripts/generate-theme-css.test.ts`:

```ts
import { resolveContrast } from './generate-theme-css'
import { checkContrast } from '../src/utils/colors'

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
    const fills = [
      '#cb0d39', '#f44f5f', '#2997ff', '#e9e28f', '#1a2f40',
      '#808080', '#767676', '#000000', '#ffffff', '#30a46c',
    ]
    for (const fill of fills) {
      const out = resolveContrast(fill, '#fff')
      expect(checkContrast(out, fill).wcagAA).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: FAIL — `resolveContrast is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `scripts/generate-theme-css.ts`, add the import alongside the existing `generateRadixColors` import:

```ts
import { checkContrast, generateRadixColors } from '../src/utils/colors'
```

Then add, above `buildScaleBlock`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-theme-css.ts scripts/generate-theme-css.test.ts
git commit -m "fix(theme): compute AA-safe contrast instead of trusting accentContrast"
```

---

### Task 3: Per-scale step-role tokens

Every generated scale gains four tokens named for what the Radix step *is*, so components can say `bg-error-subtle text-error-text` instead of `bg-error-3 text-error-11`.

**Files:**
- Modify: `scripts/generate-theme-css.ts` (`buildScaleBlock`, `buildAliasBlock`)
- Test: `scripts/generate-theme-css.test.ts`

**Interfaces:**
- Consumes: `resolveContrast` from Task 2. `ScaleInput` (already declared in the file) as `{ accentScale: readonly string[]; accentScaleAlpha: readonly string[]; accentContrast?: string; accentSurface?: string }`.
- Produces: for every scale `N`, the CSS custom properties `--color-N-subtle` (step 3), `--color-N-border` (step 6), `--color-N-solid` (step 9), `--color-N-text` (step 11). Task 5's `tokens.css` references `--color-accent-solid`, `--color-accent-subtle`, and the status equivalents.

Radix steps are 1-indexed, the arrays are 0-indexed: step 3 = index 2, step 6 = index 5, step 9 = index 8, step 11 = index 10.

- [ ] **Step 1: Write the failing test**

Append to `scripts/generate-theme-css.test.ts`:

```ts
import { buildAliasBlock } from './generate-theme-css'

describe('step-role tokens', () => {
  const scale = {
    accentScale: Array.from({ length: 12 }, (_, i) => `#0000${i}${i}`),
    accentScaleAlpha: Array.from({ length: 12 }, (_, i) => `#a000${i}${i}`),
    accentContrast: '#fff',
    accentSurface: '#eeeeee',
  }

  it('maps subtle/border/solid/text onto Radix steps 3/6/9/11', () => {
    const out = buildScaleBlock('demo', scale)
    // The builder above produces `#0000` + index + index, so index 2 (step 3)
    // is #000022 and index 10 (step 11) is #00001010.
    expect(out).toContain('--color-demo-subtle: #000022;')
    expect(out).toContain('--color-demo-border: #000055;')
    expect(out).toContain('--color-demo-solid: #000088;')
    expect(out).toContain('--color-demo-text: #00001010;')
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: FAIL — no `--color-demo-subtle` in output; `buildAliasBlock` emits no step-role suffixes.

- [ ] **Step 3: Add step-role tokens to `buildScaleBlock`**

In `scripts/generate-theme-css.ts`, replace the body of `buildScaleBlock` with:

```ts
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
  const text = step(11)
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
```

- [ ] **Step 4: Add the four suffixes to `buildAliasBlock`**

In the same file, inside `buildAliasBlock`, insert before the `contrast` line:

```ts
  for (const suffix of ['subtle', 'border', 'solid', 'text']) {
    lines.push(`  --color-${fromName}-${suffix}: var(--color-${toName}-${suffix});`)
  }
```

Update the JSDoc above it so the suffix list stays accurate — change `(1..12, a1..a12, contrast, surface)` to `(1..12, a1..a12, subtle, border, solid, text, contrast, surface)`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: PASS, including the pre-existing `buildScaleBlock` and `buildThemeCss` tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-theme-css.ts scripts/generate-theme-css.test.ts
git commit -m "feat(theme): emit subtle/border/solid/text tokens per scale"
```

---

### Task 4: Wire status merge in and assert AA across the palette

The generator starts producing status scales, and a contrast suite locks the whole palette to AA.

**Files:**
- Modify: `scripts/generate-theme-css.ts` (`generateTheme`)
- Test: `scripts/generate-theme-css.test.ts`

**Interfaces:**
- Consumes: `mergeStatusDefaults` (Task 1), `buildScaleBlock` step-role output (Task 3).
- Produces: generated CSS that always contains `success`, `warning`, and `error` scales.

- [ ] **Step 1: Write the failing test**

Append to `scripts/generate-theme-css.test.ts`:

```ts
import { mergeStatusDefaults } from '../src/utils/brand-colors'

describe('palette contrast (WCAG AA is a hard requirement)', () => {
  // The real configured palette, plus the status hues the generator adds.
  const userBrands: BrandEntry[] = [
    { name: 'gold', light: '#E9E28F', dark: '#E9E28F' },
    { name: 'apple', light: '#1A2F40', dark: '#F2F9FF' },
    { name: 'link', light: '#0066cc', dark: '#2997ff' },
  ]

  const css = buildThemeCss({
    gray: { light: '#8B8D98', dark: '#8B8D98' },
    bg: { light: '#ffffff', dark: '#111111' },
    panelBg: { light: '#ffffff', dark: '#111111' },
    shellBg: { light: '#ffffff', dark: '#111111' },
    fontFamilies: { sans: 'Inter', mono: 'IBM Plex Mono', display: 'Inter' },
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

  it('body text tokens clear AA against the page background', () => {
    for (const [label, block] of blocks) {
      const bg = token(block, 'background')
      // --color-primary / -secondary / -tertiary resolve to these primitives.
      for (const step of ['gray-12', 'gray-11']) {
        const { ratio } = checkContrast(token(block, step), bg)
        expect(
          ratio,
          `${label} ${step} on ${bg} = ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('gray-10 does NOT clear AA — the reason --color-tertiary uses gray-11', () => {
    const bg = token(lightBlock, 'background')
    expect(
      checkContrast(token(lightBlock, 'gray-10'), bg).ratio,
    ).toBeLessThan(4.5)
  })

  it('each scale text step clears AA on its own subtle fill and on the page', () => {
    for (const [label, block] of blocks) {
      const bg = token(block, 'background')
      for (const name of scales) {
        const text = token(block, `${name}-text`)
        for (const [surface, value] of [
          ['subtle', token(block, `${name}-subtle`)],
          ['background', bg],
        ] as const) {
          const { ratio } = checkContrast(text, value)
          expect(
            ratio,
            `${label} ${name}-text on ${surface} (${value}) = ${ratio.toFixed(2)}`,
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })
})
```

Note the fourth test deliberately asserts a *failure* — it documents why `--color-tertiary` cannot use `gray-10` and will start failing if Radix ever changes that step.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: FAIL on the status-scale test — `--color-success-9` is absent, because `buildThemeCss` receives whatever `brandColors` it is handed and nothing has wired the merge into `generateTheme` yet. The contrast tests pass already, since the test itself calls `mergeStatusDefaults`.

- [ ] **Step 3: Wire the merge into `generateTheme`**

In `scripts/generate-theme-css.ts`, update the import:

```ts
import { mergeStatusDefaults } from '../src/utils/brand-colors'
```

and inside `generateTheme()`, change the `brandColors` argument:

```ts
    brandColors: mergeStatusDefaults(env.VITE_BRAND_COLORS),
```

Leave `brandNames` in the `buildThemeModule` call as `env.VITE_BRAND_COLORS.map((e) => e.name)` — that export drives brand *pickers* in the UI, and status hues are not user-selectable brands.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/generate-theme-css.test.ts`
Expected: PASS.

If the "every contrast token clears AA" test fails, do **not** relax the threshold — it means `resolveContrast` from Task 2 is not being applied in `buildScaleBlock`. Re-check Task 3 Step 3.

- [ ] **Step 5: Drop the now-redundant `red` entry from `.env`**

`red` and the new `error` default carry identical values (`#cb0d39` / `#f44f5f`). Edit `.env` and change:

```
VITE_BRAND_COLORS='gold:#E9E28F/#E9E28F,apple:#1A2F40/#F2F9FF,link:#0066cc/#2997ff,red:#cb0d39/#f44f5f'
```

to:

```
VITE_BRAND_COLORS='gold:#E9E28F/#E9E28F,apple:#1A2F40/#F2F9FF,link:#0066cc/#2997ff'
```

`.env` is not tracked in git — do not attempt to commit it.

- [ ] **Step 6: Regenerate and inspect the output**

Run: `pnpm vitest run --reporter=dot 2>/dev/null; npx tsx scripts/generate-theme-css.ts`
Expected: prints the two output paths.

Then verify the dark-theme defect is actually repaired:

```bash
grep -A2 -- '--color-link-9:' src/styles/theme.generated.css | head -20
grep -- '--color-link-contrast:\|--color-error-contrast:' src/styles/theme.generated.css
```

Expected: the second occurrence of each (the `.dark` block) is now `#000`, not `#fff`.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-theme-css.ts scripts/generate-theme-css.test.ts
git commit -m "feat(theme): always generate status scales; assert palette-wide AA"
```

---

### Task 5: The semantic token layer

The committed `tokens.css` that gives this whole change its point.

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/tokens.test.ts`
- Modify: `src/styles.css:1-3`

**Interfaces:**
- Consumes: every primitive emitted by Task 3/4 — `--color-gray-{1,2,11,12}`, `--color-gray-a{4,5,6,8,11}`, `--color-accent-{subtle,solid,contrast}`, `--color-accent-a3`, `--color-{success,warning,error}-{subtle,solid,contrast}`, `--color-background`, `--color-panel-bg`.
- Produces: the semantic classes the Task 7 codemod targets — `text-primary`, `text-secondary`, `text-tertiary`, and `text-{success,warning,error}-text`.

**Why `@theme static`:** Tailwind v4 only emits theme variables it sees used. The motion, element-size, and inset-shadow tokens here are consumed through `var()` in hand-written CSS, which Tailwind's class scanner does not see. `static` forces emission. Step 6 verifies this empirically rather than trusting it.

- [ ] **Step 1: Write `src/styles/tokens.css`**

```css
/* Semantic token layer.
 *
 * Vocabulary adapted from the Astryx design system
 * (https://astryx.atmeta.com/docs/tokens). We copy its token NAMES and tier
 * structure only — no dependency, no StyleX, and none of its colour or font
 * size values. All colour resolves to Radix scales generated from env by
 * scripts/generate-theme-css.ts.
 *
 * DEVIATION FROM ASTRYX: Astryx targets StyleX, where you write
 * var(--color-text-primary). Tailwind derives utilities from the --color-*
 * namespace, so that literal name would compile to the class
 * `text-text-primary`. We drop the role prefix wherever a Tailwind utility
 * already supplies it: --color-primary yields `text-primary`.
 *
 * DEVIATION FROM ASTRYX: its font SIZES are not adopted. They are tuned for a
 * dense internal tool and would take body copy to 12px and captions to 10px.
 * The semantic type tokens below carry Astryx's values; the --text-* t-shirt
 * ramp keeps Tailwind's defaults.
 *
 * No dark-mode block is needed. Every token is a var() onto a primitive that
 * theme.generated.css re-binds under .dark, and custom-property resolution is
 * per-scope, so these flip automatically.
 *
 * `static` because motion/size/inset-shadow tokens are consumed via var() in
 * hand-written CSS, which Tailwind's class scanner cannot see.
 */
@theme static {
  /* ---------- Foreground ---------- */
  --color-primary: var(--color-gray-12);
  --color-secondary: var(--color-gray-11);
  /* rmtp extension — Astryx has no tertiary. Resolves to gray-11, the same as
     secondary, and that is deliberate: Radix exposes exactly two AA-safe text
     steps (11 and 12). Step 10 is a solid-background step at ~3:1 and fails
     WCAG AA. Tertiary stays a distinct NAME so these sites can differentiate
     by weight or size rather than by contrast. */
  --color-tertiary: var(--color-gray-11);
  /* Below 4.5:1 by design — WCAG 1.4.3 exempts inactive UI components. Apply
     ONLY to genuinely disabled controls, never to de-emphasised active text
     (that is what --color-tertiary is for). */
  --color-disabled: var(--color-gray-a8);

  /* ---------- Surfaces ---------- */
  --color-body: var(--color-background);
  --color-surface: var(--color-panel-bg);
  --color-muted: var(--color-gray-2);
  --color-card: var(--color-gray-2);
  --color-popover: var(--color-gray-1);
  --color-inverted: var(--color-gray-12);

  /* ---------- Borders ---------- */
  --color-border: var(--color-gray-a6);
  --color-border-emphasized: var(--color-gray-a8);

  /* ---------- Accent and status ---------- */
  --color-accent: var(--color-accent-solid);
  --color-accent-muted: var(--color-accent-subtle);
  --color-on-accent: var(--color-accent-contrast);
  --color-success: var(--color-success-solid);
  --color-success-muted: var(--color-success-subtle);
  --color-on-success: var(--color-success-contrast);
  --color-warning: var(--color-warning-solid);
  --color-warning-muted: var(--color-warning-subtle);
  --color-on-warning: var(--color-warning-contrast);
  --color-error: var(--color-error-solid);
  --color-error-muted: var(--color-error-subtle);
  --color-on-error: var(--color-error-contrast);

  /* ---------- Interaction and misc ---------- */
  --color-overlay: var(--color-gray-a11);
  --color-overlay-hover: var(--color-gray-a3);
  --color-overlay-pressed: var(--color-gray-a4);
  --color-tint-hover: var(--color-accent-a3);
  --color-skeleton: var(--color-gray-a4);
  --color-track: var(--color-gray-a5);
  --color-shadow: var(--color-gray-a6);

  /* ---------- Radius ---------- */
  --radius-none: 0px;
  --radius-inner: 8px;
  --radius-element: 12px;
  --radius-container: 16px;
  --radius-chat: 28px;
  --radius-page: 32px;
  --radius-full: 9999px;

  /* Tailwind's t-shirt ramp retuned onto the same values, so unmigrated
     `rounded-lg` picks up the new geometry instead of drifting from it. */
  --radius-sm: 4px;
  --radius-md: var(--radius-inner);
  --radius-lg: var(--radius-element);
  --radius-xl: var(--radius-container);
  --radius-2xl: var(--radius-page);

  /* ---------- Semantic type ----------
     Astryx's exact size/weight/line-height. The --text-* t-shirt ramp is NOT
     retuned — see the deviation note above. */
  --text-display-1: 2.625rem;
  --text-display-1--line-height: 1.2381;
  --text-display-1--font-weight: 600;
  --text-display-2: 2.1875rem;
  --text-display-2--line-height: 1.2571;
  --text-display-2--font-weight: 600;
  --text-display-3: 1.8125rem;
  --text-display-3--line-height: 1.2414;
  --text-display-3--font-weight: 600;

  --text-h1: 1.5rem;
  --text-h1--line-height: 1.3333;
  --text-h1--font-weight: 600;
  --text-h2: 1.25rem;
  --text-h2--line-height: 1.4;
  --text-h2--font-weight: 600;
  --text-h3: 1.0625rem;
  --text-h3--line-height: 1.4118;
  --text-h3--font-weight: 600;
  --text-h4: 0.875rem;
  --text-h4--line-height: 1.4286;
  --text-h4--font-weight: 600;
  /* h5 (12px) and h6 (10px) are dense heading labels. Never use for body
     copy — --text-body and --text-supporting are the body defaults. */
  --text-h5: 0.75rem;
  --text-h5--line-height: 1.6667;
  --text-h5--font-weight: 600;
  --text-h6: 0.625rem;
  --text-h6--line-height: 1.6;
  --text-h6--font-weight: 600;

  --text-large: 1.0625rem;
  --text-large--line-height: 1.4118;
  --text-large--font-weight: 600;
  --text-body: 0.875rem;
  --text-body--line-height: 1.4286;
  --text-body--font-weight: 400;
  --text-label: 0.875rem;
  --text-label--line-height: 1.4286;
  --text-label--font-weight: 500;
  --text-code: 0.875rem;
  --text-code--line-height: 1.4286;
  --text-code--font-weight: 400;
  --text-supporting: 0.75rem;
  --text-supporting--line-height: 1.6667;
  --text-supporting--font-weight: 400;

  /* ---------- Elevation ----------
     Astryx publishes visual previews but not box-shadow values. These are
     OURS, not Astryx's — do not treat them as canonical. */
  --shadow-low: 0 1px 2px 0 var(--color-shadow);
  --shadow-med:
    0 2px 8px -1px var(--color-shadow), 0 1px 3px -1px var(--color-shadow);
  --shadow-high:
    0 8px 24px -4px var(--color-shadow), 0 2px 8px -2px var(--color-shadow);
  --shadow-md: var(--shadow-low);
  --shadow-lg: var(--shadow-med);
  --shadow-xl: var(--shadow-high);

  --shadow-inset-hover: inset 0 0 0 1px var(--color-border-emphasized);
  --shadow-inset-selected: inset 0 0 0 2px var(--color-accent);
  --shadow-inset-success: inset 0 0 0 1px var(--color-success);
  --shadow-inset-warning: inset 0 0 0 1px var(--color-warning);
  --shadow-inset-error: inset 0 0 0 1px var(--color-error);

  /* ---------- Motion ----------
     var()-consumed; Tailwind v4 has no --duration-* namespace. */
  --duration-fast-min: 130ms;
  --duration-fast: 175ms;
  --duration-fast-max: 230ms;
  --duration-medium-min: 310ms;
  --duration-medium: 410ms;
  --duration-medium-max: 550ms;
  --duration-slow-min: 730ms;
  --duration-slow: 975ms;
  --duration-slow-max: 1300ms;
  --ease-standard: cubic-bezier(0.24, 1, 0.4, 1);

  /* ---------- Element sizes ---------- */
  --size-element-sm: 28px;
  --size-element-md: 32px;
  --size-element-lg: 36px;
  --border-width: 1px;
}
```

- [ ] **Step 2: Import it from `src/styles.css`**

Change lines 1–3 of `src/styles.css` from:

```css
@import "tailwindcss";
@import "./styles/theme.generated.css";
@plugin "@tailwindcss/typography";
```

to:

```css
@import "tailwindcss";
/* Env-derived primitives (gitignored, regenerated by plugins/vite-theme.ts). */
@import "./styles/theme.generated.css";
/* Semantic layer built on those primitives (committed — review changes here). */
@import "./styles/tokens.css";
@plugin "@tailwindcss/typography";
```

- [ ] **Step 3: Write the referential-integrity test**

Create `src/styles/tokens.test.ts`:

```ts
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
    const unresolved = [...new Set(referenced)].filter(
      (name) => !defined.has(name) && !generatedCss.includes(`${name}:`),
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
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/styles/tokens.test.ts`
Expected: PASS. If "every var() reference resolves" fails, the listed token is a typo or is missing from the generator — fix the name, do not delete the assertion.

- [ ] **Step 5: Verify the build emits the var()-only tokens**

Run: `pnpm build`
Then confirm `static` did its job:

```bash
grep -rl -- '--duration-fast' .output/public/assets/*.css 2>/dev/null \
  || grep -rl -- '--duration-fast' dist/assets/*.css 2>/dev/null
```

Expected: at least one matching CSS file. If nothing matches, locate the built CSS bundle first (`find .output dist -name '*.css' 2>/dev/null | head`) and re-check before concluding `static` failed.

- [ ] **Step 6: Commit**

```bash
git add src/styles/tokens.css src/styles/tokens.test.ts src/styles.css
git commit -m "feat(theme): add committed semantic token layer"
```

---

### Task 6: Move stranded token blocks out of styles.css

`src/styles.css` mixes token definitions with component rules. The sidebar and scroll-area `@theme` blocks belong in `tokens.css`.

**Files:**
- Modify: `src/styles.css` (removes the `@theme` block at ~L330-359 and the one at ~L403-411)
- Modify: `src/styles/tokens.css` (gains them)

**Interfaces:**
- Consumes: `--color-accent-9`, `--color-gray-a7`, `--color-gray-a8`, `--radius-md`, `--ease-out-cubic`, `--spacing` — all already defined.
- Produces: no new names. This is a pure move; every token keeps its exact name and value so no consumer changes.

- [ ] **Step 1: Confirm current line numbers**

Run: `grep -n '@theme' src/styles.css`
Expected: three matches. The first is the sidebar block, the second the scroll-area block. Note the exact ranges before editing — the numbers above are from an earlier snapshot and the file may have shifted.

- [ ] **Step 2: Append both blocks to `tokens.css`**

Add at the end of `src/styles/tokens.css`, after the closing brace of the main block:

```css
/* Component-scoped tokens. These live here rather than beside their component
 * CSS so that every token in the app has one home. The component RULES that
 * consume them stay in styles.css. */
@theme static {
  /* sidebar spacing */
  --spacing-sidebar-row-block: calc(var(--spacing) * 2);
  --spacing-sidebar-row-inline: calc(var(--spacing) * 3);
  --spacing-sidebar-lesson-indent: calc(var(--spacing) * 6);
  --spacing-sidebar-row-gap: calc(var(--spacing) * 1);
  --spacing-sidebar-section-gap: calc(var(--spacing) * 3);

  /* sidebar shape */
  --radius-sidebar-row: var(--radius-md);

  /* sidebar static tokens (no utility generation) */
  --border-width-sidebar-active: 2px;
  --outline-width-sidebar-focus: 2px;
  --outline-offset-sidebar-focus: 2px;
  --color-sidebar-focus-ring: var(--color-accent-9);

  /* sidebar animation */
  --duration-sidebar-chevron: 200ms;
  --duration-sidebar-reveal: 320ms;
  --duration-sidebar-shimmer: 1400ms;
  --ease-sidebar: var(--ease-out-cubic);
  --blur-sidebar-reveal: 2px;
  --sidebar-skeleton-row-opacity-step: 0.12;

  /* sidebar skeleton row heights */
  --block-size-sidebar-skeleton-header: calc(var(--spacing) * 10);
  --block-size-sidebar-skeleton-module: calc(var(--spacing) * 9);
  --block-size-sidebar-skeleton-lesson: calc(var(--spacing) * 7);

  /* scroll area shape + color */
  --size-scroll-area-thumb: calc(var(--spacing) * 1.5);
  --spacing-scroll-area-thumb-inset: 2px;
  --radius-scroll-area-thumb: 9999px;
  --color-scroll-area-thumb: var(--color-gray-a7);
  --color-scroll-area-thumb-hover: var(--color-gray-a8);
  --duration-scroll-area-thumb: 160ms;
}
```

Note `--ease-sidebar: var(--ease-out-cubic)` depends on `--ease-out-cubic`, which is declared on `html` in `styles.css`'s base layer, not in `@theme`. That already worked before the move and still does — `var()` resolves at use time against the element, and every consumer is inside the document. The referential-integrity test in Task 5 tolerates this because `--ease-out-cubic` is neither defined in `tokens.css` nor in the generated CSS — so **extend the test's allow-list in the next step** rather than letting it fail.

- [ ] **Step 3: Extend the integrity test's known-external list**

In `src/styles/tokens.test.ts`, replace the `unresolved` filter with:

```ts
    // Declared on `html` in styles.css's base layer, not in @theme.
    const externalPrimitives = new Set(['--ease-out-cubic', '--spacing'])
    const unresolved = [...new Set(referenced)].filter(
      (name) =>
        !defined.has(name) &&
        !externalPrimitives.has(name) &&
        !generatedCss.includes(`${name}:`),
    )
```

- [ ] **Step 4: Delete both blocks from `styles.css`**

Remove the two `@theme { … }` blocks identified in Step 1 in their entirety, including their closing braces. Leave the third `@theme` block if one remains, and leave every `@layer components` block untouched.

- [ ] **Step 5: Verify nothing was lost**

```bash
grep -c -- '--spacing-sidebar-row-block\|--color-scroll-area-thumb:' src/styles/tokens.css
grep -c -- '--spacing-sidebar-row-block\|--color-scroll-area-thumb:' src/styles.css
```

Expected: `2` from `tokens.css`, `0` from `styles.css`.

- [ ] **Step 6: Run tests and build**

Run: `pnpm test && pnpm build`
Expected: PASS, and the build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/styles.css src/styles/tokens.css src/styles/tokens.test.ts
git commit -m "refactor(theme): move component token blocks into tokens.css"
```

---

### Task 7: Codemod raw colour-step classes

~300 mechanical swaps across ~72 files, in one reviewable commit.

**Files:**
- Modify: ~72 `.tsx` files under `src/`

**Interfaces:**
- Consumes: `text-primary`, `text-secondary`, `text-tertiary` (Task 5); `text-{success,warning,error}-text` (Tasks 3 and 4).
- Produces: no new interfaces.

Verified pre-flight: no `.ts`, `.test.tsx`, or `.stories.tsx` file contains any target class, so no assertions can break. Variant-prefixed forms (`hover:text-gray-12` 31×, `aria-pressed:text-gray-12` 2×, `aria-selected:` 1×, `data-selected:` 1×, `hover:text-red-11` 4×) are handled by the `\b` boundary. `text-gray-1` (single digit, 4 occurrences) is not in the mapping and `\b` prevents it being touched.

- [ ] **Step 1: Record the before-state**

```bash
grep -rcE '\b(text-gray-1[012]|text-red-11|text-green-11|text-amber-11)\b' src --include='*.tsx' | wc -l
grep -rhoE '\b(text-gray-1[012]|text-red-11|text-green-11|text-amber-11)\b' src --include='*.tsx' | sort | uniq -c
```

Expected: 72 files; counts approximately `text-gray-12` 128, `text-gray-11` 81, `text-gray-10` 50, `text-red-11` 34, `text-green-11` 5, `text-amber-11` 2.

- [ ] **Step 2: Run the codemod**

`perl` is used rather than `sed` because BSD/macOS `sed` has no `\b`.

```bash
find src -name '*.tsx' -print0 | xargs -0 perl -pi -e '
  s/\btext-gray-12\b/text-primary/g;
  s/\btext-gray-11\b/text-secondary/g;
  s/\btext-gray-10\b/text-tertiary/g;
  s/\btext-red-11\b/text-error-text/g;
  s/\btext-green-11\b/text-success-text/g;
  s/\btext-amber-11\b/text-warning-text/g;
'
```

- [ ] **Step 3: Verify no target class survives**

```bash
grep -rnE '\b(text-gray-1[012]|text-red-11|text-green-11|text-amber-11)\b' src --include='*.tsx'
```

Expected: no output (exit code 1).

- [ ] **Step 4: Verify `text-gray-1` was not collateral damage**

```bash
grep -rcE '\btext-gray-1\b' src --include='*.tsx' | awk -F: '{s+=$2} END {print s}'
```

Expected: `4` — unchanged from the pre-flight count.

- [ ] **Step 5: Format, lint, test, build**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all PASS. Biome may reformat class strings — that is fine, keep it.

- [ ] **Step 6: Commit**

`src/common/config.ts` is untracked, so `git add src` would wrongly stage it. Stage only files git already tracks as modified:

```bash
git add $(git diff --name-only -- 'src/**/*.tsx')
git commit -m "refactor(ui): migrate raw colour steps to semantic tokens"
```

Confirm before committing that `git status --short` shows `src/common/config.ts` still as `??`, not `A`.

---

### Task 8: Hand-review the ambiguous cases

The ~11 solid-background usages and the CSS-side `var()` references are judgement calls, not swaps.

**Files:**
- Modify: whichever files Steps 1 and 3 surface
- Modify: `src/components/admin/delete-module-confirm-form.tsx`

**Interfaces:**
- Consumes: `--color-inverted`, `--color-on-error`, `--color-error` (Task 5).
- Produces: no new interfaces.

- [ ] **Step 1: List the solid-background cases**

```bash
grep -rnE '\bbg-(gray-1[02]|red-10)\b' src --include='*.tsx'
```

Expected: ~11 lines — `bg-gray-12` 6×, `bg-gray-10` 3×, `bg-red-10` 2×.

- [ ] **Step 2: Convert each one individually**

Read each line in context and choose:

- `bg-gray-12` as an inverted surface (dark chip, tooltip, badge) → `bg-inverted`. Its text is almost certainly `text-gray-1`; leave that, since `--color-inverted` is gray-12 and gray-1 is the correct foreground on it.
- `bg-gray-10` → judge case by case. A solid neutral fill stays a raw step; there is no semantic token for it and inventing one is out of scope.
- `bg-red-10` is the *hover* step for a solid red fill. If the element also has `bg-red-9`, the pair becomes `bg-error hover:bg-error-solid`… which is wrong — `--color-error` already **is** step 9. Leave `bg-red-9`/`bg-red-10` hover pairs as raw steps and note it; there is no step-10 semantic token by design.

Do not force a token where none fits. Raw steps are a documented escape hatch.

- [ ] **Step 3: List the CSS-side references**

```bash
grep -n 'var(--color-gray-1[012])\|var(--color-accent-9)' src/styles.css
```

- [ ] **Step 4: Convert only the genuinely semantic ones**

**Critical — do not codemod this file.** `.video-player` deliberately uses `--color-gray-12` as a *background* for an always-dark slab and `--color-gray-1` as its *foreground*, inverting both under `.dark` (see the comments around the `.video-player` and `.vp-video-area` rules). Converting those to `--color-primary` would invert the component.

Safe conversions, where the token is used as text on the page background:
- `.unsupported-screen { color: var(--color-gray-12) }` → `var(--color-primary)`
- `.unsupported-screen__body { color: var(--color-gray-11) }` → `var(--color-secondary)`
- `.lesson-header__title { color: var(--color-gray-12) }` → `var(--color-primary)`
- `.lesson-card__heading`, `.material-prose h1`–`h4`, `.material-prose strong` → `var(--color-primary)`
- `.lesson-empty`, `.lesson-card`, `.material-prose blockquote` colour → `var(--color-secondary)`
- `.lesson-header__skeleton`, `.lesson-skeleton-player`, `.lesson-material-skeleton-*` backgrounds using `--color-gray-a4` → `var(--color-skeleton)`

Leave every `--color-gray-12` / `--color-gray-1` inside a `.video-player` or `.vp-*` rule exactly as it is.

- [ ] **Step 5: Remove the contrast workaround**

`src/components/admin/delete-module-confirm-form.tsx` hardcodes `text-black` on its solid red button because `--color-red-contrast` could not be trusted. Task 2 fixed that. Find the destructive button and replace the `bg-red-9 text-black` pair with `bg-error text-on-error`.

Verify the token now resolves correctly:

```bash
grep -c -- '--color-error-contrast:' src/styles/theme.generated.css
```

Expected: at least 2 (light block and `.dark` block). Confirm the `.dark` occurrence is `#000`.

- [ ] **Step 6: Full verification**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all PASS.

- [ ] **Step 7: Visual pass**

Run `pnpm dev` and check in both light and dark themes:
- the destructive delete-module button — label legible on the red fill
- a sidebar row, a lesson card, an admin form — radius now 12px where it was 8px
- the video player — still an always-dark slab with light text, unchanged
- any empty state or hint text — now `gray-11`, visibly darker than before

- [ ] **Step 8: Commit**

```bash
git add $(git diff --name-only -- src)
git commit -m "refactor(ui): convert semantic CSS colours; drop contrast workaround"
```

---

## Self-Review

**Spec coverage.** Architecture split → Task 5. Semantic colours → Task 5. Step-role matrix → Task 3. Status colours with defaults → Tasks 1 and 4. Radius → Task 5. Typography (semantic tokens, no ramp retune) → Task 5. Elevation → Task 5. Motion and sizes → Task 5. Spacing out of scope → not implemented, correct. Generator changes 1–5 → Tasks 1, 3, 4, and 2 respectively; `buildAliasBlock` suffixes → Task 3 Step 4. Migration codemod → Task 7; hand review → Task 8; CSS files hand-review-only → Task 8 Step 4. Testing → Tasks 1–5. `accentContrast` defect → Task 2, verified in Task 4. Stranded `@theme` blocks → Task 6.

**Deviations from the spec, deliberate.** The spec said the env cap "changes from at most 12 total to at most 12 user-declared". In fact the merge happens in `generateTheme()` *after* Zod validation, so the cap already counts user-declared entries; Task 1 Step 5 corrects only the misleading message. Noted here so a reviewer does not read it as a missed requirement.

**Type consistency.** `mergeStatusDefaults(entries: BrandEntry[]): BrandEntry[]` — defined Task 1, called Task 4 Step 3 and in the Task 4 and Task 5 tests. `resolveContrast(step9: string, candidate: string): string` — defined Task 2, called Task 3 Step 3. `buildScaleBlock(name, scale: ScaleInput)` and `buildAliasBlock(fromName, toName)` keep their existing signatures. `checkContrast(fg, bg)` returns `{ wcagAA, wcagAALarge, ratio }` and is used consistently as `.wcagAA` in Task 2 and `.ratio` in Task 4.

**Known ordering constraint.** Task 7's codemod emits `text-error-text`, `text-success-text`, and `text-warning-text`, which only resolve once Tasks 3 and 4 have shipped the status scales and step-role tokens. Tasks must run in order.
