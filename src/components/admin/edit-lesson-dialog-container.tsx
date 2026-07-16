import { Dialog } from '@base-ui/react/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { editLessonAtom } from '@/atoms/admin';
import { useUpdateLesson } from '@/data-hooks/use-update-lesson';
import {
  type RenameLessonInput,
  renameLessonInputSchema,
} from '@/lib/admin-schemas';
import { CreateLessonForm } from './create-lesson-form';

export const EditLessonDialogContainer = ({
  courseId,
}: {
  courseId: number;
}) => {
  const [target, setTarget] = useAtom(editLessonAtom);
  const updateLesson = useUpdateLesson(courseId);
  const form = useForm<RenameLessonInput>({
    resolver: zodResolver(renameLessonInputSchema),
    values: { name: target?.name ?? '' },
    mode: 'onSubmit',
  });

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setTarget(null);
      updateLesson.reset();
    }
  };

  const handleSubmit = form.handleSubmit((data) => {
    if (!target) return;
    updateLesson.mutate(
      { lessonId: target.id, name: data.name },
      {
        onSuccess: () => {
          toast.success('Lesson updated');
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
            Edit lesson
          </Dialog.Title>
          <Dialog.Description className="mt-1 mb-5 text-sm text-gray-11">
            Rename this lesson.
          </Dialog.Description>
          <CreateLessonForm
            onSubmit={handleSubmit}
            registerName={form.register('name')}
            nameError={form.formState.errors.name?.message}
            serverError={
              updateLesson.isError
                ? 'Could not save. Please try again.'
                : undefined
            }
            isPending={updateLesson.isPending}
            onCancel={() => onOpenChange(false)}
            submitLabel="Save changes"
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
