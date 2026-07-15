import { Dialog } from '@base-ui/react/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { createLessonModuleIdAtom } from '@/atoms/admin';
import { useCreateLesson } from '@/data-hooks/use-create-lesson';
import {
  type CreateLessonInput,
  createLessonInputSchema,
} from '@/lib/admin-schemas';
import { CreateLessonForm } from './create-lesson-form';

export const CreateLessonDialogContainer = ({
  courseId,
}: {
  courseId: number;
}) => {
  const [moduleId, setModuleId] = useAtom(createLessonModuleIdAtom);
  const createLesson = useCreateLesson(courseId);
  const form = useForm<CreateLessonInput>({
    resolver: zodResolver(createLessonInputSchema),
    mode: 'onSubmit',
  });

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setModuleId(null);
      form.reset();
      createLesson.reset();
    }
  };

  const handleSubmit = form.handleSubmit((values) => {
    if (moduleId == null) return;
    createLesson.mutate(
      { moduleId, name: values.name },
      {
        onSuccess: () => {
          toast.success('Lesson created');
          onOpenChange(false);
        },
      },
    );
  });

  return (
    <Dialog.Root open={moduleId !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-gray-12">
            Create lesson
          </Dialog.Title>
          <Dialog.Description className="mt-1 mb-5 text-sm text-gray-11">
            Add a lesson to this module.
          </Dialog.Description>
          <CreateLessonForm
            onSubmit={handleSubmit}
            registerName={form.register('name')}
            nameError={form.formState.errors.name?.message}
            serverError={
              createLesson.isError
                ? 'Could not create lesson. Please try again.'
                : undefined
            }
            isPending={createLesson.isPending}
            onCancel={() => onOpenChange(false)}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
