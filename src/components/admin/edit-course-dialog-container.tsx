import { Dialog } from '@base-ui/react/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { editCourseAtom } from '@/atoms/admin';
import { useUpdateCourse } from '@/data-hooks/use-update-course';
import {
  type CreateCourseInput,
  updateCourseInputSchema,
} from '@/lib/admin-schemas';
import { CreateCourseForm } from './create-course-form';
import { ImageUploadFieldContainer } from './image-upload-field-container';

export const EditCourseDialogContainer = () => {
  const [target, setTarget] = useAtom(editCourseAtom);
  const updateCourse = useUpdateCourse(target?.id ?? 0);
  const form = useForm<
    z.input<typeof updateCourseInputSchema>,
    unknown,
    CreateCourseInput
  >({
    resolver: zodResolver(updateCourseInputSchema),
    values: {
      name: target?.name ?? '',
      description: target?.description ?? '',
      imageUrlAvif: target?.imageUrlAvif ?? undefined,
      imageUrlWebp: target?.imageUrlWebp ?? undefined,
    },
    mode: 'onSubmit',
  });

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setTarget(null);
      updateCourse.reset();
    }
  };

  const handleSubmit = form.handleSubmit((data) => {
    if (!target) return;
    updateCourse.mutate(data, {
      onSuccess: () => {
        toast.success('Course updated');
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
            Edit course
          </Dialog.Title>
          <Dialog.Description className="mt-1 mb-5 text-sm text-gray-11">
            Update this course's details.
          </Dialog.Description>
          <CreateCourseForm
            onSubmit={handleSubmit}
            registerName={form.register('name')}
            registerDescription={form.register('description')}
            imageField={
              <ImageUploadFieldContainer
                pathPrefix="courses"
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
            errors={{
              name: form.formState.errors.name?.message,
              description: form.formState.errors.description?.message,
            }}
            serverError={
              updateCourse.isError
                ? 'Could not save. Please try again.'
                : undefined
            }
            isPending={updateCourse.isPending}
            onCancel={() => onOpenChange(false)}
            submitLabel="Save changes"
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
