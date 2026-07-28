# Course-Scoped Routing and My Courses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the course into the URL (`/course/$courseSlug`, nesting lessons under it as a layout route), remove the four hardcoded-course sites this required, and add `/app` as a list of the user's subscribed courses with per-course progress from one batched query.

**Architecture:** `/course/$courseSlug` becomes a layout route owning `AppShell` and the sidebar; its children (`index` = course home, `modules/.../lessons/...` = a lesson) render into its `Outlet` and read `courseSlug` from route params instead of a hardcoded constant. The lesson header is a special case: `AppShell`'s `headerMain` slot is visually pinned (only `main` scrolls, per its CSS), so the layout renders it conditionally itself — based on whether `moduleSlug`/`lessonSlug` params are present — rather than letting it flow through `Outlet`, where it would end up inside the scrolling `main` region instead of the fixed header row. `/app` becomes a `.content-grid` page (no `AppShell`) listing courses via a new learner-scoped DB query, API route, and hook, following the exact shape of the existing `progress-summary` endpoint and the existing admin courses list.

**Tech Stack:** TanStack Router (file-based, dot-notation), TanStack Query, Drizzle + PostgreSQL, zod v4, vitest, biome.

**Spec:** `docs/superpowers/specs/2026-07-28-course-routing-and-list-design.md`

## Global Constraints

- **`@/` never resolves under vitest — verified freshly for this plan, not assumed from precedent.** Probed empirically: importing `@/lib/admin-schemas` (a file with zero `@/db` involvement) from a test still fails with `Failed to load url @/lib/admin-schemas`. This is not specific to `db/schema.ts`'s import chain — `@/*` is a `tsconfig.json`-only path with no matching Vite/Vitest resolve alias. **Any new file that must be test-importable uses `#/`.** `@/` is fine in files that are never imported by a test (DB modules, route files that are also never directly imported by their own handler tests — see below).
- **Existing precedent for testable route handlers:** `src/routes/api/course/progress-summary.ts` imports `getCourseProgress` from `#/db/course-progress` and `auth` from `#/lib/auth` — both via `#/`, even though `src/db/course-progress.ts` itself uses `@/db` internally. This works because the handler's test (`progress-summary.test.ts`) does `vi.mock('#/db/course-progress', ...)` and `vi.mock('#/lib/auth', ...)` *before* importing the handler — the mock intercepts the `#/`-resolved module path, so the real `@/db`-using file underneath is never loaded. **Follow this exact pattern for the new route.**
- **Data-hook response schemas are defined inline in the hook file, not imported from a shared module.** `src/data-hooks/use-course-progress-summary.ts` defines its own `z.object({...})` locally rather than importing from `@/types` or `#/types`. This keeps the hook self-contained and trivially testable. Follow it — do not add a new export to `src/types.ts` for this feature.
- **Presentational components take props, never call hooks for data or routing** (`CLAUDE.md` "React rules"). `LessonLink`, `LessonList`, `ModuleItem`, `ModuleAccordion`, `CourseSidebar`, `CourseCard` must receive `courseSlug` as a prop, threaded down from the container (`CourseSidebarWrapper`, `MyCoursesPageContainer`) that calls `useParams`/`useQuery`. Do not add a `useParams()` call inside any of these five sidebar components even though it would "work" — it would violate the container/presentational split this codebase enforces everywhere else in this exact file tree.
- **Import style matches the file's own neighbors, not a repo-wide default.** This repo is inconsistent: `src/routes/_authed/admin.index.tsx` imports via `@/components/...`; `src/routes/_authed/app.tsx` and the current lesson route import via relative `../../components/...`. Each task below states which existing file to mirror for import style — follow that file, not a general rule.
- **Never `git add -A`.** Stage explicit paths; `git status --short` before every commit. `docs/onboarding.md` and `src/common/config.ts` are the user's unrelated untracked files and must never be staged. `CLAUDE.md` currently has a local uncommitted edit (the "Testing: Assert on What the Consumer Received" section) — do not stage `CLAUDE.md` in any commit in this plan.
- **Verified baseline (measured 2026-07-28, this branch):** `pnpm exec tsc --noEmit` completely clean; `pnpm test` 102 files / 592 passed / 28 skipped. Any tsc output or test regression is yours.
- Vitest prints `close timed out after 10000ms / something prevents Vite server from exiting` after the summary — a pre-existing quirk of this repo's config, **not** a test failure. Judge pass/fail from the `Test Files` / `Tests` summary lines.
- Run tests with `pnpm vitest run <path>`. Full suite: `pnpm test`.
- Branch: `feat/course-routing` (already created off `main`; spec already committed).
- **Do not touch `src/ai/tools/search-kb.ts`.** Its hardcoded `'3d-airmanship'` fallback is deliberately deferred to the chat-course-awareness work — see the spec's "Deferred" section.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/course-progress-agg.ts` | Modify | Add `aggregatePercentByCourse` — the multi-course counterpart to the existing `aggregateCourseProgress`. |
| `src/lib/__tests__/course-progress-agg.test.ts` | Modify | Tests for the new function. |
| `src/db/course.ts` | Modify | Add `getMyCourses(userId)`. |
| `src/routes/api/course/my-courses.ts` | Create | Auth-guarded endpoint, mirrors `progress-summary.ts`. |
| `src/routes/api/course/__tests__/my-courses.test.ts` | Create | Handler test, mirrors `progress-summary.test.ts`. |
| `src/data-hooks/use-my-courses.ts` | Create | TanStack Query hook with an inline response schema. |
| `src/data-hooks/keys.ts` | Modify | Add `myCourses()` key. |
| `src/components/courses/course-card.tsx` | Create | Presentational — one course tile. |
| `src/components/courses/my-courses-container.tsx` | Create | Data — fetches and renders the grid. |
| `src/components/courses/__tests__/course-card.test.tsx` | Create | Props-only render test. |
| `src/routes/_authed/app.tsx` | Modify | Renders `MyCoursesPageContainer` instead of the course shell. |
| `src/routes/_authed/course.$courseSlug.tsx` | Create | Layout route: `AppShell` + sidebar + footer + the lesson header (conditionally). |
| `src/routes/_authed/course.$courseSlug.index.tsx` | Create | Course home — renders `LessonEmpty`. |
| `src/routes/_authed/course.$courseSlug.modules.$moduleSlug.lessons.$lessonSlug.tsx` | Create | Lesson main content only — the layout supplies the header. |
| `src/routes/_authed/modules.$moduleSlug.lessons.$lessonSlug.tsx` | Delete | Replaced by the nested routes above. |
| `src/components/lesson-main/lesson-header-wrapper.tsx` | Modify | Take `courseSlug` as a prop. |
| `src/components/lesson-main/lesson-main-wrapper.tsx` | Modify | Take `courseSlug` as a prop; fix its two query-invalidation calls to use it. |
| `src/components/sidebar/course-sidebar-wrapper.tsx` | Modify | Read `courseSlug` from params instead of a constant; pass it down. |
| `src/components/sidebar/course-sidebar.tsx` | Modify | Thread `courseSlug` prop through to `ModuleAccordion`. |
| `src/components/sidebar/module-accordion.tsx` | Modify | Thread `courseSlug` prop through to `ModuleItem`. |
| `src/components/sidebar/module-item.tsx` | Modify | Thread `courseSlug` prop through to `LessonList`. |
| `src/components/sidebar/lesson-list.tsx` | Modify | Thread `courseSlug` prop through to `LessonLink`. |
| `src/components/sidebar/lesson-link.tsx` | Modify | Use `courseSlug` in the `Link`'s `to`/`params`. |
| Six files under `src/components/sidebar/__tests__/` | Modify | New nested test route path; pass `courseSlug` prop where the component under test now requires one. |

**Sequencing note:** Task 5 creates the new route files and de-hardcodes `LessonHeaderWrapper`/`LessonMainWrapper` *together*, in one task — the new route files call these two components with a `courseSlug` prop that does not exist on their current prop types, so splitting the route creation from the prop-type change would leave a commit that fails `tsc`. Task 6 (de-hardcoding `CourseSidebarWrapper` and threading `courseSlug` through the presentational chain down to `lesson-link.tsx`) is similarly one task rather than two: `lesson-link.tsx`'s `Link` target only becomes reachable after Task 5 deletes the old flat route, so a sidebar-link click would 404 in any state where Task 5 has landed but `lesson-link.tsx` has not yet been updated. Neither split earns anything — a reviewer would not approve one half while rejecting the other.

---

## Task 1: `aggregatePercentByCourse`

**Files:**
- Modify: `src/lib/course-progress-agg.ts`
- Test: `src/lib/__tests__/course-progress-agg.test.ts`

**Interfaces:**
- Consumes: nothing new (uses the existing `aggregateCourseProgress` and `LessonProgressRow` in the same file).
- Produces: `type ManyCourseProgressRow = { courseId: number; moduleId: number | null; lessonId: number | null; videoId: string | null; watchedHits: number }` and `aggregatePercentByCourse(rows: ManyCourseProgressRow[]): Map<number, number>`.

**Why `moduleId` is nullable here but not on `LessonProgressRow`:** `LessonProgressRow.moduleId` is a real module id — the existing single-course query only reaches `aggregateCourseProgress` for a course that has at least one module row (an `INNER JOIN` on modules). The new multi-course query (Task 2) uses a `LEFT JOIN` on modules so that a subscribed course with *zero* modules still appears in the result set, as one placeholder row with `moduleId: null`. This function's job is to turn that placeholder into "this course exists, at 0%" rather than silently dropping the course from the list.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/course-progress-agg.test.ts`. Extend the existing import line to add `aggregatePercentByCourse` and `type ManyCourseProgressRow`:

```ts
import {
  aggregateCourseProgress,
  aggregatePercentByCourse,
  type LessonProgressRow,
  type ManyCourseProgressRow,
} from '#/lib/course-progress-agg';
```

Then append:

```ts
describe('aggregatePercentByCourse', () => {
  const FULL_ROW = { watchedHits: watchedMilestones.length };

  it('computes each course independently, matching aggregateCourseProgress on the same rows', () => {
    const rows: ManyCourseProgressRow[] = [
      { courseId: 1, moduleId: 10, lessonId: 100, videoId: 'v100', ...FULL_ROW },
      { courseId: 2, moduleId: 20, lessonId: 200, videoId: 'v200', watchedHits: 9 },
    ];
    const percents = aggregatePercentByCourse(rows);
    expect(percents.get(1)).toBe(100);
    expect(percents.get(2)).toBe(50);
  });

  it('separates rows from different courses that happen to share module/lesson ids', () => {
    // moduleId/lessonId are only unique within a course's own rows here —
    // grouping must key on courseId, not accidentally merge across courses.
    const rows: ManyCourseProgressRow[] = [
      { courseId: 1, moduleId: 1, lessonId: 1, videoId: 'a', ...FULL_ROW },
      { courseId: 2, moduleId: 1, lessonId: 1, videoId: 'b', watchedHits: 0 },
    ];
    const percents = aggregatePercentByCourse(rows);
    expect(percents.get(1)).toBe(100);
    expect(percents.get(2)).toBe(0);
  });

  it('registers a course with a null-moduleId placeholder row at 0%, not omitted', () => {
    const rows: ManyCourseProgressRow[] = [
      { courseId: 3, moduleId: null, lessonId: null, videoId: null, watchedHits: 0 },
    ];
    const percents = aggregatePercentByCourse(rows);
    expect(percents.has(3)).toBe(true);
    expect(percents.get(3)).toBe(0);
  });

  it('ignores a null-moduleId row for a course that also has real module rows', () => {
    // Should not happen from the real query (a course either has modules or
    // it doesn't), but the function must not let a stray null row drag down
    // an otherwise-complete course.
    const rows: ManyCourseProgressRow[] = [
      { courseId: 4, moduleId: null, lessonId: null, videoId: null, watchedHits: 0 },
      { courseId: 4, moduleId: 40, lessonId: 400, videoId: 'v400', ...FULL_ROW },
    ];
    const percents = aggregatePercentByCourse(rows);
    expect(percents.get(4)).toBe(100);
  });

  it('returns an empty map for no rows', () => {
    expect(aggregatePercentByCourse([]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/__tests__/course-progress-agg.test.ts`

Expected: FAIL — `aggregatePercentByCourse` and `ManyCourseProgressRow` are not exported. The file's existing `aggregateCourseProgress` tests will also fail to run, because the import line at the top fails.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/lib/course-progress-agg.ts`:

```ts
/**
 * One flat row tagged with which course it belongs to — the input shape for
 * a query that spans multiple courses at once (see getMyCourses). `moduleId`
 * is nullable here, unlike LessonProgressRow: a LEFT JOIN on modules yields
 * exactly one placeholder row (moduleId: null) for a subscribed course that
 * has zero modules, so that course still appears in the result rather than
 * silently vanishing from a multi-course query.
 */
export type ManyCourseProgressRow = {
  courseId: number;
  moduleId: number | null;
  lessonId: number | null;
  videoId: string | null;
  watchedHits: number;
};

/**
 * Percent complete per course from a flat, course-tagged row set — the
 * multi-course counterpart to aggregateCourseProgress, which it reuses
 * per-group so the two stay in agreement on what "percent" means.
 *
 * A course is registered in the returned map as soon as any row for it is
 * seen, even a moduleId: null placeholder — that is what keeps a
 * zero-module course in the list at 0% instead of being omitted.
 */
export function aggregatePercentByCourse(
  rows: ManyCourseProgressRow[],
): Map<number, number> {
  const byCourse = new Map<number, LessonProgressRow[]>();

  for (const row of rows) {
    if (!byCourse.has(row.courseId)) byCourse.set(row.courseId, []);
    if (row.moduleId === null) continue;
    byCourse.get(row.courseId)?.push({
      moduleId: row.moduleId,
      lessonId: row.lessonId,
      videoId: row.videoId,
      watchedHits: row.watchedHits,
    });
  }

  const percents = new Map<number, number>();
  for (const [courseId, courseRows] of byCourse) {
    // The slug argument only affects aggregateCourseProgress's own `slug`
    // output field, which this function discards — courseId is the key here.
    percents.set(courseId, aggregateCourseProgress('', courseRows).percent);
  }
  return percents;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/__tests__/course-progress-agg.test.ts`

Expected: PASS. The file had tests before this task; note the new count rather than assume a specific total, and confirm zero failures.

- [ ] **Step 5: Check formatting and types**

Run: `pnpm exec biome check src/lib/course-progress-agg.ts src/lib/__tests__/course-progress-agg.test.ts`
Run: `pnpm exec tsc --noEmit`

Expected: no errors from either. The baseline is clean, so any tsc error is yours.

- [ ] **Step 6: Commit**

```bash
git add src/lib/course-progress-agg.ts src/lib/__tests__/course-progress-agg.test.ts
git status --short
git commit -m "feat(courses): add aggregatePercentByCourse for the my-courses list"
```

Confirm `git status --short` shows only those two files staged.

---

## Task 2: `getMyCourses`

**Files:**
- Modify: `src/db/course.ts`

**Interfaces:**
- Consumes: `aggregatePercentByCourse`, `type ManyCourseProgressRow` from `#/lib/course-progress-agg`; `watchedMilestones` from `#/lib/course-milestones`; `coursesTable`, `courseSubscriptionsTable`, `modulesTable`, `lessonsTable`, `videoProgressTable` from `@/db/schema`; `db`, already imported in this file from `"."` (this file lives at `src/db/course.ts`, so `"."` resolves to `src/db/index.ts`).
- Produces: `type MyCourseSummary = { id: number; name: string; slug: string; imageUrlAvif: string | null; imageUrlWebp: string | null; percent: number }` and `getMyCourses(userId: string): Promise<MyCourseSummary[]>`.

**Import style:** `src/db/course.ts`'s current full import block, read verbatim during planning, is:

```ts
import { db } from ".";
import {
  coursesTable,
  modulesTable,
  lessonsTable,
  lessonDependenciesTable,
  moduleDependenciesTable,
  orgLessonsTable,
  orgsTable,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { inArray } from "drizzle-orm";
import { cacheWithRedis } from "@/integrations/upstash/redis";
import type { DBModule, DBLesson } from "@/db/schema";
import type {
  SubscriptionType,
  VideoResponse,
  CourseLessonDependencies,
} from "@/types";
```

Note the file's existing style of one symbol per `drizzle-orm` import statement (`eq` and `inArray` are separate lines, not consolidated) — match that rather than combining your new imports into one line.

**No unit test for this task, matching `src/db/course-progress.ts`'s precedent** — it has no test either. This module reaches `@/db`, which is unresolvable under vitest (see Global Constraints), and the pure logic it depends on (`aggregatePercentByCourse`) is already tested in Task 1. `pnpm exec tsc --noEmit` is the verification.

- [ ] **Step 1: Extend the `@/db/schema` import**

```ts
import {
  coursesTable,
  modulesTable,
  lessonsTable,
  lessonDependenciesTable,
  moduleDependenciesTable,
  orgLessonsTable,
  orgsTable,
  courseSubscriptionsTable,
  videoProgressTable,
} from "@/db/schema";
```

- [ ] **Step 2: Add the remaining imports**

Directly below the existing `import { inArray } from "drizzle-orm";` line, add:

```ts
import { and } from "drizzle-orm";
import { asc } from "drizzle-orm";
import { countDistinct } from "drizzle-orm";
import { sql } from "drizzle-orm";
```

Directly below the existing `import { cacheWithRedis } from "@/integrations/upstash/redis";` line, add:

```ts
import { aggregatePercentByCourse } from "#/lib/course-progress-agg";
import { watchedMilestones } from "#/lib/course-milestones";
```

- [ ] **Step 3: Write `getMyCourses`**

Append to `src/db/course.ts`:

```ts
export type MyCourseSummary = {
  id: number;
  name: string;
  slug: string;
  imageUrlAvif: string | null;
  imageUrlWebp: string | null;
  percent: number;
};

/**
 * The courses a user is subscribed to, each with its overall progress
 * percent from one batched query rather than one round trip per course.
 *
 * modulesTable is LEFT JOINed (not INNER) so a subscribed course with zero
 * modules still appears in the result, at 0% — see ManyCourseProgressRow's
 * doc comment for why that placeholder row exists.
 */
export async function getMyCourses(userId: string): Promise<MyCourseSummary[]> {
  const rows = await db
    .select({
      courseId: coursesTable.id,
      name: coursesTable.name,
      slug: coursesTable.slug,
      imageUrlAvif: coursesTable.imageUrlAvif,
      imageUrlWebp: coursesTable.imageUrlWebp,
      moduleId: modulesTable.id,
      lessonId: lessonsTable.id,
      videoId: lessonsTable.videoId,
      watchedHits: countDistinct(videoProgressTable.progress),
    })
    .from(courseSubscriptionsTable)
    .innerJoin(
      coursesTable,
      eq(coursesTable.id, courseSubscriptionsTable.courseId),
    )
    .leftJoin(modulesTable, eq(modulesTable.courseId, coursesTable.id))
    .leftJoin(lessonsTable, eq(lessonsTable.moduleId, modulesTable.id))
    .leftJoin(
      videoProgressTable,
      and(
        eq(videoProgressTable.userId, userId),
        // lessons.video_id is a uuid; videos_progress.video_id is the same
        // value stored as text — cast to join. Matches getCourseProgress.
        eq(videoProgressTable.videoId, sql`${lessonsTable.videoId}::text`),
        inArray(videoProgressTable.progress, watchedMilestones),
      ),
    )
    .where(eq(courseSubscriptionsTable.userId, userId))
    .groupBy(
      coursesTable.id,
      coursesTable.name,
      coursesTable.slug,
      coursesTable.imageUrlAvif,
      coursesTable.imageUrlWebp,
      modulesTable.id,
      modulesTable.rank,
      lessonsTable.id,
      lessonsTable.rank,
      lessonsTable.videoId,
    )
    // courseId as an explicit tiebreak keeps each course's rows contiguous
    // in the result, which the first-seen-wins loop below relies on.
    .orderBy(
      asc(coursesTable.name),
      asc(coursesTable.id),
      asc(modulesTable.rank),
      asc(lessonsTable.rank),
    );

  const percents = aggregatePercentByCourse(
    rows.map((r) => ({
      courseId: r.courseId,
      moduleId: r.moduleId,
      lessonId: r.lessonId,
      videoId: r.videoId,
      watchedHits: Number(r.watchedHits),
    })),
  );

  const courses = new Map<number, MyCourseSummary>();
  for (const r of rows) {
    if (courses.has(r.courseId)) continue;
    courses.set(r.courseId, {
      id: r.courseId,
      name: r.name,
      slug: r.slug,
      imageUrlAvif: r.imageUrlAvif,
      imageUrlWebp: r.imageUrlWebp,
      percent: percents.get(r.courseId) ?? 0,
    });
  }
  return [...courses.values()];
}
```

- [ ] **Step 4: Verify types compile**

Run: `pnpm exec tsc --noEmit`

Expected: zero output. If `countDistinct`, `and`, `asc`, or `sql` report as unresolved, you added them to the wrong import statement — check the file's actual `drizzle-orm` import shape from Step 1 rather than assuming.

- [ ] **Step 5: Check formatting**

Run: `pnpm exec biome check src/db/course.ts`

This file may already have pre-existing biome findings unrelated to your change (it uses double quotes in places — check before assuming a failure is yours). Do not run `--write` if the file's existing style would get reformatted wholesale; make a surgical edit instead if biome flags something outside your added lines.

- [ ] **Step 6: Commit**

```bash
git add src/db/course.ts
git status --short
git commit -m "feat(courses): add getMyCourses"
```

---

## Task 3: API route + hook

**Files:**
- Create: `src/routes/api/course/my-courses.ts`
- Create: `src/routes/api/course/__tests__/my-courses.test.ts`
- Create: `src/data-hooks/use-my-courses.ts`
- Modify: `src/data-hooks/keys.ts`

**Interfaces:**
- Consumes: `getMyCourses` from `#/db/course` (Task 2); `auth` from `#/lib/auth`.
- Produces: `getMyCoursesHandler(request: Request): Promise<Response>`, the route's `Route` export; `useMyCourses(): UseQueryResult<MyCourse[]>` where `MyCourse` is the hook's own inline-schema-inferred type.

- [ ] **Step 1: Write the failing route test**

Create `src/routes/api/course/__tests__/my-courses.test.ts`, mirroring `progress-summary.test.ts`'s structure exactly (same `@vitest-environment node` header, same `vi.hoisted` + `vi.mock` pattern):

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, getMyCourses } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getMyCourses: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/db/course', () => ({ getMyCourses }));

import { getMyCoursesHandler } from '../my-courses';

const courses = [
  {
    id: 1,
    name: '3D Airmanship',
    slug: '3d-airmanship',
    imageUrlAvif: null,
    imageUrlWebp: null,
    percent: 42,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
  getMyCourses.mockResolvedValue(courses);
});

describe('getMyCoursesHandler', () => {
  it('401 when not authenticated', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await getMyCoursesHandler(
      new Request('http://test/api/course/my-courses'),
    );
    expect(res.status).toBe(401);
    expect(getMyCourses).not.toHaveBeenCalled();
  });

  it('returns the caller\'s own courses, scoped by session user id', async () => {
    const res = await getMyCoursesHandler(
      new Request('http://test/api/course/my-courses'),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(courses);
    expect(getMyCourses).toHaveBeenCalledWith('user-1');
  });

  it('500 with a JSON error body when the query throws', async () => {
    getMyCourses.mockRejectedValueOnce(new Error('db down'));
    const res = await getMyCoursesHandler(
      new Request('http://test/api/course/my-courses'),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to load courses' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/routes/api/course/__tests__/my-courses.test.ts`

Expected: FAIL — `../my-courses` does not exist.

- [ ] **Step 3: Write the route**

Create `src/routes/api/course/my-courses.ts`, matching `progress-summary.ts`'s structure and single-quote style exactly:

```ts
import { createFileRoute } from '@tanstack/react-router';
import { getMyCourses } from '#/db/course';
import { auth } from '#/lib/auth';

/**
 * The logged-in user's subscribed courses with per-course progress, for the
 * /app course list. Any authenticated user may read their own subscriptions —
 * no admin role needed.
 */
export async function getMyCoursesHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const courses = await getMyCourses(session.user.id);
    return Response.json(courses);
  } catch (error) {
    console.error('Failed to read my courses:', error);
    return Response.json({ error: 'Failed to load courses' }, { status: 500 });
  }
}

export const Route = createFileRoute('/api/course/my-courses')({
  server: {
    handlers: {
      GET: ({ request }) => getMyCoursesHandler(request),
    },
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/routes/api/course/__tests__/my-courses.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Add the query key**

In `src/data-hooks/keys.ts`, add to the `dataKeys` object:

```ts
  myCourses: () => ['user', 'my-courses'] as const,
```

Place it near `chats: () => ['user', 'chats'] as const,` — same `['user', ...]` namespace convention.

- [ ] **Step 6: Write the hook**

Create `src/data-hooks/use-my-courses.ts`, following `use-course-progress-summary.ts`'s exact shape — a `useQuery` wrapping `fetch`, with an inline zod schema rather than an imported type:

```ts
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from './keys';

const myCourseSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  imageUrlAvif: z.string().nullable(),
  imageUrlWebp: z.string().nullable(),
  percent: z.number(),
});

export type MyCourse = z.infer<typeof myCourseSchema>;

/** The logged-in user's subscribed courses, each with an overall progress percent. */
export function useMyCourses() {
  return useQuery({
    queryKey: dataKeys.myCourses(),
    queryFn: async () => {
      const res = await fetch('/api/course/my-courses');
      if (!res.ok) throw new Error(`Failed to load courses (${res.status})`);
      return myCourseSchema.array().parse(await res.json());
    },
    staleTime: 60_000,
  });
}
```

- [ ] **Step 7: Verify types and formatting**

Run: `pnpm exec tsc --noEmit`
Run: `pnpm exec biome check src/routes/api/course/my-courses.ts src/routes/api/course/__tests__/my-courses.test.ts src/data-hooks/use-my-courses.ts src/data-hooks/keys.ts`

- [ ] **Step 8: Run the full suite so far**

Run: `pnpm test`

Expected: at least 104 test files pass (baseline 102, plus the Task 1 additions to an existing file don't add a file, plus this task's new `my-courses.test.ts`). Judge by "no failures, no fewer files than before your changes" rather than a hardcoded number — you don't have the exact file count from Task 1's additions to an existing file in front of you.

- [ ] **Step 9: Commit**

```bash
git add src/routes/api/course/my-courses.ts src/routes/api/course/__tests__/my-courses.test.ts src/data-hooks/use-my-courses.ts src/data-hooks/keys.ts
git status --short
git commit -m "feat(courses): add my-courses API route and hook"
```

---

## Task 4: `CourseCard` and `MyCoursesPageContainer`

**Files:**
- Create: `src/components/courses/course-card.tsx`
- Create: `src/components/courses/__tests__/course-card.test.tsx`
- Create: `src/components/courses/my-courses-container.tsx`
- Modify: `src/routes/_authed/app.tsx`

**Interfaces:**
- Consumes: `type MyCourse` and `useMyCourses` from `#/data-hooks/use-my-courses` (the container only); `OptimizedPicture` from `#/components/admin/optimized-picture` (that component lives at `src/components/admin/optimized-picture.tsx` — `admin/course-tile.tsx` reaches it with a same-directory relative import, `'./optimized-picture'`, but `course-card.tsx` lives in a different directory, so use the `#/` alias instead of a relative path); `CircularProgress` from `#/components/ui/circular-progress` (at `src/components/ui/circular-progress.tsx`, same reasoning).
- Produces: `CourseCard({ course }: { course: MyCourse })` (presentational — `percent` lives inside `course`, it is not a separate prop); `MyCoursesPageContainer` (data + render).

`CourseCard` mirrors `src/components/admin/course-tile.tsx`'s markup and class names closely (same cover treatment, same rounded-border card), but:
- links to `/course/$courseSlug` instead of `/admin/$courseId/editor`,
- shows a `CircularProgress` (matching `CourseSidebarHeader`'s treatment: `size={24}`ish scaled for a card — use `size={32}` here since the card is bigger) instead of a slug and module/lesson counts.

- [ ] **Step 1: Write the failing component test**

Create `src/components/courses/__tests__/course-card.test.tsx`. `LessonLink`'s and `CourseTile`'s own test files don't exist for the latter (there is no `course-tile.test.tsx` in this repo), so there is no direct precedent to copy for a `Link`-wrapping presentational component's test — instead, mirror `lesson-link.test.tsx`'s router-wrapping pattern (`createRootRoute` + `createRoute` + `createRouter` + `RouterProvider`), since `CourseCard` also renders a `<Link>`:

```tsx
// @vitest-environment jsdom
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CourseCard } from '../course-card';

async function renderInRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <>{ui}</>,
  });
  const courseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/course/$courseSlug',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, courseRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
  await waitFor(() => {
    expect(router.state.isLoading).toBe(false);
  });
}

const course = {
  id: 1,
  name: '3D Airmanship',
  slug: '3d-airmanship',
  imageUrlAvif: null,
  imageUrlWebp: null,
  percent: 42,
};

describe('CourseCard', () => {
  it('links to the course route by slug', async () => {
    await renderInRouter(<CourseCard course={course} />);
    const link = screen.getByRole('link', { name: /3D Airmanship/ });
    expect(link.getAttribute('href')).toBe('/course/3d-airmanship');
  });

  it('renders the course name', async () => {
    await renderInRouter(<CourseCard course={course} />);
    expect(screen.getByText('3D Airmanship')).toBeDefined();
  });

  it('shows a fallback icon when there is no cover image', async () => {
    const { container } = await renderInRouter(<CourseCard course={course} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('shows the progress value in an accessible label', async () => {
    await renderInRouter(<CourseCard course={course} />);
    expect(
      screen.getByLabelText(/3D Airmanship.*progress/i),
    ).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/components/courses/__tests__/course-card.test.tsx`

Expected: FAIL — `../course-card` does not exist.

- [ ] **Step 3: Write `CourseCard`**

First check the real relative paths: from `src/components/courses/course-card.tsx`, `OptimizedPicture` lives at `src/components/admin/optimized-picture.tsx` and `CircularProgress` at `src/components/ui/circular-progress.tsx`. Use `#/components/admin/optimized-picture` and `#/components/ui/circular-progress` (the `#/` alias resolves from `src/`, so this works regardless of directory depth and matches how `course-sidebar-wrapper.tsx` already reaches across directories via `#/`).

Create `src/components/courses/course-card.tsx`:

```tsx
import { Link } from '@tanstack/react-router';
import { ImageIcon } from 'lucide-react';
import { OptimizedPicture } from '#/components/admin/optimized-picture';
import { CircularProgress } from '#/components/ui/circular-progress';
import type { MyCourse } from '#/data-hooks/use-my-courses';

type CourseCardProps = {
  course: MyCourse;
};

export const CourseCard = ({ course }: CourseCardProps) => {
  const hasCover = Boolean(course.imageUrlWebp ?? course.imageUrlAvif);

  return (
    <Link
      to="/course/$courseSlug"
      params={{ courseSlug: course.slug }}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-6 bg-gray-2 transition-colors hover:border-gray-8"
    >
      <div className="aspect-video w-full overflow-hidden bg-gray-3">
        {hasCover ? (
          <OptimizedPicture
            avifUrl={course.imageUrlAvif}
            webpUrl={course.imageUrlWebp}
            alt={`${course.name} cover`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-8">
            <ImageIcon className="h-8 w-8" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 p-5">
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-primary">
          {course.name}
        </h3>
        <CircularProgress
          value={course.percent}
          size={32}
          strokeWidth={8}
          ariaLabel={`${course.name} progress`}
        />
      </div>
    </Link>
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/components/courses/__tests__/course-card.test.tsx`

Expected: PASS, 4 tests.

- [ ] **Step 5: Write `MyCoursesPageContainer`**

Create `src/components/courses/my-courses-container.tsx`, mirroring `src/components/admin/admin-courses-page-container.tsx`'s structure (`.content-grid` wrapper, loading/error/empty/populated states, `.grid-auto-fit`) but without the create-course button and with different copy:

```tsx
import { useMyCourses } from '#/data-hooks/use-my-courses';
import { CourseCard } from './course-card';

export const MyCoursesPageContainer = () => {
  const { data: courses, isLoading, error } = useMyCourses();

  return (
    <div className="content-grid py-10">
      <div className="content flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-primary">My Courses</h1>
          <p className="text-sm text-secondary">
            Pick up where you left off.
          </p>
        </header>

        {isLoading ? (
          <p className="text-sm text-secondary">Loading courses…</p>
        ) : error ? (
          <p className="text-sm text-error-text">
            Failed to load courses. Please try again.
          </p>
        ) : !courses || courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-6 bg-gray-2 p-10 text-center">
            <p className="text-sm font-medium text-primary">
              You're not enrolled in any courses yet
            </p>
          </div>
        ) : (
          <ul className="grid-auto-fit list-none p-0">
            {courses.map((course) => (
              <li key={course.id}>
                <CourseCard course={course} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 6: Wire it into the `/app` route**

Rewrite `src/routes/_authed/app.tsx` in full:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { MyCoursesPageContainer } from '../../components/courses/my-courses-container';

export const Route = createFileRoute('/_authed/app')({
  component: MyCoursesPageContainer,
});
```

This deliberately drops the `AppShell`/`CourseSidebarWrapper`/`LessonEmpty`/footer that were here before — that chrome now belongs to Task 5's `course.$courseSlug.tsx` layout route, which this route no longer owns. Do not leave any of it behind as dead code in this file.

- [ ] **Step 7: Verify types and formatting**

Run: `pnpm exec tsc --noEmit` — expect errors here about `LessonEmpty`/`CourseSidebarWrapper`/`appTitle` no longer being used in `app.tsx` to resolve themselves once Task 5 removes the old lesson route file; if `app.tsx` alone has unused-import errors after this step, remove the now-dead imports from `app.tsx`.

Run: `pnpm exec biome check src/components/courses/ src/routes/_authed/app.tsx`

- [ ] **Step 8: Commit**

```bash
git add src/components/courses/ src/routes/_authed/app.tsx
git status --short
git commit -m "feat(courses): add CourseCard and the My Courses page"
```

---
## Task 5: Route restructure + de-hardcode the lesson header/main

**Files:**
- Create: `src/routes/_authed/course.$courseSlug.tsx`
- Create: `src/routes/_authed/course.$courseSlug.index.tsx`
- Create: `src/routes/_authed/course.$courseSlug.modules.$moduleSlug.lessons.$lessonSlug.tsx`
- Delete: `src/routes/_authed/modules.$moduleSlug.lessons.$lessonSlug.tsx`
- Modify: `src/components/lesson-main/lesson-header-wrapper.tsx`
- Modify: `src/components/lesson-main/lesson-main-wrapper.tsx`

**Interfaces:**
- Consumes: `AppShell` from `../../components/app-shell`; `CourseSidebarWrapper` from `../../components/sidebar/course-sidebar-wrapper` (still prop-less — Task 6 changes its *internals*, not its call signature, so this task can create its call site now); `LessonEmpty`, `LessonHeaderWrapper`, `LessonMainWrapper` from `../../components/lesson-main`; `appTitle` from `../../styles/theme.generated`; `useParams`, `Outlet` from `@tanstack/react-router`.
- Produces: the three new route files; `LessonHeaderWrapper({ courseSlug, moduleSlug, lessonSlug })`; `LessonMainWrapper({ courseSlug, moduleSlug, lessonSlug })`.

**Why the header is rendered from the layout, not the lesson leaf route.** `AppShell`'s CSS (`src/styles.css`, `.app-shell` grid) puts `.app-shell__header` in its own grid row, entirely outside the `<ScrollArea>` that wraps `.app-shell__main`. If `LessonHeaderWrapper` were rendered inside the lesson leaf's own output (which flows into `main` via `Outlet`), it would scroll away with the lesson content instead of staying pinned — a real visual regression, not just a wiring detail. `AppShell.headerMain` is optional (`headerMain?: ReactNode`), so the layout renders it only when the current leaf is the lesson route, using the same "loose params, presence implies which leaf is active" idiom `CourseSidebarWrapper` already uses for `moduleSlug`/`lessonSlug`.

`AppShell` currently has exactly two consumers in this codebase (`src/routes/_authed/app.tsx` and the old lesson route) — Task 4 already retired the first, and this task retires the second, so after this task `course.$courseSlug.tsx` is the sole consumer. No other call site is affected by anything in this task.

**Import style:** these three route files and the two wrapper files are the direct continuation of the old lesson route's content — mirror that file's relative `../../components/...` import style (not `admin.index.tsx`'s `@/components/...` style).

- [ ] **Step 1: Create the layout route**

The old lesson route, read in full during planning, is:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '../../components/app-shell';
import {
  LessonHeaderWrapper,
  LessonMainWrapper,
} from '../../components/lesson-main';
import { CourseSidebarWrapper } from '../../components/sidebar/course-sidebar-wrapper';
import { appTitle } from '../../styles/theme.generated';

export const Route = createFileRoute(
  '/_authed/modules/$moduleSlug/lessons/$lessonSlug',
)({
  component: LessonRoute,
});

function LessonRoute() {
  const { moduleSlug, lessonSlug } = Route.useParams();
  return (
    <AppShell
      headerMain={
        <LessonHeaderWrapper moduleSlug={moduleSlug} lessonSlug={lessonSlug} />
      }
      aside={<CourseSidebarWrapper />}
      main={
        <LessonMainWrapper moduleSlug={moduleSlug} lessonSlug={lessonSlug} />
      }
      footer={
        <div className="flex items-center justify-between h-full ps-4 pe-4 text-secondary text-sm">
          <span>© {appTitle}</span>
        </div>
      }
    />
  );
}
```

Create `src/routes/_authed/course.$courseSlug.tsx`, moving the `AppShell`/`aside`/`footer` here, replacing `main` with `<Outlet />`, and moving `headerMain` here too — rendered conditionally, since the index route (course home) has no header and the lesson route does:

```tsx
import { createFileRoute, Outlet, useParams } from '@tanstack/react-router';
import { AppShell } from '../../components/app-shell';
import { LessonHeaderWrapper } from '../../components/lesson-main';
import { CourseSidebarWrapper } from '../../components/sidebar/course-sidebar-wrapper';
import { appTitle } from '../../styles/theme.generated';

export const Route = createFileRoute('/_authed/course/$courseSlug')({
  component: CourseLayout,
});

function CourseLayout() {
  const { courseSlug } = Route.useParams();
  // Loose read: these two params belong to the deeper lesson route, not this
  // layout's own path. Their presence is how the layout knows which leaf is
  // active — the same idiom CourseSidebarWrapper already uses for the same
  // two params. This only needs to distinguish two leaf shapes (course home
  // vs. a lesson); if a third leaf ever needs its own headerMain content,
  // revisit this rather than extending the presence check further.
  const lessonParams = useParams({ strict: false }) as {
    moduleSlug?: string;
    lessonSlug?: string;
  };
  const isLessonRoute =
    lessonParams.moduleSlug != null && lessonParams.lessonSlug != null;

  return (
    <AppShell
      headerMain={
        isLessonRoute ? (
          <LessonHeaderWrapper
            courseSlug={courseSlug}
            moduleSlug={lessonParams.moduleSlug as string}
            lessonSlug={lessonParams.lessonSlug as string}
          />
        ) : undefined
      }
      aside={<CourseSidebarWrapper />}
      main={<Outlet />}
      footer={
        <div className="flex items-center justify-between h-full ps-4 pe-4 text-secondary text-sm">
          <span>© {appTitle}</span>
        </div>
      }
    />
  );
}
```

- [ ] **Step 2: Create the course-home index route**

Create `src/routes/_authed/course.$courseSlug.index.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { LessonEmpty } from '../../components/lesson-main';

export const Route = createFileRoute('/_authed/course/$courseSlug/')({
  component: LessonEmpty,
});
```

- [ ] **Step 3: Create the nested lesson route**

Create `src/routes/_authed/course.$courseSlug.modules.$moduleSlug.lessons.$lessonSlug.tsx`. This renders only `LessonMainWrapper` — the layout (Step 1) already supplies the header:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { LessonMainWrapper } from '../../components/lesson-main';

export const Route = createFileRoute(
  '/_authed/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug',
)({
  component: LessonRoute,
});

function LessonRoute() {
  const { courseSlug, moduleSlug, lessonSlug } = Route.useParams();
  return (
    <LessonMainWrapper
      courseSlug={courseSlug}
      moduleSlug={moduleSlug}
      lessonSlug={lessonSlug}
    />
  );
}
```

- [ ] **Step 4: Delete the old lesson route**

```bash
git rm src/routes/_authed/modules.\$moduleSlug.lessons.\$lessonSlug.tsx
```

- [ ] **Step 5: De-hardcode `lesson-header-wrapper.tsx`**

Remove `const COURSE_SLUG = '3d-airmanship';`. Add `courseSlug` to the props type and use it:

```ts
type LessonHeaderWrapperProps = {
  courseSlug: string;
  moduleSlug: string;
  lessonSlug: string;
};

export const LessonHeaderWrapper = ({
  courseSlug,
  moduleSlug,
  lessonSlug,
}: LessonHeaderWrapperProps) => {
  const course = useCourseDetails(courseSlug);
  // ...unchanged below this line
```

- [ ] **Step 6: De-hardcode `lesson-main-wrapper.tsx`**

Remove `const COURSE_SLUG = '3d-airmanship';`. Add `courseSlug` to the props type and use it — **there are two call sites to fix, not one**: the `useCourseDetails` call, and the `queryKeys.courseDetails(...)` reference inside `onRetryCourse`'s `invalidateQueries` call (confirmed by reading the full file during planning):

```ts
type LessonMainWrapperProps = {
  courseSlug: string;
  moduleSlug: string;
  lessonSlug: string;
};

export const LessonMainWrapper = ({
  courseSlug,
  moduleSlug,
  lessonSlug,
}: LessonMainWrapperProps) => {
  const queryClient = useQueryClient();
  const course = useCourseDetails(courseSlug);
  // ...unchanged through the rest of the function body until:
    onRetryCourse: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.courseDetails(courseSlug),
      });
    },
  // ...rest unchanged
```

- [ ] **Step 7: Regenerate the route tree and verify types**

TanStack Router regenerates `src/routeTree.gen.ts` automatically from a dev server or build run — never hand-edit it. Check `package.json`'s scripts for a dedicated route-codegen step before defaulting to a full `pnpm dev` cycle; if none exists, run `pnpm dev` briefly, confirm in its terminal output that it picked up the new/deleted routes, then stop it.

Run: `pnpm exec tsc --noEmit`

Expected: zero output. If you see an error inside `course.$courseSlug.tsx` about `headerMain`'s type, confirm you kept `undefined` (not `null`) for the non-lesson branch — `AppShellProps.headerMain` is typed `ReactNode | undefined` via the optional `?`, and `null` is also assignable to `ReactNode` so either works, but prefer `undefined` to match how the prop is *omitted* rather than *explicitly nulled* conceptually.

- [ ] **Step 8: Manual smoke check**

Run `pnpm dev` and in a browser confirm, by typing URLs directly (the sidebar's own links still point at the old flat path until Task 6 — see that task's note):
- `/course/3d-airmanship` renders the shell + sidebar + the old `LessonEmpty` body, no header row content.
- `/course/3d-airmanship/modules/<a-real-module-slug>/lessons/<a-real-lesson-slug>` renders the shell + sidebar + the lesson header (in the fixed header row, not scrolling with the content) + lesson main.
- Scroll the lesson content and confirm the header stays pinned — this is the specific regression this task's design avoids; worth actually checking, not just trusting the CSS reasoning.

Stop the dev server once confirmed.

- [ ] **Step 9: Check formatting**

Run: `pnpm exec biome check src/components/lesson-main/lesson-header-wrapper.tsx src/components/lesson-main/lesson-main-wrapper.tsx "src/routes/_authed/course.\$courseSlug.tsx" "src/routes/_authed/course.\$courseSlug.index.tsx" "src/routes/_authed/course.\$courseSlug.modules.\$moduleSlug.lessons.\$lessonSlug.tsx"`

- [ ] **Step 10: Commit**

```bash
git add "src/routes/_authed/course.\$courseSlug.tsx" "src/routes/_authed/course.\$courseSlug.index.tsx" "src/routes/_authed/course.\$courseSlug.modules.\$moduleSlug.lessons.\$lessonSlug.tsx" src/components/lesson-main/lesson-header-wrapper.tsx src/components/lesson-main/lesson-main-wrapper.tsx src/routeTree.gen.ts
git status --short
git commit -m "feat(routing): nest the course/lesson routes under /course/\$courseSlug"
```

Confirm the old lesson route file's deletion (`git rm` from Step 4) is staged in this same commit — `git status --short` should show it as `D`. Do not split the delete into a separate commit; the route tree is invalid with the new nested routes present and the old flat one still there (both would claim overlapping path segments once `moduleSlug`/`lessonSlug` are involved).

---

## Task 6: De-hardcode `CourseSidebarWrapper` and thread `courseSlug` to the lesson links

**Files:**
- Modify: `src/components/sidebar/course-sidebar-wrapper.tsx`
- Modify: `src/components/sidebar/course-sidebar.tsx`
- Modify: `src/components/sidebar/module-accordion.tsx`
- Modify: `src/components/sidebar/module-item.tsx`
- Modify: `src/components/sidebar/lesson-list.tsx`
- Modify: `src/components/sidebar/lesson-link.tsx`
- Modify: `src/components/sidebar/__tests__/lesson-link.test.tsx`
- Modify: `src/components/sidebar/__tests__/module-accordion.test.tsx`
- Modify: `src/components/sidebar/__tests__/module-item.test.tsx`
- Modify: `src/components/sidebar/__tests__/lesson-list.test.tsx`
- Modify: `src/components/sidebar/__tests__/course-sidebar.test.tsx`
- Modify: `src/components/sidebar/__tests__/course-sidebar-wrapper.test.tsx`

**Interfaces:**
- Produces: `CourseSidebarWrapper` (still no props — now derives `courseSlug` from `useParams` instead of a constant); a new `courseSlug: string` prop on `CourseSidebar`, `ModuleAccordion`, `ModuleItem`, `LessonList`, and `LessonLink`.

**Why this task is not split further:** after Task 5's commit lands, the old flat route `/modules/$moduleSlug/lessons/$lessonSlug` no longer exists — but `lesson-link.tsx` still generates a `Link` to it until this task changes it. That means between Task 5 and this task, every sidebar lesson link is a dead link (a 404 on click). This is acceptable *within* a single implementation session with review gates between tasks, but do not stop and consider the app "working" at the Task 5 boundary — the manual smoke test in Task 5 deliberately types URLs directly rather than clicking sidebar links, for exactly this reason. Get to this task's commit before doing any broader manual exploration.

**Why `courseSlug` must be a prop at every level, not a `useParams()` call in `LessonLink` itself:** `CourseSidebar`, `ModuleAccordion`, `ModuleItem`, `LessonList`, and `LessonLink` are all presentational (props only, no data/routing hooks — Global Constraints). `activeLessonSlug` and `lessonPercents` are already threaded exactly this way, constant-valued, through this same five-component chain — `courseSlug` follows that established pattern.

- [ ] **Step 1: `course-sidebar-wrapper.tsx`**

Remove `const COURSE_SLUG = "3d-airmanship";`. Extend the existing `useParams({ strict: false })` cast to include `courseSlug`:

```ts
  const params = useParams({ strict: false }) as {
    courseSlug?: string;
    moduleSlug?: string;
    lessonSlug?: string;
  };
```

Replace both uses of `COURSE_SLUG` in this file — `courseDetailsAtomFamily(COURSE_SLUG)` and `useCourseProgressSummary(COURSE_SLUG)` — with `params.courseSlug ?? ""`. Both hooks already handle an empty-string slug as "no course yet, stay disabled" (`enabled: !!slug` / `slug.length > 0`, confirmed by reading both hooks during planning) — that is the correct behaviour for a render before the URL param is available, not an error case to special-case here.

Pass `courseSlug={params.courseSlug ?? ""}` to **both** `<CourseSidebar>` call sites in this file — the loading/error early return, and the ready-state return:

```tsx
  if (derived.status === "loading" || derived.status === "error") {
    return (
      <CourseSidebar
        courseSlug={params.courseSlug ?? ""}
        status={derived.status}
        openModuleSlug={openModuleSlug}
        onOpenChange={setOpenModuleSlug}
        activeLessonSlug={null}
      />
    );
  }

  return (
    <CourseSidebar
      courseSlug={params.courseSlug ?? ""}
      status="ready"
      // ...rest of this call unchanged
```

- [ ] **Step 2: `lesson-link.tsx`**

Add `courseSlug` to the props type and use it in the `Link`:

```tsx
type LessonLinkProps = {
  courseSlug: string;
  moduleSlug: string;
  lesson: LessonLike;
  rank: number;
  isActive: boolean;
  progressPercent: number;
};

export const LessonLink = ({
  courseSlug,
  moduleSlug,
  lesson,
  rank,
  isActive,
  progressPercent,
}: LessonLinkProps) => {
  // ...classes computation unchanged...
  return (
    <Link
      to="/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug"
      params={{ courseSlug, moduleSlug, lessonSlug: lesson.slug }}
      aria-current={isActive ? 'page' : undefined}
      viewTransition
      className={classes}
    >
      {/* unchanged below */}
```

- [ ] **Step 3: `lesson-list.tsx`**

Add `courseSlug` to `LessonListProps` and pass it to each `LessonLink`:

```tsx
type LessonListProps = {
  courseSlug: string;
  moduleSlug: string;
  lessons: readonly LessonLike[];
  activeLessonSlug: string | null;
  lessonPercents: Record<string, number>;
};

export const LessonList = ({
  courseSlug,
  moduleSlug,
  lessons,
  activeLessonSlug,
  lessonPercents,
}: LessonListProps) => (
  <ul className="flex flex-col gap-sidebar-row-gap py-sidebar-row-block">
    {lessons.map((lesson, index) => (
      <li key={lesson.slug}>
        <LessonLink
          courseSlug={courseSlug}
          moduleSlug={moduleSlug}
          lesson={lesson}
          rank={index + 1}
          isActive={lesson.slug === activeLessonSlug}
          progressPercent={
            (lesson.videoId && lessonPercents[lesson.videoId]) || 0
          }
        />
      </li>
    ))}
  </ul>
);
```

- [ ] **Step 4: `module-item.tsx`**

Add `courseSlug` to `ModuleItemProps` and pass it to `LessonList`:

```tsx
type ModuleItemProps = {
  courseSlug: string;
  module: ModuleLike;
  rank: number;
  isOpen: boolean;
  activeLessonSlug: string | null;
  modulePercent: number;
  lessonPercents: Record<string, number>;
};

export const ModuleItem = ({
  courseSlug,
  module,
  rank,
  isOpen,
  activeLessonSlug,
  modulePercent,
  lessonPercents,
}: ModuleItemProps) => (
  // ...unchanged down to the LessonList call, then:
              <LessonList
                courseSlug={courseSlug}
                moduleSlug={module.slug}
                lessons={module.lessons}
                activeLessonSlug={activeLessonSlug}
                lessonPercents={lessonPercents}
              />
  // ...rest unchanged
```

- [ ] **Step 5: `module-accordion.tsx`**

Add `courseSlug` to `ModuleAccordionProps` and pass it to each `ModuleItem`:

```tsx
type ModuleAccordionProps = {
  courseSlug: string;
  modules: readonly ModuleLike[];
  openModuleSlug: string | null;
  onOpenChange: (slug: string | null) => void;
  activeLessonSlug: string | null;
  lessonPercents: Record<string, number>;
  modulePercents: Record<number, number>;
};

export const ModuleAccordion = ({
  courseSlug,
  modules,
  openModuleSlug,
  onOpenChange,
  activeLessonSlug,
  lessonPercents,
  modulePercents,
}: ModuleAccordionProps) => (
  // ...unchanged down to the ModuleItem call, then:
        <ModuleItem
          key={module.slug}
          courseSlug={courseSlug}
          module={module}
          rank={index + 1}
          isOpen={openModuleSlug === module.slug}
          activeLessonSlug={activeLessonSlug}
          modulePercent={modulePercents[module.id] ?? 0}
          lessonPercents={lessonPercents}
        />
  // ...rest unchanged
```

- [ ] **Step 6: `course-sidebar.tsx`**

Add `courseSlug` to `CourseSidebarProps` and pass it to `ModuleAccordion`. `courseSlug` is a required prop regardless of `status` — the component always receives it, it's simply unused in the `loading`/`error` branches:

```tsx
type CourseSidebarProps = {
  courseSlug: string;
  status: 'loading' | 'error' | 'ready';
  // ...rest unchanged
};

export const CourseSidebar = ({
  courseSlug,
  status,
  // ...rest of the destructure unchanged
}: CourseSidebarProps) => (
  // ...unchanged down to the ModuleAccordion call, then:
            <ModuleAccordion
              courseSlug={courseSlug}
              modules={modules ?? []}
              openModuleSlug={openModuleSlug}
              onOpenChange={onOpenChange}
              activeLessonSlug={activeLessonSlug}
              lessonPercents={lessonPercents ?? {}}
              modulePercents={modulePercents ?? {}}
            />
  // ...rest unchanged
```

- [ ] **Step 7: Update the six test files**

**`course-sidebar-wrapper.test.tsx`** — its `renderAt` helper's `lessonRoute` currently has `path: '/modules/$moduleSlug/lessons/$lessonSlug'`; change it to `path: '/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug'`. Its one call site rendering at that path currently is:

```tsx
    await renderAt('/modules/intermediate/lessons/yaw', {
```

change to:

```tsx
    await renderAt('/course/3d-airmanship/modules/intermediate/lessons/yaw', {
```

The other three call sites in this file render at `'/'` and are unaffected — they assert on loading/error/null-data rendering, not on which course loaded, and never reach a route with `courseSlug`/`moduleSlug`/`lessonSlug` params either before or after this change. No new prop is passed here — this file renders `<CourseSidebarWrapper />` (no props, before and after this whole plan), so this file only needed the route-path fix, done above.

**`lesson-link.test.tsx`** — change `lessonRoute`'s `path` to `'/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug'`. Add `courseSlug="3d-airmanship"` to all three `<LessonLink .../>` JSX call sites. Update the one `href` assertion:

```ts
    expect(link.getAttribute('href')).toBe(
      '/course/3d-airmanship/modules/fundamentals/lessons/pitch-and-roll',
    );
```

**`module-accordion.test.tsx`** — change `lessonRoute`'s `path` the same way. Add `courseSlug="3d-airmanship"` to the single `<ModuleAccordion .../>` call inside `renderIn`. No `href` assertions exist in this file (it only asserts on `onOpenChange` calls and button counts) — none to update.

**`module-item.test.tsx`** — change `lessonRoute`'s `path` the same way. Add `courseSlug="3d-airmanship"` to the single `<ModuleItem .../>` call inside `renderInside`. No `href` assertions to update.

**`lesson-list.test.tsx`** — change `lessonRoute`'s `path` the same way. Add `courseSlug="3d-airmanship"` to both `<LessonList .../>` call sites. No `href` assertions to update (it only checks `aria-current` and element counts).

**`course-sidebar.test.tsx`** — change `lessonRoute`'s `path` the same way. Add `courseSlug: '3d-airmanship'` to all four `props` object literals passed to `renderStatus` (the two `'loading'` calls, the one `'error'` call, and the one `'ready'` call with `modules`). No `href` assertions to update.

- [ ] **Step 8: Run the affected tests**

Run: `pnpm vitest run src/components/sidebar/__tests__/lesson-link.test.tsx src/components/sidebar/__tests__/module-accordion.test.tsx src/components/sidebar/__tests__/module-item.test.tsx src/components/sidebar/__tests__/lesson-list.test.tsx src/components/sidebar/__tests__/course-sidebar.test.tsx src/components/sidebar/__tests__/course-sidebar-wrapper.test.tsx`

Expected: PASS, same test counts as before this task in every file (3, 3, 3, 2, 4, 4 respectively, per the files read during planning) — this task changes props and paths, not behaviour or test count.

- [ ] **Step 9: Full suite, formatting, types**

Run: `pnpm test` — no regressions.
Run: `pnpm exec biome check src/components/sidebar/`
Run: `pnpm exec tsc --noEmit`

- [ ] **Step 10: Manual smoke test**

Run `pnpm dev`; confirm clicking a lesson link in the sidebar now navigates to `/course/3d-airmanship/modules/.../lessons/...` (not the old flat path — the previous task's dead-link caveat no longer applies as of this commit), and the link's active-state highlighting still works after navigation. Also re-check the header-stays-pinned behaviour from Task 5's smoke test still holds when navigating via a sidebar click rather than a typed URL. Stop the dev server once confirmed.

- [ ] **Step 11: Commit**

```bash
git add src/components/sidebar/
git status --short
git commit -m "feat(courses): thread courseSlug through the sidebar to lesson links"
```

Confirm `git status --short` shows only files under `src/components/sidebar/` staged.

---

## Task 7: Final verification

**Files:** none modified — this task only verifies.

- [ ] **Step 1: Confirm the hardcoded slug is gone from the intended places**

Run: `grep -rn "3d-airmanship" src/components/ src/routes/`

Expected: **zero matches inside non-test source files.** Test files are expected to still contain the literal string `'3d-airmanship'` as a test fixture value (e.g. `courseSlug="3d-airmanship"` in the sidebar tests from Task 6, and `fakeCourse.slug` in `course-sidebar-wrapper.test.tsx`) — that is correct and intentional, not a leftover hardcode. If grep reports a match inside a file that is not under a `__tests__/` directory, that is a real regression from this plan — go fix it before proceeding.

Do not grep `src/ai/` — `search-kb.ts`'s occurrence is deliberately deferred (Global Constraints) and is outside `src/components/` and `src/routes/` anyway, so this command won't surface it regardless.

- [ ] **Step 2: Full suite**

Run: `pnpm test`

Expected: zero failures, and no fewer test files than existed after Task 6 (this plan added test files in Tasks 1, 3, and 4 — do not chase an exact running total if you're unsure of it; confirm instead that nothing regressed by checking the file count did not drop and the failure count is 0).

- [ ] **Step 3: Full type check**

Run: `pnpm exec tsc --noEmit`

Expected: zero output.

- [ ] **Step 4: Full biome check**

Run: `pnpm exec biome check src/`

Pre-existing failures may exist elsewhere in the tree unrelated to this plan (e.g. `src/db/schema.ts`'s known pre-existing quote-style diff, if that file is still dirty from other work). This step confirms *your* changes are clean, not that the whole repo is zero-error if it wasn't before you started. If unsure whether a given finding predates this plan, compare against a `biome check src/` run on `main`.

- [ ] **Step 5: Manual end-to-end smoke test**

Run `pnpm dev` and walk the full flow once: `/app` shows the course list → click the course tile → lands on `/course/3d-airmanship` with the shell/sidebar/empty-state → click a lesson in the sidebar → lands on the nested lesson URL with the right content, header pinned while the lesson body scrolls → the sidebar's active-lesson highlighting matches. Stop the dev server once confirmed.
## Done criteria

- `pnpm test` passes with no regressions against the 102-file / 592-test baseline.
- `pnpm exec tsc --noEmit` reports zero output.
- `/app` renders a list of the user's subscribed courses via `useMyCourses`, each tile linking to `/course/$courseSlug`.
- `/course/$courseSlug` and `/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug` both render correctly, sharing one `AppShell`/sidebar via the layout route.
- No occurrence of `'3d-airmanship'` remains in non-test files under `src/components/` or `src/routes/`.
- `src/ai/tools/search-kb.ts` is untouched.

## Explicitly out of scope

Per the spec's Non-goals and Deferred sections:

- Onboarding UI on `/course/$courseSlug`.
- Making the AI chat course-aware, or touching `search-kb.ts`.
- Any redirect from the old flat `/modules/...` URLs to the new nested ones.
- Course enrolment/purchase flows.
- Admin routes (`/admin/$courseId/editor` and its siblings are unchanged).
