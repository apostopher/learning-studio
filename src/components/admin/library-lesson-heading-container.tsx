import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { renamingLibraryLessonIdAtom } from '#/atoms/admin';
import {
  useRenameLibraryLesson,
  useUpdateLibraryLesson,
} from '#/data-hooks/use-update-library-lesson';
import {
  type RenameLessonInput,
  renameLessonInputSchema,
} from '#/lib/admin-schemas';
import {
  useVersionGate,
  type VersionedLesson,
} from './lesson-config/use-version-gate';
import { LessonHeading } from './lesson-heading';

/**
 * The library "Edit lesson" dialog's heading: the lesson-LEVEL settings —
 * name and availability — that used to be a Details tab.
 *
 * Both are properties of the lesson itself, which is what makes them safe to
 * edit here, where no course is in scope. The name is content, so it may
 * carry a new version; availability is a setting every course shares. Gates stay
 * on the per-course surface.
 *
 * Mounted with `key={lesson.id}` by the dialog, so pointing the modal at a
 * different lesson remounts this and `defaultValues` reseeds the name — no
 * effect resetting state when a prop changes (docs/use-effect-rules.md).
 */
export const LibraryLessonHeadingContainer = ({
  lesson,
}: {
  lesson: VersionedLesson & { name: string; isAvailable: boolean };
}) => {
  const [renamingId, setRenamingId] = useAtom(renamingLibraryLessonIdAtom);
  const rename = useRenameLibraryLesson(lesson.id);
  const update = useUpdateLibraryLesson();
  const gate = useVersionGate(lesson);
  const form = useForm<RenameLessonInput>({
    resolver: zodResolver(renameLessonInputSchema),
    mode: 'onSubmit',
    defaultValues: { name: lesson.name },
  });
  const isRenaming = renamingId === lesson.id;

  const onSubmitName = form.handleSubmit((values) => {
    if (values.name === lesson.name) {
      setRenamingId(null);
      return;
    }
    gate.attempt((version) =>
      rename.mutate(
        { name: values.name, version },
        {
          onSuccess: () => {
            toast.success('Lesson renamed');
            setRenamingId(null);
          },
          onError: (error) => toast.error(error.message),
        },
      ),
    );
  });

  return (
    <LessonHeading
      name={lesson.name}
      isAvailable={lesson.isAvailable}
      isRenaming={isRenaming}
      isSaving={rename.isPending || update.isPending}
      onStartRename={() => {
        form.reset({ name: lesson.name });
        setRenamingId(lesson.id);
      }}
      onCancelRename={() => setRenamingId(null)}
      onToggleAvailability={() =>
        update.mutate(
          { lessonId: lesson.id, isAvailable: !lesson.isAvailable },
          { onError: (error) => toast.error(error.message) },
        )
      }
      renameForm={
        isRenaming
          ? {
              onSubmit: onSubmitName,
              registerName: form.register('name'),
              error: form.formState.errors.name?.message,
            }
          : null
      }
    />
  );
};
