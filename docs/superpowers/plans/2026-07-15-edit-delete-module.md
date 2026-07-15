# Wire Edit + Delete module (step 3e) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the toolbar's Edit and Delete module buttons functional — Edit opens a rename dialog (PATCH), Delete opens a typed-confirmation dialog (DELETE, cascades lessons).

**Architecture:** Extend `PATCH /api/admin/modules/$moduleId` to rename (or reorder) and add a `DELETE` handler. Two board-level dialogs, opened via `editModuleAtom`/`deleteModuleAtom`, mirror the existing create dialogs. Delete requires typing "permanently delete".

**Tech Stack:** TanStack Start/Router, TanStack Query, Drizzle/Postgres, Base UI Dialog, react-hook-form + zod, sonner, jotai.

## Global Constraints

- Admin endpoints self-guard with `requireAdmin(request.headers)` → 403. Client fetching via TanStack Query hooks in `src/data-hooks/`. Presentational/container split; token colors (`gray-*`,`apple-*`,`red-*`); logical CSS; Base UI; kebab-case files; jotai for dialog state.
- Commands: pnpm. Typecheck `pnpm exec tsc --noEmit` (3 pre-existing unrelated `ai-test` errors expected — ignore). Build `pnpm build` (regenerates `src/routeTree.gen.ts`). Format `pnpm exec biome check --write <paths>`. The user's uncommitted `package.json` dev-script line, `src/db/schema.ts`, `CLAUDE.md` must never be staged — explicit `git add <paths>`. `$` in filenames needs `\$` escaping.

---

## File Structure

- `src/lib/admin-schemas.ts` — **modify.** `renameModuleInputSchema`.
- `src/db/admin.ts` — **modify.** `updateModuleName`, `deleteModule`.
- `src/routes/api/admin/modules.$moduleId.ts` — **modify.** PATCH rename|reorder + DELETE + local guard helper.
- `src/data-hooks/use-update-module.ts`, `use-delete-module.ts` — **new.**
- `src/atoms/admin.ts` — **modify.** `editModuleAtom`, `deleteModuleAtom`.
- `src/components/admin/single-name-form.tsx` — **new.** Reusable single-name form.
- `src/components/admin/edit-module-dialog-container.tsx` — **new.**
- `src/components/admin/delete-module-confirm-form.tsx` — **new.**
- `src/components/admin/delete-module-dialog-container.tsx` — **new.**
- `src/components/admin/sortable-module-column.tsx` — **modify.** Wire onEdit/onDelete.
- `src/components/admin/module-board-container.tsx` — **modify.** Render both dialogs.
- `src/routeTree.gen.ts` — regenerated.

---

### Task 1: `renameModuleInputSchema` + `updateModuleName`/`deleteModule` DB fns (additive)

**Files:** Modify `src/lib/admin-schemas.ts`, `src/db/admin.ts`.

**Interfaces:** Produces `renameModuleInputSchema`/`RenameModuleInput`; `updateModuleName(moduleId, name): Promise<{id:number;name:string}|null>`; `deleteModule(moduleId): Promise<boolean>`.

- [ ] **Step 1: Add to `src/lib/admin-schemas.ts`**

```ts
export const renameModuleInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
});
export type RenameModuleInput = z.infer<typeof renameModuleInputSchema>;
```

- [ ] **Step 2: Add the DB fns to `src/db/admin.ts`**

(`sql`, `eq`, `modulesTable` are already imported.)

```ts
export async function updateModuleName(
  moduleId: number,
  name: string,
): Promise<{ id: number; name: string } | null> {
  const [updated] = await db
    .update(modulesTable)
    .set({ name, updatedAt: sql`now()` })
    .where(eq(modulesTable.id, moduleId))
    .returning({ id: modulesTable.id, name: modulesTable.name });
  return updated ?? null;
}

export async function deleteModule(moduleId: number): Promise<boolean> {
  const [deleted] = await db
    .delete(modulesTable)
    .where(eq(modulesTable.id, moduleId))
    .returning({ id: modulesTable.id });
  return Boolean(deleted);
}
```

(`lessons.module_id` FK is `onDelete: cascade`, so deleting a module removes its lessons automatically.)

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Format and commit**

```bash
pnpm exec biome check --write src/lib/admin-schemas.ts src/db/admin.ts
git add src/lib/admin-schemas.ts src/db/admin.ts
git commit -m "feat(kanban): rename schema + updateModuleName/deleteModule db fns"
```

---

### Task 2: Extend PATCH (rename|reorder) + DELETE; update/delete hooks

**Files:** Modify `src/routes/api/admin/modules.$moduleId.ts`; create `src/data-hooks/use-update-module.ts`, `src/data-hooks/use-delete-module.ts`.

**Interfaces:** `PATCH /api/admin/modules/$moduleId` accepts `{name}` (rename) or `{prevModuleId,nextModuleId}` (reorder); `DELETE` removes the module. Produces `useUpdateModule(courseId)`, `useDeleteModule(courseId)`.

- [ ] **Step 1: Rewrite `src/routes/api/admin/modules.$moduleId.ts`**

```ts
import { createFileRoute } from "@tanstack/react-router";
import { deleteModule, reorderModule, updateModuleName } from "@/db/admin";
import { ForbiddenError, requireAdmin } from "@/lib/admin-functions.server";
import {
  renameModuleInputSchema,
  reorderModuleInputSchema,
} from "@/lib/admin-schemas";

/** Admin guard — returns a 403 Response to short-circuit, or null to proceed. */
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

function parseModuleId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const Route = createFileRoute("/api/admin/modules/$moduleId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const denied = await guard(request);
        if (denied) return denied;
        const moduleId = parseModuleId(params.moduleId);
        if (moduleId === null) {
          return Response.json({ error: "Invalid module id" }, { status: 400 });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const rename = renameModuleInputSchema.safeParse(body);
        if (rename.success) {
          const updated = await updateModuleName(moduleId, rename.data.name);
          if (!updated) return new Response("Not found", { status: 404 });
          return Response.json(updated);
        }

        const reorder = reorderModuleInputSchema.safeParse(body);
        if (reorder.success) {
          const updated = await reorderModule({
            moduleId,
            prevModuleId: reorder.data.prevModuleId,
            nextModuleId: reorder.data.nextModuleId,
          });
          if (!updated) return new Response("Not found", { status: 404 });
          return Response.json(updated);
        }

        return Response.json({ error: "Invalid body" }, { status: 400 });
      },

      DELETE: async ({ request, params }) => {
        const denied = await guard(request);
        if (denied) return denied;
        const moduleId = parseModuleId(params.moduleId);
        if (moduleId === null) {
          return Response.json({ error: "Invalid module id" }, { status: 400 });
        }
        const deleted = await deleteModule(moduleId);
        if (!deleted) return new Response("Not found", { status: 404 });
        return new Response(null, { status: 204 });
      },
    },
  },
});
```

- [ ] **Step 2: `src/data-hooks/use-update-module.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dataKeys } from "./keys";

/** Rename a module, then refetch the course board. */
export function useUpdateModule(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { moduleId: number; name: string }) => {
      const res = await fetch(`/api/admin/modules/${input.moduleId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: input.name }),
      });
      if (!res.ok) throw new Error(`Failed to update module (${res.status})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.courseBoard(courseId) });
    },
  });
}
```

- [ ] **Step 3: `src/data-hooks/use-delete-module.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dataKeys } from "./keys";

/** Delete a module (and its lessons, via cascade), then refetch the course board. */
export function useDeleteModule(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (moduleId: number) => {
      const res = await fetch(`/api/admin/modules/${moduleId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Failed to delete module (${res.status})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.courseBoard(courseId) });
    },
  });
}
```

- [ ] **Step 4: Build + typecheck**

Run: `pnpm build` then `pnpm exec tsc --noEmit`
Expected: build succeeds (route tree unchanged shape — same path, added DELETE handler); no new type errors. Confirm the existing reorder hook still works (it sends `{prevModuleId,nextModuleId}`, matched by the second branch).

- [ ] **Step 5: Format and commit**

```bash
pnpm exec biome check --write "src/routes/api/admin/modules.\$moduleId.ts" src/data-hooks/use-update-module.ts src/data-hooks/use-delete-module.ts
git add "src/routes/api/admin/modules.\$moduleId.ts" src/data-hooks/use-update-module.ts src/data-hooks/use-delete-module.ts src/routeTree.gen.ts
git commit -m "feat(kanban): module rename (PATCH) + delete (DELETE) endpoints + hooks"
```

---

### Task 3: Reusable single-name form + delete-confirm form (additive)

**Files:** Create `src/components/admin/single-name-form.tsx`, `src/components/admin/delete-module-confirm-form.tsx`.

**Interfaces:** Produces `SingleNameForm` (with a `submitLabel`) and `DeleteModuleConfirmForm` (presentational).

- [ ] **Step 1: `src/components/admin/single-name-form.tsx`**

```tsx
import { Loader2 } from "lucide-react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { cn } from "@/lib/cn";

interface SingleNameFormProps {
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  registerName: UseFormRegisterReturn<"name">;
  nameError?: string;
  serverError?: string;
  isPending: boolean;
  onCancel: () => void;
  submitLabel: string;
}

export const SingleNameForm = ({
  onSubmit,
  registerName,
  nameError,
  serverError,
  isPending,
  onCancel,
  submitLabel,
}: SingleNameFormProps) => {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="single-name" className="text-sm font-medium text-gray-12">
          Name
        </label>
        <input
          {...registerName}
          id="single-name"
          type="text"
          autoFocus
          aria-invalid={!!nameError}
          aria-describedby={nameError ? "single-name-error" : undefined}
          className={cn(
            "min-w-0 w-full rounded-lg border bg-gray-1 px-3.5 py-2.5 text-sm text-gray-12 outline-none transition-colors duration-100 placeholder:text-gray-8",
            "focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:border-apple-9",
            nameError
              ? "border-red-9 focus-visible:ring-red-9 focus-visible:border-red-9"
              : "border-gray-6 hover:border-gray-8",
          )}
        />
        {nameError && (
          <p id="single-name-error" role="alert" aria-live="polite" className="text-sm text-red-11">
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
          {submitLabel}
        </button>
      </div>
    </form>
  );
};
```

- [ ] **Step 2: `src/components/admin/delete-module-confirm-form.tsx`**

```tsx
import { Loader2 } from "lucide-react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { cn } from "@/lib/cn";

const CONFIRM_PHRASE = "permanently delete";

interface DeleteModuleConfirmFormProps {
  moduleName: string;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  registerConfirm: UseFormRegisterReturn<"confirm">;
  canSubmit: boolean;
  isPending: boolean;
  serverError?: string;
  onCancel: () => void;
}

export const DeleteModuleConfirmForm = ({
  moduleName,
  onSubmit,
  registerConfirm,
  canSubmit,
  isPending,
  serverError,
  onCancel,
}: DeleteModuleConfirmFormProps) => {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-gray-11">
        Deleting{" "}
        <span className="font-medium text-gray-12">{moduleName}</span> will
        permanently delete the module and all of its lessons. This can't be
        undone.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="delete-confirm" className="text-sm font-medium text-gray-12">
          Type <span className="font-mono text-gray-11">{CONFIRM_PHRASE}</span> to confirm
        </label>
        <input
          {...registerConfirm}
          id="delete-confirm"
          type="text"
          autoFocus
          autoComplete="off"
          placeholder={CONFIRM_PHRASE}
          className={cn(
            "min-w-0 w-full rounded-lg border border-gray-6 bg-gray-1 px-3.5 py-2.5 text-sm text-gray-12 outline-none transition-colors placeholder:text-gray-8",
            "hover:border-gray-8 focus-visible:ring-2 focus-visible:ring-red-9 focus-visible:border-red-9",
          )}
        />
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
          disabled={!canSubmit || isPending}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-lg bg-red-9 px-4 py-2.5 text-sm font-medium text-red-1",
            "transition-colors hover:bg-red-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-9 focus-visible:ring-offset-2",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Delete module
        </button>
      </div>
    </form>
  );
};
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors. (Confirm the `red-1` token exists for the danger button text; if not, use `text-white` — check `src/styles/theme.generated.css` for `red-1` / an on-red contrast token and use whichever the red scale provides.)

- [ ] **Step 4: Format and commit**

```bash
pnpm exec biome check --write src/components/admin/single-name-form.tsx src/components/admin/delete-module-confirm-form.tsx
git add src/components/admin/single-name-form.tsx src/components/admin/delete-module-confirm-form.tsx
git commit -m "feat(kanban): reusable single-name form + delete-module confirm form"
```

---

### Task 4: Atoms + dialogs + wire-up

**Files:** Modify `src/atoms/admin.ts`, `src/components/admin/sortable-module-column.tsx`, `src/components/admin/module-board-container.tsx`; create `src/components/admin/edit-module-dialog-container.tsx`, `src/components/admin/delete-module-dialog-container.tsx`.

**Interfaces:** Produces `editModuleAtom`/`deleteModuleAtom`, `EditModuleDialogContainer`/`DeleteModuleDialogContainer` (`{ courseId }`); the toolbar Edit/Delete buttons open them.

- [ ] **Step 1: Add atoms to `src/atoms/admin.ts`**

```ts
/** The module being edited (id + current name), or null when closed. */
export const editModuleAtom = atom<{ id: number; name: string } | null>(null);
/** The module pending deletion (id + name), or null when closed. */
export const deleteModuleAtom = atom<{ id: number; name: string } | null>(null);
```

- [ ] **Step 2: `src/components/admin/edit-module-dialog-container.tsx`**

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog } from "@base-ui/react/dialog";
import { useAtom } from "jotai";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { editModuleAtom } from "@/atoms/admin";
import { useUpdateModule } from "@/data-hooks/use-update-module";
import {
  renameModuleInputSchema,
  type RenameModuleInput,
} from "@/lib/admin-schemas";
import { SingleNameForm } from "./single-name-form";

export const EditModuleDialogContainer = ({
  courseId,
}: {
  courseId: number;
}) => {
  const [target, setTarget] = useAtom(editModuleAtom);
  const updateModule = useUpdateModule(courseId);
  const form = useForm<RenameModuleInput>({
    resolver: zodResolver(renameModuleInputSchema),
    values: { name: target?.name ?? "" },
    mode: "onSubmit",
  });

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setTarget(null);
      updateModule.reset();
    }
  };

  const handleSubmit = form.handleSubmit((data) => {
    if (!target) return;
    updateModule.mutate(
      { moduleId: target.id, name: data.name },
      {
        onSuccess: () => {
          toast.success("Module updated");
          onOpenChange(false);
        },
      },
    );
  });

  return (
    <Dialog.Root open={target !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-gray-12">
            Edit module
          </Dialog.Title>
          <Dialog.Description className="mt-1 mb-5 text-sm text-gray-11">
            Rename this module.
          </Dialog.Description>
          <SingleNameForm
            onSubmit={handleSubmit}
            registerName={form.register("name")}
            nameError={form.formState.errors.name?.message}
            serverError={
              updateModule.isError ? "Could not save. Please try again." : undefined
            }
            isPending={updateModule.isPending}
            onCancel={() => onOpenChange(false)}
            submitLabel="Save changes"
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
```

- [ ] **Step 3: `src/components/admin/delete-module-dialog-container.tsx`**

```tsx
import { Dialog } from "@base-ui/react/dialog";
import { useAtom } from "jotai";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { deleteModuleAtom } from "@/atoms/admin";
import { useDeleteModule } from "@/data-hooks/use-delete-module";
import { DeleteModuleConfirmForm } from "./delete-module-confirm-form";

export const DeleteModuleDialogContainer = ({
  courseId,
}: {
  courseId: number;
}) => {
  const [target, setTarget] = useAtom(deleteModuleAtom);
  const deleteModule = useDeleteModule(courseId);
  const form = useForm<{ confirm: string }>({
    values: { confirm: "" },
    mode: "onChange",
  });
  const confirmValue = form.watch("confirm");
  const canSubmit =
    confirmValue.trim().toLowerCase() === "permanently delete";

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setTarget(null);
      deleteModule.reset();
    }
  };

  const handleSubmit = form.handleSubmit(() => {
    if (!target || !canSubmit) return;
    deleteModule.mutate(target.id, {
      onSuccess: () => {
        toast.success("Module deleted");
        onOpenChange(false);
      },
    });
  });

  return (
    <Dialog.Root open={target !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-gray-12">
            Delete module
          </Dialog.Title>
          <div className="mt-4">
            <DeleteModuleConfirmForm
              moduleName={target?.name ?? ""}
              onSubmit={handleSubmit}
              registerConfirm={form.register("confirm")}
              canSubmit={canSubmit}
              isPending={deleteModule.isPending}
              serverError={
                deleteModule.isError
                  ? "Could not delete. Please try again."
                  : undefined
              }
              onCancel={() => onOpenChange(false)}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
```

- [ ] **Step 4: Wire onEdit/onDelete in `src/components/admin/sortable-module-column.tsx`**

Add `editModuleAtom`, `deleteModuleAtom` imports and setters, and pass the handlers to `ModuleColumn`:

```tsx
  const setEditModule = useSetAtom(editModuleAtom);
  const setDeleteModule = useSetAtom(deleteModuleAtom);
```

```tsx
      <ModuleColumn
        module={mod}
        dragHandleProps={{ ...attributes, ...listeners }}
        onAddLesson={() => setLessonModuleId(mod.id)}
        onEditModule={() => setEditModule({ id: mod.id, name: mod.name })}
        onDeleteModule={() => setDeleteModule({ id: mod.id, name: mod.name })}
      />
```

(Import `editModuleAtom`/`deleteModuleAtom` from `@/atoms/admin`; `useSetAtom` is already imported for the lesson atom.)

- [ ] **Step 5: Render both dialogs in `src/components/admin/module-board-container.tsx`**

Add imports and render once, next to `<CreateLessonDialogContainer courseId={courseId} />`:

```tsx
      <EditModuleDialogContainer courseId={courseId} />
      <DeleteModuleDialogContainer courseId={courseId} />
```

- [ ] **Step 6: Build + typecheck**

Run: `pnpm build` then `pnpm exec tsc --noEmit`
Expected: both pass.

- [ ] **Step 7: Manual note**

Controller/user verifies (admin): Edit icon → dialog prefilled with the name → change → Save → toast + column title updates. Delete icon → confirmation showing the module name; the red Delete button is disabled until "permanently delete" is typed → confirm → toast + column (and its lessons) disappear.

- [ ] **Step 8: Format and commit**

```bash
pnpm exec biome check --write src/atoms/admin.ts src/components/admin/edit-module-dialog-container.tsx src/components/admin/delete-module-dialog-container.tsx src/components/admin/sortable-module-column.tsx src/components/admin/module-board-container.tsx
git add src/atoms/admin.ts src/components/admin/edit-module-dialog-container.tsx src/components/admin/delete-module-dialog-container.tsx src/components/admin/sortable-module-column.tsx src/components/admin/module-board-container.tsx
git commit -m "feat(kanban): wire Edit + Delete module dialogs to the toolbar"
```

---

## Self-Review

**Spec coverage:**
- Edit = rename (name only, keeps slug) → Task 1 (`updateModuleName`) + PATCH branch (Task 2) + edit dialog (Task 4). ✓
- Delete cascades lessons → Task 1 (`deleteModule` + FK cascade) + DELETE (Task 2) + delete dialog (Task 4). ✓
- Delete requires typing "permanently delete" (button disabled otherwise) → Task 3 (`DeleteModuleConfirmForm` + `canSubmit`) + Task 4 (`watch` gating). ✓
- Polished warning copy (module name + cascade + irreversible) → Task 3. ✓
- Edit like the create modal (prefilled) → Task 4 (`values: { name }`). ✓
- Guarded endpoints → Task 2 (shared local `guard`). ✓

**Placeholder scan:** No TBD/TODO; every code step complete. ✓

**Type consistency:** `RenameModuleInput` (Task 1) ⇄ PATCH branch + edit form. `updateModuleName`/`deleteModule` signatures ⇄ API callers. `useUpdateModule`/`useDeleteModule(courseId)` ⇄ dialog mutate calls. `editModuleAtom`/`deleteModuleAtom` (Task 4) set by `SortableModuleColumn`, read by dialogs. `ModuleColumn.onEditModule/onDeleteModule` (already added in the toolbar step) fed by `SortableModuleColumn`. `dataKeys.courseBoard(courseId)` reused. ✓

**Ordering keeps build green:** Tasks 1–3 additive; Task 4 adds atoms/dialogs and wires handlers + renders dialogs. ✓
