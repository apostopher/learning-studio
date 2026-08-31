import { useUpdateLessonConfig } from '#/data-hooks/use-update-lesson-config';
import type { EditorBoardLesson, EditorBoardModule } from '#/lib/admin-schemas';
import { LessonQuickshot } from './lesson-quickshot';

/**
 * Wires the quickshot chips to the board cache.
 *
 * **There is deliberately no pending state passed down.** `useUpdateLessonConfig`
 * writes the new value into the course-board cache in `onMutate`, so the chip has
 * already flipped by the time this function returns — a spinner would appear
 * *after* the thing it claims to be waiting for, and disabling the row mid-run
 * would block the second tap of "paid, then debrief" for no reason the author
 * can see. Failure is the only case worth reporting, and the hook does that with
 * a toast and a rollback.
 *
 * The `disabled` prop is left for a caller who genuinely cannot edit — a future
 * read-only actor — not for the milliseconds a request is open.
 */
interface LessonQuickshotContainerProps {
  courseId: number;
  lesson: EditorBoardLesson;
  /** The lesson's own module: access depends on what the module allows. */
  module: EditorBoardModule;
  disabled?: boolean;
}

export const LessonQuickshotContainer = ({
  courseId,
  lesson,
  module,
  disabled,
}: LessonQuickshotContainerProps) => {
  const updateConfig = useUpdateLessonConfig(courseId);

  return (
    <LessonQuickshot
      lesson={lesson}
      module={module}
      disabled={disabled}
      onPatch={(patch) => updateConfig.mutate({ lessonId: lesson.id, patch })}
    />
  );
};
