# Admin Course Grid (Course Designer step 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a role-gated `/admin` page that lists current courses as responsive grid tiles, with an unwired "Add course" button.

**Architecture:** A new `/_authed/admin` route (URL `/admin`) whose `beforeLoad` redirects non-admins. All page data is fetched with a TanStack Query hook in the new `src/data-hooks/` dir over a `createServerFn` that self-guards with a shared `requireAdmin` helper. Course summaries (with module/lesson counts) come from a manual Drizzle aggregate query. UI is a container + presentational split using `.content-grid` and `.grid-auto-fit`.

**Tech Stack:** React 19, TanStack Router/Start, TanStack Query 5, Drizzle + Postgres (Neon), better-auth, Base UI, Lucide, date-fns, Tailwind v4 with generated Radix token scales.

## Global Constraints

- **All client data fetching** goes through TanStack Query hooks in `src/data-hooks/` over `createServerFn`s. No `fetch`/axios in components; no route-**loader** data fetching. A route's `beforeLoad` is only for the access-control redirect.
- **Every admin server fn** opens with `await requireAdmin(getRequestHeaders())` — never relies on the route guard alone.
- **Colors:** token classes only — accent scale is `apple-*` (e.g. `bg-apple-9`, `text-apple-contrast`), plus `gray-*`/`red-*`. No hardcoded hex or Tailwind palette classes. Text/bg pairings must meet WCAG AA.
- **Logical CSS:** inline-axis uses `ms/me`, `ps/pe`, `start/end`, `text-start/end`, `border-s/e`, `rounded-s/e`. Block-axis `pt/pb/py/mt/mb` are fine. Never Tailwind's `.container`; use `.content-grid` (children `.content`).
- **Files:** kebab-case component filenames, PascalCase exports. Container components hold data/logic; presentational components are pure (no state/effects/hooks/data).
- **Base UI first:** buttons via `@base-ui/react/Button`; icons via `lucide-react`.
- **Dates:** `date-fns` only.
- Commands: pnpm. Typecheck `pnpm exec tsc --noEmit` (3 pre-existing unrelated `ai-test` errors are expected — ignore). Build `pnpm build`. Format `pnpm exec biome check --write <paths>`. Uncommitted `src/db/schema.ts` + `package.json` dev-script line are the user's — never stage them; use explicit `git add <paths>`.

---

## File Structure

- `src/db/admin.ts` — DB access: `AdminCourseSummary`, `listAdminCourses()`, `getUserRoleNames()`.
- `src/lib/admin-functions.ts` — `requireAdmin()` guard + `ensureAdmin`/`listAdminCoursesFn` server fns.
- `src/db/seed-admin.ts` — one-off script to grant the `admin` role by email.
- `src/data-hooks/keys.ts` — query-key factory.
- `src/data-hooks/use-admin-courses.ts` — `useAdminCourses()` hook.
- `src/routes/_authed/admin.tsx` — the route (guard + component).
- `src/components/admin/admin-courses-page-container.tsx` — container.
- `src/components/admin/course-tile.tsx` — presentational tile.
- `src/components/admin/add-course-button.tsx` — presentational, unwired button.
- Modify: `package.json` (script), `src/routeTree.gen.ts` (regenerated, not hand-edited).

---

### Task 1: DB access layer

**Files:**
- Create: `src/db/admin.ts`

**Interfaces:**
- Consumes: `db` from `@/db`, tables from `@/db/schema`, `drizzle-orm` helpers.
- Produces: `AdminCourseSummary` (`{ id: number; name: string; slug: string; updatedAt: Date; moduleCount: number; lessonCount: number }`), `listAdminCourses(): Promise<AdminCourseSummary[]>`, `getUserRoleNames(userId: string): Promise<string[]>`.

- [ ] **Step 1: Write `src/db/admin.ts`**

```ts
import { db } from ".";
import {
  coursesTable,
  lessonsTable,
  modulesTable,
  userProfileRolesTable,
  userProfileTable,
  userRolesTable,
} from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

export interface AdminCourseSummary {
  id: number;
  name: string;
  slug: string;
  updatedAt: Date;
  moduleCount: number;
  lessonCount: number;
}

/** All courses with their module and lesson counts, newest-updated first. */
export async function listAdminCourses(): Promise<AdminCourseSummary[]> {
  const rows = await db
    .select({
      id: coursesTable.id,
      name: coursesTable.name,
      slug: coursesTable.slug,
      updatedAt: coursesTable.updatedAt,
      moduleCount: sql<number>`count(distinct ${modulesTable.id})`,
      lessonCount: sql<number>`count(distinct ${lessonsTable.id})`,
    })
    .from(coursesTable)
    .leftJoin(modulesTable, eq(modulesTable.courseId, coursesTable.id))
    .leftJoin(lessonsTable, eq(lessonsTable.moduleId, modulesTable.id))
    .groupBy(coursesTable.id)
    .orderBy(desc(coursesTable.updatedAt));

  // Postgres count() comes back as a string via node-postgres; normalise to number.
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    updatedAt: r.updatedAt,
    moduleCount: Number(r.moduleCount),
    lessonCount: Number(r.lessonCount),
  }));
}

/** Role names assigned to the auth user (empty if no profile or no roles). */
export async function getUserRoleNames(userId: string): Promise<string[]> {
  const rows = await db
    .select({ name: userRolesTable.name })
    .from(userProfileTable)
    .innerJoin(
      userProfileRolesTable,
      eq(userProfileRolesTable.userProfileId, userProfileTable.id),
    )
    .innerJoin(
      userRolesTable,
      eq(userRolesTable.id, userProfileRolesTable.roleId),
    )
    .where(eq(userProfileTable.userId, userId));

  return rows.map((r) => r.name);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors in `src/db/admin.ts`.

- [ ] **Step 3: Behavioral check against the real DB (read-only)**

Create a throwaway probe and run it — this exercises the actual query (SELECT only, safe):

```bash
cat > /tmp/probe-admin.ts <<'EOF'
import { listAdminCourses } from "@/db/admin";
const rows = await listAdminCourses();
console.log("courses:", rows.length);
console.log(rows.slice(0, 3));
process.exit(0);
EOF
pnpm exec dotenv -e .env -- tsx /tmp/probe-admin.ts; rm -f /tmp/probe-admin.ts
```
Expected: prints a course count and rows whose `moduleCount`/`lessonCount` are **numbers** (not strings) and `updatedAt` is a date. If it errors on connection, confirm `.env` has `DATABASE_URL`.

- [ ] **Step 4: Format and commit**

```bash
pnpm exec biome check --write src/db/admin.ts
git add src/db/admin.ts
git commit -m "feat(admin): course summary + user role db access"
```

---

### Task 2: Admin guard + server fns

**Files:**
- Create: `src/lib/admin-functions.ts`

**Interfaces:**
- Consumes: `createServerFn` from `@tanstack/react-start`, `getRequestHeaders` from `@tanstack/react-start/server`, `auth` from `@/lib/auth`, `getUserRoleNames`/`listAdminCourses` from `@/db/admin`.
- Produces: `requireAdmin(headers): Promise<{ userId: string; roles: string[] }>`, `ensureAdmin` (server fn → `{ roles: string[] }`), `listAdminCoursesFn` (server fn → `AdminCourseSummary[]`).

- [ ] **Step 1: Write `src/lib/admin-functions.ts`**

```ts
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getUserRoleNames, listAdminCourses } from "@/db/admin";
import { auth } from "@/lib/auth";

const ADMIN_ROLE = "admin";

type RequestHeaders = ReturnType<typeof getRequestHeaders>;

/**
 * Shared server-side guard. Every admin server fn must call this first so a
 * direct RPC from a non-admin is rejected regardless of any route guard.
 */
export async function requireAdmin(
  headers: RequestHeaders,
): Promise<{ userId: string; roles: string[] }> {
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) throw new Error("Forbidden");
  const roles = await getUserRoleNames(userId);
  if (!roles.includes(ADMIN_ROLE)) throw new Error("Forbidden");
  return { userId, roles };
}

/** Route-guard probe: resolves for admins, rejects otherwise. */
export const ensureAdmin = createServerFn({ method: "GET" }).handler(
  async () => {
    const { roles } = await requireAdmin(getRequestHeaders());
    return { roles };
  },
);

/** Admin-only: all courses with counts. Self-guarded. */
export const listAdminCoursesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAdmin(getRequestHeaders());
    return listAdminCourses();
  },
);
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors in `src/lib/admin-functions.ts`. (Confirm `auth.api.getSession({ headers })` typechecks the same way it does in `src/lib/auth-functions.ts`.)

- [ ] **Step 3: Format and commit**

```bash
pnpm exec biome check --write src/lib/admin-functions.ts
git add src/lib/admin-functions.ts
git commit -m "feat(admin): requireAdmin guard + ensureAdmin/listAdminCourses server fns"
```

---

### Task 3: Seed script + grant admin role

**Files:**
- Create: `src/db/seed-admin.ts`
- Modify: `package.json` (add `db:grant-admin` script)

**Interfaces:**
- Consumes: `db`, `userRolesTable`/`userProfileTable`/`userProfileRolesTable`, `eq`.
- Produces: a runnable script; a `db:grant-admin` package script.

- [ ] **Step 1: Write `src/db/seed-admin.ts`**

```ts
import { eq } from "drizzle-orm";
import { db } from ".";
import {
  userProfileRolesTable,
  userProfileTable,
  userRolesTable,
} from "@/db/schema";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: pnpm db:grant-admin <email>");
    process.exit(1);
  }

  // 1. Upsert the admin role.
  await db
    .insert(userRolesTable)
    .values({ name: "admin", description: "Full administrative access" })
    .onConflictDoNothing();
  const [role] = await db
    .select()
    .from(userRolesTable)
    .where(eq(userRolesTable.name, "admin"));
  if (!role) {
    console.error("Failed to create or find the 'admin' role.");
    process.exit(1);
  }

  // 2. Find the user profile by email.
  const [profile] = await db
    .select()
    .from(userProfileTable)
    .where(eq(userProfileTable.email, email));
  if (!profile) {
    console.error(`No user_profiles row found for ${email}. Sign in once first.`);
    process.exit(1);
  }

  // 3. Grant the role.
  await db
    .insert(userProfileRolesTable)
    .values({ userProfileId: profile.id, roleId: role.id, assignedBy: "seed" })
    .onConflictDoNothing();

  console.log(`Granted 'admin' to ${email} (profile ${profile.id}, role ${role.id}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the package script**

In `package.json` `scripts`, add (keep alphabetical-ish next to the other `db:` scripts):

```json
"db:grant-admin": "dotenv -e .env -- tsx src/db/seed-admin.ts",
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors in `src/db/seed-admin.ts`.

- [ ] **Step 4: Run the grant for the admin user (approved: run once now)**

Run: `pnpm db:grant-admin apostopher@gmail.com`
Expected: `Granted 'admin' to apostopher@gmail.com (profile <id>, role <id>).`
If it prints "No user_profiles row found" — STOP and report; the user must sign in once so a profile row exists.

- [ ] **Step 5: Verify the grant (read-only)**

```bash
cat > /tmp/probe-role.ts <<'EOF'
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userProfileTable } from "@/db/schema";
import { getUserRoleNames } from "@/db/admin";
const [p] = await db.select().from(userProfileTable).where(eq(userProfileTable.email, "apostopher@gmail.com"));
console.log("roles:", p ? await getUserRoleNames(p.userId) : "no profile");
process.exit(0);
EOF
pnpm exec dotenv -e .env -- tsx /tmp/probe-role.ts; rm -f /tmp/probe-role.ts
```
Expected: `roles: [ 'admin' ]`.

- [ ] **Step 6: Format and commit (script + package.json only)**

```bash
pnpm exec biome check --write src/db/seed-admin.ts
git add src/db/seed-admin.ts package.json
git commit -m "feat(admin): db:grant-admin seed script; grant admin role by email"
```
Note: `package.json` also carries the user's uncommitted dev-script line. Before committing, verify the staged diff is ONLY the new `db:grant-admin` line: `git diff --cached package.json`. If the dev-script line is also staged, unstage it (`git restore --staged package.json`, re-add just the script hunk, or temporarily set the dev line back — mirror how it was handled for the xstate deps commit).

---

### Task 4: data-hooks (TanStack Query)

**Files:**
- Create: `src/data-hooks/keys.ts`, `src/data-hooks/use-admin-courses.ts`

**Interfaces:**
- Consumes: `useQuery` from `@tanstack/react-query`, `listAdminCoursesFn` from `@/lib/admin-functions`.
- Produces: `dataKeys.adminCourses()`, `useAdminCourses()` returning `UseQueryResult<AdminCourseSummary[]>` (type inferred end-to-end).

- [ ] **Step 1: Write `src/data-hooks/keys.ts`**

```ts
/** Query-key factory for typesafe TanStack Query hooks in src/data-hooks/. */
export const dataKeys = {
  adminCourses: () => ["admin", "courses"] as const,
} as const;
```

- [ ] **Step 2: Write `src/data-hooks/use-admin-courses.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { listAdminCoursesFn } from "@/lib/admin-functions";
import { dataKeys } from "./keys";

/** All courses with module/lesson counts, for the admin grid. */
export function useAdminCourses() {
  return useQuery({
    queryKey: dataKeys.adminCourses(),
    queryFn: () => listAdminCoursesFn(),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors; hovering `useAdminCourses().data` would be `AdminCourseSummary[] | undefined` (inferred, no manual generic).

- [ ] **Step 4: Format and commit**

```bash
pnpm exec biome check --write src/data-hooks/keys.ts src/data-hooks/use-admin-courses.ts
git add src/data-hooks/keys.ts src/data-hooks/use-admin-courses.ts
git commit -m "feat(admin): data-hooks dir with typesafe useAdminCourses query hook"
```

---

### Task 5: Route + UI

**Files:**
- Create: `src/routes/_authed/admin.tsx`, `src/components/admin/add-course-button.tsx`, `src/components/admin/course-tile.tsx`, `src/components/admin/admin-courses-page-container.tsx`
- Modify: `src/routeTree.gen.ts` (regenerated)

**Interfaces:**
- Consumes: `ensureAdmin` from `@/lib/admin-functions`, `useAdminCourses` from `@/data-hooks/use-admin-courses`, `AdminCourseSummary` from `@/db/admin`, `Button` from `@base-ui/react/Button`, `Plus` from `lucide-react`, `formatDistanceToNow` from `date-fns`.
- Produces: the `/admin` route and its components.

- [ ] **Step 1: Presentational — `src/components/admin/add-course-button.tsx`**

```tsx
import { Button } from "@base-ui/react/Button";
import { Plus } from "lucide-react";

/**
 * Unwired for step 1 — opens the create-course flow in a later step.
 */
export const AddCourseButton = () => {
  return (
    <Button
      onClick={() => {
        // TODO(step 2): open create-course flow
      }}
      className="inline-flex items-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 text-sm font-medium text-apple-contrast transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Add course
    </Button>
  );
};
```

- [ ] **Step 2: Presentational — `src/components/admin/course-tile.tsx`**

```tsx
import { formatDistanceToNow } from "date-fns";
import type { AdminCourseSummary } from "@/db/admin";

interface CourseTileProps {
  course: AdminCourseSummary;
}

export const CourseTile = ({ course }: CourseTileProps) => {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-gray-6 bg-gray-2 p-5 transition-colors hover:border-gray-8">
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
    </li>
  );
};
```

- [ ] **Step 3: Container — `src/components/admin/admin-courses-page-container.tsx`**

```tsx
import { useAdminCourses } from "@/data-hooks/use-admin-courses";
import { AddCourseButton } from "./add-course-button";
import { CourseTile } from "./course-tile";

export const AdminCoursesPageContainer = () => {
  const { data: courses, isLoading, error } = useAdminCourses();

  return (
    <div className="content-grid py-10">
      <div className="content flex flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-gray-12">Courses</h1>
            <p className="text-sm text-gray-11">
              Manage your courses and their modules.
            </p>
          </div>
          <AddCourseButton />
        </header>

        {isLoading ? (
          <p className="text-sm text-gray-11">Loading courses…</p>
        ) : error ? (
          <p className="text-sm text-red-11">
            Failed to load courses. Please try again.
          </p>
        ) : !courses || courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-6 bg-gray-2 p-10 text-center">
            <p className="text-sm font-medium text-gray-12">No courses yet</p>
            <p className="mt-1 text-sm text-gray-11">
              Create your first course to get started.
            </p>
          </div>
        ) : (
          <ul className="grid-auto-fit list-none p-0">
            {courses.map((course) => (
              <CourseTile key={course.id} course={course} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Route — `src/routes/_authed/admin.tsx`**

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminCoursesPageContainer } from "@/components/admin/admin-courses-page-container";
import { ensureAdmin } from "@/lib/admin-functions";

export const Route = createFileRoute("/_authed/admin")({
  beforeLoad: async () => {
    try {
      await ensureAdmin();
    } catch {
      throw redirect({ to: "/app" });
    }
  },
  component: AdminPage,
});

function AdminPage() {
  return <AdminCoursesPageContainer />;
}
```

- [ ] **Step 5: Regenerate the route tree + typecheck + build**

Run: `pnpm build`
Expected: build succeeds; `src/routeTree.gen.ts` now includes the `/admin` route (the router plugin regenerates it during build). Then:

Run: `pnpm exec tsc --noEmit`
Expected: no new errors in the created files.

- [ ] **Step 6: Manual verification (dev server)**

Run `pnpm dev`, then as the admin user (apostopher@gmail.com, now granted) open `/admin`:
- Tiles render, one per course, with name, `/slug`, `N modules · M lessons`, and a relative "Updated …".
- Layout is centered via `.content-grid`; tiles reflow responsively via `.grid-auto-fit`.
- The "Add course" button shows but does nothing.
- Sign out (or use a non-admin account) and hit `/admin` → redirected (to login when signed out, to `/app` when signed-in non-admin).

- [ ] **Step 7: Format and commit**

```bash
pnpm exec biome check --write src/routes/_authed/admin.tsx src/components/admin/add-course-button.tsx src/components/admin/course-tile.tsx src/components/admin/admin-courses-page-container.tsx
git add src/routes/_authed/admin.tsx src/components/admin src/routeTree.gen.ts
git commit -m "feat(admin): /admin course grid page with role guard"
```

---

## Self-Review

**Spec coverage:**
- Admin-role gating, redirect non-admins → Task 5 route `beforeLoad` + Task 2 `ensureAdmin`. ✓
- Every admin server fn self-guards via `requireAdmin` → Task 2 (`ensureAdmin`, `listAdminCoursesFn` both call it). ✓
- All fetching via TanStack Query in `src/data-hooks/` → Task 4 hook; container consumes it; no fetch/loader. ✓
- Course tiles (name, slug, module/lesson counts, relative updated) → Task 1 summary + Task 5 `CourseTile` with date-fns. ✓
- `.content-grid` + `.grid-auto-fit` → Task 5 container. ✓
- Unwired "Add course" button, Base UI + Lucide → Task 5 `AddCourseButton`. ✓
- Admin bootstrap, run once now → Task 3 seed script + grant + verify. ✓
- Files land where the spec says (`src/data-hooks/`, `src/components/admin/`, `_authed/admin.tsx`) → Tasks 1–5. ✓

**Placeholder scan:** No TBD/TODO except the intentional `// TODO(step 2)` in the unwired button (a spec requirement). Every code step is complete. ✓

**Type consistency:** `AdminCourseSummary` defined in Task 1 is consumed unchanged in Tasks 2, 4, 5. `requireAdmin`/`ensureAdmin`/`listAdminCoursesFn` names match across Tasks 2, 4, 5. `dataKeys`/`useAdminCourses` names match across Tasks 4, 5. ✓
