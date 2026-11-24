import type { EditorBoardLesson } from '#/lib/admin-schemas';
import { LessonCard } from './lesson-card';
import { useLessonVersionChip } from './use-lesson-version-chip';

/** One lesson of a borrowed module: see `BorrowedLessonList`. */
export const BorrowedLessonCardContainer = ({
  course,
  lesson,
  posterUrl,
  alsoIn,
}: {
  /** The course borrowing the module. */
  course: { id: number; name: string };
  lesson: EditorBoardLesson;
  posterUrl?: string | null;
  alsoIn?: string[];
}) => {
  const version = useLessonVersionChip(course, lesson);
  return (
    <LessonCard
      lesson={lesson}
      posterUrl={posterUrl}
      alsoIn={alsoIn}
      version={version}
    />
  );
};
