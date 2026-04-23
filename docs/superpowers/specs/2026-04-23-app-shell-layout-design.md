# App Shell Layout for rmtp-studio

**Date:** 2026-04-23
**Status:** Approved, pending implementation plan
**Scope:** Layout only — no data wiring, no real navigation, no draggable aside. This pass establishes the shell structure that every future feature will render inside.

## Goal

Build the persistent application shell — header, aside, main, footer — as a single CSS grid driven entirely by CSS custom properties, so the existing themable-studio pipeline can white-label the shell per deployment without JSX edits.

## Key decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Grid topology | **Header & footer full-width; aside on the left between them; main fills the remaining cell** |
| 2 | Scroll behavior | **Header & footer never move. Aside and main are independent scroll containers.** |
| 3 | Responsive strategy | **Desktop-only.** Below 768px an "unsupported viewport" screen replaces the shell. |
| 4 | Region separator | **Grid `gap`** (uses existing `--layout-separator-size`). Regions are floating panels; page background shows through the gap. |
| 5 | Region backgrounds | **Uniform** — all four panels use the same `--panel-bg` token. No ring, no shadow. |
| 6 | Placeholder content | Header: `<Logo />` + `appTitle`. Aside: nav stub. Footer: copyright stub. Main: empty. |
| 7 | Everything-is-a-var | **Every non-breakpoint value is a CSS custom property**, so theme swaps need no JSX or component CSS changes. |
| 8 | Out of scope | User-draggable aside, collapsible aside, real navigation, header actions, nested `<Outlet />`. |

## Dependencies

This design assumes `docs/superpowers/specs/2026-04-18-themable-studio-design.md` is implemented (or lands first). It consumes from that spec:

- `src/styles/theme.generated.ts` → `appTitle`
- `src/components/logo.tsx` → `<Logo />`
- CSS custom properties `--color-background`, `--color-gray-2`, `--color-gray-11`, `--color-gray-12`, `--font-display`

It adds **layout tokens only**; no color, font, or logo tokens are introduced, and no part of the theme generator is modified.

## Architecture

A single CSS grid on the shell root fills `100dvh`. Named grid areas pin header, aside, main, footer to their cells. Header and footer rows are fixed-height (`var(--header-height)`, `var(--footer-height)`); the middle row is `minmax(0, 1fr)`. Because the grid itself never overflows the viewport, header and footer are stationary by construction — no `position: sticky`, no JS scroll listeners. Aside and main each declare `overflow: auto` + `min-block-size: 0`, making them the only two scroll containers on the page.

A viewport guard is CSS-only: below 768px, `@media` rules collapse the grid and reveal a single `<UnsupportedScreen />` element. No JavaScript breakpoint state, no hydration mismatch.

```
<AppShell>                             // grid root, 100dvh, gap = --shell-gap, bg = --shell-bg
  <header .app-shell__header>          // Logo + appTitle
  <aside  .app-shell__aside>           // overflow-auto, nav stub
  <main   .app-shell__main>            // overflow-auto, empty
  <footer .app-shell__footer>          // copyright stub
  <div    .app-shell__unsupported>     // display:none on ≥ 768px, shown below
    <UnsupportedScreen/>
  </div>
</AppShell>
```

Grid template:

```
columns:  [var(--sidebar-width)] [minmax(0, 1fr)]
rows:     [var(--header-height)] [minmax(0, 1fr)] [var(--footer-height)]

areas:
  "header header"
  "aside  main"
  "footer footer"
```

## Layout CSS

All tokens live in `@layer base`; all rules live in a new `@layer components` block in `src/styles.css`.

### New tokens (added alongside existing layout vars)

```css
@layer base {
  html {
    /* existing */
    --header-height: 64px;
    --sidebar-width: 300px;
    --layout-separator-size: 12px;

    /* NEW — shell layout, all overridable per theme */
    --footer-height: 40px;
    --shell-padding: var(--layout-separator-size);
    --shell-gap: var(--layout-separator-size);
    --shell-bg: var(--color-background);

    --panel-bg: var(--color-gray-2);
    --panel-radius: 0.75rem;

    --unsupported-bg: var(--color-background);
    --unsupported-padding: calc(var(--layout-separator-size) * 2);
    --unsupported-max-inline-size: 32ch;
  }
}
```

### Shell rules

```css
@layer components {
  .app-shell {
    display: grid;
    block-size: 100dvh;
    inline-size: 100%;

    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
    grid-template-rows:
      var(--header-height)
      minmax(0, 1fr)
      var(--footer-height);
    grid-template-areas:
      "header header"
      "aside  main"
      "footer footer";

    gap: var(--shell-gap);
    padding: var(--shell-padding);
    background-color: var(--shell-bg);
  }

  .app-shell > .app-shell__header { grid-area: header; }
  .app-shell > .app-shell__aside  { grid-area: aside;  }
  .app-shell > .app-shell__main   { grid-area: main;   }
  .app-shell > .app-shell__footer { grid-area: footer; }

  .app-shell > :is(
    .app-shell__header,
    .app-shell__aside,
    .app-shell__main,
    .app-shell__footer
  ) {
    background-color: var(--panel-bg);
    border-radius: var(--panel-radius);
  }

  /* The ONLY scroll containers */
  .app-shell__aside,
  .app-shell__main {
    overflow: auto;
    min-block-size: 0;
    min-inline-size: 0;
  }

  .app-shell__unsupported { display: none; }

  @media (max-width: 767px) {
    .app-shell {
      display: block;
      padding: 0;
      background-color: var(--unsupported-bg);
    }
    .app-shell > :is(
      .app-shell__header,
      .app-shell__aside,
      .app-shell__main,
      .app-shell__footer
    ) {
      display: none;
    }
    .app-shell__unsupported {
      display: grid;
      place-items: center;
      block-size: 100dvh;
      padding: var(--unsupported-padding);
    }
  }
}
```

### Why the specific values

- **`100dvh`** (not `100vh`) — correct on browsers with dynamic chrome; harmless on desktop.
- **`minmax(0, 1fr)`** on the middle row and column — without the `0` minimum, grid items refuse to shrink below their intrinsic content size and `overflow: auto` never engages.
- **`min-block-size: 0`** on scrollers — required so the grid child can shrink below its content height and scroll rather than overflow the grid.
- **`background-color: var(--shell-bg)`** on the grid root — the gap between panels shows the page background, which is how the "floating panels" separation is achieved without borders.

## Token inventory (what themes can override)

| Token | Purpose | Default |
|---|---|---|
| `--header-height` | top row height | `64px` |
| `--footer-height` | bottom row height | `40px` |
| `--sidebar-width` | aside column width | `300px` |
| `--shell-gap` | gap between panels | `var(--layout-separator-size)` |
| `--shell-padding` | outer inset from viewport edge | `var(--layout-separator-size)` |
| `--shell-bg` | page background behind panels | `var(--color-background)` |
| `--panel-bg` | each panel's background | `var(--color-gray-2)` |
| `--panel-radius` | each panel's corner radius | `0.75rem` |
| `--unsupported-bg` | < 768px background | `var(--color-background)` |
| `--unsupported-padding` | < 768px inset | `calc(var(--layout-separator-size) * 2)` |
| `--unsupported-max-inline-size` | unsupported-screen body width | `32ch` |

A theme swaps the shell's geometry or chrome by setting these on `:root` (or `.dark`). No component CSS, JSX, or build step involved.

## Components

All filenames kebab-case; exported identifiers PascalCase.

### `src/components/app-shell.tsx`

Slot-based container. Regions are props (not `children`) so every call site is explicit about what each landmark contains.

```tsx
import type { ReactNode } from "react";
import { UnsupportedScreen } from "./unsupported-screen";

type AppShellProps = {
  header: ReactNode;
  aside: ReactNode;
  main: ReactNode;
  footer: ReactNode;
};

export const AppShell = ({ header, aside, main, footer }: AppShellProps) => (
  <div className="app-shell">
    <header className="app-shell__header">{header}</header>
    <aside className="app-shell__aside" aria-label="Sidebar">{aside}</aside>
    <main className="app-shell__main">{main}</main>
    <footer className="app-shell__footer">{footer}</footer>
    <div className="app-shell__unsupported" role="alert">
      <UnsupportedScreen />
    </div>
  </div>
);
```

### `src/components/unsupported-screen.tsx`

Shown below 768px. Reads `appTitle` from the generated theme module; reuses `<Logo />` so branding carries through.

```tsx
import { Logo } from "./logo";
import { appTitle } from "../styles/theme.generated";

export const UnsupportedScreen = () => (
  <div className="unsupported-screen">
    <Logo className="unsupported-screen__logo" />
    <h1 className="unsupported-screen__title">Desktop only</h1>
    <p className="unsupported-screen__body">
      {appTitle} needs a tablet or larger display. Please reopen on a wider screen.
    </p>
  </div>
);
```

Matching CSS (in the same `@layer components` block):

```css
.unsupported-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--layout-separator-size);
  max-inline-size: var(--unsupported-max-inline-size);
  text-align: center;
  color: var(--color-gray-12);
}
.unsupported-screen__title { font-family: var(--font-display); }
.unsupported-screen__body  { color: var(--color-gray-11); }
```

### `src/routes/index.tsx`

Composes the shell with placeholder content. Replaces the current skeleton.

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { Logo } from "../components/logo";
import { appTitle } from "../styles/theme.generated";

export const Route = createFileRoute("/")({ component: App });

function App() {
  return (
    <AppShell
      header={
        <div className="flex items-center gap-3 h-full ps-4 pe-4">
          <Logo className="h-8" />
          <span className="font-display text-gray-12">{appTitle}</span>
        </div>
      }
      aside={
        <nav aria-label="Primary" className="p-3">
          <ul className="flex flex-col gap-1 text-gray-11">
            <li>Nav item 1</li>
            <li>Nav item 2</li>
            <li>Nav item 3</li>
          </ul>
        </nav>
      }
      main={null}
      footer={
        <div className="flex items-center justify-between h-full ps-4 pe-4 text-gray-11 text-sm">
          <span>© {appTitle}</span>
        </div>
      }
    />
  );
}
```

Logical-property Tailwind classes (`ps-4`, `pe-4`) per project CLAUDE.md.

## Accessibility

- Four semantic landmarks (`<header>`, `<aside>`, `<main>`, `<footer>`) give screen readers `banner`, `complementary`, `main`, `contentinfo` automatically.
- `<aside aria-label="Sidebar">` disambiguates the complementary landmark.
- Unsupported-screen wrapper has `role="alert"` so assistive tech announces the situation when it appears on resize.
- All color pairings (text on panel, text on page bg) use Radix steps 11/12 on step 2 backgrounds — WCAG AA by construction.
- No `position: fixed` and no focus-trapping, so tab order follows DOM order: header → aside → main → footer.

## Testing strategy

- **Visual (manual, dev server):**
  - ≥ 1440px → full shell, all four panels visible.
  - 900px → same, cramped but functional.
  - 767px → unsupported screen, no shell chrome.
  - Long placeholder content in aside and main: confirm each scrolls independently; confirm header and footer never move.
- **Component (`vitest` + `@testing-library/react`):**
  - Render `<AppShell header=… aside=… main=… footer=… />`.
  - Assert `role="banner"`, `role="complementary"`, `role="main"`, `role="contentinfo"` are present.
  - Assert children appear inside the correct landmark.
- **RTL (manual):** `document.documentElement.dir = "rtl"` in dev; aside should flip to the right-hand column automatically (grid columns honor `direction`).
- **Theme swap (manual):** in devtools, set `document.documentElement.style.setProperty("--sidebar-width", "400px")` and `"--panel-radius", "2rem"`; the shell updates live without React rerender.

## File inventory

**New:**
- `src/components/app-shell.tsx`
- `src/components/unsupported-screen.tsx`

**Modified:**
- `src/styles.css` — add new tokens in `@layer base`; add `@layer components` block with shell, unsupported, and unsupported-screen rules.
- `src/routes/index.tsx` — replace skeleton with `<AppShell />` composition.

**No changes to:**
- `src/routes/__root.tsx`
- `vite.config.ts`, `src/env.ts`, `scripts/generate-theme-css.ts`, `plugins/vite-theme.ts`
- Any file under `src/db/`, `src/lib/`

## Out of scope

- **User-draggable aside width** — future pass: `--sidebar-width` becomes a Jotai atom (`atomWithStorage`) driven by a drag handle on the aside's trailing edge. Current design already makes this a one-var change.
- **Collapsible aside** — no collapse toggle yet.
- **Real navigation** — aside nav items are visual placeholders. TanStack Router links land with the first real feature.
- **Header actions** — search, user menu, notifications come later.
- **Nested routes inside main** — `main` is empty now; `<Outlet />` lands when a second route exists.
- **Data fetching** — nothing in this layout fetches or mutates. No React Query hooks, no server state.
