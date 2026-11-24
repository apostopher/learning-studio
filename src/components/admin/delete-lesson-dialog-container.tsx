import { Dialog } from '@base-ui/react/dialog';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its component test.
import { deleteLessonAtom } from '#/atoms/admin';
import {
  LessonInUseError,
  useDeleteLesson,
} from '#/data-hooks/use-delete-lesson';
import { useEditorBoard } from '#/data-hooks/use-editor-board';
import { matchesConfirmPhrase } from '#/lib/confirm-phrase';
import {
  lessonInUseByCountMessage,
  lessonInUseMessage,
} from '#/lib/lesson-in-use';
import { DeleteConfirmForm } from './delete-confirm-form';
import { DeleteLessonWarning } from './delete-lesson-warning';
import { courseNamesShowing } from './editor-board-updates';
import { LessonInUseNotice } from './lesson-in-use-notice';

/**
 * Deleting a lesson outright, which only a lesson no course shows can be: one
 * in use gets the reason, naming its courses, and nothing to confirm.
 *
 * Takes no `courseId`: a lesson is org-owned and can be shown by several
 * courses, so there is no one course this dialog belongs to. The lesson and
 * how many courses show it ride on `deleteLessonAtom`, set by the library card
 * that opened it; which ones they are comes from the editor's board.
 *
 * Neither is proof: a course can take the lesson meanwhile. The server refuses
 * then, and its reason takes the form's place.
 */
export const DeleteLessonDialogContainer = () => {
  const [target, setTarget] = useAtom(deleteLessonAtom);
  const deleteLesson = useDeleteLesson();
  const { data: board } = useEditorBoard();
  const form = useForm<{ confirm: string }>({
    defaultValues: { confirm: '' },
    mode: 'onChange',
  });
  const confirmValue = form.watch('confirm');
  const canSubmit = matchesConfirmPhrase(confirmValue, target?.name ?? '');

  const courseNames = target ? courseNamesShowing(board ?? [], target.id) : [];
  const inUseReason =
    deleteLesson.error instanceof LessonInUseError
      ? deleteLesson.error.message
      : courseNames.length > 0
        ? lessonInUseMessage(courseNames)
        : target && target.courseCount > 0
          ? lessonInUseByCountMessage(target.courseCount)
          : null;

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
            Delete lesson
          </Dialog.Title>
          <div className="mt-4">
            {target && inUseReason !== null ? (
              <LessonInUseNotice
                name={target.name}
                reason={inUseReason}
                onClose={() => onOpenChange(false)}
              />
            ) : (
              <DeleteConfirmForm
                confirmPhrase={target?.name ?? ''}
                warning={<DeleteLessonWarning name={target?.name ?? ''} />}
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
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
