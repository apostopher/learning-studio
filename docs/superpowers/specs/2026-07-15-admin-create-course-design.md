# Admin "create course" API + data-hook (Course Designer step 2a)

**Date:** 2026-07-15
**Status:** Design, pending approval
**Area:** `src/db/admin.ts`, `src/lib/admin-functions.ts`, `src/lib/slugify.ts`, `src/data-hooks/`

## Context

`/admin` lists courses (step 1). This adds the ability to create one. The user
added `description` (nullable text) and `image_url` (nullable text) to
`coursesTable`. The API accepts `name`, optional `description`, optional
`imageUrl`; `slug` (NOT NULL UNIQUE) is auto-generated from the name.

## Decisions (from brainstorming)

- **Slug:** auto-generated via `slugify(name)`, made unique by appending
  `-2`, `-3`, … on collision. Not part of the API input.
- **imageUrl:** validated as an absolute URL (`z.string().url()`).
- **Guarding:** the create server fn self-guards with `requireAdmin()` first
  (per the admin-API rule).
- **Cache:** the create hook invalidates the admin-courses query so the grid
  refetches.

## Architecture

### Input schema — `createCourseInputSchema` (exported from `src/lib/admin-functions.ts`)

```ts
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

Empty strings for the optional fields are coerced to `undefined` (→ stored as
`null`), so a form submitting blank fields doesn't trip the URL check.

### Slug util — `src/lib/slugify.ts`

```ts
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")   // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

Pure, unit-testable. Falls back to `"course"` when the result is empty (handled
in the DB fn, so the util stays a pure transform).

### DB fn — `createCourse` in `src/db/admin.ts`

- Compute `base = slugify(name) || "course"`.
- Find a free slug: `select slug from courses where slug = base or slug like base || '-%'`,
  then pick `base` if free else `base-2`, `base-3`, … (first integer not taken).
- Insert `{ name, slug, description: description ?? null, imageUrl: imageUrl ?? null }`,
  `returning()` the row; return it as `DBCourse`.
- Signature: `createCourse(input: CreateCourseInput): Promise<DBCourse>`.

(Low-concurrency admin action; the compute-then-insert is acceptable. As a
belt-and-suspenders guard, a unique-violation on insert is surfaced as a normal
error — a later step can add retry if needed.)

### Server fn — `createCourseFn` in `src/lib/admin-functions.ts`

```ts
export const createCourseFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createCourseInputSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();          // guard FIRST
    return createCourse(data);
  });
```

### data-hook — `src/data-hooks/use-create-course.ts`

```ts
export function useCreateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCourseInput) => createCourseFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.adminCourses() });
    },
  });
}
```

Return type inferred end-to-end (`DBCourse`), consistent with the data-hooks
convention.

## Files

- Create: `src/lib/slugify.ts`, `src/lib/__tests__/slugify.test.ts`,
  `src/data-hooks/use-create-course.ts`.
- Modify: `src/db/admin.ts` (add `createCourse`),
  `src/lib/admin-functions.ts` (add `createCourseInputSchema` + `createCourseFn`).

## Out of scope (later)

- The "Add course" UI/form that calls `useCreateCourse` (this step is API + hook only;
  the button stays unwired).
- Image upload (imageUrl is just a URL string for now).
- Edit/delete course; slug override.

## Testing / verification

- Unit: `slugify` (spaces, punctuation, diacritics, empty) — real assertions.
- Behavioral: a read-only-safe check is not possible (create writes); verify the
  DB fn + slug uniqueness by creating a throwaway course via a probe, then
  confirm the grid query returns it, then clean it up — OR defer create-path
  verification to the wired-up form step. Typecheck + build must pass.
