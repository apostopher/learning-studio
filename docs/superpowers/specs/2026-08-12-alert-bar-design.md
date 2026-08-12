# Optional alert bar — design

Date: 2026-08-12

## Problem

Every screen behind login needs an optional bar pinned to the top of the
viewport. Its background colour must be configurable from the environment, the
same way the rest of the theme is. By default it is a bare 12px strip: it
renders even with no content, and holds a slot for a future alert component.

## Decisions

Four decisions were settled up front, and they bound the scope:

1. **Content source: none yet.** The bar ships as a strip with a `children`
   slot that is `null`. No `Alert` component is built, no data source is wired.
   A later feature (maintenance notice, offline banner, environment warning)
   fills the slot.
2. **Mount point: `_authed.tsx`, above `<Outlet />`.** One mount covers every
   authed route — course, lesson, admin, app — and any route added later.
   Login and the landing page never show it. `AppShell` is not touched, so
   `AdminShellLayout` needs no parallel wiring.
3. **Configuration: one optional env var.** Unset means no bar renders
   anywhere. That is what makes the bar "optional".
4. **Semantics: decorative while empty.** The strip carries no information on
   its own, so it is `aria-hidden` until a child arrives.

## Why a single colour value, not a light/dark pair

The app is dark-only — `src/routes/__root.tsx:70` pins `class="dark"` on
`<html>`. A `VITE_ALERT_BAR_LIGHT` that nothing can ever resolve would be dead
configuration. One value.

## Why the token lives in `styles.css`, not `tokens.css`

`src/styles/tokens.test.ts` asserts referential integrity: every custom
property `tokens.css` references via `var()` must be defined by the generated
CSS. `--color-alert-bar` is emitted *conditionally*, so referencing it from
`tokens.css` would fail that test whenever the env var is unset.

This is not a workaround. Shell chrome already works this way:
`--color-shell-bg` and `--color-panel-bg` are consumed by `var()` directly in
`styles.css` beside the `.app-shell` rules. The alert bar is shell chrome and
belongs in the same place.

## Components

### `src/env.ts`

In the `client` block, alongside the other theme colours:

```ts
// Optional. Unset → no alert bar renders anywhere. Any CSS colour.
VITE_ALERT_BAR_COLOR: colorStr.optional(),
```

`colorStr` already validates any colorjs.io-parseable value.

### `scripts/generate-theme-css.ts`

- `ThemeColorInputs` gains `alertBar?: string`.
- `buildThemeCss` emits `--color-alert-bar: <value>;` into the light `@theme`
  block **only when `alertBar` is present**. One emit is enough: the `.dark`
  block overrides only the properties it redefines, so the value resolves in
  both scopes.
- `ThemeModuleInputs` gains `alertBarColor: string | null`.
- `buildThemeModule` emits `export const alertBarColor = '#cb0d39'` or
  `export const alertBarColor = null`. This is the build-time flag the route
  reads to decide whether to mount — the same pattern as `appTitle` and
  `logoLight`.
- `generateTheme()` passes `env.VITE_ALERT_BAR_COLOR` through, coalescing
  `undefined` to `null` for the module.

### `src/styles.css`

Token on the `html` block, beside `--shell-padding`:

```css
/* Resting height of the alert bar. Equal to --shell-padding by design: the
   strip lands exactly in the shell's top gutter and covers no content. A
   child taller than this WILL overlap the header — see "Accepted
   limitation" in docs/superpowers/specs/2026-08-12-alert-bar-design.md. */
--alert-bar-min-block-size: 12px;
```

Rule alongside `.app-shell`:

```css
.alert-bar {
  position: absolute;
  inset-block-start: 0;
  inset-inline: 0;
  min-block-size: var(--alert-bar-min-block-size);
  background-color: var(--color-alert-bar);
  /* Deliberately 1, not a high value: Base UI portals mount at the end of
     <body>, so at equal z-index they stack above this. A tall bar must never
     cover a dialog. */
  z-index: 1;
}
```

### `src/components/alert-bar.tsx`

Presentational and hookless — required, because react-compiler plus vitest
nulls the React dispatcher in render tests.

```tsx
import type { ReactNode } from 'react'

type AlertBarProps = { children?: ReactNode }

export const AlertBar = ({ children }: AlertBarProps) => (
  <div className="alert-bar" aria-hidden={children == null ? true : undefined}>
    {children}
  </div>
)
```

The strip renders whether or not a child is passed. `aria-hidden` is set while
empty so screen readers skip it, and dropped once a child arrives so the child
owns its own role and accessible name.

### `src/routes/_authed.tsx`

```tsx
component: () => (
  <>
    {alertBarColor !== null && <AlertBar />}
    <Outlet />
  </>
),
```

The env gate lives at the mount site; the component stays pure.

## Accepted limitation

A child taller than 12px will overlap the top of the header. The bar is
absolutely positioned and the shell reserves only its own `--shell-padding`.
Reserving real space would require measuring the bar's rendered height, which
means a hook, which means `AlertBar` stops being a presentational component.

`children` is `null` today, so this is taken deliberately rather than building
layout machinery for content that does not exist. The comment on
`--alert-bar-min-block-size` names what has to change when content lands.

## Testing

Per the project's testing rule — assert on what the consumer received, not that
a value exists.

- `scripts/generate-theme-css.test.ts`
  - `--color-alert-bar` is emitted with the given value when `alertBar` is set.
  - It is **absent** from the output when `alertBar` is omitted.
  - `buildThemeModule` exports `alertBarColor` as the quoted value, and as
    `null` when not configured.
- Consumer seam: assert `src/styles.css` contains `var(--color-alert-bar)`.
  Without this, the generator could emit a token that nothing ever reads —
  exactly the defect shape this codebase produces most.
- `src/components/__tests__/alert-bar.test.tsx`
  - Renders the strip when `children` is omitted, with `aria-hidden="true"`.
  - Renders a passed child and does **not** set `aria-hidden`.
- The route wiring is a one-line conditional mount. No unit coverage is
  claimed for it; it is verified in the browser.

Each new test must be seen to fail against the unfixed code before it counts.

## Rollout

Add to `.env.local`:

```
VITE_ALERT_BAR_COLOR=#cb0d39
```

`#cb0d39` is exactly `rgb(203, 13, 57)`; the hex form avoids dotenv quoting
questions around the commas and spaces.

The same key must be set in Vercel. Project history: production theme values go
stale silently, so confirm the **deployed CSS** actually contains
`--color-alert-bar` — not merely that the key appears in the Vercel env list.

## Note on the chosen colour

`#cb0d39` is already in the theme as `STATUS_DEFAULTS.error.light`
(`src/utils/brand-colors.ts:64`), so `--color-error-solid` is a full Radix
scale of this exact hue today. The dedicated env var is still the design:
independent control of the bar is the point, and coupling it to the error hue
would mean a future palette change to `error` silently restyles the bar. If
that coupling is ever wanted, `background-color: var(--color-error-solid)`
removes the env var and the generator changes entirely.
