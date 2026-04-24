# Course Sidebar — Design

**Date:** 2026-04-24
**Scope:** Render a course's modules and lessons inside the `AppShell` `aside`, using Base UI Accordion, with focus-safe accent outlines, a motion shimmer → blur-to-focus reveal, and a strict pure/wrapper component split.

## Goals

- Render modules (accordion headers) and lessons (links) from `useCourseDetails("3d-airmanship")`.
- Navigate to `/modules/$moduleSlug/lessons/$lessonSlug` when a lesson is clicked; the active lesson is styled from the current URL.
- Keep the sidebar fully white-label: every spacing, radius, color, duration, and easing references a named CSS variable. No arbitrary-value Tailwind classes (`p-[6px]`, `rounded-[14px]`, `duration-[320ms]`), no hardcoded hex.
- Strict split: pure components render UI; wrapper components run hooks/atoms/router and return a single pure component.
- WCAG AA focus management with `outline: 2px solid var(--color-accent-9)` and `outline-offset: 2px`.

## Non-goals

- Subscription / access gating of lessons (no `Lock` icon, no `aria-disabled`). Added later when auth is wired.
- Real lesson page content. The new route is a placeholder.
- Search inside the sidebar.
- Auto-expanding the current module on navigation. Accordion is user-controlled single-open only.

## Decisions (locked during brainstorm)

| # | Question | Decision |
| --- | --- | --- |
| 1 | Click behavior | Lesson → TanStack Router `<Link>` to `/modules/$moduleSlug/lessons/$lessonSlug`. Scaffold the route now with a placeholder `main`. |
| 2 | Accordion mode | Single-open. No auto-expand when route changes. |
| 3 | Active lesson style | `bg-accent-3`, `text-accent-11`, 2px `border-inline-start` in `accent-7`. |
| 4 | Subscription gating | None for now. |
| 5 | Loading / error | Motion shimmer skeleton with staggered row opacity; blur-to-focus reveal when real data arrives; inline text on error; nothing on `null`. |
| 6 | Sidebar top | Course title + `N modules · M lessons` subtitle. |
| 7 | Module row | `[NN] Module name [ChevronDown]` — zero-padded 2-digit rank at start, chevron at end. |
| 8 | File split | `Approach 2` (flat `src/components/sidebar/`) with wrapper-vs-pure naming (`foo-bar.tsx` pure, `foo-bar-wrapper.tsx` wrapper). |

## Architecture

### State ownership

Exactly one stateful unit — `course-sidebar-wrapper.tsx`. It:

1. Calls `useCourseDetails("3d-airmanship")` → `{ data, isLoading, isError }`.
2. Reads the current URL via `useParams({ strict: false })` → derives `activeModuleSlug`, `activeLessonSlug`.
3. Reads/writes the single open module via `useAtom(openModuleSlugAtom)` from `src/atoms/sidebar.ts`.
4. Derives `status: 'loading' | 'error' | 'ready'`, `title`, `moduleCount`, `lessonCount`, `modules`, `openModuleSlug`, `onOpenChange`, `activeLessonSlug`.
5. Returns a single JSX node: `<CourseSidebar {...derivedProps} />`. No DOM beyond that.

Every other component in the feature is pure: props in, JSX out, no hooks except refs / Base UI primitives.

### Data flow

```text
course-sidebar-wrapper (hooks, atom, router)
      │  props only
      ▼
course-sidebar  (motion stage, AnimatePresence, status branch)
      │
      ├── status === 'loading' ──► sidebar-skeleton
      ├── status === 'error'   ──► sidebar-error
      └── status === 'ready'   ──► course-sidebar-header
                                    module-accordion
                                         └── module-item (×N)
                                               └── lesson-list
                                                     └── lesson-link (×M)
```

### File layout

```text
src/
├── atoms/
│   └── sidebar.ts                          # openModuleSlugAtom
├── components/sidebar/
│   ├── course-sidebar-wrapper.tsx          # WRAPPER
│   ├── course-sidebar.tsx                  # pure
│   ├── sidebar-skeleton.tsx                # pure
│   ├── sidebar-error.tsx                   # pure
│   ├── course-sidebar-header.tsx           # pure
│   ├── module-accordion.tsx                # pure
│   ├── module-item.tsx                     # pure
│   ├── lesson-list.tsx                     # pure
│   └── lesson-link.tsx                     # pure
└── routes/
    ├── index.tsx                            # aside={<CourseSidebarWrapper />}
    └── modules.$moduleSlug.lessons.$lessonSlug.tsx   # placeholder route + same aside
```

Public import: `import { CourseSidebarWrapper } from "@/components/sidebar/course-sidebar-wrapper"`.

### Component contracts

| Component | Props | Renders |
| --- | --- | --- |
| `CourseSidebarWrapper` | — | `<CourseSidebar …/>` |
| `CourseSidebar` | `status`, `title?`, `moduleCount?`, `lessonCount?`, `modules?`, `openModuleSlug`, `onOpenChange`, `activeLessonSlug?` | `<nav aria-label="Course contents">` + motion stage |
| `SidebarSkeleton` | — | shimmer rows (`aria-hidden`) |
| `SidebarError` | `message?` | inline error text |
| `CourseSidebarHeader` | `title`, `moduleCount`, `lessonCount` | title + count subtitle |
| `ModuleAccordion` | `modules`, `openModuleSlug`, `onOpenChange`, `activeLessonSlug` | `Accordion.Root` |
| `ModuleItem` | `module`, `rank`, `isOpen`, `activeLessonSlug` | `Accordion.Item/Header/Trigger/Panel` |
| `LessonList` | `moduleSlug`, `lessons`, `activeLessonSlug` | `<ul>` + `LessonLink` map |
| `LessonLink` | `moduleSlug`, `lesson`, `isActive` | `<Link>` |

If any child later needs its own state, add a sibling `-wrapper.tsx` for it. Never introduce `useState` in a pure component.

## Styling & tokens (white-label)

All values trace to a named CSS variable. Tailwind default-scale utilities (`p-2`, `gap-3`, `rounded-md`, `text-sm`, `text-xs`) are acceptable because they resolve through Tailwind v4's `--spacing` / theme tokens. Arbitrary-value syntax (`p-[6px]`, `rounded-[14px]`, `duration-[320ms]`, `text-[13px]`) is banned in this feature.

### Tokens to add to `src/styles.css` `@theme`

```css
/* sidebar spacing */
--spacing-sidebar-row-block: calc(var(--spacing) * 2);
--spacing-sidebar-row-inline: calc(var(--spacing) * 3);
--spacing-sidebar-lesson-indent: calc(var(--spacing) * 6);
--spacing-sidebar-row-gap: calc(var(--spacing) * 1);

/* sidebar shape */
--radius-sidebar-row: var(--radius-md);
--border-width-sidebar-active: 2px;

/* sidebar focus ring */
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
```

### Row state map

| State | Module trigger | Lesson link |
| --- | --- | --- |
| Rest | `text-gray-12`, transparent | `text-gray-11`, transparent |
| Hover | `bg-gray-a3` | `bg-gray-a3`, `text-gray-12` |
| Active (URL match) | — | `bg-accent-3`, `text-accent-11`, `border-inline-start-2 border-accent-7` |
| Focus-visible | accent outline (see below) | accent outline (see below) |
| Open (accordion) | `text-gray-12`, chevron rotated 0deg | — |

### Focus ring (applied to every Accordion Trigger and Lesson Link)

```css
outline: var(--outline-width-sidebar-focus) solid var(--color-sidebar-focus-ring);
outline-offset: var(--outline-offset-sidebar-focus);
```

Wired only under `:focus-visible`. Tailwind's default `outline-none` on `:focus` suppresses the browser default; `:focus-visible` re-applies our accent outline. Paired with `rounded-sidebar-row` so the ring traces a pill.

### Chevron

`lucide-react` `ChevronDown`. Rotation controlled by a CSS custom property (`--chevron-rotation`) toggled from `-90deg` (closed) to `0deg` (open) via a `[data-open]` attribute on `Accordion.Trigger`. Transition: `transform var(--duration-sidebar-chevron) var(--ease-sidebar)`.

### Logical properties

Every spacing/border/inset uses logical equivalents per `CLAUDE.md`: `ps/pe`, `ms/me`, `start-*`/`end-*`, `border-s-*`, `rounded-s-*`, `inset-inline-*`, `border-inline-start`, `padding-block`, etc.

## Accessibility

- Outer `<nav aria-label="Course contents">` replaces the current empty `<nav aria-label="Primary">`.
- Base UI `Accordion` handles `aria-expanded`, `aria-controls`, arrow-key nav, home/end — no additions needed.
- Active lesson link: `aria-current="page"`.
- Skeleton: wrapper gets `aria-busy="true"`; each skeleton row `aria-hidden="true"` so screen readers skip shimmer noise.
- `prefers-reduced-motion`: shimmer becomes a static tint; reveal becomes a duration-0 opacity fade with no blur. Implemented via `useReducedMotion()` from `motion/react`.

## Routing

New route file: `src/routes/modules.$moduleSlug.lessons.$lessonSlug.tsx`.

- Mounts `AppShell` with `aside={<CourseSidebarWrapper />}` and `main={<LessonPlaceholder moduleSlug={…} lessonSlug={…} />}`.
- `LessonPlaceholder` is an inline component inside this route file; no public export. Renders `Lesson: <lessonSlug>` in a centered pad. Deliberately minimal — it exists only to make the sidebar's `<Link>` targets resolve.

`src/routes/index.tsx` swaps its empty `<nav aria-label="Primary">` for `<CourseSidebarWrapper />`.

## Skeleton shimmer + reveal

### Skeleton (`sidebar-skeleton.tsx`, pure)

- 1 header-skeleton row + 6 module-skeleton rows. Rows 3 and 4 each render 2 nested lesson-skeleton rows as a visual hint of the accordion's nested structure (the hint is fixed, not tied to any real accordion state).
- Each row wrapped in `motion.div`; row `i` gets `opacity = 1 - i * var(--sidebar-skeleton-row-opacity-step)` via inline `style`.
- Shimmer: `backgroundImage: linear-gradient(90deg, var(--color-gray-3) 0%, var(--color-gray-4) 50%, var(--color-gray-3) 100%)`, `backgroundSize: '200% 100%'`, `animate={{ backgroundPosition: ['0% 0', '-200% 0'] }}`, `transition={{ duration: tokens.shimmerS, repeat: Infinity, ease: 'linear' }}`. All three gradient stops use theme tokens so the shimmer adapts to any brand.
- `aria-hidden="true"` on the whole skeleton.

### Reveal (`course-sidebar.tsx`, pure)

- `<AnimatePresence mode="wait">` around the status branch.
- Skeleton exit: `exit={{ opacity: 0 }}`.
- Real-content enter: `initial={{ opacity: 0, filter: 'blur(var(--blur-sidebar-reveal))' }}`, `animate={{ opacity: 1, filter: 'blur(0px)' }}`, `transition={{ duration: tokens.revealS, ease: tokens.ease }}` (duration in seconds; ease is a 4-number cubic-bezier tuple).
- When `useReducedMotion()` returns true, the initial `filter` drops to `'blur(0)'` and duration is clamped to 0.

### Motion token bridge

Motion's `transition` expects numeric ms and bezier tuples. A tiny helper `src/lib/sidebar-motion.ts`:

```ts
export function readSidebarMotionTokens() {
  const root = document.documentElement;
  const s = getComputedStyle(root);
  const toSec = (v: string) => (parseFloat(s.getPropertyValue(v)) || 0) / 1000;
  const ease = parseCubicBezier(s.getPropertyValue('--ease-sidebar')); // [x1, y1, x2, y2]
  return {
    revealS: toSec('--duration-sidebar-reveal'),
    chevronS: toSec('--duration-sidebar-chevron'),
    shimmerS: toSec('--duration-sidebar-shimmer'),
    ease,
  };
}
```

Durations are exposed in seconds because `motion/react`'s `transition.duration` is a `number` in seconds.

The wrapper calls this once on mount (via a ref-stable cache); it also re-resolves when a theme-change event fires (already emitted by the existing theme infrastructure — to be confirmed in the implementation plan).

## Testing

- `course-sidebar-wrapper.test.tsx`: mocks `useCourseDetails` via `QueryClientProvider`. Asserts the `status` prop passed to `<CourseSidebar />` transitions `loading → ready` and that `openModuleSlug`/`onOpenChange` round-trip through the atom.
- `course-sidebar.test.tsx`: renders each `status` branch; asserts the correct pure child tree.
- `module-item.test.tsx`: rank zero-padded; `data-open` set when `isOpen`; Base UI attrs present.
- `lesson-link.test.tsx`: `aria-current="page"` when `isActive`; active token classes applied.
- `sidebar-skeleton.test.tsx`: 6 module rows, `aria-hidden`, wrapper `aria-busy`.
- `modules.$moduleSlug.lessons.$lessonSlug.test.tsx`: placeholder renders the passed `lessonSlug`.

No Storybook stories required.

## Dependencies & risks

### New dependencies

- `@base-ui/react` — Accordion primitives. Verify current install status during the plan; add if missing.
- `motion` — skeleton shimmer and reveal transition. Verify during the plan; add if missing.

### Risks

1. **Base UI Accordion panel-height API.** Base UI uses `[data-starting-style]` / `[data-ending-style]` and `--base-accordion-panel-height` for panel open/close transitions. Exact current class API confirmed in the implementation plan via `context7`.
2. **Motion var parsing at runtime.** `readSidebarMotionTokens()` runs in the browser only; it is called inside an effect so SSR renders with static fallbacks. If the white-label theme changes tokens at runtime, we re-resolve on the theme-change signal.
3. **Placeholder lesson links.** Without subscription gating, all lesson links route to the placeholder — acceptable per Decision #4.
4. **Route file name syntax.** TanStack Router flat file-based naming is `modules.$moduleSlug.lessons.$lessonSlug.tsx`. Router codegen must regenerate `routeTree.gen.ts` after adding it.

## Out of scope (explicitly)

- Subscription access control.
- Real lesson page (video, material, quiz).
- Sidebar search, filters, progress bars, keyboard shortcuts beyond Base UI defaults.
- Mobile sidebar drawer — unsupported-screen view already covers < 768px.
- Persisting the open module across reloads (Jotai atom is in-memory only).

## Acceptance criteria

- `aside` renders `<CourseSidebarWrapper />` on both `/` and `/modules/$moduleSlug/lessons/$lessonSlug`.
- During `isLoading`, shimmer skeleton shows with staggered opacity; on data arrival, content enters with blur-to-focus reveal.
- Course title and `N modules · M lessons` subtitle render above the accordion.
- Modules render `[NN] Name [ChevronDown]` with zero-padded rank; chevron rotates on open.
- Only one module open at a time; state round-trips through `openModuleSlugAtom`.
- Lessons render as links; clicking navigates to `/modules/$moduleSlug/lessons/$lessonSlug`; current URL marks the active lesson with the active token set and `aria-current="page"`.
- Every Accordion Trigger and Lesson Link shows a 2px accent outline with 2px offset on `:focus-visible`.
- No arbitrary-value Tailwind classes or hardcoded hex anywhere in the feature.
- `prefers-reduced-motion` disables shimmer animation and blur reveal.
- All unit tests pass.
