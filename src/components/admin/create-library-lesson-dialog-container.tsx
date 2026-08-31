import { Dialog } from '@base-ui/react/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { createLibraryLessonTargetAtom } from '#/atoms/admin';
import {
  DisciplineRequestError,
  useCreateLibraryLesson,
} from '#/data-hooks/use-disciplines';
import {
  type CreateLessonInput,
  createLessonInputSchema,
} from '#/lib/admin-schemas';
import { CreateLessonForm } from './create-lesson-form';

/**
 * "Add lesson" from a library column — the same dialog as the course board's
 * add-lesson, down to reusing `CreateLessonForm`, with one difference: the
 * lesson is filed under this DISCIPLINE and placed in no course.
 *
 * Reusing the form component rather than copying its markup is what keeps the
 * two dialogs identical as either changes.
 *
 * `disciplineId` comes off the atom rather than being a prop, so this renders
 * once at the editor root instead of once per column — eight columns would
 * otherwise mount eight dialogs and eight idle mutations.
 */
export const CreateLibraryLessonDialogContainer = () => {
  const [target, setTarget] = useAtom(createLibraryLessonTargetAtom);
  // `?? 0` only to satisfy the hook's signature while the dialog is closed;
  // nothing is ever posted then, because submitting is guarded on `target`.
  const createLesson = useCreateLibraryLesson(target?.id ?? 0);
  const form = useForm<CreateLessonInput>({
    resolver: zodResolver(createLessonInputSchema),
    mode: 'onSubmit',
  });

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setTarget(null);
      form.reset();
      createLesson.reset();
    }
  };

  const handleSubmit = form.handleSubmit((values) => {
    if (!target) return;
    createLesson.mutate(
      { name: values.name },
      {
        onSuccess: () => {
          toast.success('Lesson created');
          onOpenChange(false);
        },
      },
    );
  });

  return (
    <Dialog.Root open={target !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="dialog-popup fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="font-semibold text-lg text-primary">
            Create lesson
          </Dialog.Title>
          <Dialog.Description className="mt-1 mb-5 text-secondary text-sm">
            Add a lesson to {target?.name ?? 'this discipline'}. It joins the
            library straight away and teaches no course until you drag it into
            one.
          </Dialog.Description>
          <CreateLessonForm
            onSubmit={handleSubmit}
            registerName={form.register('name')}
            nameError={form.formState.errors.name?.message}
            serverError={
              createLesson.isError
                ? createLesson.error instanceof DisciplineRequestError
                  ? createLesson.error.message
                  : 'Could not create lesson. Please try again.'
                : undefined
            }
            isPending={createLesson.isPending}
            onCancel={() => onOpenChange(false)}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
