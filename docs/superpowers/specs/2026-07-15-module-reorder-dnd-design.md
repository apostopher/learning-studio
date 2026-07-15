# Module reorder via dnd-kit (Course Designer step 3c)

**Date:** 2026-07-15
**Status:** Design, pending approval
**Area:** `src/db/schema.ts`, `src/db/admin.ts`, `src/lib/admin-schemas.ts`, `src/routes/api/admin`, `src/data-hooks`, `src/atoms/admin.ts`, `src/components/admin`

## Context

The module drag handle (`GripVertical`) is in place but inert. This makes it a
real dnd-kit sortable handle so modules reorder by drag, persisted by **midpoint
("averaged") rank** computed **server-side in Postgres numeric**, with an
**optimistic** cache update.

## Decisions (from brainstorming)

- **Averaged rank, server-side.** On drop, the moved module's new rank =
  midpoint of its new neighbors' ranks, computed in SQL numeric (JS doubles would
  cap precision). Only the moved module's rank changes.
- **Widen `rank` to `numeric(30, 15)`** (modules + lessons) so midpoints survive
  ~50 consecutive same-gap drops. This is a `schema.ts` edit → **you run
  `pnpm db:push`** (like the description/image_url columns). Widening preserves
  existing values.
- **Optimistic:** the column stays in its dropped position immediately (react-query
  cache reorder), the PATCH saves in the background, rollback on error.
- **Handle-only drag** via the existing grip button; **DragOverlay** for a clean
  preview in the horizontal scroll container.
- Scope: **modules only**. Lesson drag is a later step (lessons.rank widened now so
  no second migration).

## Architecture

### Schema — `src/db/schema.ts` (you `db:push`)

`modulesTable.rank` and `lessonsTable.rank`: `numeric({ precision: 10, scale: 5 })`
→ `numeric({ precision: 30, scale: 15 })`. Left **uncommitted** (your schema work);
apply with `pnpm db:push`.

### Input schema — `src/lib/admin-schemas.ts`

```ts
export const reorderModuleInputSchema = z
  .object({
    prevModuleId: z.number().int().positive().nullable(),
    nextModuleId: z.number().int().positive().nullable(),
  })
  .refine((v) => v.prevModuleId !== null || v.nextModuleId !== null, {
    message: "At least one neighbor is required",
  });
export type ReorderModuleInput = z.infer<typeof reorderModuleInputSchema>;
```

`prevModuleId`/`nextModuleId` are the module's neighbors in the **new** order (either
null at an end).

### DB fn — `reorderModule` in `src/db/admin.ts`

`reorderModule(input: { moduleId: number; prevModuleId: number | null; nextModuleId: number | null }): Promise<{ id: number; rank: number } | null>`

Computes the new rank **in SQL** for real precision, via a subquery expression:
- both neighbors → `((SELECT rank … prev) + (SELECT rank … next)) / 2`
- start (only next) → `(SELECT rank … next) / 2`
- end (only prev) → `(SELECT rank … prev) + 1`

```ts
export async function reorderModule(input: {
  moduleId: number;
  prevModuleId: number | null;
  nextModuleId: number | null;
}): Promise<{ id: number; rank: number } | null> {
  const prevRank = input.prevModuleId
    ? sql`(select ${modulesTable.rank} from ${modulesTable} where ${modulesTable.id} = ${input.prevModuleId})`
    : null;
  const nextRank = input.nextModuleId
    ? sql`(select ${modulesTable.rank} from ${modulesTable} where ${modulesTable.id} = ${input.nextModuleId})`
    : null;

  let rankExpr: SQL;
  if (prevRank && nextRank) rankExpr = sql`(${prevRank} + ${nextRank}) / 2`;
  else if (nextRank) rankExpr = sql`${nextRank} / 2`;
  else if (prevRank) rankExpr = sql`${prevRank} + 1`;
  else return null; // guarded upstream, but be safe

  const [updated] = await db
    .update(modulesTable)
    .set({ rank: rankExpr, updatedAt: sql`now()` })
    .where(eq(modulesTable.id, input.moduleId))
    .returning({ id: modulesTable.id, rank: modulesTable.rank });

  return updated ? { id: updated.id, rank: Number(updated.rank) } : null;
}
```

(`SQL` type + `sql` from `drizzle-orm`.) Postgres numeric division computes to
≥16 significant digits then rounds to the column's 15-decimal scale — real
precision, not JS-double-limited.

### API route — `src/routes/api/admin/modules.$moduleId.ts`

`PATCH /api/admin/modules/$moduleId`:
- `requireAdmin(request.headers)` first → 403.
- `moduleId = Number(params.moduleId)` → 400 if not a positive integer.
- `request.json()` in try/catch → 400 on bad JSON.
- `reorderModuleInputSchema.safeParse` → 400 (also rejects both-null via the refine).
- `reorderModule(...)` → 404 if `null` (module missing), else `Response.json(updated)`.

### data-hook — `src/data-hooks/use-reorder-module.ts` (optimistic)

```ts
export function useReorderModule(courseId: number) {
  const queryClient = useQueryClient();
  const key = dataKeys.courseBoard(courseId);
  return useMutation({
    mutationFn: async (vars: {
      moduleId: number;
      prevModuleId: number | null;
      nextModuleId: number | null;
    }) => {
      const res = await fetch(`/api/admin/modules/${vars.moduleId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prevModuleId: vars.prevModuleId,
          nextModuleId: vars.nextModuleId,
        }),
      });
      if (!res.ok) throw new Error(`Failed to reorder module (${res.status})`);
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CourseBoard | null>(key);
      queryClient.setQueryData<CourseBoard | null>(key, (old) => {
        if (!old) return old;
        const modules = [...old.modules];
        const from = modules.findIndex((m) => m.id === vars.moduleId);
        if (from === -1) return old;
        const [moved] = modules.splice(from, 1);
        const to =
          vars.prevModuleId == null
            ? 0
            : modules.findIndex((m) => m.id === vars.prevModuleId) + 1;
        modules.splice(to, 0, moved);
        return { ...old, modules };
      });
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous !== undefined) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
```

### UI

- `src/atoms/admin.ts` — `activeDragModuleIdAtom = atom<number | null>(null)`.
- `module-column.tsx` — add prop `dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>`; spread it onto the grip button (the button becomes the drag handle).
- `sortable-module-column.tsx` — **new.** `useSortable({ id: module.id })`; a wrapper `div` with `ref={setNodeRef}`, `style={{ transform: CSS.Transform.toString(transform), transition }}`, `className={cn("shrink-0", isDragging && "opacity-40")}`; renders `<ModuleColumn module dragHandleProps={{ ...attributes, ...listeners }} />`.
- `module-board-container.tsx` — **new.** Owns the DnD: `useSensors(PointerSensor{activationConstraint:{distance:5}}, KeyboardSensor{coordinateGetter: sortableKeyboardCoordinates})`; `useReorderModule(courseId)`; `activeDragModuleIdAtom`. Renders `DndContext` (`collisionDetection={closestCenter}`, `onDragStart`→set active, `onDragEnd`→compute neighbors + mutate, `onDragCancel`→clear) around the `flex-1 overflow-auto` scroll region + `SortableContext(items=module ids, horizontalListSortingStrategy)` + a `DragOverlay` rendering `<ModuleColumn>` of the active module.
  - `onDragEnd`: `arrayMove(modules, oldIndex, newIndex)`; the moved module's new neighbors → `reorder.mutate({ moduleId, prevModuleId, nextModuleId })`.
- `course-board.tsx` — refactor to chrome + slot: props `{ courseName, toolbar, children }`; renders `.course-board` root + header (back + `courseName`) + sub-header (`toolbar`) + `{children}` (fills flex-1).
- `course-board-container.tsx` — renders `<CourseBoard courseName toolbar={<CreateModuleDialogContainer/>}>` with children = the empty state (`board.modules.length === 0`) or `<ModuleBoardContainer courseId modules={board.modules} />`.

## Files

- Modify: `src/db/schema.ts` (rank precision — uncommitted, db:push), `src/db/admin.ts` (+`reorderModule`), `src/lib/admin-schemas.ts` (+schema), `src/atoms/admin.ts` (+atom), `src/components/admin/module-column.tsx` (+`dragHandleProps`), `course-board.tsx` (→ slot), `course-board-container.tsx` (→ ModuleBoardContainer).
- Create: `src/routes/api/admin/modules.$moduleId.ts`, `src/data-hooks/use-reorder-module.ts`, `src/components/admin/sortable-module-column.tsx`, `src/components/admin/module-board-container.tsx`.
- Regenerated: `src/routeTree.gen.ts`.

## Out of scope (next steps)

- Lesson drag (within/across modules); rank rebalance; add-lesson. Shared
  `guardAdmin(request)` / `findFreeSlug` extraction still tracked.

## Testing / verification

- Typecheck + build.
- **You:** `pnpm db:push` to widen `rank` before reordering persists at full precision.
- Manual (admin, ≥2 modules): drag a module by its grip → it lands in place instantly,
  order persists on reload; drop at the ends works; keyboard drag works (focus grip,
  space, arrows, space).
