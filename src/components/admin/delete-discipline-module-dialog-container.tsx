import { Dialog } from '@base-ui/react/dialog';
import { useAtom } from 'jotai';
import { toast } from 'sonner';

import { deleteDisciplineModuleTargetAtom } from '#/atoms/admin';
import { useDeleteDisciplineModule } from '#/data-hooks/use-discipline-modules';
import { DeleteDisciplineModuleConfirm } from './delete-discipline-module-confirm';

/**
 * Delete the discipline module named by `deleteDisciplineModuleTargetAtom`.
 *
 * The lesson count the confirm quotes comes off the atom — the count the
 * column the user just clicked is already showing — and nothing here is
 * reassigned by a second write: deleting a discipline module only clears
 * `lessons.discipline_module_id`, which is what returns them to Untitled.
 */
export const DeleteDisciplineModuleDialogContainer = () => {
  const [target, setTarget] = useAtom(deleteDisciplineModuleTargetAtom);
  const remove = useDeleteDisciplineModule();

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setTarget(null);
      remove.reset();
    }
  };

  const onConfirm = () => {
    if (!target) return;
    remove.mutate(
      { moduleId: target.id },
      {
        onSuccess: () => {
          toast.success(`${target.name} deleted`);
          onOpenChange(false);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <Dialog.Root open={target !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="dialog-popup fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="font-semibold text-lg text-primary">
            Delete module
          </Dialog.Title>
          <div className="mt-4">
            <DeleteDisciplineModuleConfirm
              moduleName={target?.name ?? ''}
              lessonCount={target?.lessonCount ?? 0}
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
