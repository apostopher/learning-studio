# Module reorder via dnd-kit (step 3c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make module columns reorderable by dragging the grip handle, persisted by server-side midpoint ("averaged") rank, with an optimistic cache update.

**Architecture:** A new `ModuleBoardContainer` owns `DndContext` + horizontal `SortableContext`; `SortableModuleColumn` wires `useSortable` and hands the drag listeners to the grip button (handle-only). On drop, `useReorderModule` optimistically reorders the `courseBoard` cache and PATCHes `/api/admin/modules/$moduleId`, where `reorderModule` computes the new rank in SQL numeric.

**Tech Stack:** dnd-kit (core/sortable/utilities), TanStack Query 5, Drizzle/Postgres, jotai, zod.

## Global Constraints

- Admin endpoints are API route handlers under `src/routes/api/admin/`, each opening with `await requireAdmin(request.headers)` → 403 on `ForbiddenError`. Client fetching only via TanStack Query hooks in `src/data-hooks/`.
- Presentational/container split: presentational pure (props only; may use refs); containers hold hooks/DnD state (jotai for shared client state — the active-drag id is a jotai atom, not `useState`). Token colors; logical CSS; kebab-case files.
- `rank` schema widening (`src/db/schema.ts`) is ALREADY DONE and left uncommitted (the user's file) for `pnpm db:push` — do NOT touch or stage `src/db/schema.ts`.
- Commands: pnpm. Typecheck `pnpm exec tsc --noEmit` (3 pre-existing unrelated `ai-test` errors expected — ignore). Build `pnpm build` (regenerates `src/routeTree.gen.ts`). Format `pnpm exec biome check --write <paths>`. The user's uncommitted `package.json` dev-script line, `src/db/schema.ts`, `CLAUDE.md` must never be staged — explicit `git add <paths>` only. `$` in filenames needs `\$` escaping in shell.

---

## File Structure

- `src/lib/admin-schemas.ts` — **modify.** `reorderModuleInputSchema`.
- `src/db/admin.ts` — **modify.** `reorderModule` (SQL numeric midpoint).
- `src/routes/api/admin/modules.$moduleId.ts` — **new.** Guarded PATCH.
- `src/data-hooks/use-reorder-module.ts` — **new.** Optimistic reorder mutation.
- `src/atoms/admin.ts` — **modify.** `activeDragModuleIdAtom`.
- `src/components/admin/module-column.tsx` — **modify.** `dragHandleProps` on the grip.
- `src/components/admin/sortable-module-column.tsx` — **new.** `useSortable` wrapper.
- `src/components/admin/module-board-container.tsx` — **new.** DnD owner.
- `src/components/admin/course-board.tsx` — **modify.** Chrome + `children` slot.
- `src/components/admin/course-board-container.tsx` — **modify.** Render `ModuleBoardContainer`.
- `src/routeTree.gen.ts` — regenerated.

---

### Task 1: `reorderModuleInputSchema` + `reorderModule` DB fn (additive)

**Files:** Modify `src/lib/admin-schemas.ts`, `src/db/admin.ts`.

**Interfaces:** Produces `reorderModuleInputSchema`/`ReorderModuleInput`; `reorderModule(input: { moduleId: number; prevModuleId: number | null; nextModuleId: number | null }): Promise<{ id: number; rank: number } | null>`.

- [ ] **Step 1: Add to `src/lib/admin-schemas.ts`**

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

- [ ] **Step 2: Add `reorderModule` to `src/db/admin.ts`**

Add `type SQL` to the existing `drizzle-orm` import (it already imports `sql`, `eq`, `asc`, `desc`, `or`, `like`, `inArray`). Append:

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
  else return null;

  const [updated] = await db
    .update(modulesTable)
    .set({ rank: rankExpr, updatedAt: sql`now()` })
    .where(eq(modulesTable.id, input.moduleId))
    .returning({ id: modulesTable.id, rank: modulesTable.rank });

  return updated ? { id: updated.id, rank: Number(updated.rank) } : null;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors. (Confirm the `sql` fragments compose into `.set({ rank })` and `SQL` is imported as a type.)

- [ ] **Step 4: Format and commit**

```bash
pnpm exec biome check --write src/lib/admin-schemas.ts src/db/admin.ts
git add src/lib/admin-schemas.ts src/db/admin.ts
git commit -m "feat(kanban): reorderModule db fn (SQL numeric midpoint) + input schema"
```

---

### Task 2: Reorder API route + optimistic hook (additive)

**Files:** Create `src/routes/api/admin/modules.$moduleId.ts`, `src/data-hooks/use-reorder-module.ts`.

**Interfaces:** Consumes `requireAdmin`/`ForbiddenError`, `reorderModule`, `reorderModuleInputSchema`, `dataKeys`, `CourseBoard`. Produces `PATCH /api/admin/modules/$moduleId`; `useReorderModule(courseId)`.

- [ ] **Step 1: `src/routes/api/admin/modules.$moduleId.ts`**

```ts
import { createFileRoute } from "@tanstack/react-router";
import { reorderModule } from "@/db/admin";
import { reorderModuleInputSchema } from "@/lib/admin-schemas";
import { ForbiddenError, requireAdmin } from "@/lib/admin-functions.server";

export const Route = createFileRoute("/api/admin/modules/$moduleId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          await requireAdmin(request.headers);
        } catch (error) {
          if (error instanceof ForbiddenError) {
            return new Response("Forbidden", { status: 403 });
          }
          throw error;
        }
        const moduleId = Number(params.moduleId);
        if (!Number.isInteger(moduleId) || moduleId <= 0) {
          return Response.json({ error: "Invalid module id" }, { status: 400 });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const parsed = reorderModuleInputSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }
        const updated = await reorderModule({
          moduleId,
          prevModuleId: parsed.data.prevModuleId,
          nextModuleId: parsed.data.nextModuleId,
        });
        if (!updated) return new Response("Not found", { status: 404 });
        return Response.json(updated);
      },
    },
  },
});
```

- [ ] **Step 2: `src/data-hooks/use-reorder-module.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CourseBoard } from "@/lib/admin-schemas";
import { dataKeys } from "./keys";

interface ReorderVars {
  moduleId: number;
  prevModuleId: number | null;
  nextModuleId: number | null;
}

/** Reorder a module (optimistic), persisting an averaged rank server-side. */
export function useReorderModule(courseId: number) {
  const queryClient = useQueryClient();
  const key = dataKeys.courseBoard(courseId);
  return useMutation({
    mutationFn: async (vars: ReorderVars) => {
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
    onError: (_error, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(key, ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
```

- [ ] **Step 3: Build + typecheck**

Run: `pnpm build` then `pnpm exec tsc --noEmit`
Expected: build regenerates `routeTree.gen.ts` with `/api/admin/modules/$moduleId`; no new type errors.

- [ ] **Step 4: Format and commit**

```bash
pnpm exec biome check --write "src/routes/api/admin/modules.\$moduleId.ts" src/data-hooks/use-reorder-module.ts
git add "src/routes/api/admin/modules.\$moduleId.ts" src/data-hooks/use-reorder-module.ts src/routeTree.gen.ts
git commit -m "feat(kanban): guarded module reorder PATCH + optimistic useReorderModule"
```

---

### Task 3: dnd-kit UI — sortable columns + board container (additive)

**Files:** Modify `src/atoms/admin.ts`, `src/components/admin/module-column.tsx`; create `src/components/admin/sortable-module-column.tsx`, `src/components/admin/module-board-container.tsx`.

**Interfaces:** Produces `activeDragModuleIdAtom`; `ModuleColumn` gains `dragHandleProps`; `SortableModuleColumn` (`{ module }`); `ModuleBoardContainer` (`{ courseId, modules }`).

- [ ] **Step 1: Add the atom to `src/atoms/admin.ts`**

```ts
/** Id of the module column currently being dragged, or null. */
export const activeDragModuleIdAtom = atom<number | null>(null);
```

- [ ] **Step 2: `module-column.tsx` — accept `dragHandleProps` on the grip button**

Add the prop and spread it on the grip `<button>`:

```tsx
export const ModuleColumn = ({
  module: mod,
  dragHandleProps,
}: {
  module: BoardModule;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}) => {
```

and on the grip button (keep the existing classes):

```tsx
        <button
          type="button"
          aria-label="Drag to reorder module"
          {...dragHandleProps}
          className="-me-1 shrink-0 cursor-grab rounded p-1 text-gray-10 transition-colors hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
```

(Spread `dragHandleProps` BEFORE `className` so the component's `className` wins; the dnd-kit listeners/attributes — `onPointerDown`, `role`, `tabIndex`, `aria-*` — land on the handle.)

- [ ] **Step 3: `src/components/admin/sortable-module-column.tsx`**

```tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardModule } from "@/lib/admin-schemas";
import { cn } from "@/lib/cn";
import { ModuleColumn } from "./module-column";

export const SortableModuleColumn = ({ module: mod }: { module: BoardModule }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: mod.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("shrink-0", isDragging && "opacity-40")}
    >
      <ModuleColumn module={mod} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
};
```

- [ ] **Step 4: `src/components/admin/module-board-container.tsx`**

```tsx
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useAtom } from "jotai";

import { activeDragModuleIdAtom } from "@/atoms/admin";
import { useReorderModule } from "@/data-hooks/use-reorder-module";
import type { BoardModule } from "@/lib/admin-schemas";
import { ModuleColumn } from "./module-column";
import { SortableModuleColumn } from "./sortable-module-column";

export const ModuleBoardContainer = ({
  courseId,
  modules,
}: {
  courseId: number;
  modules: BoardModule[];
}) => {
  const [activeId, setActiveId] = useAtom(activeDragModuleIdAtom);
  const reorder = useReorderModule(courseId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = modules.map((m) => m.id);
  const activeModule = modules.find((m) => m.id === activeId) ?? null;

  const onDragStart = (event: DragStartEvent) => {
    setActiveId(Number(event.active.id));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(Number(active.id));
    const newIndex = ids.indexOf(Number(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(modules, oldIndex, newIndex);
    const pos = newOrder.findIndex((m) => m.id === active.id);
    const prev = newOrder[pos - 1] ?? null;
    const next = newOrder[pos + 1] ?? null;
    reorder.mutate({
      moduleId: Number(active.id),
      prevModuleId: prev?.id ?? null,
      nextModuleId: next?.id ?? null,
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex-1 overflow-auto">
        <div className="flex w-max items-start gap-4 p-4">
          <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
            {modules.map((mod) => (
              <SortableModuleColumn key={mod.id} module={mod} />
            ))}
          </SortableContext>
        </div>
      </div>
      <DragOverlay>
        {activeModule ? <ModuleColumn module={activeModule} /> : null}
      </DragOverlay>
    </DndContext>
  );
};
```

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors. (Confirm the dnd-kit imports resolve and `useSortable({ id: number })` accepts a numeric id.)

- [ ] **Step 6: Format and commit**

```bash
pnpm exec biome check --write src/atoms/admin.ts src/components/admin/module-column.tsx src/components/admin/sortable-module-column.tsx src/components/admin/module-board-container.tsx
git add src/atoms/admin.ts src/components/admin/module-column.tsx src/components/admin/sortable-module-column.tsx src/components/admin/module-board-container.tsx
git commit -m "feat(kanban): sortable module columns + DnD board container"
```

---

### Task 4: Wire the DnD board into the editor (wire-up)

**Files:** Modify `src/components/admin/course-board.tsx`, `src/components/admin/course-board-container.tsx`.

**Interfaces:** Consumes `ModuleBoardContainer`. Produces the editor rendering the sortable board.

- [ ] **Step 1: Refactor `course-board.tsx` to chrome + `children` slot**

Replace the whole component so it renders the board *chrome* (header + sub-header) and a `children` body slot (the container supplies the body):

```tsx
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const CourseBoard = ({
  courseName,
  toolbar,
  children,
}: {
  courseName: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) => {
  return (
    <div className="course-board flex h-dvh flex-col">
      <header className="flex h-[var(--board-header-height)] items-center gap-3 border-b border-gray-6 px-4">
        <Link
          to="/admin"
          className="shrink-0 text-gray-11 transition-colors hover:text-gray-12"
          aria-label="Back to courses"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <h1 className="min-w-0 truncate text-base font-semibold text-gray-12">
          {courseName}
        </h1>
      </header>

      {toolbar && (
        <div className="flex h-[var(--board-subheader-height)] items-center justify-end border-b border-gray-6 px-4">
          {toolbar}
        </div>
      )}

      {children}
    </div>
  );
};
```

(The `ModuleColumn` import is no longer used here — remove it. The empty state + columns now live in the container/`ModuleBoardContainer`.)

- [ ] **Step 2: Update `course-board-container.tsx` to supply the body**

```tsx
import { useCourseBoard } from "@/data-hooks/use-course-board";
import { CourseBoard } from "./course-board";
import { CreateModuleDialogContainer } from "./create-module-dialog-container";
import { ModuleBoardContainer } from "./module-board-container";

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

  return (
    <CourseBoard
      courseName={board.course.name}
      toolbar={<CreateModuleDialogContainer courseId={courseId} />}
    >
      {board.modules.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-11">No modules yet</p>
        </div>
      ) : (
        <ModuleBoardContainer courseId={courseId} modules={board.modules} />
      )}
    </CourseBoard>
  );
};
```

- [ ] **Step 3: Build + typecheck**

Run: `pnpm build` then `pnpm exec tsc --noEmit`
Expected: both pass.

- [ ] **Step 4: Manual note**

Controller/user verifies (admin, ≥2 modules; run `pnpm db:push` first so ranks widen): drag a module by its grip → lands in place instantly (optimistic), order persists on reload; dropping at the ends works; keyboard drag (Tab to grip → Space → Arrows → Space) reorders. A failed save rolls back.

- [ ] **Step 5: Format and commit**

```bash
pnpm exec biome check --write src/components/admin/course-board.tsx src/components/admin/course-board-container.tsx
git add src/components/admin/course-board.tsx src/components/admin/course-board-container.tsx
git commit -m "feat(kanban): wire sortable module board into the editor"
```

---

## Self-Review

**Spec coverage:**
- Averaged rank server-side (SQL numeric) → Task 1 (`reorderModule`). ✓
- Guarded PATCH + optimistic hook (reorder cache, rollback, settle-invalidate) → Task 2. ✓
- Handle-only drag via grip; DragOverlay; pointer+keyboard sensors → Task 3. ✓
- CourseBoard chrome+slot; container renders ModuleBoardContainer → Task 4. ✓
- rank widened to numeric(30,15) → done in `schema.ts` (uncommitted, user db:push); not in these commits. ✓

**Placeholder scan:** No TBD/TODO; every code step complete. ✓

**Type consistency:** `ReorderModuleInput` (Task 1) ⇄ API safeParse (Task 2). `reorderModule` signature ⇄ API caller. `useReorderModule(courseId)` `ReorderVars` ⇄ `ModuleBoardContainer` mutate call (Task 3). `dataKeys.courseBoard(courseId)` reused for optimistic + invalidate. `activeDragModuleIdAtom` (Task 3) ⇄ container. `dragHandleProps` (ModuleColumn) ⇄ `SortableModuleColumn`. `CourseBoard` new props (`courseName`/`children`) ⇄ container (Task 4). ✓

**Ordering keeps build green:** Tasks 1–3 additive (schema/db, API/hook, unrendered components); Task 4 refactors `CourseBoard` + wires the container. ✓
