import { AlertDialog } from '@base-ui/react/alert-dialog';
import { useAtom } from 'jotai';
import { updateLessonVersionAtom } from '#/atoms/admin';
import {
  CourseLessonVersionError,
  useUpdateCourseLessonVersion,
} from '#/data-hooks/use-update-course-lesson-version';
import type { EditorBoardModule } from '#/lib/admin-schemas';
import { findBoardLesson } from './editor-board-updates';
import { UpdateLessonVersionDialog } from './update-lesson-version-dialog';

/**
 * The confirmation a version chip opens, mounted once per board.
 *
 * What it shows is kept as it was when the chip was pressed, and that version
 * is what is posted: a board refetching behind the dialog must not change what
 * the button does. Only a `stale` refusal renews it, from the refetched board.
 */
export const UpdateLessonVersionDialogContainer = ({
  readBoards,
}: {
  /**
   * The boards on screen, read from the cache when called: the answer to a
   * refusal has to come from the refetch that followed it.
   */
  readBoards: () => readonly {
    course: { id: number };
    modules: readonly EditorBoardModule[];
  }[];
}) => {
  const [target, setTarget] = useAtom(updateLessonVersionAtom);
  const update = useUpdateCourseLessonVersion();

  const close = () => {
    setTarget(null);
    update.reset();
  };

  const confirm = () => {
    if (!target) return;
    const { courseId, lessonId, to } = target;
    update.mutate(
      { courseId, lessonId, toVersion: to },
      {
        onSuccess: close,
        onError: (error) => {
          const code =
            error instanceof CourseLessonVersionError ? error.code : undefined;
          // Someone else moved this course here first: nothing left to ask.
          if (code === 'current') return close();
          if (code !== 'stale') return;
          const lesson = findBoardLesson(readBoards(), courseId, lessonId);
          if (!lesson) return;
          if (lesson.version === lesson.disciplineVersion) return close();
          setTarget({
            ...target,
            lessonName: lesson.name,
            from: lesson.version,
            to: lesson.disciplineVersion,
            contentUpdatedAt: lesson.contentUpdatedAt,
          });
        },
      },
    );
  };

  return (
    <AlertDialog.Root
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !update.isPending) close();
      }}
    >
      {target && (
        <UpdateLessonVersionDialog
          lessonName={target.lessonName}
          courseName={target.courseName}
          from={target.from}
          to={target.to}
          contentUpdatedAt={target.contentUpdatedAt}
          isPending={update.isPending}
          error={
            update.error instanceof CourseLessonVersionError
              ? update.error.message
              : update.error
                ? 'Could not update this lesson. Please try again.'
                : undefined
          }
          onConfirm={confirm}
        />
      )}
    </AlertDialog.Root>
  );
};
