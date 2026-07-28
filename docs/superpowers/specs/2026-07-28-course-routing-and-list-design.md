# Course-Scoped Routing and the My Courses Page

**Date:** 2026-07-28
**Status:** Approved, ready for planning
**Scope:** Routing restructure + a new `/app` course list. UI and data layer.

## Context

`/app` renders the course today, and it works only because the app is
single-course by **assumption**, not by routing. The slug `'3d-airmanship'` is
hardcoded in four places:

| File | Line |
|---|---|
| `src/components/sidebar/course-sidebar-wrapper.tsx` | `const COURSE_SLUG = "3d-airmanship"` |
| `src/components/lesson-main/lesson-header-wrapper.tsx` | same constant |
| `src/components/lesson-main/lesson-main-wrapper.tsx` | same constant |
| `src/ai/tools/search-kb.ts` | `opts.courseSlug ?? '3d-airmanship'` |

Lesson routes are flat and course-agnostic
(`/modules/$moduleSlug/lessons/$lessonSlug`), which only works because the
sidebar hardcodes the course.

There is also no learner-side course query. `courseSubscriptionsTable` exists
(user ↔ course, unique on `(userId, courseId)`), but every course data hook
today is admin-side.

This spec makes the course explicit in the URL and adds the page that lists a
user's courses.

## Non-goals

- Onboarding UI. `/course/$courseSlug` is where `shouldOfferOnboarding` will
  eventually be consulted, but that is the next step.
- Making the AI chat course-aware (see Deferred).
- Course enrolment/purchase flows. This lists existing subscriptions only.
- Admin routes. `/admin/$courseId/editor` is unchanged.

## Decisions

**The URL carries the slug, not the id.** Every learner data hook keys off slug
already — `useCourseProgressSummary(slug)`, `courseDetailsAtomFamily(slug)` —
and modules and lessons are addressed by slug throughout. An id would need
either a signature change on every hook or an id→slug resolution step on each
page. `coursesTable.slug` is already unique.

Consequence: slugs become effectively permanent, since renaming one breaks
links. Admin keeps using ids (`/admin/$courseId/editor`) — two conventions, each
matching its own layer.

**Lesson URLs nest under the course.** The URL expresses the hierarchy, and the
sidebar reads `courseSlug` from route params rather than deriving it. Lesson
slugs *are* globally unique so a flat route would still resolve, but a user
landing on a deep link could not tell which course they were in, and every
lesson page would need a lookup before the sidebar could render.

Consequence: existing `/modules/…` links break. With one course, that cost is
near-zero now and grows later.

**`/app` always shows the list**, even for a user with exactly one course —
which is every user today. One consistent destination, nothing to explain, and
it stays correct as users gain a second course. Costs current users one extra
click.

**`/course/$courseSlug` is a layout route, not a leaf.** Today `app.tsx` and the
lesson route each independently render `<AppShell aside={<CourseSidebarWrapper/>}>`.
As a layout the shell and sidebar are declared once and both children render
into its `<Outlet/>`.

## Routes

```
/app                                                         my courses
/course/$courseSlug                                          course home  (was /app)
/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug  lesson       (was flat)
```

Files, using the dot-notation this repo already uses (`admin.$courseId.editor.tsx`):

```
src/routes/_authed/
  app.tsx                                                     → the list
  course.$courseSlug.tsx                                      → layout: AppShell + sidebar
  course.$courseSlug.index.tsx                                → course home
  course.$courseSlug.modules.$moduleSlug.lessons.$lessonSlug.tsx
```

`src/routes/_authed/modules.$moduleSlug.lessons.$lessonSlug.tsx` is deleted.

The layout owns `AppShell`, the sidebar, and the footer. `course.$courseSlug.index.tsx`
renders `LessonEmpty` — the current `/app` body. The lesson route renders the
header and main content only.

## Removing the hardcoded course

Three of the four sites resolve once the slug is in params:

- **`course-sidebar-wrapper.tsx`** — already calls `useParams({ strict: false })`
  for `moduleSlug`/`lessonSlug`; add `courseSlug` and drop the constant.
- **`lesson-header-wrapper.tsx`** — takes `courseSlug` as a prop from the route.
- **`lesson-main-wrapper.tsx`** — same.

The fourth, `src/ai/tools/search-kb.ts`, is **deferred**. Callers can already
pass `courseSlug`; the fix is threading the current course from the chat context
into the tool, which belongs with whatever makes the chat course-aware. Doing it
half-way would leave the fallback silently wrong for a second course.

## The My Courses page

### Data

Following the existing `src/routes/api/course/` pattern:

- **`src/db/course.ts`** — `getMyCourses(userId)`: courses joined through
  `courseSubscriptionsTable`, with a per-course progress percentage.
- **`src/routes/api/course/my-courses.ts`** — auth-guarded via `auth.api.getSession`,
  returns only the caller's own courses. Mirrors `progress-summary.ts`.
- **`src/data-hooks/use-my-courses.ts`** — TanStack Query with a `staleTime`.

**Progress is one batched query, not one per course.** Reusing
`useCourseProgressSummary` per tile would be N round trips. `getMyCourses`
instead returns a percentage per course from a single grouped query, using the
same watched-milestone counting approach as `getCourseProgress` in
`src/db/course-progress.ts`.

Note `courseSubscriptionsTable` (user ↔ course) is a different concept from
`modulesTable.requiredSubscriptions` / `lessonsTable.requiredSubscriptions`,
which are subscription-tier name arrays. This page uses the former only.

### Components

- `src/components/courses/course-card.tsx` — presentational, props only.
- `src/components/courses/my-courses-container.tsx` — data via `useMyCourses`.

The card mirrors admin's `CourseTile`: `OptimizedPicture` cover with an
`ImageIcon` fallback, name, and the same rounded-border treatment. It differs in
linking to `/course/$courseSlug` and showing a progress indicator rather than
module counts and a slug.

Layout uses the existing `.grid-auto-fit` utility from `src/styles.css`, as
`admin-courses-page-container.tsx` does, inside a `.content-grid` wrapper.

States to cover, matching the admin page's shape: loading, error, empty
("You're not enrolled in any courses yet"), and populated.

## What breaks

- **`src/components/sidebar/lesson-link.tsx`** — the only production
  `<Link to="/modules/…">`. Gains a `courseSlug` param.
- **Six sidebar test files** stub `path: '/modules/$moduleSlug/lessons/$lessonSlug'`
  and need the nested path: `lesson-link`, `module-accordion`,
  `course-sidebar-wrapper`, `course-sidebar`, `module-item`, `lesson-list`.
- Bookmarked `/app` and `/modules/…` URLs. Accepted — one course, and the cost
  only grows from here.

## Verification

- `getMyCourses` returns only courses the user is subscribed to; a user with no
  subscriptions gets an empty array; progress percentages match what
  `getCourseProgress` reports for the same course.
- The API route rejects an unauthenticated request with 401 and never returns
  another user's courses.
- `course-card.tsx` renders from props: with and without a cover image, at 0%
  and 100% progress.
- Navigating to a lesson from the list keeps the course context — the sidebar
  renders the right course without a hardcoded slug.
- `pnpm test` passes with the six sidebar tests updated.
- No occurrence of `'3d-airmanship'` remains in `src/components/` or
  `src/routes/`.

## Deferred

- `search-kb.ts`'s hardcoded fallback, pending course-aware chat.
- Onboarding on `/course/$courseSlug`.
- Any redirect from the old flat lesson URLs. Deliberately not added — a
  compatibility route would have to be carried indefinitely for a single
  pre-launch course.
