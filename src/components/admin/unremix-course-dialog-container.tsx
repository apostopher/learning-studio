import { Dialog } from '@base-ui/react/dialog';
import { useAtom } from 'jotai';
import { toast } from 'sonner';
// `#/` not `@/`: vitest cannot resolve the `@/` alias.
import { unremixCourseAtom } from '#/atoms/admin';
import { useUnremixCourse } from '#/data-hooks/use-remix-course';
import { UnremixConfirm } from './unremix-confirm';

export const UnremixCourseDialogContainer = () => {
  const [target, setTarget] = useAtom(unremixCourseAtom);
  const unremix = useUnremixCourse();

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setTarget(null);
      unremix.reset();
    }
  };

  return (
    <Dialog.Root open={target !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="dialog-popup fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-primary">
            Un-remix {target?.sourceName ?? ''}
          </Dialog.Title>
          <div className="mt-4">
            {target && (
              <UnremixConfirm
                courseName={target.courseName}
                sourceName={target.sourceName}
                moduleCount={target.moduleCount}
                isPending={unremix.isPending}
                onConfirm={() =>
                  unremix.mutate(
                    {
                      courseId: target.courseId,
                      sourceCourseId: target.sourceCourseId,
                    },
                    {
                      onSuccess: ({ moduleCount }) => {
                        toast.success(
                          `${moduleCount} ${moduleCount === 1 ? 'module' : 'modules'} left ${target.courseName}`,
                        );
                        onOpenChange(false);
                      },
                      onError: (error) => toast.error(error.message),
                    },
                  )
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
