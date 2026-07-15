# Add-course form dialog + toast (Course Designer step 2b)

**Date:** 2026-07-15
**Status:** Design, pending approval
**Area:** `src/components/admin`, `src/atoms`, `src/routes/__root.tsx`, `package.json`

## Context

Step 2a shipped `useCreateCourse` + the `/api/admin/courses` POST, but the
"Add course" button is inert. This wires it to a create-course modal and adds
success/error toasts.

## Decisions (from brainstorming)

- **Modal dialog** via Base UI `Dialog` (repo's first — reusable for edit later).
- **Toast** feedback via **sonner** (new dep) — a root `<Toaster />` + `toast.success`/`toast.error`.
- **Dialog open state** in a jotai atom (per the jotai rule); Dialog is controlled.
- Form uses react-hook-form + `zodResolver(createCourseInputSchema)` (built in 2a).

## Architecture

### Open-state atom — `src/atoms/admin.ts`

```ts
import { atom } from "jotai";
/** Whether the create-course dialog is open. */
export const createCourseDialogOpenAtom = atom(false);
```

### Toast — `sonner`

- Add `sonner` dependency.
- Mount `<Toaster />` once in `src/routes/__root.tsx` `RootDocument` (inside the
  providers, near `<Scripts />`). Configure `position="bottom-right"`,
  `theme="system"` (respects the app's light/dark), and `richColors`. No design
  tokens needed for step 1 of toasts; can be themed later.

### Presentational form — `src/components/admin/create-course-form.tsx`

Pure component (Base-UI-friendly, matches the auth form idiom). Props:

```ts
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
```

- **Name** — text input, `autoFocus`, required styling; error under field.
- **Description** — `<textarea>` (optional), 3–4 rows.
- **Image URL** — `type="url"` input (optional), placeholder `https://…`.
- Footer: Cancel (calls `onCancel`) + Submit ("Create course", spinner when
  `isPending`, disabled while pending). Token colors (`apple-*`, `gray-*`,
  `red-*`), logical CSS, same label/input/`aria-invalid`/error idiom as
  `email-step-form.tsx`. No state/effects/hooks — pure.

### Container — `src/components/admin/create-course-dialog-container.tsx`

```tsx
export const CreateCourseDialogContainer = () => {
  const [open, setOpen] = useAtom(createCourseDialogOpenAtom);
  const createCourse = useCreateCourse();
  const form = useForm<CreateCourseInput>({
    resolver: zodResolver(createCourseInputSchema),
    mode: "onSubmit",
  });

  const handleSubmit = form.handleSubmit((values) => {
    createCourse.mutate(values, {
      onSuccess: () => {
        toast.success("Course created");
        setOpen(false);
        form.reset();
      },
      onError: () => toast.error("Could not create course. Please try again."),
    });
  });

  // Reset form + mutation error when the dialog closes.
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) { form.reset(); createCourse.reset(); }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger render={<AddCourseButton />} />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="fixed inset-inline-0 mx-auto ... bg-gray-2 border border-gray-6 rounded-xl ...">
          <Dialog.Title className="...">Create course</Dialog.Title>
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
            serverError={createCourse.isError ? "Something went wrong." : undefined}
            isPending={createCourse.isPending}
            onCancel={() => onOpenChange(false)}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
```

- `AddCourseButton` is reused as the trigger via Base UI's `render` prop — update
  it to forward props (`{...props}`) onto its `<Button>` so Dialog can inject
  `onClick`/aria; drop the step-1 no-op `onClick`.
- Positioning/animation: center the popup (logical `inset-inline`, `translate`);
  optional Motion fade/scale with `useReducedMotion` (nice-to-have, can follow).

### Wire-up — `src/components/admin/admin-courses-page-container.tsx`

Replace `<AddCourseButton />` in the header with `<CreateCourseDialogContainer />`.

## Files

- Create: `src/atoms/admin.ts`, `src/components/admin/create-course-form.tsx`,
  `src/components/admin/create-course-dialog-container.tsx`.
- Modify: `src/routes/__root.tsx` (`<Toaster />`),
  `src/components/admin/add-course-button.tsx` (prop-forwarding),
  `src/components/admin/admin-courses-page-container.tsx` (use the dialog),
  `package.json` (`sonner`).

## Out of scope (later)

- Image upload (URL only). Edit/delete course. Per-field server error mapping
  from the POST 400 body. Toast theming to Radix tokens.

## Testing / verification

- Typecheck + build.
- Manual: click Add course → dialog opens; blank name → validation error; bad URL
  → error; valid submit → toast + dialog closes + new tile appears.
  **Note:** the create round-trip needs the `description`/`image_url` columns in
  the Neon DB — the user must commit `schema.ts` + run the Drizzle migration first;
  until then the POST will error (dialog/validation/toast-error still verifiable).
