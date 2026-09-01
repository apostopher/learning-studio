import { Dialog } from '@base-ui/react/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { createCourseDialogOpenAtom } from '@/atoms/admin';
import { useCreateCourse } from '@/data-hooks/use-create-course';
import {
  type CreateCourseInput,
  createCourseInputSchema,
} from '@/lib/admin-schemas';
import { AddCourseButton } from './add-course-button';
import { CreateCourseForm } from './create-course-form';
import { ImageUploadFieldContainer } from './image-upload-field-container';

/**
 * `triggerLabel` and `noun` exist because the editor's course rail calls the
 * same thing an "offering" — a variant of a course (two-week, mini, full)
 * that a learner actually buys. Offering is an ALIAS of course, not a second
 * table, so this is one dialog with two names rather than two dialogs. They
 * are separate props because the courses page keeps saying "Add course" while
 * the rail says "New offering", and the dialog's own copy must follow the
 * button that opened it — a button reading "New offering" over a dialog
 * titled "Create course" reads as the wrong dialog having opened.
 */
export const CreateCourseDialogContainer = ({
  triggerLabel = 'Add course',
  noun = 'course',
}: {
  triggerLabel?: string;
  noun?: string;
} = {}) => {
  const [open, setOpen] = useAtom(createCourseDialogOpenAtom);
  const createCourse = useCreateCourse();
  const form = useForm<
    z.input<typeof createCourseInputSchema>,
    unknown,
    CreateCourseInput
  >({
    resolver: zodResolver(createCourseInputSchema),
    mode: 'onSubmit',
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
        toast.success(
          `${noun.charAt(0).toUpperCase()}${noun.slice(1)} created`,
        );
        onOpenChange(false);
      },
    });
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger render={<AddCourseButton label={triggerLabel} />} />
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="dialog-popup fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-primary">
            Create {noun}
          </Dialog.Title>
          <Dialog.Description className="mt-1 mb-5 text-sm text-secondary">
            Add a new {noun}. You can add modules and lessons next.
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
              createCourse.isError
                ? `Could not create ${noun}. Please try again.`
                : undefined
            }
            submitLabel={`Create ${noun}`}
            isPending={createCourse.isPending}
            onCancel={() => onOpenChange(false)}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
