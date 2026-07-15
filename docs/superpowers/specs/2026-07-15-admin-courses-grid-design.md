# Admin course grid — step 1 of Course Designer

**Date:** 2026-07-15
**Status:** Design, pending user review
**Area:** `src/routes/_authed`, `src/db`, `src/lib`, `src/hooks/data`, `src/components/admin`

## Context

First baby step toward a Trello/Jira-style course designer (a later step adds
the kanban drag-and-drop of modules → lessons with dnd-kit). This step only
builds a read-only `/admin` landing page: current courses shown as grid tiles,
plus an unwired "Add course" button.

Schema hierarchy already exists: `coursesTable` (id, name, slug, timestamps) →
`modulesTable` (courseId, rank, …) → `lessonsTable` (moduleId, rank, …). Roles
exist (`userRolesTable`, `userProfileRolesTable`) but none are seeded and there
is no role-check helper yet.

## Decisions (from brainstorming)

- **Access:** admin-role only. Route lives under `_authed` (login redirect for
  free) and additionally checks the `admin` role in its own `beforeLoad`,
  redirecting non-admins to `/app`.
- **Bootstrap:** a `pnpm db:grant-admin <email>` script upserts the `admin` role
  and links it to the profile with that email. It will be run once now against
  the live Neon DB for `apostopher@gmail.com`.
- **Data:** ALL client data fetching goes through TanStack Query hooks over
  `createServerFn`s (matches the existing `getSession` pattern). No direct
  `fetch`/axios in components, and no route-**loader** data fetching. A route's
  `beforeLoad` is used only for the access-control redirect, never to load page
  data.
- **API guarding:** EVERY admin server fn independently enforces the `admin`
  role server-side via a shared `requireAdmin(headers)` guard — never relying on
  the route guard alone. A leaked/forged direct call to any admin server fn must
  still be rejected.
- **UI:** container/presentational split; Base UI components; Radix/token colors
  (WCAG AA); `date-fns` for relative dates; `.content-grid` + `.grid-auto-fit`
  for layout; kebab-case component files.

## Architecture

### Route & access control

`src/routes/_authed/admin.tsx` — renders at `/admin`.
- `beforeLoad`: `await ensureAdmin()`. `ensureAdmin` reads the session headers,
  resolves the user's role names, and throws `redirect({ to: '/app' })` when
  `admin` is absent. (Unauthenticated users are already redirected to login by
  the parent `_authed` guard, so `ensureAdmin` only needs the role gate.)
- `component`: `<AdminCoursesPageContainer />`.

### Data layer

`src/db/admin.ts`:
- `getUserRoleNames(userId: string): Promise<string[]>` — join
  `user_profiles` (by `userId`) → `user_profile_roles` → `user_roles`, return
  role `name`s.
- `listAdminCourses(): Promise<AdminCourseSummary[]>` — Drizzle relational query:
  `db.query.coursesTable.findMany({ orderBy, with: { modules: { columns: { id },
  with: { lessons: { columns: { id } } } } } })`, mapped to
  `{ id, name, slug, updatedAt, moduleCount, lessonCount }`. Counts computed in
  JS from the trimmed relation payload (course/module/lesson counts are small).
- Export type `AdminCourseSummary`.

`src/lib/admin-functions.ts` (server fns, `@tanstack/react-start`):
- `requireAdmin(headers): Promise<{ userId: string; roles: string[] }>` — shared
  guard (not a server fn; a plain server-side helper). Gets the session via
  `auth.api.getSession({ headers })`; if no session or `admin` not in
  `getUserRoleNames(session.user.id)`, throws `Error('Forbidden')`. Returns the
  user id + roles on success. **Every admin server fn calls this first.**
- `ensureAdmin` — `createServerFn({ method: 'GET' })` that calls
  `requireAdmin(getRequestHeaders())` and returns the roles. Used by the route
  `beforeLoad`, which wraps the call in try/catch and, on rejection, throws
  `redirect({ to: '/app' })`.
- `listAdminCoursesFn` — `createServerFn({ method: 'GET' })` that calls
  `requireAdmin(getRequestHeaders())` FIRST, then returns `listAdminCourses()`.
  So even a direct RPC call from a non-admin is rejected, independent of the
  route guard.
- Any future admin server fn (create/update course, etc.) MUST open with
  `requireAdmin(...)` the same way.

**`src/data-hooks/` is the home for all typesafe TanStack Query fetch hooks**
going forward (new top-level dir). The existing `src/hooks/data/` hooks are left
in place and migrated in a later pass — out of scope here.

- `src/data-hooks/keys.ts`: query-key factory for this dir, starting with
  `adminCourses: () => ['admin', 'courses'] as const`.
- `src/data-hooks/use-admin-courses.ts`: `useAdminCourses()` — `useQuery({
  queryKey: keys.adminCourses(), queryFn: () => listAdminCoursesFn(), staleTime:
  60_000 })`. Return type is inferred end-to-end from `listAdminCoursesFn`'s
  `AdminCourseSummary[]`, so the hook is fully typesafe with no manual generics.

### Admin-role bootstrap

`src/db/seed-admin.ts` — a runnable script (`tsx`/node) taking an email arg:
1. Upsert `user_roles` row `{ name: 'admin' }` (on-conflict do nothing; then
   select its id).
2. Find `user_profiles` by email; error clearly if missing.
3. Insert `{ userProfileId, roleId, assignedBy: 'seed' }` into
   `user_profile_roles` on-conflict do nothing.
4. Log the result.

`package.json` script: `"db:grant-admin": "dotenv -e .env -- tsx src/db/seed-admin.ts"`.

### UI

`src/components/admin/admin-courses-page-container.tsx` (container):
- `const { data, isLoading, error } = useAdminCourses()`.
- Renders a `.content-grid` page. Inside `.content`: a header row (title
  "Courses" + `<AddCourseButton />`), then loading / error / empty states, or the
  tile grid.
- Tile grid: `<ul className="grid-auto-fit">` of `<CourseTile />` items.

`src/components/admin/course-tile.tsx` (presentational):
- Props: `{ course: AdminCourseSummary }`.
- Shows `name` (prominent), `slug` (muted, mono), a stat row
  `moduleCount modules · lessonCount lessons`, and `Updated {formatDistanceToNow}`.
- Token colors: card `bg-gray-2 border-gray-6`, text `gray-12`/`gray-11`.
  Pure function, no state/effects/hooks.

`src/components/admin/add-course-button.tsx` (presentational):
- Base UI `Button` + Lucide `Plus`, label "Add course". **Unwired**:
  `onClick` is a no-op with `// TODO(step 2): open create-course flow`.

Empty state: "No courses yet" with a short hint; the Add button still shows in
the header.

## Files

- Create: `src/routes/_authed/admin.tsx`, `src/db/admin.ts`,
  `src/lib/admin-functions.ts`, `src/data-hooks/keys.ts`,
  `src/data-hooks/use-admin-courses.ts`, `src/db/seed-admin.ts`,
  `src/components/admin/admin-courses-page-container.tsx`,
  `src/components/admin/course-tile.tsx`,
  `src/components/admin/add-course-button.tsx`.
- Modify: `package.json` (script), `src/routeTree.gen.ts` (regenerated by the
  router plugin — not hand-edited).

## Out of scope (later steps)

- Creating/editing courses (the Add button is inert this step).
- The kanban module/lesson drag-and-drop board (dnd-kit).
- A full role-management UI; bootstrap is a one-off script.
- Pagination/search (course count is small).

## Testing / verification

- Unit: `listAdminCourses` count-mapping and `getUserRoleNames` join can be
  covered with a small test if a DB test harness exists; otherwise verify via the
  running app.
- Manual: after `db:grant-admin`, load `/admin` as the admin user → tiles render;
  a non-admin (or logged-out) user is redirected; the Add button is inert.
