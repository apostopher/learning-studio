# ITPS theme alignment

Date: 2026-07-29
Status: implemented

## Summary

This app is deployed for International Test Pilots School (ITPS) Canada.
The token system landed in `2026-07-27-astryx-tokens-design.md` made every
non-color surface semantic; this change verifies and tightens the color
layer against ITPS's actual brand, fixes one WCAG 1.4.11 defect it surfaced,
and updates the app identity (title, logo, favicon, PWA manifest).

## Findings: current palette vs. ITPS's real CSS

The live palette was pulled from `itpscanada.com`'s served CSS
(`app/cache/minify/*.css`) and compared hex-for-hex against
`VITE_BRAND_COLORS` and related env vars.

| Token | Seed | On itpscanada.com? | Action |
| --- | --- | --- | --- |
| `gold` (accent) | `#E9E28F` | exact match, 228 uses | none |
| `apple` | `#1A2F40` / `#F2F9FF` | within their dark-navy button-active range / exact ice-white match | none |
| `gray` | `#334F64` / `#1a2f40` | exact match, 256 uses (their dominant UI navy) | none |
| `error` | `#cb0d39` | exact match, 54 uses | none |
| `link` | `#0066cc` / `#2997ff` | not present on their site | none (see below) |
| `warning` | generic default `#f5a524`/`#ffb224` | theirs is `#FAA74A`, 24 uses | **retuned** |

Most of the palette was already ITPS's own color, evidently chosen by hand
in an earlier pass before the semantic token layer existed. Only `warning`
needed a real change.

### `link` stays generic — measured, not assumed

`link` isn't used for hyperlinks anywhere in `src/` — it's a decorative
accent (a landing-page badge, a 4px underline mark, a hero background glow).
The obvious move was to retune it to ITPS's pale blue family. Measuring it
first (`generateRadixColors` + `checkContrast`, both appearances) showed
that doesn't work:

- ITPS's ice-blue (`#C4D9EA`) as a light-mode seed produces a step-9 that
  fails 3:1 against the page background (2.46) and 4.5:1 as a solid-fill
  contrast pair (2.64) — it's too pale to serve as a light-mode accent fill.
- Their mid-blue (`#66afe9`) fails the same way (2.20 vs body).
- Any ITPS blue dark enough to pass light-mode contrast lands within ~12 dE
  of the existing `apple` navy — perceptually the same color, so the three
  decorative spots that use `link` would stop reading as distinct from the
  navy hero panels around them.

Kept as `#0066cc` / `#2997ff`: not brand-sourced, but AA-verified in both
appearances and perceptually distinct from `gold`, `apple`, and `gray`.

### `warning` seed change

```
warning: #f5a524/#ffb224  →  #FAA74A/#FAA74A
```

Declared explicitly in `VITE_BRAND_COLORS` (last, so `gold` stays the
accent — first entry wins that role). `STATUS_DEFAULTS` in
`brand-colors.ts` is untouched; this is a per-deployment override, not a
change to the generic default other deployments would inherit.

## Defect found and fixed: non-text contrast on the score ring

`score-ring.tsx` strokes an SVG progress ring — a graphical object, not
text — with `--color-{success,warning,error}-9` (the `-solid` step),
falling back to a hardcoded hex if the token was ever undefined. Measuring
step 9 against the panel it sits on:

| | light | dark |
| --- | --- | --- |
| success-9 | 3.16 — passes | 7.34 |
| **warning-9** | **1.90 — fails** (2.67 with the ITPS orange) | 7.01 |
| error-9 | 5.74 | 4.02 |

WCAG 1.4.11 requires 3:1 for graphical objects. `-solid` (step 9) is tuned
as a large-area fill color; yellow/orange hues are inherently light at that
step and fall well short. This was a pre-existing defect — the ITPS orange
makes it marginally worse, not better — and the generator's adaptive
`-text` token (step 11, falling back to step 12 when step 11 fails against
`-subtle`) already clears both 3:1 and 4.5:1 by construction, because it's
measured, not assumed.

**Fix:** `score-ring.tsx` now strokes with `--color-{name}-text` instead of
`-solid`, and the hardcoded hex fallbacks are removed — those tokens are
generator-guaranteed to exist, so the fallback was dead code that could
mask a real misconfiguration.

**Consequence:** the warning ring now renders visibly darker (its `-text`
falls back to step 12) than success/error (`-text` stays step 11). This is
the intended tradeoff, not a bug — see the astryx-tokens design's
"tertiary" note for the same measure-don't-average principle applied to
grays.

## Identity: title, logo, favicon, manifest

- `VITE_APP_TITLE`: `"RMTP Studio"` → `"ITPS Flight Test Training"`.
- `VITE_LOGO_LIGHT` / `VITE_LOGO_DARK`: the placeholder `currentColor` circle
  SVG is replaced by ITPS's real gold roundel mark (jet + globe grid),
  sourced from their site favicon (`app/uploads/2020/04/cropped-favicon-*.png`,
  270×270 — the largest they publish) and saved to `public/logo192.png`.
  This is a fixed-color raster, not a `currentColor` SVG, so
  `text-apple-contrast` classes on `<Logo>` (`hero-section.tsx`,
  `auth-brand-panel.tsx`) become no-ops — WCAG 1.4.11 exempts logotypes from
  contrast minimums, so this is not a defect.
- `public/favicon.ico`: regenerated as a real multi-resolution ICO (16/32/48,
  hand-assembled from three `sips`-generated single-size ICOs — `sips`
  can't emit multi-frame ICO directly) from the same source mark. Previously
  the generic CRA default, unreferenced by any tracked `<link>` tag but
  served by browsers automatically by convention.
- `public/logo512.png`: upscaled from the 270px source (ITPS doesn't publish
  anything larger) via `sips -z`. Held up cleanly on inspection — the mark
  is flat-color/high-contrast, which upscales without visible artifacting.
- `public/manifest.json`: `name`/`short_name` updated to match the new
  title; `theme_color` set to the accent gold (`#E9E28F`); `background_color`
  set to the app's light background (`#f4f7fc`); icon `sizes` corrected to
  the ICO's actual embedded resolutions (was `64x64 32x32 24x24 16x16`,
  none of which matched the old file).

## Tests

- `scripts/generate-theme-css.test.ts`: the `userBrands` fixture used by the
  "palette contrast" describe block now includes the real `warning`
  override, so the suite exercises the deployed value rather than silently
  falling back to testing the generic `STATUS_DEFAULTS` seed. Also
  differentiated the fixture's `panelBg` from `bg` (previously identical),
  and added a new assertion: every status `-text` token clears the 3:1
  WCAG 1.4.11 non-text minimum against both background and panel, in both
  appearances.
- `src/components/lesson-material/parts/__tests__/score-ring.test.tsx`
  (new): renders `<ScoreRing>` at a passing/middling/failing score and
  asserts the actual `stroke` attribute on the progress `<circle>` — the
  thing the browser paints — resolves to the `-text` token, not `-solid`.
  Verified red against the pre-fix code (asserted `var(--color-error-9,
  #e5484d)` was returned instead) before confirming green post-fix, per
  this repo's "assert on what the consumer received" testing rule.

## Operational note: shell-exported env vars shadow `.env`

While regenerating `theme.generated.css` to verify this change end-to-end,
`VITE_BRAND_COLORS`, `VITE_APP_TITLE`, `VITE_LOGO_LIGHT`, and
`VITE_LOGO_DARK` were found already exported in the shell environment used
to run the generator — with a stale `red:` brand entry that predates the
current `.env`. `dotenv` does not override variables already present in
`process.env`, so `generateTheme()` silently regenerated the *old* theme
until those exports were unset for the run. The origin of the exports
wasn't found in `~/.zshrc`, `~/.zprofile`, or `launchctl`.

**Action for whoever runs `pnpm dev` / `pnpm build` next:** if the ITPS
colors/title/logo don't show up, run `env | grep VITE_` in that terminal —
if any of these four are already set, `unset` them (or open a fresh shell)
before starting the dev server.

## Out of scope

- The wider red+gold ITPS wordmark/crest SVG — sized for a banner, not the
  app's icon-sized logo slot. Not used.
- Any further palette changes to `success`, `gray`, `apple`, `error`, or
  background/panel/shell tokens — all already exact or near-exact ITPS
  matches, confirmed by direct comparison against their live CSS.
