import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSetAtom } from 'jotai';
import {
  configureLessonIdAtom,
  deleteLessonAtom,
  playLessonIdAtom,
} from '#/atoms/admin';
import { useOrgLibrary } from '#/data-hooks/use-org-library';
import type { BoardLesson, BoardModule } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { lessonDndId } from '#/lib/dnd-ids';
import { LessonCard } from './lesson-card';
import {
  DELETE_UNAVAILABLE_REASON,
  findLibraryCourseCount,
} from './lesson-card-labels';
import { LessonQuickshotContainer } from './lesson-quickshot-container';

export const SortableLessonCard = ({
  courseId,
  lesson,
  module: mod,
  posterUrl,
}: {
  courseId: number;
  lesson: BoardLesson;
  /** The whole module, not just its id: the quickshot's access chip depends
   *  on what the module allows, and dnd needs the id. */
  module: BoardModule;
  posterUrl?: string | null;
}) => {
  const moduleId = mod.id;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isSorting,
    isDragging,
  } = useSortable({
    id: lessonDndId(lesson.id),
    data: { type: 'lesson', lessonId: lesson.id, moduleId },
  });
  const setConfigureLessonId = useSetAtom(configureLessonIdAtom);
  const setDeleteLesson = useSetAtom(deleteLessonAtom);
  const setPlayLessonId = useSetAtom(playLessonIdAtom);
  /**
   * Deleting a lesson ends it in EVERY course, so the confirmation has to name
   * how many lose it — and this board, being one course's board, does not know.
   * The org library is the only place that count is computed, so this card asks
   * for it the same way the knowledge editor's card does.
   *
   * Passing `0` instead was the cheap option and is not available: the delete
   * confirmation's zero branch reads "is not in any course yet", which is a
   * flat lie about a lesson currently sitting in a module on this very board.
   * `null` (library not loaded, or the lesson missing from it) withholds the
   * control rather than guessing — see `findLibraryCourseCount`.
   */
  const { data: library } = useOrgLibrary();
  const courseCount = findLibraryCourseCount(library, lesson.id);

  return (
    <div
      ref={setNodeRef}
      // Only animate the shift while sorting. After drop, the optimistic reorder
      // already places the lesson in its final slot, so suppress the transition
      // to avoid the displaced card sliding oddly.
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isSorting ? transition : undefined,
      }}
      className={cn(isDragging && 'opacity-40')}
    >
      <LessonCard
        lesson={lesson}
        posterUrl={posterUrl}
        dragHandleProps={{ ...attributes, ...listeners }}
        onEdit={() => setConfigureLessonId(lesson.id)}
        onDelete={
          courseCount == null
            ? undefined
            : () =>
                setDeleteLesson({
                  id: lesson.id,
                  name: lesson.name,
                  courseCount,
                  // `null`: this board has no remove control — a lesson's
                  // placement is undone in the knowledge library editor. The
                  // confirmation says so rather than naming a button that is
                  // nowhere on this screen.
                  removeControlLabel: null,
                })
        }
        // Inert-with-a-reason rather than absent while the count loads: a
        // control that vanishes without explanation is the locked state this
        // project does not ship.
        deleteUnavailableReason={DELETE_UNAVAILABLE_REASON}
        onPlay={
          lesson.isConfigured ? () => setPlayLessonId(lesson.id) : undefined
        }
        quickshotSlot={
          <LessonQuickshotContainer
            courseId={courseId}
            lesson={lesson}
            module={mod}
          />
        }
      />
    </div>
  );
};
