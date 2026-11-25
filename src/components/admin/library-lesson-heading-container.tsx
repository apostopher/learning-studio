import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { renamingLibraryLessonIdAtom } from '#/atoms/admin';
import { useRenameLibraryLesson } from '#/data-hooks/use-update-library-lesson';
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
 * The library "Edit lesson" dialog's heading: the lesson's name, which is
 * content, so it may carry a new version. Who sees the lesson is each course's
 * to say, and not here.
 *
 * Mounted with `key={lesson.id}` by the dialog, so pointing the modal at a
 * different lesson remounts this and `defaultValues` reseeds the name — no
 * effect resetting state when a prop changes (docs/use-effect-rules.md).
 */
export const LibraryLessonHeadingContainer = ({
  lesson,
}: {
  lesson: VersionedLesson & { name: string };
}) => {
  const [renamingId, setRenamingId] = useAtom(renamingLibraryLessonIdAtom);
  const rename = useRenameLibraryLesson(lesson.id);
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
      isRenaming={isRenaming}
      isSaving={rename.isPending}
      onStartRename={() => {
        form.reset({ name: lesson.name });
        setRenamingId(lesson.id);
      }}
      onCancelRename={() => setRenamingId(null)}
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
