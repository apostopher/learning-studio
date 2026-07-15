# Add-module to the course editor (Course Designer step 3b)

**Date:** 2026-07-15
**Status:** Design, pending approval
**Area:** `src/db/admin.ts`, `src/lib/admin-schemas.ts`, `src/routes/api/admin`, `src/data-hooks`, `src/components/admin`, `src/atoms/admin.ts`

## Context

A new course has no modules. This adds an "Add module" flow to the editor,
mirroring the create-course dialog: a sub-header toolbar in the editor renders an
Add-module button that opens a dialog; on create the board refetches and the new
column appears. No drag-and-drop.

## Decisions (from brainstorming)

- Form collects **name only**. Server sets `requiredSubscriptions = []` and
  `rank = (max module rank in the course) + 1` (append to the end). Slug is
  auto-generated + unique (modules' slug is globally unique).
- Editor layout: `[course title + back]` header → a thin **sub-header** toolbar
  with the Add-module button (inline-end aligned) → the board.
- Same conventions as create-course: guarded `/api/admin` POST, TanStack Query
  data-hook, Base UI Dialog controlled by a jotai atom, sonner toast, RHF + zod.

## Architecture

### Input schema — `src/lib/admin-schemas.ts`

```ts
export const createModuleInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
});
export type CreateModuleInput = z.infer<typeof createModuleInputSchema>;
```

The POST returns the created module in **`boardModuleSchema`** shape (with
`lessons: []`), so the hook parses it with the existing schema.

### DB fn — `createModule` in `src/db/admin.ts`

`createModule(input: { courseId: number; name: string }): Promise<BoardModule>`:
- Unique slug: `slugify(name) || "module"`, suffix `-2`, `-3`, … on collision
  (same pattern as `createCourse`, since `modules.slug` is globally unique).
- Append rank: `select max(rank) where courseId` → `rank = maxRank == null ? 1 :
  Number(maxRank) + 1` (inserted as a string, the column is `numeric`).
- Insert `{ courseId, name, slug, requiredSubscriptions: [], rank: String(rank) }`,
  `returning()`; map to `{ id, name, slug, rank: Number(rank), lessons: [] }`.

(The editor only reaches this for an existing course, so no extra course-exists
check; the `courseId` FK protects integrity.)

### API route — `src/routes/api/admin/courses.$courseId.modules.ts`

`POST /api/admin/courses/$courseId/modules`:
- `await requireAdmin(request.headers)` first → 403 on `ForbiddenError`.
- `courseId = Number(params.courseId)` → 400 if not a positive integer.
- `body = await request.json()` in try/catch → 400 on invalid JSON.
- `createModuleInputSchema.safeParse(body)` → 400 with `flatten()` on failure.
- `Response.json(await createModule({ courseId, name: parsed.data.name }))`.

### data-hook — `src/data-hooks/use-create-module.ts`

```ts
export function useCreateModule(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateModuleInput) => {
      const res = await fetch(`/api/admin/courses/${courseId}/modules`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`Failed to create module (${res.status})`);
      return boardModuleSchema.parse(await res.json());
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: dataKeys.courseBoard(courseId) }),
  });
}
```

### UI (mirrors create-course; presentational/container split)

- `src/atoms/admin.ts` — add `createModuleDialogOpenAtom = atom(false)`.
- `add-module-button.tsx` — presentational, prop-forwarding "Add module" button
  (Base UI `Button` + `Plus`), used as the Dialog trigger via `render` (same shape
  as `add-course-button.tsx`).
- `create-module-form.tsx` — presentational, single **Name** field (autofocus,
  accessible error wiring like `create-course-form`), Cancel + "Create module".
- `create-module-dialog-container.tsx` — container, prop `{ courseId: number }`:
  `createModuleDialogOpenAtom`, RHF(`createModuleInputSchema`),
  `useCreateModule(courseId)`; Base UI Dialog; `onSuccess` → `toast.success("Module
  created")` + close + reset; `onError` handled by an inline banner; close resets.

### Editor layout — sub-header

`course-board.tsx` gains a `toolbar?: React.ReactNode` prop and renders a
sub-header between the title header and the board body:
```tsx
<div className="flex items-center justify-end border-b border-gray-6 px-4 py-2">
  {toolbar}
</div>
```
`course-board-container.tsx` passes
`toolbar={<CreateModuleDialogContainer courseId={courseId} />}` (the container
renders `CourseBoard` only once the board has loaded, so the toolbar shows with a
valid course).

## Files

- Modify: `src/lib/admin-schemas.ts` (+`createModuleInputSchema`), `src/db/admin.ts`
  (+`createModule`), `src/atoms/admin.ts` (+atom),
  `src/components/admin/course-board.tsx` (+`toolbar` prop + sub-header),
  `src/components/admin/course-board-container.tsx` (pass toolbar).
- Create: `src/routes/api/admin/courses.$courseId.modules.ts`,
  `src/data-hooks/use-create-module.ts`,
  `src/components/admin/add-module-button.tsx`,
  `src/components/admin/create-module-form.tsx`,
  `src/components/admin/create-module-dialog-container.tsx`.
- Regenerated: `src/routeTree.gen.ts`.

## Out of scope (next steps)

- dnd-kit reordering + rank persistence; subscription gating picker; edit/delete
  module; adding lessons. Shared `guardAdmin(request)` helper extraction (tracked).

## Testing / verification

- `slugify`/`createModule` unit or read-only-probe not applicable (write path) —
  verify via typecheck + build; a real create needs a seeded course + the
  `schema.ts` migration.
- Manual (admin session): editor → Add module → dialog → blank name error → create
  → toast + a new empty column appears (board refetch).
