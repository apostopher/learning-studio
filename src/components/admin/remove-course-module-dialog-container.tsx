import { AlertDialog } from '@base-ui/react/alert-dialog';
import { useAtom } from 'jotai';
import { toast } from 'sonner';
// `#/` not `@/`: vitest cannot resolve the `@/` alias.
import { removeCourseModuleAtom } from '#/atoms/admin';
import { useDeleteModule } from '#/data-hooks/use-delete-module';
import { RemoveCourseModuleDialog } from './remove-course-module-dialog';

/**
 * Confirms taking a module out of a course from the editor rail.
 *
 * One click, not a typed phrase: the lessons are not lost — they stay in the
 * library and learners keep their progress, which lives on the lesson — so
 * this is not the irreversible delete the per-course board's dialog guards.
 * What IS lost (the module's name, image, access and prerequisites, and its
 * place in any course remixing this one) is said in the dialog.
 */
export const RemoveCourseModuleDialogContainer = () => {
  const [target, setTarget] = useAtom(removeCourseModuleAtom);
  const deleteModule = useDeleteModule(target?.courseId ?? 0);

  const close = () => {
    setTarget(null);
    deleteModule.reset();
  };

  return (
    <AlertDialog.Root
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      {target && (
        <RemoveCourseModuleDialog
          moduleName={target.name}
          courseName={target.courseName}
          otherCourseCount={target.otherCourseCount}
          isPending={deleteModule.isPending}
          onConfirm={() =>
            deleteModule.mutate(target.id, {
              onSuccess: () => {
                toast.success(
                  `Removed "${target.name}" from ${target.courseName}. Its lessons are still in the library.`,
                );
                close();
              },
              onError: (error) => toast.error(error.message),
            })
          }
        />
      )}
    </AlertDialog.Root>
  );
};
