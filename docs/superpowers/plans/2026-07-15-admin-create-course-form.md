# Add-course dialog + toast (Course Designer step 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the inert "Add course" button to a Base UI modal with a react-hook-form create form that calls `useCreateCourse`, with sonner toasts on success/error.

**Architecture:** A controlled Base UI `Dialog` (open state in a jotai atom) triggered by the Add-course button; a presentational form + a container holding RHF + the mutation; a root `<Toaster />` for feedback.

**Tech Stack:** React 19, Base UI Dialog 1.4, react-hook-form + zod, jotai, sonner, TanStack Query, Tailwind with Radix token scales.

## Global Constraints

- **Presentational vs container** (per CLAUDE.md): presentational components are pure, build on Base UI, no state/effects/hooks/data; containers hold the jotai atom + RHF + the mutation and pass props down.
- **Colors:** token classes only — `apple-*` accent, `gray-*`, `red-*`; no hex/Tailwind-palette. WCAG-sane pairings. Match `src/components/auth/email-step-form.tsx` input idiom.
- **Logical CSS:** inline-axis `ms/me`,`ps/pe`,`start/end`; block-axis `py/pt/pb` ok; center the modal with `inset-0 m-auto` (not `left/top` + translate). Never `.container`.
- **State:** jotai for the dialog open state (no `useState`). react-hook-form for the form. `useCreateCourse` (built in 2a) for the mutation.
- kebab-case files, PascalCase exports. Base UI imports from lowercase subpaths (e.g. `@base-ui/react/dialog`).
- Commands: pnpm. Typecheck `pnpm exec tsc --noEmit` (3 pre-existing unrelated `ai-test` errors expected — ignore). Build `pnpm build`. Format `pnpm exec biome check --write <paths>`. The user's uncommitted `package.json` dev-script line, `src/db/schema.ts`, and `CLAUDE.md` must never be staged — explicit `git add <paths>` only.

---

## File Structure

- `src/atoms/admin.ts` — **new.** `createCourseDialogOpenAtom`.
- `src/components/admin/create-course-form.tsx` — **new.** Presentational form.
- `src/components/admin/create-course-dialog-container.tsx` — **new.** Container: atom + RHF + mutation + Dialog.
- `src/routes/__root.tsx` — **modify.** Mount `<Toaster />`.
- `src/components/admin/add-course-button.tsx` — **modify.** Forward props (used as Dialog trigger).
- `src/components/admin/admin-courses-page-container.tsx` — **modify.** Render the dialog container.
- `package.json` — **modify.** Add `sonner`.

---

### Task 1: sonner + root Toaster

**Files:**
- Modify: `package.json`, `src/routes/__root.tsx`

**Interfaces:**
- Produces: a globally-mounted `<Toaster />`; `toast` from `sonner` usable app-wide.

- [ ] **Step 1: Install sonner**

```bash
pnpm add sonner@^2.0.6
```
Expected: adds `sonner` (2.0.x). If the release-age policy blocks the latest, it resolves to the newest allowed 2.0.x — fine.

- [ ] **Step 2: Mount `<Toaster />` in `src/routes/__root.tsx`**

Add the import:
```tsx
import { Toaster } from "sonner";
```
In `RootDocument`, inside `<body>`, within the `TanstackQueryProvider` and just before `<Scripts />`, add:
```tsx
<Toaster position="bottom-right" theme="system" richColors closeButton />
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm exec tsc --noEmit` then `pnpm build`
Expected: both pass; `sonner` resolves.

- [ ] **Step 4: Commit (dependency + root only — keep the user's dev-script line out)**

`package.json` also carries the user's uncommitted `dev` script change (`.env` vs `.env.local`). Stage only the `sonner` line: after `git add`, run `git diff --cached package.json` and confirm ONLY the `sonner` dependency line is staged; if the `dev` line appears, temporarily set it back to `.env.local`, commit, then restore it to `.env` (mirroring the earlier dep commits).

```bash
pnpm exec biome check --write src/routes/__root.tsx
git add package.json pnpm-lock.yaml src/routes/__root.tsx
git commit -m "feat(admin): add sonner and mount root Toaster"
```

---

### Task 2: Open-state atom, presentational form, prop-forwarding button

All additive/leaf — nothing renders the new form yet; the button still works standalone.

**Files:**
- Create: `src/atoms/admin.ts`, `src/components/admin/create-course-form.tsx`
- Modify: `src/components/admin/add-course-button.tsx`

**Interfaces:**
- Consumes: `CreateCourseInput` field names (`name`, `description`, `imageUrl`) via `UseFormRegisterReturn`.
- Produces: `createCourseDialogOpenAtom`; `CreateCourseForm` (props below); `AddCourseButton` now forwards props.

- [ ] **Step 1: `src/atoms/admin.ts`**

```ts
import { atom } from "jotai";

/** Whether the create-course dialog is open. */
export const createCourseDialogOpenAtom = atom(false);
```

- [ ] **Step 2: `src/components/admin/create-course-form.tsx`**

```tsx
import { Loader2 } from "lucide-react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { cn } from "@/lib/cn";

interface CreateCourseFormProps {
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  registerName: UseFormRegisterReturn<"name">;
  registerDescription: UseFormRegisterReturn<"description">;
  registerImageUrl: UseFormRegisterReturn<"imageUrl">;
  errors: { name?: string; description?: string; imageUrl?: string };
  serverError?: string;
  isPending: boolean;
  onCancel: () => void;
}

const inputBase = cn(
  "w-full rounded-lg border bg-gray-1 px-3.5 py-2.5 text-sm text-gray-12 outline-none",
  "transition-colors duration-100",
  "focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:border-apple-9",
);

export const CreateCourseForm = ({
  onSubmit,
  registerName,
  registerDescription,
  registerImageUrl,
  errors,
  serverError,
  isPending,
  onCancel,
}: CreateCourseFormProps) => {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="course-name" className="text-sm font-medium text-gray-12">
          Name
        </label>
        <input
          {...registerName}
          id="course-name"
          type="text"
          autoFocus
          aria-invalid={!!errors.name}
          className={cn(
            inputBase,
            errors.name
              ? "border-red-9 focus-visible:ring-red-9 focus-visible:border-red-9"
              : "border-gray-6 hover:border-gray-8",
          )}
        />
        {errors.name && <p className="text-sm text-red-11">{errors.name}</p>}
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="course-description" className="text-sm font-medium text-gray-12">
          Description <span className="text-gray-10">(optional)</span>
        </label>
        <textarea
          {...registerDescription}
          id="course-description"
          rows={3}
          aria-invalid={!!errors.description}
          className={cn(
            inputBase,
            "resize-y",
            errors.description
              ? "border-red-9 focus-visible:ring-red-9 focus-visible:border-red-9"
              : "border-gray-6 hover:border-gray-8",
          )}
        />
        {errors.description && (
          <p className="text-sm text-red-11">{errors.description}</p>
        )}
      </div>

      {/* Image URL */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="course-image-url" className="text-sm font-medium text-gray-12">
          Image URL <span className="text-gray-10">(optional)</span>
        </label>
        <input
          {...registerImageUrl}
          id="course-image-url"
          type="url"
          placeholder="https://…"
          aria-invalid={!!errors.imageUrl}
          className={cn(
            inputBase,
            errors.imageUrl
              ? "border-red-9 focus-visible:ring-red-9 focus-visible:border-red-9"
              : "border-gray-6 hover:border-gray-8",
          )}
        />
        {errors.imageUrl && (
          <p className="text-sm text-red-11">{errors.imageUrl}</p>
        )}
      </div>

      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-red-9/40 bg-red-9/15 px-3 py-2.5 text-sm text-red-11"
        >
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
          Create course
        </button>
      </div>
    </form>
  );
};
```

- [ ] **Step 3: Make `AddCourseButton` forward props — `src/components/admin/add-course-button.tsx`**

```tsx
import { Button } from "@base-ui/react/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";

/** Styled "Add course" button. Used directly, or as a Base UI Dialog trigger via `render`. */
export const AddCourseButton = (props: React.ComponentProps<typeof Button>) => {
  return (
    <Button
      {...props}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 text-sm font-medium text-apple-contrast transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2",
        props.className,
      )}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Add course
    </Button>
  );
};
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors. (`admin-courses-page-container.tsx` still renders `<AddCourseButton />` with no props — still valid since all props are optional.)

- [ ] **Step 5: Format and commit**

```bash
pnpm exec biome check --write src/atoms/admin.ts src/components/admin/create-course-form.tsx src/components/admin/add-course-button.tsx
git add src/atoms/admin.ts src/components/admin/create-course-form.tsx src/components/admin/add-course-button.tsx
git commit -m "feat(admin): create-course form, dialog atom, prop-forwarding add button"
```

---

### Task 3: Dialog container + wire into the page

**Files:**
- Create: `src/components/admin/create-course-dialog-container.tsx`
- Modify: `src/components/admin/admin-courses-page-container.tsx`

**Interfaces:**
- Consumes: `createCourseDialogOpenAtom`, `CreateCourseForm`, `AddCourseButton`, `useCreateCourse`, `createCourseInputSchema`/`CreateCourseInput`, Base UI `Dialog`, `toast`.
- Produces: `CreateCourseDialogContainer` rendered in the admin page header.

- [ ] **Step 1: `src/components/admin/create-course-dialog-container.tsx`**

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog } from "@base-ui/react/dialog";
import { useAtom } from "jotai";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createCourseDialogOpenAtom } from "@/atoms/admin";
import { useCreateCourse } from "@/data-hooks/use-create-course";
import {
  createCourseInputSchema,
  type CreateCourseInput,
} from "@/lib/admin-schemas";
import { AddCourseButton } from "./add-course-button";
import { CreateCourseForm } from "./create-course-form";

export const CreateCourseDialogContainer = () => {
  const [open, setOpen] = useAtom(createCourseDialogOpenAtom);
  const createCourse = useCreateCourse();
  const form = useForm<CreateCourseInput>({
    resolver: zodResolver(createCourseInputSchema),
    mode: "onSubmit",
  });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      form.reset();
      createCourse.reset();
    }
  };

  const handleSubmit = form.handleSubmit((values) => {
    createCourse.mutate(values, {
      onSuccess: () => {
        toast.success("Course created");
        onOpenChange(false);
      },
      onError: () => {
        toast.error("Could not create course. Please try again.");
      },
    });
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger render={<AddCourseButton />} />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-gray-12">
            Create course
          </Dialog.Title>
          <Dialog.Description className="mt-1 mb-5 text-sm text-gray-11">
            Add a new course. You can add modules and lessons next.
          </Dialog.Description>
          <CreateCourseForm
            onSubmit={handleSubmit}
            registerName={form.register("name")}
            registerDescription={form.register("description")}
            registerImageUrl={form.register("imageUrl")}
            errors={{
              name: form.formState.errors.name?.message,
              description: form.formState.errors.description?.message,
              imageUrl: form.formState.errors.imageUrl?.message,
            }}
            serverError={
              createCourse.isError ? "Something went wrong." : undefined
            }
            isPending={createCourse.isPending}
            onCancel={() => onOpenChange(false)}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
```

- [ ] **Step 2: Wire into `src/components/admin/admin-courses-page-container.tsx`**

Replace the `AddCourseButton` import with the dialog container, and swap the element in the header:
```tsx
// import
import { CreateCourseDialogContainer } from "./create-course-dialog-container";
// in the header (replaces <AddCourseButton />)
<CreateCourseDialogContainer />
```
Remove the now-unused `import { AddCourseButton } from "./add-course-button";` from this file (it's still used by the dialog container).

- [ ] **Step 3: Typecheck + build**

Run: `pnpm exec tsc --noEmit` then `pnpm build`
Expected: both pass. Confirm `Dialog.Trigger render={<AddCourseButton />}` typechecks (AddCourseButton accepts `ComponentProps<typeof Button>`).

- [ ] **Step 4: Manual verification note**

The controller/user verifies in a browser (needs an admin session): Add course → dialog opens; empty name → validation error; invalid URL → error; Cancel/backdrop closes and resets. A successful create additionally needs the `description`/`image_url` columns migrated into Neon (commit `schema.ts` + `pnpm db:push`) — until then, submit surfaces the error toast, which itself verifies the error path.

- [ ] **Step 5: Format and commit**

```bash
pnpm exec biome check --write src/components/admin/create-course-dialog-container.tsx src/components/admin/admin-courses-page-container.tsx
git add src/components/admin/create-course-dialog-container.tsx src/components/admin/admin-courses-page-container.tsx
git commit -m "feat(admin): wire Add course button to create-course dialog"
```

---

## Self-Review

**Spec coverage:**
- Modal dialog (Base UI), controlled by jotai atom → Task 2 (atom) + Task 3 (Dialog). ✓
- sonner toast on success/error + root Toaster → Task 1 + Task 3 `onSuccess`/`onError`. ✓
- RHF + `zodResolver(createCourseInputSchema)`, fields name/description/imageUrl → Task 2 form + Task 3 container. ✓
- Presentational form / container split → Task 2 (pure form) + Task 3 (container). ✓
- Trigger = Add-course button (prop-forwarding) → Task 2 Step 3 + Task 3 `render`. ✓
- Grid refetch on success → inherited from `useCreateCourse` (invalidates `adminCourses`). ✓
- Close + reset on success/close → Task 3 `onOpenChange`/`onSuccess`. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. ✓

**Type consistency:** `CreateCourseInput` field names (`name`/`description`/`imageUrl`) match the form's `register` calls and `CreateCourseFormProps`. `createCourseDialogOpenAtom` (Task 2) consumed in Task 3. `useCreateCourse` (from 2a) returns `{ mutate, isPending, isError, reset }` used in Task 3. `AddCourseButton` prop type (`ComponentProps<typeof Button>`) supports the `render` usage. ✓

**Ordering keeps build green:** Task 1 additive (dep + Toaster); Task 2 additive (leaf atom/form/button, button stays backward-compatible); Task 3 assembles and swaps the header element. ✓
