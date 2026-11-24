import { useSetAtom } from 'jotai';
import { updateLessonVersionAtom } from '#/atoms/admin';
import { useIsUpdatingCourseLesson } from '#/data-hooks/use-update-course-lesson-version';
import type { EditorBoardLesson } from '#/lib/admin-schemas';
import type { VersionChipProps } from './version-chip';

/**
 * The version chip of one lesson on one course's card. `course` is the course
 * whose board the card is on, also where the module is borrowed: the version is
 * that course's own.
 */
export function useLessonVersionChip(
  course: { id: number; name: string },
  lesson: EditorBoardLesson,
): VersionChipProps {
  const openUpdate = useSetAtom(updateLessonVersionAtom);
  const isPending = useIsUpdatingCourseLesson(course.id, lesson.id);
  return {
    version: lesson.version,
    disciplineVersion: lesson.disciplineVersion,
    isPending,
    onUpdate: () =>
      openUpdate({
        courseId: course.id,
        courseName: course.name,
        lessonId: lesson.id,
        lessonName: lesson.name,
        from: lesson.version,
        to: lesson.disciplineVersion,
        contentUpdatedAt: lesson.contentUpdatedAt,
      }),
  };
}
