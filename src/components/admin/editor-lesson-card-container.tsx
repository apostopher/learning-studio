import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSetAtom } from 'jotai';
import { toast } from 'sonner';
import { deleteLessonAtom } from '#/atoms/admin';
import { useOrgLibrary } from '#/data-hooks/use-org-library';
import { useUnlinkLesson } from '#/data-hooks/use-unlink-lesson';
import type { EditorBoardLesson } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { lessonDndId } from '#/lib/dnd-ids';
import { LessonCard } from './lesson-card';
import {
  DELETE_UNAVAILABLE_REASON,
  findLibraryCourseCount,
  removeLessonLabel,
} from './lesson-card-labels';

/**
 * A lesson already placed in a module, made sortable inside the editor's
 * shared DndContext, carrying the two destructive controls that act on it.
 *
 * The two are deliberately not siblings in meaning:
 *
 * - **Remove from module** deletes the PLACEMENT. The lesson stays in the
 *   library and in every other course teaching it, and dragging it back from
 *   the library undoes it. Low stakes, so no confirmation — a dialog in front
 *   of a reversible act only trains people to dismiss dialogs.
 * - **Delete lesson everywhere** deletes the LESSON, taking it out of every
 *   course at once and cascading learner progress. It opens the confirmation
 *   through `deleteLessonAtom`, which carries the course count so the dialog
 *   can name what is about to be lost.
 */
export const EditorLessonCardContainer = ({
  lesson,
  moduleId,
  moduleName,
  courseId,
}: {
  lesson: EditorBoardLesson;
  moduleId: number;
  /** Named in the remove control's accessible name — see `LessonCard`. */
  moduleName: string;
  courseId: number;
}) => {
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
    data: { type: 'lesson', lessonId: lesson.id, moduleId, courseId },
  });

  const unlinkLesson = useUnlinkLesson();
  const setDeleteLesson = useSetAtom(deleteLessonAtom);
  /**
   * Read here rather than threaded down from `EditorContainer` through the
   * course column and the module: the only thing this card needs from the
   * library is one number, and the query is already in cache — the editor
   * cannot render a card at all until it has loaded. Two components between
   * here and there would otherwise carry a prop neither of them uses.
   */
  const { data: library } = useOrgLibrary();
  const courseCount = findLibraryCourseCount(library, lesson.id);

  return (
    <div
      ref={setNodeRef}
      // Only animate the shift while sorting: after the drop the optimistic
      // update has already placed the card in its final slot, so a transition
      // would slide it from a position it never really held.
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isSorting ? transition : undefined,
      }}
      className={cn(isDragging && 'opacity-40')}
    >
      <LessonCard
        lesson={lesson}
        dragHandleProps={{ ...attributes, ...listeners }}
        remove={{
          label: removeLessonLabel(lesson.name, moduleName),
          onClick: () =>
            unlinkLesson.mutate(
              { moduleId, lessonId: lesson.id },
              { onError: (error) => toast.error(error.message) },
            ),
          isPending: unlinkLesson.isPending,
        }}
        // Offered only once the count is known. The confirmation's whole job
        // is to state the blast radius, and a dialog that guessed at it —
        // or fell back to "1 course" for a lesson taught by five — would be
        // worse than no button. Until then the control is inert and says why,
        // rather than silently not being there.
        onDelete={
          courseCount == null
            ? undefined
            : () =>
                setDeleteLesson({
                  id: lesson.id,
                  name: lesson.name,
                  courseCount,
                  // This card HAS a remove control, so the confirmation may
                  // point at it — by the same name the button wears.
                  removeControlLabel: removeLessonLabel(
                    lesson.name,
                    moduleName,
                  ),
                })
        }
        deleteUnavailableReason={DELETE_UNAVAILABLE_REASON}
      />
    </div>
  );
};
