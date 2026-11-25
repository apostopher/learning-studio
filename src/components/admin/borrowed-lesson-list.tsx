import type { EditorBoardLesson } from '#/lib/admin-schemas';
import { LessonCard } from './lesson-card';

/**
 * The lessons of a BORROWED module.
 *
 * No `useSortable`, no remove, no settings: those all edit the module, which
 * belongs to its owner. The version chip is the borrowing course's own, which
 * may differ from the owner's. Not the same card component with the handlers
 * left off — `EditorLessonCardContainer` registers a dnd sortable
 * unconditionally (hooks cannot be conditional), and a registered sortable
 * that refuses every drop is a control that looks live and is not.
 */
export const BorrowedLessonList = ({
  ownerName,
  lessons,
  posters,
  alsoIn,
}: {
  /** The course OWNING the module: its lessons are added and removed there. */
  ownerName: string;
  lessons: readonly EditorBoardLesson[];
  posters?: Record<number, string | null>;
  alsoIn?: ReadonlyMap<number, string[]>;
}) => (
  <>
    {lessons.map((lesson) => (
      <LessonCard
        key={lesson.id}
        lesson={lesson}
        posterUrl={posters?.[lesson.id]}
        alsoIn={alsoIn?.get(lesson.id)}
        version={{
          version: lesson.version,
          disciplineVersion: lesson.disciplineVersion,
          editedIn: ownerName,
        }}
      />
    ))}
  </>
);
