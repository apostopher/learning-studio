import type { EditorBoardLesson } from '#/lib/admin-schemas';
import { BorrowedLessonCardContainer } from './borrowed-lesson-card-container';

/**
 * The lessons of a BORROWED module.
 *
 * No `useSortable`, no remove, no settings: those all edit the module, which
 * belongs to its owner. The version chip is the one live control, because the
 * version is the borrowing course's own. Not the same card component with the
 * handlers left off — `EditorLessonCardContainer` registers a dnd sortable
 * unconditionally (hooks cannot be conditional), and a registered sortable
 * that refuses every drop is a control that looks live and is not.
 */
export const BorrowedLessonList = ({
  course,
  lessons,
  posters,
  alsoIn,
}: {
  /** The course BORROWING the module, whose board this is. */
  course: { id: number; name: string };
  lessons: readonly EditorBoardLesson[];
  posters?: Record<number, string | null>;
  alsoIn?: ReadonlyMap<number, string[]>;
}) => (
  <>
    {lessons.map((lesson) => (
      <BorrowedLessonCardContainer
        key={lesson.id}
        course={course}
        lesson={lesson}
        posterUrl={posters?.[lesson.id]}
        alsoIn={alsoIn?.get(lesson.id)}
      />
    ))}
  </>
);
