import { Dialog } from '@base-ui/react/dialog';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { deleteLessonAtom } from '@/atoms/admin';
import { useDeleteLesson } from '@/data-hooks/use-delete-lesson';
import { DeleteConfirmForm } from './delete-confirm-form';

export const DeleteLessonDialogContainer = ({
  courseId,
}: {
  courseId: number;
}) => {
  const [target, setTarget] = useAtom(deleteLessonAtom);
  const deleteLesson = useDeleteLesson(courseId);
  const form = useForm<{ confirm: string }>({
    defaultValues: { confirm: '' },
    mode: 'onChange',
  });
  const confirmValue = form.watch('confirm');
  const canSubmit = confirmValue.trim().toLowerCase() === 'permanently delete';

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setTarget(null);
      form.reset();
      deleteLesson.reset();
    }
  };

  const handleSubmit = form.handleSubmit(() => {
    if (!target || !canSubmit) return;
    deleteLesson.mutate(target.id, {
      onSuccess: () => {
        toast.success('Lesson deleted');
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
            Delete lesson
          </Dialog.Title>
          <div className="mt-4">
            <DeleteConfirmForm
              warning={
                <>
                  Deleting{' '}
                  <span className="font-medium text-gray-12">
                    {target?.name ?? ''}
                  </span>{' '}
                  will permanently delete this lesson. This can't be undone.
                </>
              }
              submitLabel="Delete lesson"
              onSubmit={handleSubmit}
              registerConfirm={form.register('confirm')}
              canSubmit={canSubmit}
              isPending={deleteLesson.isPending}
              serverError={
                deleteLesson.isError
                  ? 'Could not delete. Please try again.'
                  : undefined
              }
              onCancel={() => onOpenChange(false)}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
