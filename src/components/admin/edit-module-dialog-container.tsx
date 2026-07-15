import { Dialog } from '@base-ui/react/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { editModuleAtom } from '@/atoms/admin';
import { useUpdateModule } from '@/data-hooks/use-update-module';
import {
  type UpdateModuleInput,
  updateModuleInputSchema,
} from '@/lib/admin-schemas';
import { CreateModuleForm } from './create-module-form';
import { ImageUploadFieldContainer } from './image-upload-field-container';

export const EditModuleDialogContainer = ({
  courseId,
}: {
  courseId: number;
}) => {
  const [target, setTarget] = useAtom(editModuleAtom);
  const updateModule = useUpdateModule(courseId);
  const form = useForm<UpdateModuleInput>({
    resolver: zodResolver(updateModuleInputSchema),
    values: {
      name: target?.name ?? '',
      imageUrlAvif: target?.imageUrlAvif ?? undefined,
      imageUrlWebp: target?.imageUrlWebp ?? undefined,
    },
    mode: 'onSubmit',
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
      {
        moduleId: target.id,
        name: data.name,
        imageUrlAvif: data.imageUrlAvif ?? null,
        imageUrlWebp: data.imageUrlWebp ?? null,
      },
      {
        onSuccess: () => {
          toast.success('Module updated');
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
            Update this module's name and cover image.
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
                    {
                      shouldDirty: true,
                    },
                  );
                  form.setValue(
                    'imageUrlWebp',
                    next.imageUrlWebp ?? undefined,
                    {
                      shouldDirty: true,
                    },
                  );
                }}
              />
            }
            serverError={
              updateModule.isError
                ? 'Could not save. Please try again.'
                : undefined
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
