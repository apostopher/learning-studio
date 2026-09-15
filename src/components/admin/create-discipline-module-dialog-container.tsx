import { Dialog } from '@base-ui/react/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { createDisciplineModuleTargetAtom } from '#/atoms/admin';
import { useCreateDisciplineModule } from '#/data-hooks/use-discipline-modules';
import {
  type CreateDisciplineModuleInput,
  createDisciplineModuleInputSchema,
} from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';

/**
 * "Add a module" from a discipline column.
 *
 * `CreateModuleForm` doesn't fit here — it also collects a cover image, and a
 * discipline module (`LibraryDisciplineModule`) has no such field — so this
 * is the bare name field the brief calls for, inlined rather than split into
 * its own presentational component for a single input and two buttons.
 *
 * `?? 0` only satisfies the hook's signature while the dialog is closed;
 * submitting is guarded on `target`, so nothing is ever posted then.
 */
export const CreateDisciplineModuleDialogContainer = () => {
  const [target, setTarget] = useAtom(createDisciplineModuleTargetAtom);
  const createModule = useCreateDisciplineModule();
  const form = useForm<CreateDisciplineModuleInput>({
    resolver: zodResolver(createDisciplineModuleInputSchema),
    mode: 'onSubmit',
  });

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setTarget(null);
      form.reset();
      createModule.reset();
    }
  };

  const handleSubmit = form.handleSubmit((values) => {
    if (!target) return;
    createModule.mutate(
      { disciplineId: target.disciplineId, name: values.name },
      {
        onSuccess: () => {
          toast.success('Module created');
          onOpenChange(false);
        },
      },
    );
  });

  const nameError = form.formState.errors.name?.message;

  return (
    <Dialog.Root open={target !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="dialog-popup fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="font-semibold text-lg text-primary">
            Add module
          </Dialog.Title>
          <Dialog.Description className="mt-1 mb-5 text-secondary text-sm">
            Add a module to {target?.disciplineName ?? 'this discipline'}. You
            can drag lessons into it from the library next.
          </Dialog.Description>
          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="create-discipline-module-name"
                className="font-medium text-primary text-sm"
              >
                Name
              </label>
              <input
                {...form.register('name')}
                id="create-discipline-module-name"
                type="text"
                // biome-ignore lint/a11y/noAutofocus: only ever rendered inside a modal dialog the user just opened, where focus belongs on the first field rather than the popup container
                autoFocus
                aria-invalid={!!nameError}
                aria-describedby={
                  nameError ? 'create-discipline-module-name-error' : undefined
                }
                className={cn(
                  'w-full min-w-0 rounded-lg border bg-gray-1 px-3.5 py-2.5 text-primary text-sm outline-none transition-colors duration-100 placeholder:text-tertiary',
                  'focus-visible:border-apple-9 focus-visible:ring-2 focus-visible:ring-apple-9',
                  nameError
                    ? 'border-error-9 focus-visible:border-error-9 focus-visible:ring-error-9'
                    : 'border-gray-6 hover:border-gray-8',
                )}
              />
              {nameError && (
                <p
                  id="create-discipline-module-name-error"
                  role="alert"
                  aria-live="polite"
                  className="text-error-text text-sm"
                >
                  {nameError}
                </p>
              )}
            </div>

            {createModule.isError && (
              <p
                role="alert"
                className="rounded-lg border border-error-9/40 bg-error-9/15 px-3 py-2.5 text-error-text text-sm"
              >
                {createModule.error.message}
              </p>
            )}

            <div className="mt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg px-4 py-2.5 font-medium text-secondary text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createModule.isPending}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 font-medium text-apple-contrast text-sm',
                  'transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                {createModule.isPending && (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                Create module
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
