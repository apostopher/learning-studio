# Course editor board (layout + data, step 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/admin/$courseId/editor` rendering a static Trello-style board (fixed-width module columns, sticky headers, dual-axis scroll) fed by a guarded `/api/admin` board endpoint; make course tiles link to it. No drag-and-drop yet.

**Architecture:** `admin.tsx` becomes a guarded layout; the grid moves to `admin.index.tsx`; a new editor route renders a board container that fetches via `useCourseBoard`. Board data comes from a new `getCourseBoard` DB fn behind `GET /api/admin/courses/$courseId/board`. UI is a container + presentational components using Baseline CSS (overflow scrolling + sticky).

**Tech Stack:** TanStack Start/Router, TanStack Query, Drizzle/Postgres, zod, Base UI/Lucide, Tailwind token scales.

## Global Constraints

- Admin endpoints are API route handlers under `src/routes/api/admin/`, each opening with `await requireAdmin(request.headers)` → 403 on `ForbiddenError`. Client fetching only via TanStack Query hooks in `src/data-hooks/`, zod-parsing responses.
- `/admin*` routes are guarded by the role check on the `admin` layout (`context.roles.includes(ADMIN_ROLE)`).
- Presentational/container split: presentational pure (props only, may use `Link`); container holds the hook. Token colors only (`gray-*`,`apple-*`,`red-*`); logical inline-axis CSS; `.content-grid` for the grid page; kebab-case files.
- Commands: pnpm. Typecheck `pnpm exec tsc --noEmit` (3 pre-existing unrelated `ai-test` errors expected — ignore). Build `pnpm build` (regenerates `src/routeTree.gen.ts`). Format `pnpm exec biome check --write <paths>`. The user's uncommitted `package.json` dev-script line, `src/db/schema.ts`, `CLAUDE.md` must never be staged — explicit `git add <paths>` only.

---

## File Structure

- `src/lib/admin-schemas.ts` — **modify.** Board wire schemas + types.
- `src/db/admin.ts` — **modify.** `getCourseBoard`.
- `src/routes/api/admin/courses.$courseId.board.ts` — **new.** Guarded GET board.
- `src/data-hooks/keys.ts` — **modify.** `courseBoard` key.
- `src/data-hooks/use-course-board.ts` — **new.** Board hook.
- `src/components/admin/lesson-card.tsx`, `module-column.tsx`, `course-board.tsx`, `course-board-container.tsx` — **new.** Board UI.
- `src/routes/_authed/admin.tsx` — **modify.** → guarded layout (`<Outlet/>`).
- `src/routes/_authed/admin.index.tsx` — **new.** Grid page.
- `src/routes/_authed/admin.$courseId.editor.tsx` — **new.** Editor page.
- `src/components/admin/course-tile.tsx` — **modify.** → `Link`.
- `src/components/admin/admin-courses-page-container.tsx` — **modify.** `<li>` wrap.
- `src/routeTree.gen.ts` — regenerated.

---

### Task 1: Board schemas + `getCourseBoard` DB fn (additive)

**Files:** Modify `src/lib/admin-schemas.ts`, `src/db/admin.ts`.

**Interfaces:**
- Produces: `courseBoardSchema`/`CourseBoard`, `boardModuleSchema`/`BoardModule`, `boardLessonSchema`/`BoardLesson`; `getCourseBoard(courseId: number): Promise<CourseBoard | null>`.

- [ ] **Step 1: Add board schemas to `src/lib/admin-schemas.ts`** (append near the other exports)

```ts
export const boardLessonSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  rank: z.coerce.number(),
  isAvailable: z.boolean(),
});
export type BoardLesson = z.infer<typeof boardLessonSchema>;

export const boardModuleSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  rank: z.coerce.number(),
  lessons: z.array(boardLessonSchema),
});
export type BoardModule = z.infer<typeof boardModuleSchema>;

export const courseBoardSchema = z.object({
  course: z.object({ id: z.number(), name: z.string(), slug: z.string() }),
  modules: z.array(boardModuleSchema),
});
export type CourseBoard = z.infer<typeof courseBoardSchema>;
```

- [ ] **Step 2: Add `getCourseBoard` to `src/db/admin.ts`**

Add `asc` and `inArray` to the existing `drizzle-orm` import (currently `desc, eq, sql, or, like`), import `modulesTable`/`lessonsTable` (already imported) and the `CourseBoard` type, then append:

```ts
import type { CourseBoard } from "@/lib/admin-schemas";

export async function getCourseBoard(
  courseId: number,
): Promise<CourseBoard | null> {
  const [course] = await db
    .select({
      id: coursesTable.id,
      name: coursesTable.name,
      slug: coursesTable.slug,
    })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId));
  if (!course) return null;

  const modules = await db
    .select({
      id: modulesTable.id,
      name: modulesTable.name,
      slug: modulesTable.slug,
      rank: modulesTable.rank,
    })
    .from(modulesTable)
    .where(eq(modulesTable.courseId, courseId))
    .orderBy(asc(modulesTable.rank));

  const moduleIds = modules.map((m) => m.id);
  const lessons = moduleIds.length
    ? await db
        .select({
          id: lessonsTable.id,
          moduleId: lessonsTable.moduleId,
          name: lessonsTable.name,
          slug: lessonsTable.slug,
          rank: lessonsTable.rank,
          isAvailable: lessonsTable.isAvailable,
        })
        .from(lessonsTable)
        .where(inArray(lessonsTable.moduleId, moduleIds))
        .orderBy(asc(lessonsTable.rank))
    : [];

  const byModule = new Map<number, typeof lessons>();
  for (const lesson of lessons) {
    const list = byModule.get(lesson.moduleId) ?? [];
    list.push(lesson);
    byModule.set(lesson.moduleId, list);
  }

  return {
    course,
    modules: modules.map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      rank: Number(m.rank),
      lessons: (byModule.get(m.id) ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        rank: Number(l.rank),
        isAvailable: l.isAvailable,
      })),
    })),
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Read-only DB probe (safe)**

```bash
cat > ./probe-board.ts <<'EOF'
import { getCourseBoard } from "@/db/admin";
async function main() {
  console.log("board(1):", JSON.stringify(await getCourseBoard(1)));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
EOF
pnpm exec dotenv -e .env -- tsx ./probe-board.ts 2>&1 | grep -v "SECURITY WARNING\|SSL modes\|libpq\|postgresql.org\|To prepare\|current behavior\|trace-warnings" | tail -3; rm -f ./probe-board.ts
```
Expected: prints `board(1): null` (no courses in DB) without throwing — confirms the query composes/runs. (Write the probe INSIDE the project dir as shown so tsx treats it as ESM.)

- [ ] **Step 5: Format and commit**

```bash
pnpm exec biome check --write src/lib/admin-schemas.ts src/db/admin.ts
git add src/lib/admin-schemas.ts src/db/admin.ts
git commit -m "feat(kanban): board schemas + getCourseBoard db fn"
```

---

### Task 2: Board API route + data-hook (additive)

**Files:** Create `src/routes/api/admin/courses.$courseId.board.ts`, `src/data-hooks/use-course-board.ts`; modify `src/data-hooks/keys.ts`.

**Interfaces:**
- Consumes: `requireAdmin`/`ForbiddenError`, `getCourseBoard`, `courseBoardSchema`, `dataKeys`.
- Produces: `GET /api/admin/courses/$courseId/board`; `useCourseBoard(courseId): UseQueryResult<CourseBoard | null>`.

- [ ] **Step 1: `src/routes/api/admin/courses.$courseId.board.ts`**

```ts
import { createFileRoute } from "@tanstack/react-router";
import { getCourseBoard } from "@/db/admin";
import { ForbiddenError, requireAdmin } from "@/lib/admin-functions.server";

export const Route = createFileRoute("/api/admin/courses/$courseId/board")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          await requireAdmin(request.headers);
        } catch (error) {
          if (error instanceof ForbiddenError) {
            return new Response("Forbidden", { status: 403 });
          }
          throw error;
        }
        const courseId = Number(params.courseId);
        if (!Number.isInteger(courseId) || courseId <= 0) {
          return Response.json({ error: "Invalid course id" }, { status: 400 });
        }
        const board = await getCourseBoard(courseId);
        if (!board) return new Response("Not found", { status: 404 });
        return Response.json(board);
      },
    },
  },
});
```

- [ ] **Step 2: Add the query key to `src/data-hooks/keys.ts`**

```ts
  courseBoard: (courseId: number) =>
    ["admin", "course-board", courseId] as const,
```
(add inside the `dataKeys` object)

- [ ] **Step 3: `src/data-hooks/use-course-board.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { courseBoardSchema } from "@/lib/admin-schemas";
import { dataKeys } from "./keys";

/** Modules + lessons for a course's editor board. `null` when the course doesn't exist. */
export function useCourseBoard(courseId: number) {
  return useQuery({
    queryKey: dataKeys.courseBoard(courseId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/courses/${courseId}/board`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Failed to load board (${res.status})`);
      return courseBoardSchema.parse(await res.json());
    },
    staleTime: 30_000,
  });
}
```

- [ ] **Step 4: Build + typecheck**

Run: `pnpm build` then `pnpm exec tsc --noEmit`
Expected: build regenerates `routeTree.gen.ts` with `/api/admin/courses/$courseId/board`; no new type errors.

- [ ] **Step 5: Format and commit**

```bash
pnpm exec biome check --write src/routes/api/admin/courses.\$courseId.board.ts src/data-hooks/use-course-board.ts src/data-hooks/keys.ts
git add "src/routes/api/admin/courses.\$courseId.board.ts" src/data-hooks/use-course-board.ts src/data-hooks/keys.ts src/routeTree.gen.ts
git commit -m "feat(kanban): guarded board API route + useCourseBoard hook"
```

---

### Task 3: Board components (additive — not rendered yet)

**Files:** Create `lesson-card.tsx`, `module-column.tsx`, `course-board.tsx`, `course-board-container.tsx` under `src/components/admin/`.

**Interfaces:**
- Consumes: `BoardLesson`/`BoardModule`/`CourseBoard`, `useCourseBoard`, `cn`, `Link`.
- Produces: `CourseBoardContainer` (`{ courseId: number }`), `CourseBoard`, `ModuleColumn`, `LessonCard`.

- [ ] **Step 1: `src/components/admin/lesson-card.tsx`**

```tsx
import type { BoardLesson } from "@/lib/admin-schemas";
import { cn } from "@/lib/cn";

export const LessonCard = ({ lesson }: { lesson: BoardLesson }) => {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2.5 text-sm text-gray-12">
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          lesson.isAvailable ? "bg-apple-9" : "bg-gray-7",
        )}
        aria-hidden="true"
      />
      <span className="truncate">{lesson.name}</span>
    </div>
  );
};
```

- [ ] **Step 2: `src/components/admin/module-column.tsx`**

```tsx
import type { BoardModule } from "@/lib/admin-schemas";
import { LessonCard } from "./lesson-card";

export const ModuleColumn = ({ module: mod }: { module: BoardModule }) => {
  return (
    <section className="flex w-80 shrink-0 flex-col rounded-xl border border-gray-6 bg-gray-2">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-xl border-b border-gray-6 bg-gray-3 px-4 py-3">
        <h3 className="truncate text-sm font-semibold text-gray-12">{mod.name}</h3>
        <span className="shrink-0 text-xs text-gray-11">{mod.lessons.length}</span>
      </header>
      <div className="flex flex-col gap-2 p-3">
        {mod.lessons.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-gray-10">No lessons</p>
        ) : (
          mod.lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} />
          ))
        )}
      </div>
    </section>
  );
};
```

- [ ] **Step 3: `src/components/admin/course-board.tsx`**

```tsx
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { CourseBoard as CourseBoardData } from "@/lib/admin-schemas";
import { ModuleColumn } from "./module-column";

export const CourseBoard = ({ board }: { board: CourseBoardData }) => {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-gray-6 px-4 py-3">
        <Link
          to="/admin"
          className="text-gray-11 transition-colors hover:text-gray-12"
          aria-label="Back to courses"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <h1 className="truncate text-base font-semibold text-gray-12">
          {board.course.name}
        </h1>
      </header>

      {board.modules.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-11">No modules yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="flex w-max items-start gap-4 p-4">
            {board.modules.map((mod) => (
              <ModuleColumn key={mod.id} module={mod} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: `src/components/admin/course-board-container.tsx`**

```tsx
import { useCourseBoard } from "@/data-hooks/use-course-board";
import { CourseBoard } from "./course-board";

export const CourseBoardContainer = ({ courseId }: { courseId: number }) => {
  const { data: board, isLoading, error } = useCourseBoard(courseId);

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-11">Loading board…</div>;
  }
  if (error) {
    return (
      <div className="p-6 text-sm text-red-11">Failed to load the board.</div>
    );
  }
  if (!board) {
    return <div className="p-6 text-sm text-gray-11">Course not found.</div>;
  }
  return <CourseBoard board={board} />;
};
```

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Format and commit**

```bash
pnpm exec biome check --write src/components/admin/lesson-card.tsx src/components/admin/module-column.tsx src/components/admin/course-board.tsx src/components/admin/course-board-container.tsx
git add src/components/admin/lesson-card.tsx src/components/admin/module-column.tsx src/components/admin/course-board.tsx src/components/admin/course-board-container.tsx
git commit -m "feat(kanban): board presentational components + container"
```

---

### Task 4: Route restructure + tile links (wire-up)

Turns `admin.tsx` into a layout, moves the grid to an index route, adds the editor route, and links tiles. Changes together to keep the build green.

**Files:**
- Modify: `src/routes/_authed/admin.tsx`, `src/components/admin/course-tile.tsx`, `src/components/admin/admin-courses-page-container.tsx`
- Create: `src/routes/_authed/admin.index.tsx`, `src/routes/_authed/admin.$courseId.editor.tsx`
- Regenerated: `src/routeTree.gen.ts`

**Interfaces:**
- Consumes: `CourseBoardContainer`, `AdminCoursesPageContainer`, `ADMIN_ROLE`, `AdminCourseSummary`.
- Produces: `/admin` (index), `/admin/$courseId/editor`; tiles linking to the editor.

- [ ] **Step 1: `admin.tsx` → guarded layout**

```tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ADMIN_ROLE } from "@/lib/admin-schemas";

export const Route = createFileRoute("/_authed/admin")({
  beforeLoad: ({ context }) => {
    if (!context.roles.includes(ADMIN_ROLE)) {
      throw redirect({ to: "/app" });
    }
  },
  component: () => <Outlet />,
});
```

- [ ] **Step 2: `src/routes/_authed/admin.index.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { AdminCoursesPageContainer } from "@/components/admin/admin-courses-page-container";

export const Route = createFileRoute("/_authed/admin/")({
  component: AdminCoursesPageContainer,
});
```
(If the build reports a different expected route id for this file, use exactly the id it prints — the router plugin is authoritative.)

- [ ] **Step 3: `src/routes/_authed/admin.$courseId.editor.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { CourseBoardContainer } from "@/components/admin/course-board-container";

export const Route = createFileRoute("/_authed/admin/$courseId/editor")({
  component: EditorPage,
});

function EditorPage() {
  const { courseId } = Route.useParams();
  const id = Number(courseId);
  if (!Number.isInteger(id) || id <= 0) {
    return <div className="p-6 text-sm text-gray-11">Course not found.</div>;
  }
  return <CourseBoardContainer courseId={id} />;
}
```

- [ ] **Step 4: `course-tile.tsx` → `Link`**

Replace the root `<li>` with a `Link` (keep the same inner content). Full file:

```tsx
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import type { AdminCourseSummary } from "@/db/admin";

interface CourseTileProps {
  course: AdminCourseSummary;
}

export const CourseTile = ({ course }: CourseTileProps) => {
  return (
    <Link
      to="/admin/$courseId/editor"
      params={{ courseId: String(course.id) }}
      className="flex flex-col gap-3 rounded-xl border border-gray-6 bg-gray-2 p-5 transition-colors hover:border-gray-8"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-gray-12">{course.name}</h3>
        <span className="font-mono text-xs text-gray-11">/{course.slug}</span>
      </div>

      <dl className="flex items-center gap-4 text-sm text-gray-11">
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">Modules</dt>
          <dd className="font-medium text-gray-12">{course.moduleCount}</dd>
          <span>modules</span>
        </div>
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">Lessons</dt>
          <dd className="font-medium text-gray-12">{course.lessonCount}</dd>
          <span>lessons</span>
        </div>
      </dl>

      <p className="text-xs text-gray-10">
        Updated {formatDistanceToNow(new Date(course.updatedAt), { addSuffix: true })}
      </p>
    </Link>
  );
};
```

- [ ] **Step 5: `admin-courses-page-container.tsx` — wrap tiles in `<li>`**

Change the tile list so each `CourseTile` sits inside an `<li>` (Link inside li is valid HTML):

```tsx
<ul className="grid-auto-fit list-none p-0">
  {courses.map((course) => (
    <li key={course.id}>
      <CourseTile course={course} />
    </li>
  ))}
</ul>
```

- [ ] **Step 6: Build (regenerate route tree) + typecheck**

Run: `pnpm build`
Expected: succeeds; `routeTree.gen.ts` includes `/_authed/admin/` (index) and `/_authed/admin/$courseId/editor`, with `/_authed/admin` now a layout. If the build errors on a `createFileRoute` path string, correct it to the id the plugin expects and rebuild.

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Manual note**

Controller/user verifies in a browser (admin session): `/admin` grid → click a tile → `/admin/$courseId/editor`; the board renders (empty "No modules yet" until data exists), sticky headers + dual-axis scroll once a seeded course has modules/lessons; a bad id shows "Course not found". Non-admins are redirected by the layout guard.

- [ ] **Step 8: Format and commit**

```bash
pnpm exec biome check --write src/routes/_authed/admin.tsx src/routes/_authed/admin.index.tsx src/routes/_authed/admin.\$courseId.editor.tsx src/components/admin/course-tile.tsx src/components/admin/admin-courses-page-container.tsx
git add src/routes/_authed/admin.tsx src/routes/_authed/admin.index.tsx "src/routes/_authed/admin.\$courseId.editor.tsx" src/components/admin/course-tile.tsx src/components/admin/admin-courses-page-container.tsx src/routeTree.gen.ts
git commit -m "feat(kanban): /admin/\$courseId/editor route + tile links; admin layout"
```

---

## Self-Review

**Spec coverage:**
- Route `/admin/$courseId/editor` + admin layout + grid index → Task 4. ✓
- Board data (getCourseBoard + guarded API + hook) → Tasks 1–2. ✓
- Board UI: fixed columns, sticky headers, dual-axis scroll → Task 3 (`ModuleColumn` sticky header, `CourseBoard` `overflow-auto` + `w-max` flex row). ✓
- Tiles link to editor → Task 4 (`course-tile` → `Link`, `<li>` wrap). ✓
- Numeric `$courseId`, not-found handling → Task 2 (API 400/404) + Task 4 (editor NaN guard) + container (`null` → not found). ✓
- No DnD this step → confirmed (static render). ✓

**Placeholder scan:** No TBD/TODO; every code step complete. ✓

**Type consistency:** `CourseBoard`/`BoardModule`/`BoardLesson` (Task 1) consumed by the hook (Task 2) and components (Task 3). `getCourseBoard` signature matches its API caller. `useCourseBoard(courseId: number)` matches the container prop and editor's `Number(courseId)`. `dataKeys.courseBoard` added Task 2, used by the hook. ✓

**Ordering keeps build green:** Tasks 1–3 additive (schemas/db, API/hook, unrendered components); Task 4 wires + restructures the routes atomically. ✓
