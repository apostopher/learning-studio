# Env-Driven Theming for rmtp-studio

**Date:** 2026-04-18
**Status:** Approved, pending implementation plan

## Goal

Turn rmtp-studio into a base repo where each deployment can be fully themed via env vars: colors (gray / accent / brand, light + dark), fonts (sans / mono / display), and logos (light + dark). No code changes required per tenant — only env configuration and redeploy.

## Key decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Theme resolution time | **Build-time** (read env during `vite build`, bake into CSS) |
| 2 | Mechanism | **Vite plugin** invoking a standalone generator script |
| 3 | CSS variable naming | **Radix-native** — `--color-gray-1…12`, `--color-accent-*`, `--color-brand-*`, with `a1…a12` alpha variants |
| 4 | Font env shape | **One var per slot**, each parsed as a full URL (`https://…`) or a Google Fonts spec (e.g., `"Inter:wght@400..700"`) |
| 5 | Logo env shape | **Two explicit slots** — `VITE_LOGO_LIGHT` and `VITE_LOGO_DARK`, each accepts inline SVG or URL |
| 6 | Background colors | **Env-configurable** with defaults — `VITE_BG_LIGHT` (default `#ffffff`), `VITE_BG_DARK` (default `#111111`) |
| 7 | Env validation | **Strict (G1)** — all 13 vars required, validated by Zod; build hard-fails on missing or malformed values |
| 8 | Generator location | **Standalone script** at `scripts/generate-theme-css.ts`, wrapped by thin Vite plugin at `plugins/vite-theme.ts`; generated files on disk (`src/styles/theme.generated.{css,ts}`, gitignored) |

`generateRadixColors` in `src/utils/colors.ts` is **not modified**. It is called six times (light/dark × gray/accent/brand) with the appropriate `background` anchor per appearance.

## Architecture

At build start — and on `.env.local` change in dev — a Vite plugin runs a generator script. The script reads 13 validated env vars, calls `generateRadixColors` six times, emits `src/styles/theme.generated.css` containing Radix-native CSS custom properties inside Tailwind v4 `@theme` blocks, and a TS module with font link specs and logo data. `styles.css` imports the generated CSS. Dark mode is toggled by the existing `.dark` class from `THEME_INIT_SCRIPT` in `src/routes/__root.tsx`. A `<Logo />` component reads the TS module and renders SVG-or-img with CSS-based light/dark switching.

```
.env.local → env.ts (Zod validate)
           → scripts/generate-theme-css.ts
                ├─ generateRadixColors × 6 → theme.generated.css (@theme tokens)
                ├─ font specs → theme.generated.ts (font <link> hrefs, family vars)
                └─ logos → theme.generated.ts (sanitized SVG strings / URLs)
           → styles.css @imports the CSS
           → __root.tsx imports the TS for <link> and <Logo />
```

## Env schema (added to `src/env.ts`)

All 13 vars are in the `client` block under the `VITE_` prefix so they inline into the build. `@t3-oss/env-core` already throws on invalid values, which provides the G1 strict-fail semantics.

```ts
const colorStr = z.string().refine(
  (v) => { try { new Color(v); return true } catch { return false } },
  { message: "must be a valid CSS color" }
)

const logoStr = z.string().min(1).refine(
  (v) => !/<script|on\w+\s*=|javascript:/i.test(v),
  { message: "logo contains unsafe content" }
).refine(
  (v) => v.trimStart().startsWith("<svg") || /^https?:\/\//.test(v) || v.startsWith("/"),
  { message: "must be inline SVG, absolute URL, or /public path" }
)

const fontStr = z.string().min(1)  // URL or Google Fonts spec, parsed by generator

client: {
  VITE_APP_TITLE: z.string().min(1),

  VITE_GRAY_LIGHT:   colorStr,
  VITE_GRAY_DARK:    colorStr,
  VITE_ACCENT_LIGHT: colorStr,
  VITE_ACCENT_DARK:  colorStr,
  VITE_BRAND_LIGHT:  colorStr,
  VITE_BRAND_DARK:   colorStr,

  VITE_BG_LIGHT: colorStr.default("#ffffff"),
  VITE_BG_DARK:  colorStr.default("#111111"),

  VITE_FONT_SANS:    fontStr,
  VITE_FONT_MONO:    fontStr,
  VITE_FONT_DISPLAY: fontStr,

  VITE_LOGO_LIGHT: logoStr,
  VITE_LOGO_DARK:  logoStr,
}
```

## Generator script (`scripts/generate-theme-css.ts`)

Standalone, runnable via `tsx scripts/generate-theme-css.ts` for debugging. Exports a `generateTheme()` function that the Vite plugin calls.

**Produces two files:**

### `src/styles/theme.generated.css`

```css
/* GENERATED. Do not edit. Source: scripts/generate-theme-css.ts */
@theme {
  --color-gray-1:  <hex>;  ...  --color-gray-12:  <hex>;
  --color-gray-a1: <hex>;  ...  --color-gray-a12: <hex>;
  --color-gray-surface:    <hex>;

  --color-accent-1:  <hex>;  ...  --color-accent-12:  <hex>;
  --color-accent-a1: <hex>;  ...  --color-accent-a12: <hex>;
  --color-accent-contrast: <hex>;
  --color-accent-surface:  <hex>;

  --color-brand-1:  <hex>;  ...  --color-brand-12:  <hex>;
  --color-brand-a1: <hex>;  ...  --color-brand-a12: <hex>;
  --color-brand-contrast:  <hex>;
  --color-brand-surface:   <hex>;

  --color-background: <VITE_BG_LIGHT>;

  --font-sans:    <family>, ui-sans-serif, system-ui, sans-serif;
  --font-mono:    <family>, ui-monospace, monospace;
  --font-display: <family>, ui-sans-serif, sans-serif;
}

.dark {
  /* all three scales overridden with dark hex values */
  --color-gray-1: <dark hex>;  ...
  --color-background: <VITE_BG_DARK>;
}

@supports (color: oklch(0 0 0)) {
  @theme { --color-gray-1: <oklch>; ... }
  .dark   { --color-gray-1: <dark oklch>; ... }
}
```

### `src/styles/theme.generated.ts`

```ts
export const fontLinkHref: string | null
export const extraFontLinks: string[]
export const logoLight: { kind: "svg"; svg: string } | { kind: "url"; src: string }
export const logoDark:  { kind: "svg"; svg: string } | { kind: "url"; src: string }
export const appTitle: string
```

### Parsing rules

- **Font spec:** value matching `^https?://` → pushed to `extraFontLinks`; otherwise treated as a Google Fonts family spec (e.g., `"Inter:wght@400..700"`) and merged into a single combined `fonts.googleapis.com/css2?family=…&family=…&display=swap` URL. Three slots produce at most one Google link plus N raw third-party links.
- **Logo:** `v.trimStart().startsWith("<svg")` → `{ kind: "svg", svg: sanitized }`; else → `{ kind: "url", src: v }`. Sanitization strips `<script>` tags, `on*=` attributes, and `javascript:` URLs via regex (defense-in-depth; Zod already rejects these at env validation).

## Vite plugin (`plugins/vite-theme.ts`)

Thin wrapper (~40 lines). Runs `enforce: "pre"` so generated files exist when `tailwindcss()` scans CSS.

```ts
import type { Plugin } from "vite"
import { resolve } from "node:path"
import { generateTheme } from "../scripts/generate-theme-css"

export function themePlugin(): Plugin {
  const envFile = resolve(process.cwd(), ".env.local")
  return {
    name: "rmtp-theme",
    enforce: "pre",
    buildStart() {
      generateTheme()
    },
    configureServer(server) {
      generateTheme()
      server.watcher.add(envFile)
      server.watcher.on("change", (path) => {
        if (path === envFile) {
          generateTheme()
          server.ws.send({ type: "full-reload" })
        }
      })
    },
  }
}
```

Wired in `vite.config.ts` **before** `tailwindcss()`:

```ts
plugins: [
  devtools(),
  themePlugin(),          // new, first
  tailwindcss(),
  tanstackStart(),
  viteReact(),
  babel({ presets: [reactCompilerPreset()] }),
]
```

## Styles integration

`src/styles.css`:

```css
@import "tailwindcss";
@import "./styles/theme.generated.css";
@plugin "@tailwindcss/typography";
/* ...existing @layer base, @layer layout blocks unchanged... */
```

The existing `@theme { --color-*: initial; }` block is **removed** — the generated file now owns every `--color-*` token, so there are no Tailwind defaults to nuke.

## Root layout (`src/routes/__root.tsx`) changes

Replace the hardcoded Google Fonts `<link>` with data from the generated module:

```tsx
import { fontLinkHref, extraFontLinks } from "../styles/theme.generated"

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
{fontLinkHref && <link href={fontLinkHref} rel="stylesheet" />}
{extraFontLinks.map((href) => <link key={href} href={href} rel="stylesheet" />)}
```

Font CSS variables (`--font-sans`, `--font-mono`, `--font-display`) live inside the generated `@theme` block, so Tailwind's `font-sans` / `font-mono` / `font-display` utilities resolve automatically with no further wiring.

## Logo component (`src/components/logo.tsx`)

```tsx
import { logoLight, logoDark, appTitle } from "../styles/theme.generated"

export const Logo = ({ className }: { className?: string }) => (
  <span role="img" aria-label={appTitle} className={className}>
    <LogoSlot data={logoLight} className="block dark:hidden" />
    <LogoSlot data={logoDark}  className="hidden dark:block" />
  </span>
)

const LogoSlot = ({ data, className }: {
  data: typeof logoLight
  className: string
}) =>
  data.kind === "svg"
    ? <span className={className} dangerouslySetInnerHTML={{ __html: data.svg }} />
    : <img className={className} src={data.src} alt="" />
```

Both slots render; CSS toggles visibility via the `.dark` class already set by `THEME_INIT_SCRIPT`. No JS theme state, no hydration mismatch. `dangerouslySetInnerHTML` is safe because env input is Zod-validated (G1) and sanitized again by the generator.

## File inventory

**New (checked in):**
- `scripts/generate-theme-css.ts`
- `plugins/vite-theme.ts`
- `src/components/logo.tsx`

**New (gitignored):**
- `src/styles/theme.generated.css`
- `src/styles/theme.generated.ts`

**Modified:**
- `src/env.ts` — add 13 theme vars with Zod refinements
- `src/styles.css` — import generated file, remove `@theme { --color-*: initial }`
- `src/routes/__root.tsx` — font `<link>`s and `<Logo />` sourced from generated module
- `vite.config.ts` — add `themePlugin()` before `tailwindcss()`
- `.gitignore` — add `src/styles/theme.generated.*`
- `.env.local` — add the 13 required vars with working defaults for local dev

## Build-order guarantee

`themePlugin` has `enforce: "pre"` and writes files in `buildStart`, which runs before `tailwindcss()` scans CSS. In dev, `configureServer` generates once on boot; `.env.local` changes trigger regen and a full browser reload (CSS vars inside `@theme` require Tailwind to re-process, so HMR is not sufficient).

## Testing strategy

- **Unit (vitest):** generator parses font specs correctly (URL vs Google spec), combines multiple Google specs into a single `css2?family=…&family=…` URL, sanitizes inline SVG, emits expected CSS shape. Drive with fixture env objects.
- **Integration:** `vite build` succeeds with all 13 vars set; fails with clear Zod error listing the offending var when any is missing or malformed.
- **Visual:** in dev, light/dark toggle renders correct logos; `bg-accent-9 text-accent-contrast` pair has WCAG AA contrast for a sample accent via `checkContrast` from `colors.ts`.

## Out of scope

- **Per-request / per-tenant theming** at runtime (Option B from brainstorming). Possible extension: same generator runs on each request, result cached by env hash, CSS vars inlined on `<html>` in SSR. Not required for the "one deployment = one tenant" goal.
- **Semantic aliases** (`--color-surface`, `--color-border`, etc.). Can be layered on top later in `styles.css` without changing the generator.
- **Runtime theme switcher** beyond the existing light/dark toggle. The existing `THEME_INIT_SCRIPT` and `.dark` class mechanics continue unchanged.
