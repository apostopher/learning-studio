import { Dialog } from '@base-ui/react/dialog';
import { Tooltip } from '@base-ui/react/tooltip';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { createModuleDialogOpenAtom } from '#/atoms/admin';
import { useCreateModule } from '#/data-hooks/use-create-module';
import {
  type BoardCourse,
  type CreateModuleInput,
  createModuleInputSchema,
} from '#/lib/admin-schemas';
import { isFlagshipCourse } from '#/lib/flagship-course';
import { IconButtonTooltip } from '../ui/tooltip-icon-button';
import { AddModuleButton } from './add-module-button';
import { CreateModuleForm } from './create-module-form';
import { ImageUploadFieldContainer } from './image-upload-field-container';

export const CreateModuleDialogContainer = ({
  course,
}: {
  course: Pick<BoardCourse, 'id' | 'name' | 'slug'>;
}) => {
  const [open, setOpen] = useAtom(createModuleDialogOpenAtom);
  const createModule = useCreateModule(course.id);
  const form = useForm<CreateModuleInput>({
    resolver: zodResolver(createModuleInputSchema),
    mode: 'onSubmit',
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
        toast.success('Module created');
        onOpenChange(false);
      },
    });
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {/* Closes as soon as the pointer leaves — see `tooltip-icon-button.tsx`. */}
      <Tooltip.Root disableHoverablePopup>
        <Tooltip.Trigger
          render={<Dialog.Trigger render={<AddModuleButton />} />}
        />
        <IconButtonTooltip label="Add module" />
      </Tooltip.Root>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="dialog-popup fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-primary">
            Create module
          </Dialog.Title>
          <Dialog.Description className="mt-1 mb-5 text-sm text-secondary">
            {/* The flagship has no column there to drag into. */}
            {isFlagshipCourse(course)
              ? 'Add a module to this course.'
              : `Add a module to this course. Then, in the knowledge library, drag lessons into it from Disciplines, in the ${course.name} column.`}
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
