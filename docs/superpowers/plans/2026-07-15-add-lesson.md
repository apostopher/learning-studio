# Add lesson + lesson card redesign (step 3d) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lessons to modules — a per-module "Add lesson" sub-header button + create-lesson dialog + API — and redesign the lesson card to a header with the lesson name and an (inert) drag handle.

**Architecture:** `createLesson` mirrors `createModule`; guarded `POST /api/admin/modules/$moduleId/lessons` → `useCreateLesson`. One board-level controlled dialog opens for a target module via a jotai atom holding the module id. Lesson drag is NOT wired this step.

**Tech Stack:** TanStack Start/Router, TanStack Query, Drizzle/Postgres, Base UI Dialog, react-hook-form + zod, sonner, jotai, Lucide.

## Global Constraints

- Admin endpoints are API route handlers under `src/routes/api/admin/`, each opening with `await requireAdmin(request.headers)` → 403 on `ForbiddenError`. Client fetching only via TanStack Query hooks in `src/data-hooks/`, zod-parsing responses.
- Presentational/container split; token colors (`gray-*`,`apple-*`,`red-*`); logical inline-axis CSS; Base UI components; kebab-case files. jotai for shared client state (dialog open), not `useState`.
- Commands: pnpm. Typecheck `pnpm exec tsc --noEmit` (3 pre-existing unrelated `ai-test` errors expected — ignore). Build `pnpm build` (regenerates `src/routeTree.gen.ts`). Format `pnpm exec biome check --write <paths>`. The user's uncommitted `package.json` dev-script line, `src/db/schema.ts`, `CLAUDE.md` must never be staged — explicit `git add <paths>` only. `$` in filenames needs `\$` escaping.

---

## File Structure

- `src/lib/admin-schemas.ts` — **modify.** `createLessonInputSchema`.
- `src/db/admin.ts` — **modify.** `createLesson`.
- `src/routes/api/admin/modules.$moduleId.lessons.ts` — **new.** Guarded POST.
- `src/data-hooks/use-create-lesson.ts` — **new.** Create-lesson mutation.
- `src/atoms/admin.ts` — **modify.** `createLessonModuleIdAtom`.
- `src/components/admin/lesson-card.tsx` — **modify.** Header + inert handle.
- `src/components/admin/add-lesson-button.tsx` — **new.**
- `src/components/admin/module-column.tsx` — **modify.** Add-lesson sub-header.
- `src/components/admin/create-lesson-form.tsx` — **new.**
- `src/components/admin/create-lesson-dialog-container.tsx` — **new.**
- `src/components/admin/sortable-module-column.tsx` — **modify.** Pass `onAddLesson`.
- `src/components/admin/module-board-container.tsx` — **modify.** Render the dialog.
- `src/routeTree.gen.ts` — regenerated.

---

### Task 1: `createLessonInputSchema` + `createLesson` DB fn (additive)

**Files:** Modify `src/lib/admin-schemas.ts`, `src/db/admin.ts`.

**Interfaces:** Produces `createLessonInputSchema`/`CreateLessonInput`; `createLesson(input: { moduleId: number; name: string }): Promise<BoardLesson>`.

- [ ] **Step 1: Add to `src/lib/admin-schemas.ts`**

```ts
export const createLessonInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
});
export type CreateLessonInput = z.infer<typeof createLessonInputSchema>;
```

- [ ] **Step 2: Add `createLesson` to `src/db/admin.ts`**

(`slugify`, `or`, `like`, `sql`, `eq`, `lessonsTable`, and the `BoardLesson` type are already imported/available.)

```ts
export async function createLesson(input: {
  moduleId: number;
  name: string;
}): Promise<BoardLesson> {
  const base = slugify(input.name) || "lesson";
  const taken = await db
    .select({ slug: lessonsTable.slug })
    .from(lessonsTable)
    .where(or(eq(lessonsTable.slug, base), like(lessonsTable.slug, `${base}-%`)));
  const takenSet = new Set(taken.map((r) => r.slug));
  let slug = base;
  for (let n = 2; takenSet.has(slug); n++) slug = `${base}-${n}`;

  const [{ maxRank }] = await db
    .select({ maxRank: sql<string | null>`max(${lessonsTable.rank})` })
    .from(lessonsTable)
    .where(eq(lessonsTable.moduleId, input.moduleId));
  const rank = maxRank === null ? 1 : Number(maxRank) + 1;

  const [created] = await db
    .insert(lessonsTable)
    .values({
      moduleId: input.moduleId,
      name: input.name,
      slug,
      requiredSubscriptions: [],
      rank: String(rank),
    })
    .returning();

  return {
    id: created.id,
    name: created.name,
    slug: created.slug,
    rank: Number(created.rank),
    isAvailable: created.isAvailable,
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors. (Confirm `requiredSubscriptions: []` + `rank: String(rank)` satisfy the insert types; the other NOT-NULL lesson columns have DB defaults.)

- [ ] **Step 4: Format and commit**

```bash
pnpm exec biome check --write src/lib/admin-schemas.ts src/db/admin.ts
git add src/lib/admin-schemas.ts src/db/admin.ts
git commit -m "feat(kanban): createLessonInputSchema + createLesson db fn"
```

---

### Task 2: Lesson-create API route + hook (additive)

**Files:** Create `src/routes/api/admin/modules.$moduleId.lessons.ts`, `src/data-hooks/use-create-lesson.ts`.

**Interfaces:** Consumes `requireAdmin`/`ForbiddenError`, `createLesson`, `createLessonInputSchema`, `boardLessonSchema`, `dataKeys`. Produces `POST /api/admin/modules/$moduleId/lessons`; `useCreateLesson(courseId)`.

- [ ] **Step 1: `src/routes/api/admin/modules.$moduleId.lessons.ts`**

```ts
import { createFileRoute } from "@tanstack/react-router";
import { createLesson } from "@/db/admin";
import { createLessonInputSchema } from "@/lib/admin-schemas";
import { ForbiddenError, requireAdmin } from "@/lib/admin-functions.server";

export const Route = createFileRoute("/api/admin/modules/$moduleId/lessons")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
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
        const parsed = createLessonInputSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }
        return Response.json(
          await createLesson({ moduleId, name: parsed.data.name }),
        );
      },
    },
  },
});
```

- [ ] **Step 2: `src/data-hooks/use-create-lesson.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { boardLessonSchema } from "@/lib/admin-schemas";
import { dataKeys } from "./keys";

/** Create a lesson in a module, then refetch the course board. */
export function useCreateLesson(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { moduleId: number; name: string }) => {
      const res = await fetch(`/api/admin/modules/${input.moduleId}/lessons`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: input.name }),
      });
      if (!res.ok) throw new Error(`Failed to create lesson (${res.status})`);
      return boardLessonSchema.parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.courseBoard(courseId) });
    },
  });
}
```

- [ ] **Step 3: Build + typecheck**

Run: `pnpm build` then `pnpm exec tsc --noEmit`
Expected: build regenerates `routeTree.gen.ts` with `/api/admin/modules/$moduleId/lessons`; no new type errors.

- [ ] **Step 4: Format and commit**

```bash
pnpm exec biome check --write "src/routes/api/admin/modules.\$moduleId.lessons.ts" src/data-hooks/use-create-lesson.ts
git add "src/routes/api/admin/modules.\$moduleId.lessons.ts" src/data-hooks/use-create-lesson.ts src/routeTree.gen.ts
git commit -m "feat(kanban): guarded lesson-create API route + useCreateLesson hook"
```

---

### Task 3: Lesson card redesign + Add-lesson button + module sub-header (additive)

**Files:** Modify `src/components/admin/lesson-card.tsx`, `src/components/admin/module-column.tsx`; create `src/components/admin/add-lesson-button.tsx`.

**Interfaces:** Produces the redesigned `LessonCard` (header + inert handle); `AddLessonButton` (`{ onClick }`); `ModuleColumn` gains optional `onAddLesson`.

- [ ] **Step 1: `src/components/admin/add-lesson-button.tsx`**

```tsx
import { Plus } from "lucide-react";

export const AddLessonButton = ({ onClick }: { onClick: () => void }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-6 px-3 py-2 text-xs font-medium text-gray-11 transition-colors hover:border-gray-8 hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      Add lesson
    </button>
  );
};
```

- [ ] **Step 2: Redesign `src/components/admin/lesson-card.tsx`**

```tsx
import { GripVertical } from "lucide-react";
import type { BoardLesson } from "@/lib/admin-schemas";
import { cn } from "@/lib/cn";

export const LessonCard = ({ lesson }: { lesson: BoardLesson }) => {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-sm text-gray-12">
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          lesson.isAvailable ? "bg-apple-9" : "bg-gray-7",
        )}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">{lesson.name}</span>
      {/* Inert for now — wired as a dnd handle in the lesson-drag step. */}
      <button
        type="button"
        aria-label="Drag to reorder lesson"
        className="-me-1 shrink-0 cursor-grab rounded p-1 text-gray-10 transition-colors hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};
```

- [ ] **Step 3: Add the sub-header to `src/components/admin/module-column.tsx`**

Add `import { AddLessonButton } from "./add-lesson-button";`, add the prop, and render the sub-header between the sticky header and the lessons list. The prop block becomes:

```tsx
export const ModuleColumn = ({
  module: mod,
  dragHandleProps,
  onAddLesson,
}: {
  module: BoardModule;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  onAddLesson?: () => void;
}) => {
```

and insert, immediately after the closing `</header>` and before the `<div className="flex flex-col gap-2 p-3">` lessons block:

```tsx
      {onAddLesson && (
        <div className="border-b border-gray-6 p-3">
          <AddLessonButton onClick={onAddLesson} />
        </div>
      )}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors. (`SortableModuleColumn`/DragOverlay still call `ModuleColumn` without `onAddLesson` — valid since it's optional; the sub-header simply doesn't render there yet.)

- [ ] **Step 5: Format and commit**

```bash
pnpm exec biome check --write src/components/admin/add-lesson-button.tsx src/components/admin/lesson-card.tsx src/components/admin/module-column.tsx
git add src/components/admin/add-lesson-button.tsx src/components/admin/lesson-card.tsx src/components/admin/module-column.tsx
git commit -m "feat(kanban): lesson card header+handle, Add lesson button + module sub-header"
```

---

### Task 4: Lesson dialog + wire-up

**Files:** Modify `src/atoms/admin.ts`, `src/components/admin/sortable-module-column.tsx`, `src/components/admin/module-board-container.tsx`; create `src/components/admin/create-lesson-form.tsx`, `src/components/admin/create-lesson-dialog-container.tsx`.

**Interfaces:** Produces `createLessonModuleIdAtom`, `CreateLessonForm`, `CreateLessonDialogContainer` (`{ courseId }`); columns open the dialog for their module.

- [ ] **Step 1: Add the atom to `src/atoms/admin.ts`**

```ts
/** Module id whose create-lesson dialog is open, or null when closed. */
export const createLessonModuleIdAtom = atom<number | null>(null);
```

- [ ] **Step 2: `src/components/admin/create-lesson-form.tsx`**

```tsx
import { Loader2 } from "lucide-react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { cn } from "@/lib/cn";

interface CreateLessonFormProps {
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  registerName: UseFormRegisterReturn<"name">;
  nameError?: string;
  serverError?: string;
  isPending: boolean;
  onCancel: () => void;
}

export const CreateLessonForm = ({
  onSubmit,
  registerName,
  nameError,
  serverError,
  isPending,
  onCancel,
}: CreateLessonFormProps) => {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="lesson-name" className="text-sm font-medium text-gray-12">
          Name
        </label>
        <input
          {...registerName}
          id="lesson-name"
          type="text"
          autoFocus
          aria-invalid={!!nameError}
          aria-describedby={nameError ? "lesson-name-error" : undefined}
          className={cn(
            "min-w-0 w-full rounded-lg border bg-gray-1 px-3.5 py-2.5 text-sm text-gray-12 outline-none transition-colors duration-100 placeholder:text-gray-8",
            "focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:border-apple-9",
            nameError
              ? "border-red-9 focus-visible:ring-red-9 focus-visible:border-red-9"
              : "border-gray-6 hover:border-gray-8",
          )}
        />
        {nameError && (
          <p id="lesson-name-error" role="alert" aria-live="polite" className="text-sm text-red-11">
            {nameError}
          </p>
        )}
      </div>

      {serverError && (
        <p role="alert" className="rounded-lg border border-red-9/40 bg-red-9/15 px-3 py-2.5 text-sm text-red-11">
          {serverError}
        </p>
      )}

      <div className="mt-2 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-11 transition-colors hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 text-sm font-medium text-apple-contrast",
            "transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Create lesson
        </button>
      </div>
    </form>
  );
};
```

- [ ] **Step 3: `src/components/admin/create-lesson-dialog-container.tsx`**

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog } from "@base-ui/react/dialog";
import { useAtom } from "jotai";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createLessonModuleIdAtom } from "@/atoms/admin";
import { useCreateLesson } from "@/data-hooks/use-create-lesson";
import {
  createLessonInputSchema,
  type CreateLessonInput,
} from "@/lib/admin-schemas";
import { CreateLessonForm } from "./create-lesson-form";

export const CreateLessonDialogContainer = ({
  courseId,
}: {
  courseId: number;
}) => {
  const [moduleId, setModuleId] = useAtom(createLessonModuleIdAtom);
  const createLesson = useCreateLesson(courseId);
  const form = useForm<CreateLessonInput>({
    resolver: zodResolver(createLessonInputSchema),
    mode: "onSubmit",
  });

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setModuleId(null);
      form.reset();
      createLesson.reset();
    }
  };

  const handleSubmit = form.handleSubmit((values) => {
    if (moduleId == null) return;
    createLesson.mutate(
      { moduleId, name: values.name },
      {
        onSuccess: () => {
          toast.success("Lesson created");
          onOpenChange(false);
        },
      },
    );
  });

  return (
    <Dialog.Root open={moduleId !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-gray-12">
            Create lesson
          </Dialog.Title>
          <Dialog.Description className="mt-1 mb-5 text-sm text-gray-11">
            Add a lesson to this module.
          </Dialog.Description>
          <CreateLessonForm
            onSubmit={handleSubmit}
            registerName={form.register("name")}
            nameError={form.formState.errors.name?.message}
            serverError={
              createLesson.isError
                ? "Could not create lesson. Please try again."
                : undefined
            }
            isPending={createLesson.isPending}
            onCancel={() => onOpenChange(false)}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
```

- [ ] **Step 4: Wire `onAddLesson` in `src/components/admin/sortable-module-column.tsx`**

Add `import { useSetAtom } from "jotai";` and `import { createLessonModuleIdAtom } from "@/atoms/admin";`, then:

```tsx
  const setLessonModuleId = useSetAtom(createLessonModuleIdAtom);
```

and pass it to `ModuleColumn`:

```tsx
      <ModuleColumn
        module={mod}
        dragHandleProps={{ ...attributes, ...listeners }}
        onAddLesson={() => setLessonModuleId(mod.id)}
      />
```

- [ ] **Step 5: Render the dialog in `src/components/admin/module-board-container.tsx`**

Add `import { CreateLessonDialogContainer } from "./create-lesson-dialog-container";` and render it once inside the `DndContext` (e.g. right after `</DragOverlay>`):

```tsx
      <CreateLessonDialogContainer courseId={courseId} />
```

- [ ] **Step 6: Build + typecheck**

Run: `pnpm build` then `pnpm exec tsc --noEmit`
Expected: both pass.

- [ ] **Step 7: Manual note**

Controller/user verifies (admin, a module present): each module column shows an "Add lesson" sub-header; click → dialog → blank name error → create → toast + the new lesson card (name + inert handle) appears in that column. Only one lesson dialog opens at a time (the last-clicked module).

- [ ] **Step 8: Format and commit**

```bash
pnpm exec biome check --write src/atoms/admin.ts src/components/admin/create-lesson-form.tsx src/components/admin/create-lesson-dialog-container.tsx src/components/admin/sortable-module-column.tsx src/components/admin/module-board-container.tsx
git add src/atoms/admin.ts src/components/admin/create-lesson-form.tsx src/components/admin/create-lesson-dialog-container.tsx src/components/admin/sortable-module-column.tsx src/components/admin/module-board-container.tsx
git commit -m "feat(kanban): create-lesson dialog wired to per-module Add lesson buttons"
```

---

## Self-Review

**Spec coverage:**
- Lesson create (name only; server slug/rank/subscriptions) → Task 1. ✓
- Guarded POST + hook invalidating the board → Task 2. ✓
- Lesson card header + inert drag handle → Task 3 (`LessonCard`). ✓
- Add-lesson sub-header per module → Task 3 (`ModuleColumn` + `AddLessonButton`). ✓
- Per-module dialog via a board-level container + jotai atom → Task 4. ✓
- Returns `boardLessonSchema` shape → Task 1 + Task 2 (hook parse). ✓

**Placeholder scan:** No TBD/TODO; every code step complete. ✓

**Type consistency:** `CreateLessonInput` (Task 1) ⇄ hook/form/container (Tasks 2/4). `createLesson` signature ⇄ API caller. `useCreateLesson(courseId)` mutate `{ moduleId, name }` ⇄ container call. `createLessonModuleIdAtom` (Task 4) set by `SortableModuleColumn`, read by the dialog. `ModuleColumn.onAddLesson` (Task 3) fed by `SortableModuleColumn` (Task 4). `dataKeys.courseBoard(courseId)` reused. ✓

**Ordering keeps build green:** Tasks 1–3 additive (schema/db, API/hook, presentational components with optional `onAddLesson`); Task 4 adds the atom + dialog and wires `onAddLesson` + renders the dialog. ✓
