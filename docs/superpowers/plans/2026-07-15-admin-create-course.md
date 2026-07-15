# Admin /api/admin migration + create-course Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move admin data off server functions onto `/api/admin` route handlers, add a create-course endpoint, and relocate the `/admin` role guard into router context — all consumed by typesafe TanStack Query data-hooks.

**Architecture:** Admin data is served by `createFileRoute(...).server.handlers` under `src/routes/api/admin/`, each guarded by `requireAdmin(request.headers)`. The `/admin` route guard reads `context.roles` (loaded once in the root `beforeLoad`). Data-hooks `fetch` the API routes and zod-parse responses (coercing JSON date strings back to `Date`).

**Tech Stack:** TanStack Start/Router 1.167, TanStack Query 5, Drizzle/Postgres, better-auth, zod 4, vitest.

## Global Constraints

- **No server functions for admin data.** Admin endpoints are API route handlers under `src/routes/api/admin/`. (The session-infra server fn in the root is not an admin API and stays.)
- **Every admin API handler** opens with `await requireAdmin(request.headers)` and returns `403` on `ForbiddenError`.
- **All client fetching** via TanStack Query hooks in `src/data-hooks/`, each `fetch`ing an `/api/...` route and **zod-parsing** the response (`z.coerce.date()` for date fields — JSON delivers strings). No raw fetch in components; no route-loader data.
- **Guard via context:** `/admin` `beforeLoad` reads `context.roles` synchronously; never fetches.
- Types: kebab-case files; zod schemas are the single source of truth for wire shapes.
- Commands: pnpm. Typecheck `pnpm exec tsc --noEmit` (3 pre-existing unrelated `ai-test` errors expected — ignore). Build `pnpm build` (regenerates `src/routeTree.gen.ts`). Test `pnpm exec vitest run <path>`. Format `pnpm exec biome check --write <paths>`. The user's uncommitted `package.json` dev-script line + `src/db/schema.ts` must never be staged — use explicit `git add <paths>`.

---

## File Structure

- `src/lib/admin-schemas.ts` — **new.** Wire schemas + types (`adminCourseSummarySchema`/`AdminCourseSummary`, `courseSchema`/`Course`, `createCourseInputSchema`/`CreateCourseInput`).
- `src/lib/slugify.ts` (+ test) — **new.** Pure slug util.
- `src/db/admin.ts` — **modify.** Import `AdminCourseSummary` from schemas; add `createCourse`.
- `src/lib/auth-functions.ts` — **modify.** Add `getAuthContext` (session + roles).
- `src/routes/__root.tsx` — **modify.** Root `beforeLoad` loads `{ session, roles }`; context type gains `roles`.
- `src/router.tsx` — **modify.** Initial context `roles: []`.
- `src/lib/admin-functions.server.ts` — **modify.** `requireAdmin(headers: Headers)`.
- `src/routes/api/admin/courses.ts` — **new.** `GET` (list) + `POST` (create), guarded.
- `src/data-hooks/use-admin-courses.ts` — **modify.** Fetch + parse.
- `src/data-hooks/use-create-course.ts` — **new.** Create mutation.
- `src/routes/_authed/admin.tsx` — **modify.** Guard via `context.roles`.
- `src/lib/admin-functions.ts` — **delete.**

---

### Task 1: Shared schemas, slugify, createCourse (additive prep)

Additive — nothing that exists today breaks; the old server fns keep working.

**Files:**
- Create: `src/lib/admin-schemas.ts`, `src/lib/slugify.ts`, `src/lib/__tests__/slugify.test.ts`
- Modify: `src/db/admin.ts`

**Interfaces:**
- Produces: `adminCourseSummarySchema`, `AdminCourseSummary`, `courseSchema`, `Course`, `createCourseInputSchema`, `CreateCourseInput` (from admin-schemas); `slugify(input: string): string`; `createCourse(input: CreateCourseInput): Promise<DBCourse>` (db/admin).

- [ ] **Step 1: Write `src/lib/admin-schemas.ts`**

```ts
import { z } from "zod";

/** Course summary as delivered by GET /api/admin/courses (dates arrive as ISO strings). */
export const adminCourseSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  updatedAt: z.coerce.date(),
  moduleCount: z.number(),
  lessonCount: z.number(),
});
export type AdminCourseSummary = z.infer<typeof adminCourseSummarySchema>;

/** A full course row as delivered over JSON (dates coerced back to Date). */
export const courseSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Course = z.infer<typeof courseSchema>;

/** Input accepted by POST /api/admin/courses. */
export const createCourseInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().trim().max(2000).optional(),
  ),
  imageUrl: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().trim().url("Enter a valid URL").optional(),
  ),
});
export type CreateCourseInput = z.infer<typeof createCourseInputSchema>;
```

- [ ] **Step 2: Write the failing slugify test — `src/lib/__tests__/slugify.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { slugify } from "../slugify";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Intro to Flying")).toBe("intro-to-flying");
  });
  it("strips punctuation and collapses separators", () => {
    expect(slugify("A/B  &  C!!")).toBe("a-b-c");
  });
  it("trims leading/trailing separators", () => {
    expect(slugify("  -Hello- ")).toBe("hello");
  });
  it("removes diacritics", () => {
    expect(slugify("Aviación Básica")).toBe("aviacion-basica");
  });
  it("returns empty string when nothing slug-able remains", () => {
    expect(slugify("!!!")).toBe("");
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `pnpm exec vitest run src/lib/__tests__/slugify.test.ts`
Expected: FAIL — cannot resolve `../slugify`.

- [ ] **Step 4: Write `src/lib/slugify.ts`**

```ts
/** Lowercase, de-accented, hyphen-separated slug. Empty when nothing remains. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pnpm exec vitest run src/lib/__tests__/slugify.test.ts`
Expected: PASS (5/5).

- [ ] **Step 6: Modify `src/db/admin.ts` — import the type, add `createCourse`**

Change the top of `src/db/admin.ts` so `AdminCourseSummary` comes from the schema module (remove the local `interface AdminCourseSummary { ... }` and re-export the imported type), and add imports for the new needs. The file currently declares `interface AdminCourseSummary`; replace that declaration with:

```ts
import type { AdminCourseSummary, CreateCourseInput } from "@/lib/admin-schemas";
import type { DBCourse } from "@/db/schema";
import { slugify } from "@/lib/slugify";
// re-export so existing importers of AdminCourseSummary from "@/db/admin" keep working
export type { AdminCourseSummary } from "@/lib/admin-schemas";
```

Keep `listAdminCourses` and `getUserRoleNames` exactly as they are (their return type `AdminCourseSummary[]` now refers to the imported type — identical shape). Append `createCourse`:

```ts
export async function createCourse(input: CreateCourseInput): Promise<DBCourse> {
  const base = slugify(input.name) || "course";

  // Find a free slug: base, else base-2, base-3, ...
  const taken = await db
    .select({ slug: coursesTable.slug })
    .from(coursesTable)
    .where(
      or(eq(coursesTable.slug, base), like(coursesTable.slug, `${base}-%`)),
    );
  const takenSet = new Set(taken.map((r) => r.slug));
  let slug = base;
  for (let n = 2; takenSet.has(slug); n++) slug = `${base}-${n}`;

  const [created] = await db
    .insert(coursesTable)
    .values({
      name: input.name,
      slug,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
    })
    .returning();
  return created;
}
```

Add `or`, `like` to the existing `drizzle-orm` import (it already imports `desc, eq, sql`).

- [ ] **Step 7: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors. (Confirm `db/admin.ts` and its existing importers — `admin-functions.ts`, `use-admin-courses.ts` — still typecheck against the re-exported `AdminCourseSummary`.)

- [ ] **Step 8: Format and commit**

```bash
pnpm exec biome check --write src/lib/admin-schemas.ts src/lib/slugify.ts src/lib/__tests__/slugify.test.ts src/db/admin.ts
git add src/lib/admin-schemas.ts src/lib/slugify.ts src/lib/__tests__/slugify.test.ts src/db/admin.ts
git commit -m "feat(admin): wire schemas, slugify util, createCourse db fn"
```

---

### Task 2: Roles in root router context (additive)

Additive — context gains `roles`; `/admin` still uses the old server-fn guard until Task 3.

**Files:**
- Modify: `src/lib/auth-functions.ts`, `src/routes/__root.tsx`, `src/router.tsx`

**Interfaces:**
- Produces: `getAuthContext` server fn → `{ session, roles: string[] }`; router `context.roles: string[]`.

- [ ] **Step 1: Add `getAuthContext` to `src/lib/auth-functions.ts`**

Append (keep `getSession`/`ensureSession` as they are):

```ts
import { getUserRoleNames } from "@/db/admin";

/** Session plus the user's role names, for the root router context. */
export const getAuthContext = createServerFn({ method: "GET" }).handler(
  async () => {
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({ headers });
    const roles = session?.user?.id
      ? await getUserRoleNames(session.user.id)
      : [];
    return { session, roles };
  },
);
```

- [ ] **Step 2: Update `src/routes/__root.tsx`**

Add `roles` to the context type and load it in `beforeLoad`:

```ts
// import getAuthContext alongside getSession
import { getAuthContext, getSession } from "../lib/auth-functions";
```

In `interface MyRouterContext` add:
```ts
  roles: string[];
```

Replace the `beforeLoad`:
```ts
  beforeLoad: async () => {
    const { session, roles } = await getAuthContext();
    return { session, roles };
  },
```

(`type Session = Awaited<ReturnType<typeof getSession>>` stays as the `session` type.)

- [ ] **Step 3: Update `src/router.tsx` initial context**

Change the `context` line to seed `roles`:
```ts
    context: { ...context, session: null, roles: [] },
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm exec tsc --noEmit` then `pnpm build`
Expected: both succeed; no new type errors (every route's context now includes `roles: string[]`).

- [ ] **Step 5: Format and commit**

```bash
pnpm exec biome check --write src/lib/auth-functions.ts src/routes/__root.tsx src/router.tsx
git add src/lib/auth-functions.ts src/routes/__root.tsx src/router.tsx
git commit -m "feat(admin): load user roles into root router context"
```

---

### Task 3: Cut over to /api/admin routes (atomic)

Replaces the admin server fns with API routes, swaps the hooks to fetch, moves the guard to context, and deletes `admin-functions.ts`. These change together to keep the build green.

**Files:**
- Modify: `src/lib/admin-functions.server.ts`, `src/data-hooks/use-admin-courses.ts`, `src/routes/_authed/admin.tsx`
- Create: `src/routes/api/admin/courses.ts`, `src/data-hooks/use-create-course.ts`
- Delete: `src/lib/admin-functions.ts`
- Regenerated: `src/routeTree.gen.ts`

**Interfaces:**
- Consumes: `requireAdmin`/`ForbiddenError` (server-only), `listAdminCourses`/`createCourse` (db), the schemas (Task 1), `context.roles` (Task 2), `dataKeys` (existing).
- Produces: `GET`/`POST /api/admin/courses`; `useCreateCourse()`.

- [ ] **Step 1: `requireAdmin(headers)` in `src/lib/admin-functions.server.ts`**

Change the guard to accept headers (API handlers pass `request.headers`). Full file:

```ts
import { getUserRoleNames } from "@/db/admin";
import { auth } from "@/lib/auth";

export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

const ADMIN_ROLE = "admin";

/** Server-only admin guard. Every admin API handler must call this first. */
export async function requireAdmin(
  headers: Headers,
): Promise<{ userId: string; roles: string[] }> {
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) throw new ForbiddenError();
  const roles = await getUserRoleNames(userId);
  if (!roles.includes(ADMIN_ROLE)) throw new ForbiddenError();
  return { userId, roles };
}
```

- [ ] **Step 2: Create `src/routes/api/admin/courses.ts`**

```ts
import { createFileRoute } from "@tanstack/react-router";
import { createCourse, listAdminCourses } from "@/db/admin";
import { createCourseInputSchema } from "@/lib/admin-schemas";
import { ForbiddenError, requireAdmin } from "@/lib/admin-functions.server";

async function guard(request: Request): Promise<Response | null> {
  try {
    await requireAdmin(request.headers);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response("Forbidden", { status: 403 });
    }
    throw error;
  }
}

export const Route = createFileRoute("/api/admin/courses")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await guard(request);
        if (denied) return denied;
        return Response.json(await listAdminCourses());
      },
      POST: async ({ request }) => {
        const denied = await guard(request);
        if (denied) return denied;
        const parsed = createCourseInputSchema.safeParse(await request.json());
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.flatten() },
            { status: 400 },
          );
        }
        return Response.json(await createCourse(parsed.data));
      },
    },
  },
});
```

- [ ] **Step 3: Swap `src/data-hooks/use-admin-courses.ts` to fetch + parse**

```ts
import { useQuery } from "@tanstack/react-query";
import { adminCourseSummarySchema } from "@/lib/admin-schemas";
import { dataKeys } from "./keys";

/** All courses with module/lesson counts, for the admin grid. */
export function useAdminCourses() {
  return useQuery({
    queryKey: dataKeys.adminCourses(),
    queryFn: async () => {
      const res = await fetch("/api/admin/courses");
      if (!res.ok) throw new Error(`Failed to load courses (${res.status})`);
      return adminCourseSummarySchema.array().parse(await res.json());
    },
    staleTime: 60_000,
  });
}
```

- [ ] **Step 4: Create `src/data-hooks/use-create-course.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { courseSchema, type CreateCourseInput } from "@/lib/admin-schemas";
import { dataKeys } from "./keys";

/** Create a course, then refetch the admin course list. */
export function useCreateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCourseInput) => {
      const res = await fetch("/api/admin/courses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`Failed to create course (${res.status})`);
      return courseSchema.parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.adminCourses() });
    },
  });
}
```

- [ ] **Step 5: Guard `/admin` via context — `src/routes/_authed/admin.tsx`**

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminCoursesPageContainer } from "@/components/admin/admin-courses-page-container";

export const Route = createFileRoute("/_authed/admin")({
  beforeLoad: ({ context }) => {
    if (!context.roles.includes("admin")) {
      throw redirect({ to: "/app" });
    }
  },
  component: AdminPage,
});

function AdminPage() {
  return <AdminCoursesPageContainer />;
}
```

- [ ] **Step 6: Delete the old server-fn file**

```bash
git rm src/lib/admin-functions.ts
```

- [ ] **Step 7: Build (regenerates route tree) + typecheck**

Run: `pnpm build`
Expected: succeeds; `src/routeTree.gen.ts` now includes `/api/admin/courses` and no longer references deleted code.

Run: `pnpm exec tsc --noEmit`
Expected: no new errors; confirm nothing still imports from `@/lib/admin-functions` (the deleted file):
`grep -rn "admin-functions\"" src` should show only `admin-functions.server`.

- [ ] **Step 8: Re-verify `/admin` behavior**

The guard moved from a server fn to context and the list hook now fetches — re-verify:
- Typecheck/build green (above).
- Confirm `src/components/admin/admin-courses-page-container.tsx` still compiles against `useAdminCourses()` (its `data` is `AdminCourseSummary[] | undefined`, unchanged shape).
- Manual (controller/user): as admin, `/admin` still lists (empty state, 0 courses); a non-admin/logged-out user is redirected. (Full manual check needs a browser session.)

- [ ] **Step 9: Format and commit**

```bash
pnpm exec biome check --write src/lib/admin-functions.server.ts src/routes/api/admin/courses.ts src/data-hooks/use-admin-courses.ts src/data-hooks/use-create-course.ts src/routes/_authed/admin.tsx
git add src/lib/admin-functions.server.ts src/routes/api/admin/courses.ts src/data-hooks/use-admin-courses.ts src/data-hooks/use-create-course.ts src/routes/_authed/admin.tsx src/routeTree.gen.ts
git rm src/lib/admin-functions.ts 2>/dev/null || true
git commit -m "feat(admin): serve admin data via /api/admin routes; guard via router context"
```

---

## Self-Review

**Spec coverage:**
- No admin server fns; API routes under `/api/admin` → Task 3 (`courses.ts`), Task 3 Step 6 (delete). ✓
- Every handler self-guards with `requireAdmin(request.headers)` → Task 3 `guard()` used by GET+POST. ✓
- Guard via root context → Task 2 (root loads roles) + Task 3 Step 5 (admin.tsx reads `context.roles`). ✓
- Data-hooks fetch + zod-parse (coerce dates) → Task 3 Steps 3–4 with `adminCourseSummarySchema`/`courseSchema`. ✓
- Create course: slug auto+unique, URL-validated imageUrl, nullable fields → Task 1 (`createCourse`, `createCourseInputSchema`, `slugify`). ✓
- Grid refetches on create → Task 3 Step 4 `invalidateQueries`. ✓
- Delete `admin-functions.ts` → Task 3 Step 6. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. ✓

**Type consistency:** `AdminCourseSummary`/`Course`/`CreateCourseInput` defined in Task 1 (`admin-schemas.ts`) are consumed unchanged in Tasks 3. `requireAdmin(headers)` signature (Task 3 Step 1) matches its one caller `guard()` (Step 2). `getAuthContext` (Task 2) feeds `context.roles` read in Task 3 Step 5. `dataKeys.adminCourses()` unchanged. ✓

**Ordering keeps build green:** Task 1 additive; Task 2 additive (context gains a field, seeded in router.tsx); Task 3 atomic cutover (all references to the deleted server fns updated/removed together). ✓
