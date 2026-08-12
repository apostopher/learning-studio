# Dark-only theme

**Date:** 2026-08-12
**Status:** Approved, ready for implementation

## Problem

Light mode looks wrong. The blue theme that reads well in dark mode becomes
washed out and off in light mode, and there is no theme toggle in the UI — a
visitor whose OS is set to Light gets the bad rendering with no way out.

The decision is to drop light mode: every surface renders the current dark
palette regardless of OS preference.

## Why the obvious approach does not work

Setting the `VITE_*_LIGHT` env vars equal to their `VITE_*_DARK` counterparts
does not reproduce the dark palette. `buildThemeCss`
(`scripts/generate-theme-css.ts:236`) computes the light scales with
`generateRadixColors({ appearance: 'light', … })`, and Radix always builds a
light-appearance scale *lighter* than its background seed. Feeding it the navy
seed yields a washed-out navy-tinted light scale — which is a good description
of the current symptom.

Matching the generated token values alone would also be incomplete. There are
8 hand-written `.dark`-scoped rules in `src/styles.css`, all for the video
player (`.dark .video-player`, `.dark .vp-controls`, `.dark .vp-time`, …).
Those key off the class, not the token values, so a token-only fix would leave
the video player as the one component that still looks different.

The reliable way to render exactly like dark mode is to *be* in dark mode.

## The pre-existing bug this uncovers

No `@custom-variant dark` is defined in the stylesheet, so Tailwind v4's
`dark:` variant falls back to `@media (prefers-color-scheme: dark)` — the OS
setting — while every colour token keys off the `.dark` **class**. The two
systems already disagree: with `localStorage.theme = 'dark'` on a light-mode
OS, tokens go dark while `dark:` utilities stay light.

The only two `dark:` uses in the codebase are the logo swap
(`src/components/logo.tsx:24-25`). Forcing the class without fixing the
variant would therefore render the **light** logo on the navy background for
every light-OS visitor. This is currently invisible only because
`VITE_LOGO_LIGHT` and `VITE_LOGO_DARK` are both `/logo192.png` — a property of
today's config, not something to rely on.

## Design

### 1. Make `dark:` class-driven — `src/styles.css`

```css
@custom-variant dark (&:where(.dark, .dark *));
```

Aligns the `dark:` variant with the token system and fixes the logo bug above.

### 2. Set the native colour scheme — `src/styles.css`

```css
:root { color-scheme: dark; }
```

Makes scrollbars, form controls and browser chrome render dark.
`THEME_INIT_SCRIPT` did this via `root.style.colorScheme`; as CSS it needs no
script.

### 3. Pin the class and drop the script — `src/routes/__root.tsx`

- `<html lang="en" className="dark" suppressHydrationWarning>` (line 68).
- Delete `THEME_INIT_SCRIPT` (line 30) and the `<script>` tag that injects it
  (line 82).

Shipping the class in the SSR HTML also removes the flash-of-wrong-theme the
script existed to prevent.

## Why this is safe

Each mechanism that could have complicated it was checked and is clear:

- **Zero** `prefers-color-scheme` rules in `src/styles.css` — everything keys
  off the class.
- **Zero** `.light`-scoped CSS rules, so nothing is orphaned by the class
  never being applied.
- **Zero** consumers of the `data-theme` attribute outside the script that
  writes it, so dropping it breaks nothing.
- The generated CSS emits exactly two scopes, `@theme` and `.dark`, so the
  override path is unambiguous.

## Consequences accepted

- **The public landing page becomes dark.** Its 5 components use theme tokens
  (20 uses of `gray`/`apple`/`link`) and define no `dark:` variants, so it
  follows the tokens. This was chosen deliberately over keeping it light.
- **`localStorage.theme` is ignored.** No UI ever set it; any value left in a
  browser from earlier testing simply has no effect.
- **The light `@theme` block is still generated** and permanently overridden.
  It is unused CSS, kept so that re-enabling light mode later is a revert of
  these three edits rather than a generator change.
- **`suppressHydrationWarning` stays** on `<html>`. Its original reason (a
  script mutating the element pre-hydration) is gone, but browser extensions
  mutate that element and the attribute is cheap insurance.

## Testing

No unit test. The claim is "every surface renders dark regardless of OS
preference": jsdom has neither an OS preference nor layout, so a test could
only assert that the string `"dark"` was passed as a class name — restating
the implementation rather than constraining it.

Verification is on screen, with **macOS System Settings set to Light**, which
is the condition that currently produces the bug:

1. `/` (public landing) — dark, and legible.
2. `/app` — dark.
3. `/admin` and `/admin/$courseId/editor` — dark.
4. A lesson page including the **video player** — confirm the 8 `.dark`
   video-player rules apply (controls, cue text, error state).
5. Native surfaces — scrollbars and any form control render dark.

## Out of scope

- Reworking the light palette to look good. This spec removes light mode
  rather than fixing it.
- Adding a user-facing theme toggle.
- Changing any `VITE_*` env value or the theme generator.
