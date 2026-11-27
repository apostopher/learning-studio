import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSetAtom } from 'jotai';
import { configureLessonIdAtom, playLessonAtom } from '#/atoms/admin';
import { useSetLessonVisibility } from '#/data-hooks/use-set-lesson-visibility';
import type { BoardLesson, BoardModule } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { lessonDndId } from '#/lib/dnd-ids';
import { LessonCard } from './lesson-card';
import { LessonQuickshotContainer } from './lesson-quickshot-container';

export const SortableLessonCard = ({
  courseId,
  courseName,
  lesson,
  module: mod,
  posterUrl,
}: {
  courseId: number;
  /** Named by the version chip. */
  courseName: string;
  lesson: BoardLesson;
  /** The whole module, not just its id: the eye names the courses sharing
   *  it, and dnd needs the id. */
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
    id: lessonDndId(courseId, lesson.id),
    data: { type: 'lesson', lessonId: lesson.id, moduleId },
  });
  const setConfigureLessonId = useSetAtom(configureLessonIdAtom);
  const setPlayLesson = useSetAtom(playLessonAtom);
  const setVisibility = useSetLessonVisibility();

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
        visibility={{
          onToggle: () =>
            setVisibility.mutate({
              courseId,
              lessonId: lesson.id,
              isVisible: !lesson.isAvailable,
            }),
          isPending: setVisibility.isPending,
          sharedWith: mod.otherCourseCount,
        }}
        onConfigure={() => setConfigureLessonId(lesson.id)}
        // With the course: the preview resolves playback for the lesson IN
        // this course, and this board is one course's board.
        onPlay={
          lesson.isConfigured
            ? () => setPlayLesson({ lessonId: lesson.id, courseId })
            : undefined
        }
        quickshotSlot={
          <LessonQuickshotContainer courseId={courseId} lesson={lesson} />
        }
        version={{
          version: lesson.version,
          disciplineVersion: lesson.disciplineVersion,
          editedIn: courseName,
        }}
      />
    </div>
  );
};
