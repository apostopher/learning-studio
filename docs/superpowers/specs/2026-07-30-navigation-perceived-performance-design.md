# Navigation perceived performance: killing the dead click

Clicking a course card on `/app` leaves the learner staring at the unchanged
courses grid for 3–4 seconds. Nothing moves, so there is no way to tell whether
the click registered. This spec covers both halves of that problem: making the
click *legible* (Part A) and making the wait *shorter* (Part B).

## Diagnosis

Clicking a `CourseCard` fires three **sequential, blocking** server round-trips
and renders nothing during any of them:

| # | Where | Blocking work |
|---|---|---|
| 1 | `routes/_authed/course.$courseSlug.tsx:19` `beforeLoad` | `getMySubscribedSlugs()` — session lookup + DB |
| 2 | `routes/_authed/course.$courseSlug.index.tsx:24` `beforeLoad` | `getCourseResumeTarget()` — session + Redis + progress + gating |
| 3 | `throw redirect` → lesson URL | re-runs the match tree, then sidebar/lesson wrappers fetch on mount |

Each independently calls `auth.api.getSession()`. All three live in
`beforeLoad`, which is pre-render — it cannot stream or suspend.

There is **no `pendingComponent` or `pendingMs` anywhere in `src/`**.

That is the whole reason nothing renders. Confirmed against the router's own
source (`packages/router-core/src/load-matches.ts`, `setupPendingTimeout`):
`shouldPending` requires

```
(route.options.loader || route.options.beforeLoad || routeNeedsPreload(route))
  && (route.options.pendingComponent ?? router.options.defaultPendingComponent)
```

Without a pending component the timer never starts, and the previous route
layout stays mounted indefinitely until loaders finish. `beforeLoad` *is*
covered by the pending state — the only missing ingredient is the component.

### `getMySubscribedSlugs` is heavier than it needs to be

It calls `getMyCourses()` — the full multi-join aggregate over every module,
lesson and video-progress row — then discards all of it except
`.map(c => c.slug)`. That query runs on every course navigation purely to
answer "is this user enrolled?"

### Rejected: raising `defaultPreloadStaleTime`

`router.tsx:15` sets `defaultPreloadStaleTime: 0`. This looks like a bug that
defeats `defaultPreload: 'intent'` — hover preloads, the result is instantly
stale, the click re-runs everything.

**It is deliberate and must not be changed.** It is the documented requirement
for the `@tanstack/react-router-ssr-query` integration: setting it to `0` marks
all preloads stale internally so React Query, not the router's preload cache,
owns data freshness. Raising it would give the router a second, competing cache.

The correct fix is B1 below — route the guards *through* React Query so
preloading pays off via the cache the integration already expects.

## Part A — Feedback

### A1. `AppShellSkeleton`

New presentational component composing the existing `SidebarSkeleton` and
`LessonSkeleton` inside the same `AppShell` grid, so the skeleton has identical
geometry to the real page and the swap causes no layout shift.

### A2. Per-route pending state

```ts
// course.$courseSlug.tsx
pendingComponent: AppShellSkeleton,
pendingMs: 120,
pendingMinMs: 400,
```

The index route gets `LessonSkeleton` alone as its `pendingComponent` — no
`AppShell` wrapper, since the layout supplying it has already committed by then.
When navigating from `/app` both matches are pending at once: the layout's
skeleton shows first, then once its guard resolves the index's skeleton renders
inside the layout's `Outlet` — a progressive reveal of full skeleton → real
sidebar + skeleton main → content.

Per-route rather than `defaultPendingComponent`, because an AppShell skeleton is
wrong for `/admin` and `/auth`.

`pendingMinMs: 400` prevents the skeleton flickering once B1 makes hover-preloaded
navigations resolve from cache.

### A3. Card press feedback

A `useIsNavigatingTo(to, params)` hook derived from `useRouterState`'s pending
matches — **not** an `onClick` flag. Deriving from router state is
self-correcting: a cancelled navigation, a redirect, or a cmd-click into a new
tab clears the state on its own instead of leaving a stuck spinner.

The clicked card takes `scale(.98)`, swaps its progress ring for a spinner, and
sets `aria-busy`. Siblings dim to `.6`.

Implemented in **plain CSS**, not Motion. A transform plus an opacity change is
precisely what the motion-react guidance says not to add a library for.

### A4. Skeleton → content crossfade

This is where Motion earns its place. In `lesson-main.tsx`, wrap the state
render in `AnimatePresence mode="popLayout"` keyed on the state kind from
`compute-lesson-main-state.ts`. Opacity only: content in ~200ms, skeleton out
~120ms. Deliberately short so it never adds perceptible delay to the moment
we are trying to make feel fast.

Opacity-only motion is already reduced-motion-safe. A3's `scale` needs a
`motion-reduce` guard.

## Part B — Latency

### B1. Route the guards through React Query

Both `beforeLoad`s call server fns raw — the one place in the codebase that
skips the "React Query for ALL API calls" rule in `CLAUDE.md`. Wrapping them in
`context.queryClient.ensureQueryData(...)` means:

- hover-preload populates the Query cache, so the click's `beforeLoad` resolves
  from cache with **no network at all**
- the redirect hop's re-run of the layout guard hits that same cache — the
  duplicate `getMySubscribedSlugs()` call disappears for free
- it works *with* `defaultPreloadStaleTime: 0` rather than against it

Query options live in `data-hooks` alongside the existing ones, keyed via
`dataKeys`. Concrete values, so the intent is not left to interpretation:

- **subscribed slugs — `staleTime: 5 * 60_000`.** Enrollment changes rarely, and
  a stale entry cannot grant access it shouldn't: the list is derived from the
  session server-side on every genuine fetch, and the worst a stale *positive*
  achieves is letting a just-unenrolled user reach a course page whose own data
  fetches will fail.
- **resume target — `staleTime: 30_000`.** Long enough that a hover-preload
  survives to the click, short enough that it re-resolves within a lesson.
  Matters less once B3 lands, since it will then only run on direct
  `/course/$courseSlug` hits (bookmarks, the empty-state path).

### B2. Lean enrollment check

`getMySubscribedSlugs` keeps its shape — a per-user slug list caches better than
per-slug checks, because one cache entry serves every card on the grid — but is
backed by a plain `SELECT slug FROM course_subscriptions JOIN courses` instead
of the full `getMyCourses` aggregate.

### B3. Cards link straight to the resume lesson

Add `resume` to the `/api/course/my-courses` payload and to `myCourseSchema` in
`use-my-courses.ts`. `CourseCard` targets the lesson URL when
`resume.kind === 'lesson'`, falling back to `/course/$courseSlug` otherwise
(which preserves today's empty-state path).

This deletes the index-redirect hop entirely for the common case.

Server-side cost is **one extra batched query**
(`SELECT course_id, lesson_id FROM course_last_viewed WHERE user_id = ?`) plus
`resolveResumeTarget` reusing module/lesson/progress data `getMyCourses` already
fetches. Not a per-course round trip — the grid barely moves.

#### Accepted trade-off: resume-target staleness

The resume target becomes a snapshot taken when the grid loaded. `useMyCourses`
sets `refetchOnMount: 'always'` and `refetchOnWindowFocus: true`, so it is fresh
on arrival at `/app`. But progress made in a second tab could leave a card
pointing at a lesson that has since become locked, where today's redirect would
have re-resolved and hopped off it.

This is accepted rather than engineered around:

- **Correctness is not at risk.** Gating is enforced on the server — the lesson
  page independently asks and renders `LessonLocked` if the answer is no
  (see `compute-lesson-main-state.ts`). The sidebar's locks are advisory. A
  direct link cannot bypass a gate.
- **The failure mode is legible.** `LessonLocked` already names what unlocks the
  lesson and links there, so a learner who hits it is not stranded.

## Testing

Following the `CLAUDE.md` rule — assert the consumer *received* the value, never
that the value exists:

- `CourseCard` renders an `href` pointing at the resume lesson when
  `resume.kind === 'lesson'` — assert the rendered anchor, not the prop
- the spinner and `aria-busy` land on the *clicked* card given a pending router
  state — assert rendered output, not internal state
- skeleton components stay hookless, per the existing render-test constraint
- every regression test verified red against the unfixed code before landing

## Rollout

Five independently shippable steps:

1. **A1 + A2** — pending components. Biggest perceived win, lowest risk, no
   server changes.
2. **A3 + A4** — card feedback and crossfade polish.
3. **B1** — Query-backed guards. Where the real speed comes from.
4. **B2** — lean subscription query.
5. **B3** — direct resume links.
