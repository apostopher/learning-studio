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

export const CreateCourseDialogContainer = () => {
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
        toast.success('Course created');
        onOpenChange(false);
      },
      onError: () => {
        toast.error('Could not create course. Please try again.');
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
            registerName={form.register('name')}
            registerDescription={form.register('description')}
            registerImageUrl={form.register('imageUrl')}
            errors={{
              name: form.formState.errors.name?.message,
              description: form.formState.errors.description?.message,
              imageUrl: form.formState.errors.imageUrl?.message,
            }}
            serverError={
              createCourse.isError ? 'Something went wrong.' : undefined
            }
            isPending={createCourse.isPending}
            onCancel={() => onOpenChange(false)}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
