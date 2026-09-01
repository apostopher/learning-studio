import { Dialog } from '@base-ui/react/dialog';
import { useAtom } from 'jotai';
import { toast } from 'sonner';

import { deleteDisciplineTargetAtom } from '#/atoms/admin';
import {
  DisciplineRequestError,
  useDeleteDiscipline,
} from '#/data-hooks/use-disciplines';
import { DeleteDisciplineConfirm } from './delete-discipline-confirm';

/**
 * Delete the discipline named by `deleteDisciplineTargetAtom`.
 *
 * The lesson count the dialog blocks on comes off the atom — it is the count
 * the library column the user just clicked is already showing, so the dialog
 * cannot contradict what they were looking at. The server checks it again and
 * refuses with a 409 carrying its own count; that refusal is rendered too,
 * because the two can legitimately disagree if someone else filed a lesson in
 * the meantime, and the server's number is the true one.
 */
export const DeleteDisciplineDialogContainer = () => {
  const [target, setTarget] = useAtom(deleteDisciplineTargetAtom);
  const remove = useDeleteDiscipline();

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setTarget(null);
      remove.reset();
    }
  };

  const onConfirm = () => {
    if (!target) return;
    remove.mutate(target.id, {
      onSuccess: () => {
        toast.success(`${target.name} deleted`);
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog.Root open={target !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="dialog-popup fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="font-semibold text-lg text-primary">
            Delete discipline
          </Dialog.Title>
          <div className="mt-4">
            <DeleteDisciplineConfirm
              disciplineName={target?.name ?? ''}
              lessonCount={target?.lessonCount ?? 0}
              serverError={
                remove.isError
                  ? remove.error instanceof DisciplineRequestError
                    ? remove.error.message
                    : 'Could not delete. Please try again.'
                  : undefined
              }
              isPending={remove.isPending}
              onConfirm={onConfirm}
              onCancel={() => onOpenChange(false)}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
