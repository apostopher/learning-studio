import { Dialog } from '@base-ui/react/dialog';
import { useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { deleteCourseAtom } from '@/atoms/admin';
import { useDeleteCourse } from '@/data-hooks/use-delete-course';
import { DeleteConfirmForm } from './delete-confirm-form';

export const DeleteCourseDialogContainer = () => {
  const [target, setTarget] = useAtom(deleteCourseAtom);
  const deleteCourse = useDeleteCourse();
  const navigate = useNavigate();
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
      deleteCourse.reset();
    }
  };

  const handleSubmit = form.handleSubmit(() => {
    if (!target || !canSubmit) return;
    deleteCourse.mutate(target.id, {
      onSuccess: () => {
        toast.success('Course deleted');
        onOpenChange(false);
        navigate({ to: '/admin' });
      },
    });
  });

  return (
    <Dialog.Root open={target !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-gray-12">
            Delete course
          </Dialog.Title>
          <div className="mt-4">
            <DeleteConfirmForm
              warning={
                <>
                  Deleting{' '}
                  <span className="font-medium text-gray-12">
                    {target?.name ?? ''}
                  </span>{' '}
                  will permanently delete the course, all of its modules, and
                  their lessons. This can't be undone.
                </>
              }
              submitLabel="Delete course"
              onSubmit={handleSubmit}
              registerConfirm={form.register('confirm')}
              canSubmit={canSubmit}
              isPending={deleteCourse.isPending}
              serverError={
                deleteCourse.isError
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
