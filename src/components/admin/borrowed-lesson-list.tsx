import type { EditorBoardLesson } from '#/lib/admin-schemas';
import { LessonCard } from './lesson-card';

/**
 * The lessons of a BORROWED module, drawn read-only.
 *
 * No `useSortable`, no remove, no delete: those all edit the module's
 * content, which belongs to its owner. Not the same card component with the
 * handlers left off — `EditorLessonCardContainer` registers a dnd sortable
 * unconditionally (hooks cannot be conditional), and a registered sortable
 * that refuses every drop is a control that looks live and is not.
 */
export const BorrowedLessonList = ({
  lessons,
  posters,
  alsoIn,
}: {
  lessons: readonly EditorBoardLesson[];
  posters?: Record<number, string | null>;
  alsoIn: ReadonlyMap<number, string[]>;
}) => (
  <>
    {lessons.map((lesson) => (
      <LessonCard
        key={lesson.id}
        lesson={lesson}
        posterUrl={posters?.[lesson.id]}
        alsoIn={alsoIn.get(lesson.id)}
      />
    ))}
  </>
);
