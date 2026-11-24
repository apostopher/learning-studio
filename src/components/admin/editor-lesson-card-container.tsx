import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSetAtom } from 'jotai';
import { toast } from 'sonner';
import { playLessonAtom } from '#/atoms/admin';
import { useUnlinkLesson } from '#/data-hooks/use-unlink-lesson';
import { useUpdateEditorLessonConfig } from '#/data-hooks/use-update-editor-lesson-config';
import type { EditorBoardLesson, EditorBoardModule } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { lessonDndId } from '#/lib/dnd-ids';
import { EditorLessonQuickshotContainer } from './editor-lesson-quickshot-container';
import { LessonCard } from './lesson-card';
import { lessonAccess, removeLessonLabel } from './lesson-card-labels';
import { useLessonVersionChip } from './use-lesson-version-chip';

/**
 * A lesson already placed in a module, made sortable inside the editor's
 * shared DndContext, carrying the controls that act on it.
 *
 * **Remove from module** deletes the PLACEMENT. The lesson stays in the
 * library and in every other course teaching it, and dragging it back from
 * the library undoes it. Low stakes, so no confirmation — a dialog in front
 * of a reversible act only trains people to dismiss dialogs. Deleting the
 * lesson itself is not offered here: that lives on the library card only.
 *
 * There is no Edit: what a lesson IS is edited in Disciplines, and this course
 * takes a newer version of it through the version chip.
 *
 * Otherwise this card is the SAME card the per-course board draws — poster,
 * play tile, eye, padlock, quickshot and version chips — down to sharing
 * `LessonCard` and `LessonQuickshot`. The remove control is the one thing it
 * adds, because a placement is only undone here. Two boards showing the same
 * lesson two different ways was the thing to fix, not a difference worth
 * keeping.
 */
export const EditorLessonCardContainer = ({
  lesson,
  module: mod,
  courseId,
  courseName,
  posterUrl,
  alsoIn,
}: {
  lesson: EditorBoardLesson;
  /**
   * The whole module, not just its id and name: the padlock depends on what
   * the module allows, and dnd needs the id. Mirrors
   * `SortableLessonCard`, which takes it for the same reason.
   */
  module: EditorBoardModule;
  courseId: number;
  /** Named by the dialog the version chip opens. */
  courseName: string;
  /** Poster frame for this lesson's video, when its provider exposes one. */
  posterUrl?: string | null;
  /**
   * Names of the OTHER modules in this course that also hold this lesson,
   * already filtered by the module container so this card never lists its
   * own module. See `duplicateLessonNotes`.
   */
  alsoIn?: string[];
}) => {
  const moduleId = mod.id;
  const moduleName = mod.name;
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
    data: { type: 'lesson', lessonId: lesson.id, moduleId, courseId },
  });

  const unlinkLesson = useUnlinkLesson();
  const setPlayLesson = useSetAtom(playLessonAtom);
  // The same save the quickshot chips use, so the eye, the padlock and the
  // chips share one optimistic cache write and one rollback path.
  const updateConfig = useUpdateEditorLessonConfig();
  const version = useLessonVersionChip(
    { id: courseId, name: courseName },
    lesson,
  );

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
        posterUrl={posterUrl}
        alsoIn={alsoIn}
        dragHandleProps={{ ...attributes, ...listeners }}
        visibility={{
          onToggle: () =>
            updateConfig.mutate({
              lessonId: lesson.id,
              patch: { isAvailable: !lesson.isAvailable },
            }),
          isPending: updateConfig.isPending,
        }}
        remove={{
          label: removeLessonLabel(lesson.name, moduleName),
          onClick: () =>
            unlinkLesson.mutate(
              { moduleId, lessonId: lesson.id },
              { onError: (error) => toast.error(error.message) },
            ),
          isPending: unlinkLesson.isPending,
        }}
        access={lessonAccess(
          lesson,
          mod,
          (patch) => updateConfig.mutate({ lessonId: lesson.id, patch }),
          updateConfig.isPending,
        )}
        // With the column's course: the rail shows several courses and the
        // same lesson may sit in two of them, and the preview resolves
        // playback for the lesson IN one named course.
        onPlay={
          lesson.isConfigured
            ? () => setPlayLesson({ lessonId: lesson.id, courseId })
            : undefined
        }
        quickshotSlot={<EditorLessonQuickshotContainer lesson={lesson} />}
        version={version}
      />
    </div>
  );
};
