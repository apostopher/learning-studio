import { Dialog } from '@base-ui/react/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { createModuleTargetAtom } from '#/atoms/admin';
import { useCreateModule } from '#/data-hooks/use-create-module';
import {
  type CreateModuleInput,
  createModuleInputSchema,
} from '#/lib/admin-schemas';
import { CreateModuleForm } from './create-module-form';
import { ImageUploadFieldContainer } from './image-upload-field-container';

/**
 * "Add module" from a column of the org editor's rail.
 *
 * The sibling of `CreateModuleDialogContainer`, which serves the per-course
 * board, and it reuses that dialog's `CreateModuleForm` verbatim so the two
 * stay identical as either changes. What differs is only how the target is
 * chosen: that one is handed a `courseId` prop and opens on a shared boolean,
 * which works when exactly one course is on screen. This rail shows many at
 * once, so the course rides on the atom — a shared boolean would open every
 * column's dialog at the same time.
 *
 * `?? 0` only satisfies the hook's signature while the dialog is closed;
 * submitting is guarded on `target`, so nothing is ever posted then.
 */
export const EditorCreateModuleDialogContainer = () => {
  const [target, setTarget] = useAtom(createModuleTargetAtom);
  const createModule = useCreateModule(target?.id ?? 0);
  const form = useForm<CreateModuleInput>({
    resolver: zodResolver(createModuleInputSchema),
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
    createModule.mutate(values, {
      onSuccess: () => {
        toast.success('Module created');
        onOpenChange(false);
      },
    });
  });

  return (
    <Dialog.Root open={target !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="dialog-popup fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="font-semibold text-lg text-primary">
            Create module
          </Dialog.Title>
          <Dialog.Description className="mt-1 mb-5 text-secondary text-sm">
            Add a module to {target?.name ?? 'this course'}. You can drag
            lessons into it from the library next.
          </Dialog.Description>
          <CreateModuleForm
            onSubmit={handleSubmit}
            registerName={form.register('name')}
            nameError={form.formState.errors.name?.message}
            imageField={
              <ImageUploadFieldContainer
                pathPrefix="modules"
                value={{
                  imageUrlAvif: form.watch('imageUrlAvif') ?? null,
                  imageUrlWebp: form.watch('imageUrlWebp') ?? null,
                }}
                onChange={(next) => {
                  form.setValue(
                    'imageUrlAvif',
                    next.imageUrlAvif ?? undefined,
                    { shouldDirty: true },
                  );
                  form.setValue(
                    'imageUrlWebp',
                    next.imageUrlWebp ?? undefined,
                    { shouldDirty: true },
                  );
                }}
              />
            }
            serverError={
              createModule.isError
                ? 'Could not create module. Please try again.'
                : undefined
            }
            isPending={createModule.isPending}
            onCancel={() => onOpenChange(false)}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
