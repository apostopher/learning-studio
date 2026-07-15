import { Dialog } from '@base-ui/react/dialog';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { deleteModuleAtom } from '@/atoms/admin';
import { useDeleteModule } from '@/data-hooks/use-delete-module';
import { DeleteModuleConfirmForm } from './delete-module-confirm-form';

export const DeleteModuleDialogContainer = ({
  courseId,
}: {
  courseId: number;
}) => {
  const [target, setTarget] = useAtom(deleteModuleAtom);
  const deleteModule = useDeleteModule(courseId);
  const form = useForm<{ confirm: string }>({
    values: { confirm: '' },
    mode: 'onChange',
  });
  const confirmValue = form.watch('confirm');
  const canSubmit = confirmValue.trim().toLowerCase() === 'permanently delete';

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setTarget(null);
      deleteModule.reset();
    }
  };

  const handleSubmit = form.handleSubmit(() => {
    if (!target || !canSubmit) return;
    deleteModule.mutate(target.id, {
      onSuccess: () => {
        toast.success('Module deleted');
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
            Delete module
          </Dialog.Title>
          <div className="mt-4">
            <DeleteModuleConfirmForm
              moduleName={target?.name ?? ''}
              onSubmit={handleSubmit}
              registerConfirm={form.register('confirm')}
              canSubmit={canSubmit}
              isPending={deleteModule.isPending}
              serverError={
                deleteModule.isError
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
