import { Dialog } from '@base-ui/react/dialog';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its component test.
import { deleteLessonAtom } from '#/atoms/admin';
import { useDeleteLesson } from '#/data-hooks/use-delete-lesson';
import { DeleteConfirmForm } from './delete-confirm-form';
import { DeleteLessonWarning } from './delete-lesson-warning';

/**
 * The confirmation for deleting a lesson outright.
 *
 * Takes no `courseId`: a lesson is org-owned and can be taught by several
 * courses, so there is no one course this dialog belongs to. Everything it
 * needs — including how many courses lose the lesson — rides on
 * `deleteLessonAtom`, set by whichever card opened it.
 */
export const DeleteLessonDialogContainer = () => {
  const [target, setTarget] = useAtom(deleteLessonAtom);
  const deleteLesson = useDeleteLesson();
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
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="dialog-popup fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-primary">
            Delete lesson everywhere
          </Dialog.Title>
          <div className="mt-4">
            <DeleteConfirmForm
              warning={
                <DeleteLessonWarning
                  name={target?.name ?? ''}
                  courseCount={target?.courseCount ?? 0}
                  removeControlLabel={target?.removeControlLabel ?? null}
                />
              }
              submitLabel="Delete lesson"
              onSubmit={handleSubmit}
              registerConfirm={form.register('confirm')}
              canSubmit={canSubmit}
              isPending={deleteLesson.isPending}
              // The hook's own message, not a generic one: a refusal and a
              // transient failure need different sentences, and only the hook
              // knows which happened.
              serverError={
                deleteLesson.error?.message ??
                (deleteLesson.isError
                  ? 'Could not delete. Please try again.'
                  : undefined)
              }
              onCancel={() => onOpenChange(false)}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
