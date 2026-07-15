# Admin APIs under /api/admin: courses list + create (Course Designer step 2a)

**Date:** 2026-07-15
**Status:** Design, pending approval
**Area:** `src/routes/api/admin`, `src/routes/__root.tsx`, `src/routes/_authed/admin.tsx`, `src/db/admin.ts`, `src/lib/*`, `src/data-hooks/*`

## Context

`/admin` lists courses via server fns (`ensureAdmin`, `listAdminCoursesFn`) merged
in step 1. We are (a) adding course creation, and (b) — per the new directive —
moving admin off server functions onto REST-style API route handlers under
`/api/admin`, consumed by typesafe data-hooks. `coursesTable` gained nullable
`description` and `image_url`.

## Decisions (from brainstorming)

- **No server functions for admin.** Admin data is served by API route handlers
  under `src/routes/api/admin/` (the existing `createFileRoute(...).server.handlers`
  pattern), consumed by data-hooks via `fetch` + zod-parse.
- **Every admin API handler self-guards** with `requireAdmin(request.headers)`
  first; returns 403 on failure.
- **Route guard via root context** (not a server fn, not a per-route fetch): the
  root route's `beforeLoad` — which already loads the session — also loads the
  user's role names into router context. `/admin`'s `beforeLoad` reads
  `context.roles` synchronously and redirects non-admins to `/app`. (Accepted
  cost: one role query per root load.)
- **Slug:** auto-generated from name, unique-suffixed. **imageUrl:** must be a
  valid URL. Empty optional strings → `null`.
- **Cache:** the create hook invalidates the admin-courses query so the grid
  refetches.

## Architecture

### Shared schemas — `src/lib/admin-schemas.ts` (client-safe: no server imports)

Single source of truth for shapes, used by API handlers, hooks, and (later) the form.

```ts
export const adminCourseSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  updatedAt: z.coerce.date(), // JSON delivers an ISO string; coerce back to Date
  moduleCount: z.number(),
  lessonCount: z.number(),
});
export type AdminCourseSummary = z.infer<typeof adminCourseSummarySchema>;

export const createCourseInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.preprocess((v) => (v === "" ? undefined : v),
    z.string().trim().max(2000).optional()),
  imageUrl: z.preprocess((v) => (v === "" ? undefined : v),
    z.string().trim().url("Enter a valid URL").optional()),
});
export type CreateCourseInput = z.infer<typeof createCourseInputSchema>;
```

`src/db/admin.ts` imports `AdminCourseSummary` from here (drops its local interface);
`listAdminCourses` still returns real `Date`s server-side.

### Server-only guard — `src/lib/admin-functions.server.ts`

Reworked to take headers (API handlers pass `request.headers`):

```ts
export class ForbiddenError extends Error { /* name = "ForbiddenError" */ }

export async function requireAdmin(headers: Headers):
  Promise<{ userId: string; roles: string[] }> {
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) throw new ForbiddenError();
  const roles = await getUserRoleNames(userId);
  if (!roles.includes("admin")) throw new ForbiddenError();
  return { userId, roles };
}
```

`src/lib/admin-functions.ts` (the old server-fn file) is **deleted**.

### Slug util — `src/lib/slugify.ts`

Pure: lowercase, strip diacritics (`̀-ͯ`), non-alphanumeric → `-`, trim
dashes. Empty → `""` (caller falls back to `"course"`). Unit-tested.

### DB fn — `createCourse` in `src/db/admin.ts`

`createCourse(input: CreateCourseInput): Promise<DBCourse>`:
- `base = slugify(name) || "course"`.
- `select slug where slug = base or slug like base || '-%'`; pick `base`, else the
  first free `base-2`, `base-3`, ….
- Insert `{ name, slug, description ?? null, imageUrl ?? null }`, `returning()` the row.

### API routes — `src/routes/api/admin/courses.ts`

One resource file, two handlers, each guarded:

```ts
export const Route = createFileRoute("/api/admin/courses")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try { await requireAdmin(request.headers); }
        catch { return new Response("Forbidden", { status: 403 }); }
        return Response.json(await listAdminCourses());
      },
      POST: async ({ request }) => {
        try { await requireAdmin(request.headers); }
        catch { return new Response("Forbidden", { status: 403 }); }
        const parsed = createCourseInputSchema.safeParse(await request.json());
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }
        return Response.json(await createCourse(parsed.data));
      },
    },
  },
});
```

(A shared local `guard(request)` helper folds the try/catch so it isn't duplicated.)

### Root context roles — `src/routes/__root.tsx` + `src/lib/auth-functions.ts`

Add `getAuthContext` server fn (session infra, not an admin API) returning
`{ session, roles }`; root `beforeLoad` returns it into context. `MyRouterContext`
gains `roles: string[]`. Existing `getSession`/`session` usage is unchanged.

```ts
// auth-functions.ts
export const getAuthContext = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({ headers });
  const roles = session?.user?.id ? await getUserRoleNames(session.user.id) : [];
  return { session, roles };
});
```

### Route guard — `src/routes/_authed/admin.tsx`

```ts
beforeLoad: ({ context }) => {
  if (!context.roles.includes("admin")) throw redirect({ to: "/app" });
},
```

No server-fn call, no fetch — synchronous context read (works on SSR + client-nav).
`_authed` already redirects unauthenticated users to login.

### data-hooks (fetch + zod-parse for true type safety)

`src/data-hooks/use-admin-courses.ts`:
```ts
queryFn: async () => {
  const res = await fetch("/api/admin/courses");
  if (!res.ok) throw new Error(`Failed to load courses (${res.status})`);
  return adminCourseSummarySchema.array().parse(await res.json());
}
```

`src/data-hooks/use-create-course.ts`:
```ts
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
      return dbCourseSchema.parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dataKeys.adminCourses() }),
  });
}
```

## Files

- Create: `src/lib/admin-schemas.ts`, `src/lib/slugify.ts`,
  `src/lib/__tests__/slugify.test.ts`, `src/routes/api/admin/courses.ts`,
  `src/data-hooks/use-create-course.ts`.
- Modify: `src/lib/admin-functions.server.ts` (headers arg), `src/db/admin.ts`
  (import type, add `createCourse`), `src/lib/auth-functions.ts` (`getAuthContext`),
  `src/routes/__root.tsx` (context roles), `src/routes/_authed/admin.tsx` (context
  guard), `src/data-hooks/use-admin-courses.ts` (fetch + parse).
- Delete: `src/lib/admin-functions.ts`.

## Out of scope (later)

- The "Add course" form/button wiring (this step is API + hook only).
- Image upload; edit/delete; slug override; role-load caching in root.

## Testing / verification

- Unit: `slugify` (spaces, punctuation, diacritics, empty).
- Re-verify `/admin` still lists (empty state now) and still redirects non-admins —
  the guard moved from a server fn to root context, so this must be re-checked.
- Typecheck + build must pass. Create-path can be smoke-tested by POSTing to
  `/api/admin/courses` as admin, or deferred to the form step.

## Migration note

This replaces the just-merged admin server fns with API routes and relocates the
guard. `useAdminCourses` and `/admin` behavior must be re-verified after the change.
