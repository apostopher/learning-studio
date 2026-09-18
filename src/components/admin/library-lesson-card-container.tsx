import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSetAtom } from 'jotai';
import { editLibraryLessonIdAtom } from '#/atoms/admin';
import { useDisciplineLessonPosters } from '#/data-hooks/use-discipline-lesson-posters';
import type { LibraryLesson } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { libraryLessonDndId } from '#/lib/dnd-ids';
import { LibraryLessonCard } from './library-lesson-card';

/**
 * A library lesson made sortable inside the editor's shared DndContext.
 *
 * `useSortable`, not `useDraggable`: a discipline's lessons now have an order
 * within their module (or Untitled), so this card must also be a droppable
 * among its siblings — the same double duty `EditorLessonCardContainer` and
 * `LibraryModuleContainer` carry. Dragging one into a course still LINKS it
 * rather than moving a placement; `resolveDrop` tells the two apart by where
 * the drop lands, not by how the drag started.
 */
export const LibraryLessonCardContainer = ({
  lesson,
  disciplineId,
  boxId,
  sortable = true,
}: {
  lesson: LibraryLesson;
  /**
   * The column this card came from. Carried in the drag data so collision
   * detection can leave that one column out of the candidate set: releasing a
   * card back where it started is "never mind", and answering it with a red
   * refusal toast would make the universal cancel gesture look like an error.
   */
  disciplineId: number;
  /**
   * The BUCKET this card is rendered from — a discipline module's id, or
   * null for an Untitled group — named by the container rendering it, never
   * read off `lesson.disciplineModuleId`. The editor's stage-two collision
   * filters pick "the lessons of the box the pointer is inside" by this
   * field, and the payload column can be stale (its module was deleted; the
   * payload has already re-bucketed the card under Untitled) — the same
   * walk-the-buckets rule `resolveDrop` and `moveLessonInLibrary` follow.
   */
  boxId: number | null;
  /**
   * False for the org-level Untitled column: those cards have no order to
   * keep (`resolveDrop` refuses every library-side target for a lesson with
   * no discipline), but as sortables their siblings still animated a reorder
   * the drop would refuse. Off, the card registers no droppable among its
   * siblings, so nothing displaces — while the DRAG stays on: the card must
   * still link into a course.
   */
  sortable?: boolean;
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
    id: libraryLessonDndId(lesson.id),
    data: {
      type: 'library-lesson',
      lessonId: lesson.id,
      disciplineId,
      disciplineModuleId: boxId,
    },
    disabled: { draggable: false, droppable: !sortable },
  });
  const editLesson = useSetAtom(editLibraryLessonIdAtom);
  // One entry per shelf, shared by every card on it (TanStack dedupes the
  // request); read here rather than threaded down three containers because
  // the card container already knows its shelf. Unknown or refused posters
  // leave the tile on its placeholder — decoration, never a dependency.
  const { data: posters } = useDisciplineLessonPosters(disciplineId);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isSorting ? transition : undefined,
      }}
      className={cn(isDragging && 'opacity-40')}
    >
      <LibraryLessonCard
        lesson={lesson}
        dragHandleProps={{ ...attributes, ...listeners }}
        // `LibraryLessonCard` has accepted this prop all along and nothing
        // passed it, so the pencil it guards never rendered — the library had
        // no way to edit a lesson at all. Offered to everyone who can see the
        // card: authority over a lesson follows its DISCIPLINE, which the
        // router context cannot answer for any particular lesson, so the
        // server decides and the mutation turns its 403 into a sentence.
        onEdit={() => editLesson(lesson.id)}
        posterUrl={posters?.[String(lesson.id)]}
      />
    </div>
  );
};
