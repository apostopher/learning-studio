# Astryx-derived token architecture

Date: 2026-07-27
Branch: `feat/astryx-tokens`
Status: approved design, ready for planning

## Summary

The theme system generates Radix colour scales from env vars and nothing else.
Components consume raw scale steps directly, and every non-colour dimension
(radius, type, elevation, motion) is a stock Tailwind default. A theme can
therefore change hue, but not shape, density, or feel.

This design adds a semantic token tier modelled on the
[Astryx token system](https://astryx.atmeta.com/docs/tokens), and adopts its
radius, type, elevation, and motion scales. **We are not adopting Astryx
itself** — no dependency, no StyleX, no Astryx colour values. We are copying
its token vocabulary and tier structure and binding it to our own generated
Radix primitives.

## Current state

`plugins/vite-theme.ts` calls `generateTheme()` from
`scripts/generate-theme-css.ts` on `buildStart`, on dev-server boot, and when
`.env` changes. That writes two gitignored artefacts:

- `src/styles/theme.generated.css` — `@theme` block with 12-step Radix scales
  (solid + alpha + `contrast` + `surface`) for `gray` and each entry in
  `VITE_BRAND_COLORS`, a `.dark` override block, and a P3 `@supports` block.
  `accent` is aliased to the first brand entry.
- `src/styles/theme.generated.ts` — app title, font link hrefs, logos, brand names.

Current config: `VITE_BRAND_COLORS='gold:…,apple:…,link:…,red:…'`, so the
generated scales are `gray`, `gold`, `apple`, `link`, `red`, plus the `accent`
alias onto `gold`.

### Problems this design addresses

1. **No semantic tier.** Components name raw steps: `text-gray-12` 128×,
   `text-gray-11` 81×, `text-gray-10` 50×, `text-red-11` 34×, and
   `var(--color-gray-12)` 20× / `var(--color-accent-9)` 18× inside
   `src/styles.css`. Redefining "muted text" means editing ~72 files.

2. **Dead colour classes.** `text-green-11` (5×) and `text-amber-11` (2×)
   reference scales that are never generated — only gold/apple/link/red/gray
   exist. Tailwind emits no rule, so that text silently inherits its parent
   colour. Nothing catches it.

3. **Only colour is themeable.** `rounded-lg` 62×, `rounded-md` 38×,
   `rounded-xl` 18×, `text-sm` 165×, `text-xs` 44×, `shadow-xl` 10× are all
   Tailwind stock values, untouched by the theme.

4. **Theme decisions are unreviewable.** `src/styles/theme.generated.*` is
   gitignored (`.gitignore:15`). No diff ever shows what changed about the
   theme.

5. **Token definitions are stranded in component CSS.** `src/styles.css` is
   1049 lines and contains three `@theme` blocks (sidebar tokens L330–359,
   scroll-area tokens L403–411) interleaved with component rules.

6. **The generated `contrast` tokens are not AA-safe.** `--color-red-contrast`
   and `--color-link-contrast` are `#fff` in dark theme, scoring 3.43 and 3.02
   against their step-9 fills. Solid destructive and link buttons are illegible
   in dark mode unless a component hardcodes `text-black`, which one already
   does. Nothing detects this.

## Architecture

```
src/styles.css
  @import "tailwindcss";
  @import "./styles/theme.generated.css";   gitignored — env-derived PRIMITIVES
  @import "./styles/tokens.css";            committed — SEMANTIC layer   [new]
  @plugin "@tailwindcss/typography";
```

The split is **by what depends on env**, not by token category.

**`theme.generated.css`** — Radix scales for gray, each brand, and the three
status hues; the per-brand step-role matrix; `--color-background`,
`--color-panel-bg`, `--color-shell-bg`; font families; the `.dark` block; the
P3 `@supports` block.

**`src/styles/tokens.css`** (new, committed) — every role-only semantic colour,
the radius scale, type scale, elevation, motion, and element sizes. Also
absorbs the two stranded `@theme` blocks from `styles.css`.

### Dark mode needs no work in the semantic layer

Every semantic token is defined as `var(--color-gray-N)` or similar. The
generated `.dark` block re-binds those primitives, and custom-property
resolution is per-scope, so `--color-primary` flips automatically. The
semantic layer is written once and is theme-agnostic by construction.

**Decision: do not adopt `light-dark()`.** Astryx uses it, but our existing
`.dark` cascade already produces the same result, and switching would raise
the browser floor for no gain.

### Naming: adapted to Tailwind's utility grammar

Astryx targets StyleX, where you write `var(--color-text-primary)`. Tailwind v4
derives utilities from the `--color-*` namespace, so a literal
`--color-text-primary` compiles to the class `text-text-primary`.

**We drop the role prefix wherever a Tailwind utility already supplies the
role.** `--color-primary` → `text-primary`. `--color-surface` → `bg-surface`.
This deviation is documented at the top of `tokens.css`.

The per-brand matrix is the one place the prefix cannot simply be dropped —
each brand needs four differently-roled tokens. There we name by **what the
Radix step is**, not by which utility consumes it (see below).

### Tailwind v4 namespaces actually in play

Real namespaces that generate utilities: `--color-*`, `--radius-*`, `--text-*`,
`--shadow-*`, `--ease-*`. There is no `--duration-*` or `--size-element-*`
namespace. Motion and element-size tokens are therefore consumed via `var()`,
which matches existing repo precedent — `--duration-scroll-area-thumb` and
`--size-scroll-area-thumb` are already `var()`-only.

## Token specification

### Semantic colours (`tokens.css`)

```css
@theme {
  /* Foreground */
  --color-primary:   var(--color-gray-12);
  --color-secondary: var(--color-gray-11);
  --color-tertiary:  var(--color-gray-11);   /* rmtp extension, see note */
  --color-disabled:  var(--color-gray-a8);   /* exempt from 1.4.3, see note */

  /* Surfaces */
  --color-body:     var(--color-background);
  --color-surface:  var(--color-panel-bg);
  --color-muted:    var(--color-gray-2);
  --color-card:     var(--color-gray-2);
  --color-popover:  var(--color-gray-1);
  --color-inverted: var(--color-gray-12);

  /* Borders */
  --color-border:            var(--color-gray-a6);
  --color-border-emphasized: var(--color-gray-a8);

  /* Accent + status: solid / muted / on- triplets, aliased onto the matrix */
  --color-accent:        var(--color-accent-solid);
  --color-accent-muted:  var(--color-accent-subtle);
  --color-on-accent:     var(--color-accent-contrast);
  --color-success:       var(--color-success-solid);
  --color-success-muted: var(--color-success-subtle);
  --color-on-success:    var(--color-success-contrast);
  --color-warning:       var(--color-warning-solid);
  --color-warning-muted: var(--color-warning-subtle);
  --color-on-warning:    var(--color-warning-contrast);
  --color-error:         var(--color-error-solid);
  --color-error-muted:   var(--color-error-subtle);
  --color-on-error:      var(--color-error-contrast);

  /* Interaction + misc */
  --color-overlay:         var(--color-gray-a11);   /* modal scrim */
  --color-overlay-hover:   var(--color-gray-a3);
  --color-overlay-pressed: var(--color-gray-a4);
  --color-tint-hover:      var(--color-accent-a3);
  --color-skeleton:        var(--color-gray-a4);
  --color-track:           var(--color-gray-a5);
  --color-shadow:          var(--color-gray-a6);
}
```

Notes:

- **`--color-tertiary` is an addition Astryx does not have.** Astryx offers
  primary/secondary/disabled only. Our 50 `text-gray-10` sites are tertiary
  meta-text (counts, timestamps, hints, empty-state copy, placeholder icons),
  not disabled controls; labelling them `disabled` would be wrong.

  **It resolves to `gray-11`, the same value as `--color-secondary`, and this
  is deliberate.** Radix's gray scale exposes exactly two text steps: 11
  (`low-contrast text`, ≥4.5:1) and 12 (`high-contrast text`). Step 10 is a
  *solid background* step at roughly 3:1 and was never intended to carry text —
  which is why the current 50 sites fail WCAG AA. An AA-compliant three-level
  text hierarchy does not exist in colour alone on this scale. `tertiary` is
  kept as a distinct **name** so those sites stay semantically labelled and can
  be differentiated by weight or size rather than by contrast.

  Consequence: those 50 sites render visibly darker than today. That is the
  intended fix, not a regression.
- **`--color-disabled` at `gray-a8` is below 4.5:1 and that is correct.**
  WCAG 1.4.3 explicitly exempts inactive user-interface components from
  contrast minimums. This token must only be applied to genuinely disabled
  controls — never to de-emphasised active text, which is what `tertiary` is
  for.
- `--color-skeleton: gray-a4` is not a new decision. It is the value
  `.lesson-skeleton-player`, `.lesson-header__skeleton`, and the material
  skeletons already hardcode.

### Per-brand step-role matrix (generated)

For **every** generated scale `N` (brands and status hues alike), emit four
tokens named for what the Radix step is:

```css
--color-N-subtle: var(--color-N-3);    /* bg-N-subtle     */
--color-N-border: var(--color-N-6);    /* border-N-border */
--color-N-solid:  var(--color-N-9);    /* bg-N-solid      */
--color-N-text:   var(--color-N-11);   /* text-N-text — see caveat below */
```

**`-text` is adaptive, not fixed at step 11.** Radix guarantees step 11 clears
4.5:1 against steps 1–2, *not* step 3. Measured against the real palette, three
of six light-theme scales fail `text` on their own `subtle` fill:

| scale | text (step 11) | subtle (step 3) | ratio | |
| --- | --- | --- | --- | --- |
| `gold` (= accent) | `#7e7612` | `#f8f6cd` | 4.246 | fail |
| `warning` | `#a96600` | `#fff0cb` | 4.050 | fail |
| `success` | `#00814c` | `#e5f6eb` | 4.409 | fail |
| `apple` / `link` / `error` | | | 4.66–4.77 | pass |

Dark theme passes everywhere (7.0–11.6). This is a **live defect**, not a
hypothetical: `.sidebar-row-active` (`src/styles.css`) already pairs
`--color-accent-3` with `--color-accent-11`, so the active lesson row ships at
4.246:1.

The generator therefore measures step 11 against step 3 and emits **step 12**
when step 11 fails — the same measure-don't-trust principle applied to
`--color-N-contrast`. Scales already safe at step 11 keep it.

The decision must be computed **once from the sRGB values and reused for the
wide-gamut block**. Measuring each gamut independently would let a scale near
the threshold resolve differently in P3 than in sRGB, so wide-gamut browsers
would render a different text colour from everyone else.

`text-N-text` and `border-N-border` stutter. Accepted: the naming is
unambiguous, and the alternative (`text-text-gold`) is worse.

These are emitted in both the base `@theme` block and the P3 `@supports` block,
and inherit dark-mode flipping from the primitives.

### Status colours

`success`, `warning`, and `error` become **reserved brand names** with built-in
default seeds. If declared in `VITE_BRAND_COLORS` the declaration wins;
otherwise the generator supplies the default and generates the scale anyway, so
status tokens can never be missing.

| Name | default light | default dark |
| --- | --- | --- |
| `success` | `#30a46c` | `#3dd68c` |
| `warning` | `#f5a524` | `#ffb224` |
| `error` | `#cb0d39` | `#f44f5f` |

The existing `red` entry folds into `error` — its current values are exactly
the `error` defaults, so `VITE_BRAND_COLORS` drops `red:…` entirely.

This reinstates a `RESERVED_BRAND_NAMES`-style export in
`src/utils/brand-colors.ts`. Note that the current working tree **removed** that
export; this design brings the concept back serving a different purpose
(defaulting rather than forbidding).

### Radius

Semantic tokens plus a retune of the t-shirt aliases onto the same ramp, so
unmigrated code picks up the new geometry and stays coherent.

| Token | Value | Tailwind alias retuned | was | usages |
| --- | --- | --- | --- | --- |
| `--radius-none` | `0px` | — | | |
| — | `4px` | `--radius-sm` | `0.25rem` | |
| `--radius-inner` | `8px` | `--radius-md` | `0.375rem` | 38× |
| `--radius-element` | `12px` | `--radius-lg` | `0.5rem` | 62× |
| `--radius-container` | `16px` | `--radius-xl` | `0.75rem` | 18× |
| `--radius-chat` | `28px` | — | | |
| `--radius-page` | `32px` | `--radius-2xl` | `1rem` | 5× |
| `--radius-full` | `9999px` | unchanged | | 19× |

### Typography

**Decision: do NOT retune Tailwind's ramp. Add semantic tokens only.**

Legibility is a hard requirement for this product, and Astryx's ramp is tuned
for a dense internal tool — adopting it would take body copy to 12px and
captions to 10px across 209 usages. Rejected.

No retune is needed anyway, because the semantic tokens already coincide with
what the codebase uses:

| Astryx semantic | value | current Tailwind equivalent |
| --- | --- | --- |
| Body | `0.875rem / 400 / 1.4286` | `text-sm` — identical, including the line-height Tailwind v4 already computes |
| Supporting | `0.75rem / 400` | `text-xs` — identical size |
| H1 | `1.5rem / 600` | `text-2xl` — identical size |
| H2 | `1.25rem / 600` | `text-xl` — identical size |

`--text-xs` … `--text-5xl` keep their Tailwind defaults untouched. The
sub-`xs` sizes from Astryx's ramp (`4xs` 6px, `3xs` 7px, `2xs` 8px) are **not
added** — there is no legitimate use for 6–8px text here and defining the
tokens would only invite it.

Fourteen semantic type tokens at Astryx's exact values, using Tailwind v4's
`--text-*--line-height` and `--text-*--font-weight` modifiers:

| Token | Size | Weight | Line-height |
| --- | --- | --- | --- |
| `--text-display-1` | `2.625rem` | 600 | `1.2381` |
| `--text-display-2` | `2.1875rem` | 600 | `1.2571` |
| `--text-display-3` | `1.8125rem` | 600 | `1.2414` |
| `--text-h1` | `1.5rem` | 600 | `1.3333` |
| `--text-h2` | `1.25rem` | 600 | `1.4` |
| `--text-h3` | `1.0625rem` | 600 | `1.4118` |
| `--text-h4` | `0.875rem` | 600 | `1.4286` |
| `--text-h5` | `0.75rem` | 600 | `1.6667` |
| `--text-h6` | `0.625rem` | 600 | `1.6` |
| `--text-large` | `1.0625rem` | 600 | `1.4118` |
| `--text-body` | `0.875rem` | 400 | `1.4286` |
| `--text-label` | `0.875rem` | 500 | `1.4286` |
| `--text-code` | `0.875rem` | 400 | `1.4286` |
| `--text-supporting` | `0.75rem` | 400 | `1.6667` |

`--text-h5` (12px) and `--text-h6` (10px) are dense heading labels. They must
not be used for body copy; `--text-body` and `--text-supporting` are the body
defaults.

### Elevation

**Astryx publishes visual previews but not box-shadow values.** The values below
are ours, not Astryx's, and `tokens.css` will say so in a comment.

```css
--shadow-low:  0 1px 2px 0 var(--color-shadow);
--shadow-med:  0 2px 8px -1px var(--color-shadow), 0 1px 3px -1px var(--color-shadow);
--shadow-high: 0 8px 24px -4px var(--color-shadow), 0 2px 8px -2px var(--color-shadow);

--shadow-inset-hover:    inset 0 0 0 1px var(--color-border-emphasized);
--shadow-inset-selected: inset 0 0 0 2px var(--color-accent);
--shadow-inset-success:  inset 0 0 0 1px var(--color-success);
--shadow-inset-warning:  inset 0 0 0 1px var(--color-warning);
--shadow-inset-error:    inset 0 0 0 1px var(--color-error);
```

`--shadow-md` / `-lg` / `-xl` retune onto `low` / `med` / `high` respectively.

### Motion and sizes

All nine duration tokens at Astryx's exact values — `--duration-fast-min`
`130ms`, `--duration-fast` `175ms`, `--duration-fast-max` `230ms`,
`--duration-medium-min` `310ms`, `--duration-medium` `410ms`,
`--duration-medium-max` `550ms`, `--duration-slow-min` `730ms`,
`--duration-slow` `975ms`, `--duration-slow-max` `1300ms` — plus
`--ease-standard: cubic-bezier(0.24, 1, 0.4, 1)`.

The 18 existing hand-rolled `--ease-*-quad/cubic/quart/quint/expo/circ` curves
in `styles.css` stay as they are; `--ease-standard` joins them.

Element sizes: `--size-element-sm` `28px`, `--size-element-md` `32px`,
`--size-element-lg` `36px`. `--border-width: 1px`.

### Out of scope: spacing

Astryx's spacing scale is byte-identical to Tailwind's default 4px ramp
(`--spacing-2` = 8px = `gap-2`, `--spacing-4` = 16px = `p-4`,
`--spacing-12` = 48px = `p-12`, including the `0-5`/`1-5` half-steps). The
existing `gap-2` / `px-4` / `p-6` usages are *already* Astryx spacing. No tokens
to add, nothing to retune, nothing to migrate.

## Generator changes

`scripts/generate-theme-css.ts`:

1. Merge the three reserved status seeds over the parsed `VITE_BRAND_COLORS`
   entries before generating scales.
2. `buildScaleBlock` emits the four step-role tokens per scale, in both the
   base and P3 blocks.
3. **`buildAliasBlock` must alias the four new suffixes too.** `accent` is not
   a generated scale — it is an alias block pointing at the first brand entry
   (currently `gold`). Without this, `--color-accent-solid` and
   `--color-accent-subtle` would not exist, and the `--color-accent` /
   `--color-accent-muted` semantic tokens defined in `tokens.css` would resolve
   to nothing. The alias block's suffix list grows from
   `1..12, a1..a12, contrast, surface` to additionally cover
   `subtle, border, solid, text`.
4. `--color-shadow` needs a concrete primitive; it resolves through
   `--color-gray-a6`, which the gray scale already provides.

5. **Replace `accentContrast` with a measured AA-safe label colour.**
   `generateRadixColors` returns an `accentContrast` that is not guaranteed to
   clear 4.5:1. Measured against the current palette:

   | scale | step 9 | `contrast` | ratio | |
   | --- | --- | --- | --- | --- |
   | light `red` | `#cb0d39` | `#fff` | 5.74 | pass |
   | light `link` | `#06c` | `#fff` | 5.57 | pass |
   | light `gold` | `#d9cc3d` | `#25230a` | 9.56 | pass |
   | light `apple` | `#1a2f40` | `#fff` | 13.77 | pass |
   | **dark `red`** | `#f44f5f` | `#fff` | **3.43** | **fail** (black = 6.13) |
   | **dark `link`** | `#2997ff` | `#fff` | **3.02** | **fail** (black = 6.96) |
   | dark `gold` | `#e9e28f` | `#25230a` | 11.89 | pass |
   | dark `apple` | `#f2f9ff` | `#0f2433` | 14.97 | pass |

   `buildScaleBlock` must therefore compute `--color-N-contrast` itself:
   measure the candidate against step 9 and fall back to whichever of
   black/white scores higher when `accentContrast` fails 4.5:1. This is what
   makes `--color-on-error` trustworthy in dark theme.

   This defect is already known in the codebase and worked around by hand —
   `src/components/admin/delete-module-confirm-form.tsx` hardcodes
   `text-black` on its solid red button precisely because the token could not
   be trusted. That workaround can be removed once the token is correct.

`src/utils/brand-colors.ts`: reintroduce `RESERVED_BRAND_NAMES` alongside a
`STATUS_DEFAULTS` map.

`src/env.ts`: the entry cap changes from "at most 12 total" to "at most 12
user-declared", since up to 3 reserved entries are merged in afterwards and
should not crowd out brand slots.

## Migration

### Codemod (mechanical, one commit, 72 files)

| From | To | Count |
| --- | --- | --- |
| `text-gray-12` | `text-primary` | 128 |
| `text-gray-11` | `text-secondary` | 81 |
| `text-gray-10` | `text-tertiary` | 50 |
| `text-red-11` | `text-error-text` | 34 |
| `text-green-11` | `text-success-text` | 5 (currently dead) |
| `text-amber-11` | `text-warning-text` | 2 (currently dead) |

### Hand review (~11 sites)

`bg-gray-12` (6×), `bg-gray-10` (3×), `bg-red-10` (2×) are solid surfaces, not
text. Each is read individually; `bg-gray-12` is most likely `bg-inverted`.

### CSS files: hand review only, never codemod

`src/styles.css` uses `var(--color-gray-12)` 20× and `var(--color-accent-9)`
18×, but a mechanical swap would be **wrong**. The video player deliberately
uses `--color-gray-12` as a *background* for an always-dark slab and
`--color-gray-1` as its *foreground*, inverting both under `.dark`
(`styles.css` L478–540). Converting those to `--color-primary` would invert the
component. Every CSS-side conversion is reviewed by hand.

### Escape hatch

Raw scale steps (`bg-gold-3`, `text-gray-11`) remain legal and documented. No
lint rule is added in this change.

## Testing

Extend `scripts/generate-theme-css.test.ts`:

- the four step-role tokens are emitted for every scale, in base and P3 blocks
- `buildAliasBlock` aliases the four step-role suffixes, so
  `--color-accent-solid` / `-subtle` / `-border` / `-text` resolve
- status defaults are filled in when absent from `VITE_BRAND_COLORS`
- a user-declared `success`/`warning`/`error` overrides the default
- the 12-entry cap counts user-declared entries only

New contrast suite — **AA is a hard product requirement, so it is enforced in
CI across every text token, not just the `on-*` pairs.** All assertions run in
both light and dark appearance, using the `checkContrast` helper in
`src/utils/colors.ts`.

1. **Labels on solid fills** — `--color-on-accent`, `--color-on-success`,
   `--color-on-warning`, `--color-on-error`, and every `--color-N-contrast`
   clear 4.5:1 against their paired step-9 solid.

   **This assertion fails on the current palette** — see the
   `accentContrast` defect below.
2. **Body text on page and panel** — `--color-primary`, `--color-secondary`,
   and `--color-tertiary` each clear 4.5:1 against both `--color-body` and
   `--color-surface`. This is the assertion that would have caught the existing
   `text-gray-10` failures.
3. **Text on tinted surfaces** — for every generated scale, `--color-N-text`
   clears 4.5:1 against `--color-N-subtle` (step 3) and against `--color-body`.
   Covers `bg-error-subtle text-error-text` alert patterns.

   **This assertion failed on first run** and exposed the step-11 defect
   described above. It is what forced `-text` to become adaptive.

4. **Gamut agreement** — for a scale that falls back to step 12, the base
   `@theme` block and the `@supports (color: oklch(0 0 0))` block select the
   same step, so wide-gamut browsers do not diverge.
5. **`--color-disabled` is explicitly excluded** with a comment citing the
   WCAG 1.4.3 inactive-component exemption, so its absence reads as deliberate
   rather than an oversight.

Because these run against generated output, they also guard future brand
changes: a new `VITE_BRAND_COLORS` value that produces an illegible pairing
fails the build rather than shipping.

Test constraints to respect (existing repo behaviour): vitest cannot resolve the
`@/` alias — use `#/`. Presentational components under render-test must stay
hookless.

## Accessibility position

Legibility and WCAG AA are hard requirements for this product, not tradeoffs.
Two consequences run through this design:

- Astryx's type ramp is **not** adopted; its sizes are tuned for a dense
  internal tool and would take body copy to 12px and captions to 10px. The
  semantic type vocabulary is adopted without the sizes.
- The 50 existing sub-AA `text-gray-10` sites are **fixed** as part of this
  work, not carried forward. `--color-tertiary` resolves to `gray-11`.
- The two sub-AA `contrast` tokens (dark `red`, dark `link`) are **fixed** by
  computing the label colour from a measured ratio instead of trusting
  `generateRadixColors`.
- The sub-AA `text`-on-`subtle` pairings (light `gold`, `success`, `warning`)
  are **fixed** by making `-text` fall back to step 12 when step 11 fails. This
  repairs the live `.sidebar-row-active` failure.

AA is enforced by the contrast suite above, so regressions fail the build.
Four existing defects are repaired as part of this work rather than
grandfathered: the 50 `text-gray-10` sites, the two dark-theme `contrast`
tokens, the three light-theme `text`-on-`subtle` pairings, and the dead
`text-green-11` / `text-amber-11` classes.

## Accepted tradeoffs

1. **Tertiary and secondary text share a colour.** Radix offers only two
   AA-safe text steps, so a three-level hierarchy has to be expressed through
   weight or size instead. The names stay distinct to keep that option open.
2. **50 sites get visibly darker text.** The intended fix for the existing AA
   failures, but it is a visible change and worth a look once it lands.
3. **Radius changes on ~140 elements at once.** Intended, but the change most
   likely to need a visual pass.
4. **Generated CSS grows.** Three more scales (light + dark + P3) plus four
   matrix tokens per scale. No runtime cost.
5. **Shadow values are invented.** Astryx does not publish them.

## Non-goals

- Adopting Astryx as a dependency, or StyleX.
- Astryx's colour *values* — all colour derives from `generateRadixColors`.
- Astryx's font *sizes* — the semantic type vocabulary is adopted, the ramp is
  not. See Accessibility position.
- `light-dark()`.
- Spacing tokens.
- A lint rule banning raw scale steps.
- `duration-*` / `size-element-*` utility class generation.
