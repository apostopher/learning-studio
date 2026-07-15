# Course editor board — layout + data (Course Designer step 3a)

**Date:** 2026-07-15
**Status:** Design, pending approval
**Area:** `src/routes/_authed/admin*`, `src/db/admin.ts`, `src/lib/admin-schemas.ts`, `src/routes/api/admin`, `src/data-hooks`, `src/components/admin`

## Context

Adds a `/admin/$courseId/editor` route rendering a static Trello-style board for a
course: fixed-width module columns with sticky headers, lessons inside, the whole
surface scrolling both axes. **No drag-and-drop this step** — that (dnd-kit +
rank persistence) is the next step. dnd-kit is already installed.

## Decisions (from brainstorming)

- Route uses the numeric `$courseId`. Course tiles link to the editor.
- This step: route + data + static board layout only. No DnD.
- Board data via a guarded `/api/admin` GET route + a typesafe data-hook (per the
  admin-API convention).

## Architecture

### Route restructure (flat files, guard on the layout)

- `src/routes/_authed/admin.tsx` — becomes a **layout**: keep the existing
  `beforeLoad` admin-role guard, change the component to render `<Outlet />`.
- `src/routes/_authed/admin.index.tsx` — **new**, `/admin`: renders
  `<AdminCoursesPageContainer />` (moved out of `admin.tsx`).
- `src/routes/_authed/admin.$courseId.editor.tsx` — **new**,
  `/admin/$courseId/editor`: reads `courseId` param, renders
  `<CourseBoardContainer courseId={id} />`. Guard inherited from the layout.
  A non-numeric `courseId` renders a not-found state (parse `Number`, guard `NaN`).

### Data layer

`src/db/admin.ts` — `getCourseBoard(courseId: number): Promise<CourseBoard | null>`:
- Course `{ id, name, slug }` by id → `null` if missing.
- Modules `{ id, name, slug, rank }` where `courseId`, `order by rank asc`.
- Lessons `{ id, name, slug, rank, isAvailable }` for those modules
  (`inArray(moduleId, ids)`), `order by rank asc`.
- Assemble `{ course, modules: [{ ...module, lessons: [...] }] }` (lessons grouped
  by `moduleId`, preserving rank order).

`src/lib/admin-schemas.ts` — wire schemas (single source of truth):
```ts
export const boardLessonSchema = z.object({
  id: z.number(), name: z.string(), slug: z.string(),
  rank: z.coerce.number(), isAvailable: z.boolean(),
});
export const boardModuleSchema = z.object({
  id: z.number(), name: z.string(), slug: z.string(),
  rank: z.coerce.number(), lessons: z.array(boardLessonSchema),
});
export const courseBoardSchema = z.object({
  course: z.object({ id: z.number(), name: z.string(), slug: z.string() }),
  modules: z.array(boardModuleSchema),
});
export type CourseBoard = z.infer<typeof courseBoardSchema>;
export type BoardModule = z.infer<typeof boardModuleSchema>;
export type BoardLesson = z.infer<typeof boardLessonSchema>;
```
(`rank` is a Postgres `numeric` → arrives as a string; `z.coerce.number()` normalizes it. Kept for the next step's DnD even though unused now.)

`src/routes/api/admin/courses.$courseId.board.ts` — `GET /api/admin/courses/$courseId/board`:
- `await requireAdmin(request.headers)` first → 403 on `ForbiddenError`.
- `const courseId = Number(params.courseId)` — 400 if `NaN`.
- `getCourseBoard(courseId)` → 404 if `null`, else `Response.json(board)`.

`src/data-hooks/keys.ts` — add `courseBoard: (courseId: number) => ['admin','course-board', courseId]`.
`src/data-hooks/use-course-board.ts` — `useCourseBoard(courseId)`: fetch the route,
throw on non-ok, `courseBoardSchema.parse(res.json())`. `staleTime: 30_000`.

### Board components (container + presentational)

- `course-board-container.tsx` (container): `useCourseBoard(courseId)`; loading /
  error / not-found; renders `<CourseBoard board={data} />`.
- `course-board.tsx` (presentational): the dual-axis scroll region + a flex row of
  `<ModuleColumn>`; empty state ("No modules yet"). Also a header strip with the
  course name + a back link to `/admin`.
- `module-column.tsx` (presentational): fixed-width column with a **sticky** header
  (module name + lesson count) and its `<LessonCard>` list; empty ("No lessons").
- `lesson-card.tsx` (presentational): lesson name + an availability dot/label.

### Layout (Baseline CSS — no new deps)

- Board scroll region fills the editor area and scrolls both axes:
  `class="h-full overflow-auto"` on the scroll container.
- Inside: `class="flex items-start gap-4 p-4 w-max"` — a flex row of columns; the
  row is wider than the viewport → horizontal scroll; `items-start` lets columns
  size to content.
- Column: `class="flex w-80 shrink-0 flex-col ..."` — fixed 20rem width.
- Column header: `class="sticky top-0 z-10 ..."` with an **opaque** token bg
  (`bg-gray-3`) so it cleanly covers content scrolling underneath during vertical
  scroll. All columns' headers share the scroll container's top edge, so they line
  up as a sticky header row.
- Tokens only (`gray-*`, `apple-*`), logical inline-axis props; `top-0` on the
  sticky header is the block-start offset against the scroll container (standard,
  allowed). Optional later polish (from modern-web-guidance): scroll-shadow
  affordance hints on the horizontal container + `scrollbar-color` theming — out
  of scope for this step.

### Tile → editor link

- `course-tile.tsx` becomes a TanStack `<Link to="/admin/$courseId/editor"
  params={{ courseId: String(course.id) }}>` styled as the card (Link is the card
  root, hover affordance preserved).
- `admin-courses-page-container.tsx` wraps each tile in `<li>` (Link inside li is
  valid) — small adjustment to the existing `.grid-auto-fit` list.

## Files

- Modify: `src/routes/_authed/admin.tsx` (→ layout), `src/db/admin.ts` (+`getCourseBoard`),
  `src/lib/admin-schemas.ts` (+board schemas), `src/data-hooks/keys.ts`,
  `src/components/admin/course-tile.tsx` (→ Link),
  `src/components/admin/admin-courses-page-container.tsx` (li wrap).
- Create: `src/routes/_authed/admin.index.tsx`,
  `src/routes/_authed/admin.$courseId.editor.tsx`,
  `src/routes/api/admin/courses.$courseId.board.ts`,
  `src/data-hooks/use-course-board.ts`,
  `src/components/admin/course-board-container.tsx`,
  `src/components/admin/course-board.tsx`,
  `src/components/admin/module-column.tsx`,
  `src/components/admin/lesson-card.tsx`.
- Regenerated: `src/routeTree.gen.ts`.

## Out of scope (next steps)

- dnd-kit drag/reorder + `rank` persistence (PATCH endpoints, optimistic updates).
- Creating/editing modules & lessons from the board; scroll-shadow polish.

## Testing / verification

- Typecheck + build (route tree regenerates with the new routes).
- Manual (needs admin session): `/admin` grid → click a tile → editor board;
  columns per module, lessons inside, sticky headers stay on vertical scroll,
  horizontal scroll across columns. With 0 modules → "No modules yet".
  (The DB currently has 0 courses, so seed a course/modules to see columns — or
  verify the empty/not-found states now and full render after data exists.)
