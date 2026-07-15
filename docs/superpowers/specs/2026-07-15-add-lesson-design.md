# Add lesson + lesson card redesign (Course Designer step 3d)

**Date:** 2026-07-15
**Status:** Design, pending approval
**Area:** `src/db/admin.ts`, `src/lib/admin-schemas.ts`, `src/routes/api/admin`, `src/data-hooks`, `src/atoms/admin.ts`, `src/components/admin`

## Context

Modules can be created and reordered. This adds **lessons**: each module column gets
an "Add lesson" sub-header button that opens a create-lesson dialog; the lesson card
is redesigned to a header with the lesson name on the left and a **drag handle on
the right** (inert for now — lesson drag is the next step, mirroring how the module
handle was added before wiring module drag).

## Decisions (from brainstorming)

- Lesson create = **name only**. Server sets `requiredSubscriptions = []`,
  `rank = (max lesson rank in the module) + 1`, unique slug; DB defaults cover
  `isAvailable`/`exclusivePerDay`/`hasDebrief`/`videoId`/`otherVideoIds`.
- Add-lesson is **per module**; one board-level dialog opened for a target module via
  a jotai atom holding the module id.
- Lesson card gains a header (name + inert drag handle). Lesson drag/reorder is a
  later step.
- Same conventions as add-module: guarded `/api/admin` POST, TanStack Query hook,
  Base UI Dialog, sonner toast, RHF + zod.

## Architecture

### Input schema — `src/lib/admin-schemas.ts`

```ts
export const createLessonInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
});
export type CreateLessonInput = z.infer<typeof createLessonInputSchema>;
```

### DB fn — `createLesson` in `src/db/admin.ts`

`createLesson(input: { moduleId: number; name: string }): Promise<BoardLesson>` —
mirrors `createModule`:
- Unique slug: `slugify(name) || "lesson"`, suffix `-2`, `-3`, … (lessons.slug is
  globally unique).
- Append rank: `select max(rank) where moduleId` → `null ? 1 : Number(max) + 1`
  (inserted as a string; column is `numeric(30,15)`).
- Insert `{ moduleId, name, slug, requiredSubscriptions: [], rank: String(rank) }`
  (DB defaults handle the rest), `returning()`; map to
  `{ id, name, slug, rank: Number(rank), isAvailable }` (`BoardLesson` shape).

### API route — `src/routes/api/admin/modules.$moduleId.lessons.ts`

`POST /api/admin/modules/$moduleId/lessons`:
- `requireAdmin(request.headers)` first → 403.
- `moduleId = Number(params.moduleId)` → 400 if not a positive integer.
- `request.json()` try/catch → 400; `createLessonInputSchema.safeParse` → 400.
- `Response.json(await createLesson({ moduleId, name }))`.

### data-hook — `src/data-hooks/use-create-lesson.ts`

`useCreateLesson(courseId)` — `useMutation` whose `mutationFn` takes
`{ moduleId: number; name: string }`, POSTs to
`/api/admin/modules/${moduleId}/lessons`, `boardLessonSchema.parse`es the response;
`onSuccess` invalidates `dataKeys.courseBoard(courseId)`.

### Open-state atom — `src/atoms/admin.ts`

```ts
/** Module id whose create-lesson dialog is open, or null when closed. */
export const createLessonModuleIdAtom = atom<number | null>(null);
```

(One board-level dialog; `open` is derived as `moduleId !== null`.)

### UI

- `add-lesson-button.tsx` — presentational: a subtle full-width ghost button
  (`Plus` + "Add lesson") in the module sub-header; `onClick` prop.
- `create-lesson-form.tsx` — presentational: single **Name** field (autofocus,
  accessible errors), Cancel + "Create lesson". (Same shape as `create-module-form`.)
- `create-lesson-dialog-container.tsx` — **board-level** container, prop
  `{ courseId }`: reads `createLessonModuleIdAtom`; `open = moduleId !== null`;
  RHF(`createLessonInputSchema`); `useCreateLesson(courseId)`; a **controlled** Base UI
  Dialog (no trigger); on submit → `mutate({ moduleId, name })` → `toast.success("Lesson created")`
  + close (set atom `null`); close resets form + mutation.
- `module-column.tsx` — add an **Add-lesson sub-header** (a bordered row below the
  sticky module header) rendering `<AddLessonButton onClick={onAddLesson} />`; new
  prop `onAddLesson?: () => void`.
- `lesson-card.tsx` — redesign to a header row: availability dot + `name` (truncate,
  left) and a **drag handle** button (`GripVertical`, `cursor-grab`,
  `aria-label="Drag to reorder lesson"`, **inert** — no dnd wiring this step) on the
  right. Same card container styling.
- `sortable-module-column.tsx` — `const setLessonModuleId = useSetAtom(createLessonModuleIdAtom)`;
  pass `onAddLesson={() => setLessonModuleId(mod.id)}` to `ModuleColumn`.
- `module-board-container.tsx` — render `<CreateLessonDialogContainer courseId={courseId} />`
  once (inside the DnD tree). The `DragOverlay`'s `<ModuleColumn>` gets no `onAddLesson`
  (its Add-lesson button is inert in the preview — fine).

## Files

- Modify: `src/lib/admin-schemas.ts`, `src/db/admin.ts`, `src/atoms/admin.ts`,
  `src/components/admin/module-column.tsx`, `src/components/admin/lesson-card.tsx`,
  `src/components/admin/sortable-module-column.tsx`,
  `src/components/admin/module-board-container.tsx`.
- Create: `src/routes/api/admin/modules.$moduleId.lessons.ts`,
  `src/data-hooks/use-create-lesson.ts`,
  `src/components/admin/add-lesson-button.tsx`,
  `src/components/admin/create-lesson-form.tsx`,
  `src/components/admin/create-lesson-dialog-container.tsx`.
- Regenerated: `src/routeTree.gen.ts`.

## Out of scope (next steps)

- Lesson drag/reorder (dnd within/across modules + rank persistence); edit/delete
  lesson; video/subscription fields. Shared `guardAdmin`/`findFreeSlug`/`single-name-form`
  consolidations still tracked.

## Testing / verification

- Typecheck + build.
- Manual (admin, a module present): module column shows an "Add lesson" sub-header;
  click → dialog → blank name error → create → toast + the new lesson card appears in
  that column (board refetch); the lesson card shows name + an (inert) drag handle.
