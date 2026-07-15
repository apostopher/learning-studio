# Add-module to the course editor (step 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Add module" flow to `/admin/$courseId/editor` — a sub-header button that opens a dialog creating a module (name only; server fills subscriptions/rank), refetching the board.

**Architecture:** Mirrors the create-course flow: guarded `POST /api/admin/courses/$courseId/modules` → `useCreateModule` hook (invalidates the board) → Base UI Dialog (jotai open atom) with RHF + sonner. `course-board` gains a `toolbar` slot rendered as a sub-header.

**Tech Stack:** TanStack Start/Router, TanStack Query, Drizzle/Postgres, Base UI Dialog, react-hook-form + zod, sonner, jotai.

## Global Constraints

- Admin endpoints are API route handlers under `src/routes/api/admin/`, each opening with `await requireAdmin(request.headers)` → 403 on `ForbiddenError`. Client fetching only via TanStack Query hooks in `src/data-hooks/`, zod-parsing responses.
- Presentational/container split; token colors only (`gray-*`,`apple-*`,`red-*`); logical inline-axis CSS; Base UI components; kebab-case files.
- Commands: pnpm. Typecheck `pnpm exec tsc --noEmit` (3 pre-existing unrelated `ai-test` errors expected — ignore). Build `pnpm build` (regenerates `src/routeTree.gen.ts`). Format `pnpm exec biome check --write <paths>`. The user's uncommitted `package.json` dev-script line, `src/db/schema.ts`, `CLAUDE.md` must never be staged — explicit `git add <paths>` only. `$` in filenames needs shell-escaping (`\$`).

---

## File Structure

- `src/lib/admin-schemas.ts` — **modify.** `createModuleInputSchema`.
- `src/db/admin.ts` — **modify.** `createModule`.
- `src/routes/api/admin/courses.$courseId.modules.ts` — **new.** Guarded POST.
- `src/data-hooks/use-create-module.ts` — **new.** Create-module mutation.
- `src/atoms/admin.ts` — **modify.** `createModuleDialogOpenAtom`.
- `src/components/admin/add-module-button.tsx`, `create-module-form.tsx`, `create-module-dialog-container.tsx` — **new.**
- `src/components/admin/course-board.tsx`, `course-board-container.tsx` — **modify.** Toolbar slot.
- `src/routeTree.gen.ts` — regenerated.

---

### Task 1: `createModuleInputSchema` + `createModule` DB fn (additive)

**Files:** Modify `src/lib/admin-schemas.ts`, `src/db/admin.ts`.

**Interfaces:** Produces `createModuleInputSchema`/`CreateModuleInput`; `createModule(input: { courseId: number; name: string }): Promise<BoardModule>`.

- [ ] **Step 1: Add to `src/lib/admin-schemas.ts`**

```ts
export const createModuleInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
});
export type CreateModuleInput = z.infer<typeof createModuleInputSchema>;
```

- [ ] **Step 2: Add `createModule` to `src/db/admin.ts`**

(`slugify`, `or`, `like`, `sql`, `eq`, `modulesTable`, and the `BoardModule` type are already imported/available in this file.)

```ts
export async function createModule(input: {
  courseId: number;
  name: string;
}): Promise<BoardModule> {
  const base = slugify(input.name) || "module";
  const taken = await db
    .select({ slug: modulesTable.slug })
    .from(modulesTable)
    .where(or(eq(modulesTable.slug, base), like(modulesTable.slug, `${base}-%`)));
  const takenSet = new Set(taken.map((r) => r.slug));
  let slug = base;
  for (let n = 2; takenSet.has(slug); n++) slug = `${base}-${n}`;

  const [{ maxRank }] = await db
    .select({ maxRank: sql<string | null>`max(${modulesTable.rank})` })
    .from(modulesTable)
    .where(eq(modulesTable.courseId, input.courseId));
  const rank = maxRank === null ? 1 : Number(maxRank) + 1;

  const [created] = await db
    .insert(modulesTable)
    .values({
      courseId: input.courseId,
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
    lessons: [],
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors. (Confirm `requiredSubscriptions: []` and `rank: String(rank)` satisfy the insert types.)

- [ ] **Step 4: Format and commit**

```bash
pnpm exec biome check --write src/lib/admin-schemas.ts src/db/admin.ts
git add src/lib/admin-schemas.ts src/db/admin.ts
git commit -m "feat(kanban): createModuleInputSchema + createModule db fn"
```

---

### Task 2: Module create API route + hook (additive)

**Files:** Create `src/routes/api/admin/courses.$courseId.modules.ts`, `src/data-hooks/use-create-module.ts`.

**Interfaces:** Consumes `requireAdmin`/`ForbiddenError`, `createModule`, `createModuleInputSchema`, `boardModuleSchema`, `dataKeys`. Produces `POST /api/admin/courses/$courseId/modules`; `useCreateModule(courseId)`.

- [ ] **Step 1: `src/routes/api/admin/courses.$courseId.modules.ts`**

```ts
import { createFileRoute } from "@tanstack/react-router";
import { createModule } from "@/db/admin";
import { createModuleInputSchema } from "@/lib/admin-schemas";
import { ForbiddenError, requireAdmin } from "@/lib/admin-functions.server";

export const Route = createFileRoute("/api/admin/courses/$courseId/modules")({
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
        const courseId = Number(params.courseId);
        if (!Number.isInteger(courseId) || courseId <= 0) {
          return Response.json({ error: "Invalid course id" }, { status: 400 });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const parsed = createModuleInputSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }
        return Response.json(
          await createModule({ courseId, name: parsed.data.name }),
        );
      },
    },
  },
});
```

- [ ] **Step 2: `src/data-hooks/use-create-module.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  boardModuleSchema,
  type CreateModuleInput,
} from "@/lib/admin-schemas";
import { dataKeys } from "./keys";

/** Create a module in a course, then refetch that course's board. */
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.courseBoard(courseId) });
    },
  });
}
```

- [ ] **Step 3: Build + typecheck**

Run: `pnpm build` then `pnpm exec tsc --noEmit`
Expected: build regenerates `routeTree.gen.ts` with `/api/admin/courses/$courseId/modules`; no new type errors.

- [ ] **Step 4: Format and commit**

```bash
pnpm exec biome check --write "src/routes/api/admin/courses.\$courseId.modules.ts" src/data-hooks/use-create-module.ts
git add "src/routes/api/admin/courses.\$courseId.modules.ts" src/data-hooks/use-create-module.ts src/routeTree.gen.ts
git commit -m "feat(kanban): guarded module-create API route + useCreateModule hook"
```

---

### Task 3: Add-module dialog UI (additive — not rendered yet)

**Files:** Modify `src/atoms/admin.ts`; create `add-module-button.tsx`, `create-module-form.tsx`, `create-module-dialog-container.tsx` under `src/components/admin/`.

**Interfaces:** Produces `createModuleDialogOpenAtom`, `AddModuleButton`, `CreateModuleForm`, `CreateModuleDialogContainer` (`{ courseId: number }`).

- [ ] **Step 1: Add the atom to `src/atoms/admin.ts`**

```ts
/** Whether the create-module dialog is open. */
export const createModuleDialogOpenAtom = atom(false);
```

- [ ] **Step 2: `src/components/admin/add-module-button.tsx`**

```tsx
import { Button } from "@base-ui/react/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";

/** Styled "Add module" button. Used as a Base UI Dialog trigger via `render`. */
export const AddModuleButton = (props: React.ComponentProps<typeof Button>) => {
  return (
    <Button
      {...props}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg bg-apple-9 px-3.5 py-2 text-sm font-medium text-apple-contrast transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2",
        props.className,
      )}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Add module
    </Button>
  );
};
```

- [ ] **Step 3: `src/components/admin/create-module-form.tsx`**

```tsx
import { Loader2 } from "lucide-react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { cn } from "@/lib/cn";

interface CreateModuleFormProps {
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  registerName: UseFormRegisterReturn<"name">;
  nameError?: string;
  serverError?: string;
  isPending: boolean;
  onCancel: () => void;
}

export const CreateModuleForm = ({
  onSubmit,
  registerName,
  nameError,
  serverError,
  isPending,
  onCancel,
}: CreateModuleFormProps) => {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="module-name" className="text-sm font-medium text-gray-12">
          Name
        </label>
        <input
          {...registerName}
          id="module-name"
          type="text"
          autoFocus
          aria-invalid={!!nameError}
          aria-describedby={nameError ? "module-name-error" : undefined}
          className={cn(
            "min-w-0 w-full rounded-lg border bg-gray-1 px-3.5 py-2.5 text-sm text-gray-12 outline-none transition-colors duration-100 placeholder:text-gray-8",
            "focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:border-apple-9",
            nameError
              ? "border-red-9 focus-visible:ring-red-9 focus-visible:border-red-9"
              : "border-gray-6 hover:border-gray-8",
          )}
        />
        {nameError && (
          <p id="module-name-error" role="alert" aria-live="polite" className="text-sm text-red-11">
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
          Create module
        </button>
      </div>
    </form>
  );
};
```

- [ ] **Step 4: `src/components/admin/create-module-dialog-container.tsx`**

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog } from "@base-ui/react/dialog";
import { useAtom } from "jotai";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createModuleDialogOpenAtom } from "@/atoms/admin";
import { useCreateModule } from "@/data-hooks/use-create-module";
import {
  createModuleInputSchema,
  type CreateModuleInput,
} from "@/lib/admin-schemas";
import { AddModuleButton } from "./add-module-button";
import { CreateModuleForm } from "./create-module-form";

export const CreateModuleDialogContainer = ({
  courseId,
}: {
  courseId: number;
}) => {
  const [open, setOpen] = useAtom(createModuleDialogOpenAtom);
  const createModule = useCreateModule(courseId);
  const form = useForm<CreateModuleInput>({
    resolver: zodResolver(createModuleInputSchema),
    mode: "onSubmit",
  });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      form.reset();
      createModule.reset();
    }
  };

  const handleSubmit = form.handleSubmit((values) => {
    createModule.mutate(values, {
      onSuccess: () => {
        toast.success("Module created");
        onOpenChange(false);
      },
    });
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger render={<AddModuleButton />} />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-gray-12">
            Create module
          </Dialog.Title>
          <Dialog.Description className="mt-1 mb-5 text-sm text-gray-11">
            Add a module to this course. You can add lessons to it next.
          </Dialog.Description>
          <CreateModuleForm
            onSubmit={handleSubmit}
            registerName={form.register("name")}
            nameError={form.formState.errors.name?.message}
            serverError={
              createModule.isError ? "Could not create module. Please try again." : undefined
            }
            isPending={createModule.isPending}
            onCancel={() => onOpenChange(false)}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
```

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Format and commit**

```bash
pnpm exec biome check --write src/atoms/admin.ts src/components/admin/add-module-button.tsx src/components/admin/create-module-form.tsx src/components/admin/create-module-dialog-container.tsx
git add src/atoms/admin.ts src/components/admin/add-module-button.tsx src/components/admin/create-module-form.tsx src/components/admin/create-module-dialog-container.tsx
git commit -m "feat(kanban): add-module dialog (atom, button, form, container)"
```

---

### Task 4: Sub-header toolbar in the editor (wire-up)

**Files:** Modify `src/components/admin/course-board.tsx`, `src/components/admin/course-board-container.tsx`.

**Interfaces:** Consumes `CreateModuleDialogContainer`. Produces the editor sub-header rendering the Add-module dialog.

- [ ] **Step 1: Add a `toolbar` slot + sub-header to `src/components/admin/course-board.tsx`**

Add `toolbar?: React.ReactNode` to the props, and render a sub-header between the title header and the board body. The updated component (keep everything else the same):

```tsx
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { CourseBoard as CourseBoardData } from "@/lib/admin-schemas";
import { ModuleColumn } from "./module-column";

export const CourseBoard = ({
  board,
  toolbar,
}: {
  board: CourseBoardData;
  toolbar?: React.ReactNode;
}) => {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-gray-6 px-4 py-3">
        <Link
          to="/admin"
          className="shrink-0 text-gray-11 transition-colors hover:text-gray-12"
          aria-label="Back to courses"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <h1 className="min-w-0 truncate text-base font-semibold text-gray-12">
          {board.course.name}
        </h1>
      </header>

      {toolbar && (
        <div className="flex items-center justify-end border-b border-gray-6 px-4 py-2">
          {toolbar}
        </div>
      )}

      {board.modules.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-11">No modules yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="flex w-max items-start gap-4 p-4">
            {board.modules.map((mod) => (
              <ModuleColumn key={mod.id} module={mod} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Pass the toolbar from `src/components/admin/course-board-container.tsx`**

Update the successful-render branch to pass the dialog container as the toolbar:

```tsx
import { CreateModuleDialogContainer } from "./create-module-dialog-container";
// ...
  return (
    <CourseBoard
      board={board}
      toolbar={<CreateModuleDialogContainer courseId={courseId} />}
    />
  );
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm exec tsc --noEmit` then `pnpm build`
Expected: both pass.

- [ ] **Step 4: Manual note**

Controller/user verifies (admin session, a seeded course): editor shows the sub-header with an end-aligned "Add module" button; click → dialog; blank name → error; create → toast + a new empty column appears (board refetches).

- [ ] **Step 5: Format and commit**

```bash
pnpm exec biome check --write src/components/admin/course-board.tsx src/components/admin/course-board-container.tsx
git add src/components/admin/course-board.tsx src/components/admin/course-board-container.tsx
git commit -m "feat(kanban): editor sub-header with Add module dialog"
```

---

## Self-Review

**Spec coverage:**
- Name-only module create; server sets subscriptions=[] + rank=max+1 → Task 1 (`createModule`). ✓
- Guarded POST + hook that invalidates the board → Task 2. ✓
- Add-module dialog mirroring create-course (atom, button, form, container, toast) → Task 3. ✓
- Sub-header toolbar (end-aligned) between title header and board → Task 4. ✓
- Returns `boardModuleSchema` shape (lessons: []) → Task 1 + Task 2 (hook parse). ✓

**Placeholder scan:** No TBD/TODO; every code step complete. ✓

**Type consistency:** `CreateModuleInput` (Task 1) used by the hook (Task 2) + form/container (Task 3). `createModule` signature matches its API caller. `useCreateModule(courseId)` matches the container prop. `createModuleDialogOpenAtom` (Task 3) consumed in the container. `dataKeys.courseBoard(courseId)` reused for invalidation. `toolbar` prop (Task 4) fed by the container. ✓

**Ordering keeps build green:** Tasks 1–3 additive; Task 4 wires the toolbar. ✓
