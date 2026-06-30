# Landing Page — Design Spec

**Date:** 2026-06-30
**Status:** Approved

## 1. Summary

Add a polished public landing page at `/` that serves as the entry point for RMTP Studio. The page is an _entry point_, not a full marketing site — its job is to make the product feel premium and funnel visitors to the sign-in screen. The existing course app moves from `/` to `/app` (protected). All colours come exclusively from the generated CSS token scales (`apple`, `gray`, `link`).

---

## 2. Locked Decisions

| Area | Decision |
|---|---|
| Visual approach | Dark hero + light body; diagonal clip-path section breaks |
| Typography | Bebas Neue (display), Inter (body) — already loaded via theme |
| Animation | motion.dev `useScroll` + `useTransform` for parallax; `whileInView` for card entrances |
| Colour source | CSS token scales only — no hardcoded hex |
| Component split | Presentational + container per project convention |
| Route change | `/` → landing (public); `/app` → course dashboard (protected) |
| Sign-in CTA | Links to `/auth/login`; no inline form on landing |
| Section count | Hero · 4 feature cards · 2 feature spotlights · CTA |

---

## 3. Route Changes

### 3.1 File moves

| Old path | New path | URL |
|---|---|---|
| `src/routes/_authed/index.tsx` | `src/routes/_authed/app.tsx` | `/app` |
| _(new)_ | `src/routes/index.tsx` | `/` |

The lesson route (`_authed/modules.$moduleSlug.lessons.$lessonSlug.tsx`) is unaffected.

### 3.2 Redirect updates

- `auth-flow-container.tsx`: default redirect after login changes from `/` → `/app`.
- `_authed.tsx`: no change needed — it already redirects to the current URL.
- `__root.tsx`: no change needed.

---

## 4. Page Sections

### 4.1 Hero

- **Full viewport height** (`min-h-screen`), `bg-apple-9`, `color: apple-contrast`.
- **Headline:** Bebas Neue, `~8–10rem` (fluid via `clamp`), line-height tight (0.9–1.0). Copy: `"TRAIN.\nEVALUATE.\nFLY."` — three stacked lines.
- **Subheadline:** Inter 18px / `apple-contrast/70`. Copy: `"Aviation ground school meets science-based AI evaluation. Built for serious aviators."`
- **CTA:** "Sign in to start learning" → `/auth/login`. Styled as a filled pill button using `bg-apple-contrast text-apple-9` (inverted from hero bg, high contrast).
- **Parallax background:** Two large translucent radial blobs (`apple-contrast/5` and `link-9/10`) positioned absolutely. Both use `useScroll` + `useTransform` to move at 0.25× and 0.4× scroll speed respectively.
- **Section break:** `clip-path: polygon(0 0, 100% 0, 100% 88%, 0 100%)` on the hero container. No hard horizontal line.

### 4.2 Feature Cards

- **Overlap:** Cards section has `margin-block-start: -6rem` (negative) so it physically overlaps the hero's clipped bottom edge. Cards visually float above the seam.
- **Layout:** 2×2 grid on desktop. Cards in `bg-gray-surface` (glassmorphic token) with `border border-gray-6`, `border-radius: 1rem`, `padding: 2rem`.
- **Each card:** Lucide icon (24px, `text-apple-9`) + heading (Inter 16px semibold) + 1-sentence body (`text-gray-11`).
- **Four features:**
  1. **Video Courses** (`PlayCircle`) — "Structured modules with clear learning objectives."
  2. **AI-Driven Evaluation** (`BrainCircuit`) — "Answer questions and receive instant, context-aware feedback."
  3. **Science-Based Retention** (`FlaskConical`) — "Spaced repetition and active recall baked into every module."
  4. **Progress Tracking** (`TrendingUp`) — "See where you are and what to focus on next."
- **Entrance animation:** `whileInView` fade+slide-up, staggered by index (0, 0.1, 0.2, 0.3s delay). `viewport: { once: true, margin: '-80px' }`.

### 4.3 Feature Spotlights (×2)

Two alternating left/right rows below the cards, each in their own section.

**Spotlight 1 — AI Evaluation** (text left, visual right)
- Background: `bg-gray-2`, `clip-path: polygon(0 0, 100% 4%, 100% 96%, 0 100%)` — a subtle diagonal skew.
- Large decorative number `"01"` in Bebas Neue at `~12rem`, `text-gray-4`, positioned behind the text block (`z-index: 0`). Scrolls at 0.6× via `useTransform`.
- Text block: Heading in Bebas Neue ~3rem + 2–3 sentence description in Inter + small `link-9` coloured badge "Powered by AI".
- Right side: A mocked UI fragment (a simple styled card showing a question + AI feedback snippet) in `bg-gray-surface border-gray-6`.

**Spotlight 2 — Science-Based Retention** (visual left, text right)
- Background: `bg-gray-1`, same diagonal clip (mirrored). Decorative `"02"`.
- Left side: Visual showing spaced repetition concept (e.g. a simple retention curve using SVG paths, styled with `stroke: link-9`).
- Text block: Heading + description + badge "Research-backed".

### 4.4 Final CTA

- `bg-apple-9`, `color: apple-contrast`. Full-width section.
- **Above the section:** a 4px horizontal gradient bar: `linear-gradient(90deg, apple-9, link-9)` — acts as a colourful divider line.
- **Heading:** Bebas Neue ~5rem: `"READY TO FLY?"`
- **Body:** One sentence. "Join and start your first module in minutes."
- **Button:** Same inverted pill as hero.
- **No parallax** on this section — it's the terminal state; motion has done its job.

---

## 5. Animation Details

| Element | Technique | Values |
|---|---|---|
| Hero blob 1 | `useTransform(scrollY, [0, 500], [0, -125])` translateY | 0.25× scroll |
| Hero blob 2 | `useTransform(scrollY, [0, 500], [0, -200])` translateY | 0.4× scroll |
| Spotlight `"01"` number | `useTransform(scrollYProgress, [0, 1], [20, -40])` translateY | Relative to section |
| Spotlight `"02"` number | Same, mirrored | — |
| Feature cards | `whileInView: { opacity: 1, y: 0 }` from `{ opacity: 0, y: 32 }` | Staggered 0.1s |
| All animations | `useReducedMotion()` → disable transforms | Respects OS preference |

All `useScroll` instances are scoped to their section container (`ref` passed to `useScroll({ container })`), not the window, to avoid jank from global scroll listeners.

---

## 6. Theming

All colours are referenced via CSS variables resolved from the generated `@theme` block. No hardcoded hex. When the tenant theme changes (different `apple`/`link` values), the landing page recolours automatically.

Explicit token usage:
- `bg-apple-9` / `text-apple-contrast` — hero and CTA backgrounds
- `bg-gray-1` / `bg-gray-2` / `bg-gray-surface` — body sections and cards
- `border-gray-6` — card borders
- `text-gray-11` / `text-gray-12` — body text
- `text-link-9` — accent badges and SVG strokes in spotlight visuals
- `text-apple-10` — hover state on dark-bg buttons

---

## 7. Component Map

**New files:**

| File | Type | Purpose |
|---|---|---|
| `src/routes/index.tsx` | Route | Public landing page entry |
| `src/components/landing/hero-section.tsx` | Presentational | Full-viewport hero with parallax blobs |
| `src/components/landing/feature-cards.tsx` | Presentational | 2×2 animated feature card grid |
| `src/components/landing/feature-spotlight.tsx` | Presentational | Single alternating spotlight row |
| `src/components/landing/cta-section.tsx` | Presentational | Final CTA block |
| `src/components/landing/landing-page.tsx` | Presentational | Composes all sections |

**Modified files:**

| File | Change |
|---|---|
| `src/routes/_authed/index.tsx` | Rename to `app.tsx`; update `createFileRoute` to `/_authed/app` |
| `src/components/auth/auth-flow-container.tsx` | Default redirect `/` → `/app` |

---

## 8. Out of Scope

- Pricing section or subscription tiers.
- Testimonials / social proof.
- Course catalogue preview (browsing courses before sign-in).
- Mobile-specific layout (app is desktop-only; same `UnsupportedScreen` guard applies).
- Any analytics or tracking events.
