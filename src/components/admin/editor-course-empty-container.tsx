import { useDroppable } from '@dnd-kit/core';
import { useSetAtom } from 'jotai';
import { createModuleTargetAtom } from '#/atoms/admin';
import { courseDndId } from '#/lib/dnd-ids';
import { DropZoneEmpty } from './drop-zone-empty';
import { PaneActionButton } from './pane-action-button';

/**
 * What a course column shows before it has any modules.
 *
 * Registered as a droppable it will always refuse. That is deliberate, and it
 * is the same argument the discipline columns make: a lesson can only live in
 * a MODULE, so an empty course has nowhere to put one — and the only way to
 * say "not here, and here is why" is to be a real target that `resolveDrop`
 * refuses by name. Left as a dead region, dragging a lesson onto an empty
 * course would spring back with no explanation, which reads as a bug.
 *
 * The button is the way out of the state, right where the reader hits it,
 * rather than making them find the subheader above.
 */
export const EditorCourseEmptyContainer = ({
  course,
}: {
  course: { id: number; name: string };
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: courseDndId(course.id),
    data: { type: 'course', courseId: course.id },
  });
  const openCreateModule = useSetAtom(createModuleTargetAtom);

  return (
    <div ref={setNodeRef}>
      <DropZoneEmpty
        // Reserved height, so an empty course reads as space waiting to be
        // filled rather than a column that failed to load — and so there is a
        // target big enough to aim a dragged lesson at.
        className="min-h-40"
        message={`${course.name} has no modules yet. Lessons live inside modules, so create one — then drag lessons into it from the library.`}
        isOver={isOver}
        action={
          <PaneActionButton
            label="Create module"
            onClick={() =>
              openCreateModule({ id: course.id, name: course.name })
            }
            className="px-3 py-2 text-xs"
          />
        }
      />
    </div>
  );
};
