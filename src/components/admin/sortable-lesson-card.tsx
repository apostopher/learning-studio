import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSetAtom } from 'jotai';
import {
  configureLessonIdAtom,
  deleteLessonAtom,
  playLessonIdAtom,
} from '@/atoms/admin';
import type { BoardLesson } from '@/lib/admin-schemas';
import { cn } from '@/lib/cn';
import { lessonDndId } from '@/lib/dnd-ids';
import { LessonCard } from './lesson-card';

export const SortableLessonCard = ({
  lesson,
  moduleId,
}: {
  lesson: BoardLesson;
  moduleId: number;
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
    data: { type: 'lesson', lessonId: lesson.id, moduleId },
  });
  const setConfigureLessonId = useSetAtom(configureLessonIdAtom);
  const setDeleteLesson = useSetAtom(deleteLessonAtom);
  const setPlayLessonId = useSetAtom(playLessonIdAtom);

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
        dragHandleProps={{ ...attributes, ...listeners }}
        onEdit={() => setConfigureLessonId(lesson.id)}
        onDelete={() => setDeleteLesson({ id: lesson.id, name: lesson.name })}
        onPlay={
          lesson.isConfigured ? () => setPlayLessonId(lesson.id) : undefined
        }
      />
    </div>
  );
};
