import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useAtom } from 'jotai';
import { expandedEditorModuleIdsAtom } from '#/atoms/admin';
import type { CourseBoard } from '#/lib/admin-schemas';
import { moduleDndId } from '#/lib/dnd-ids';
import { CourseColumn } from './course-column';
import { EditorModuleContainer } from './editor-module-container';

/**
 * One course in the rail, with its modules as a vertical sortable list.
 *
 * The accordion's open state is read from a Jotai atom rather than left to
 * `Accordion.Root`, because the editor has to be able to open a module the
 * admin never clicked: a lesson dragged onto a collapsed module needs the
 * panel open before it has a slot to land in. The atom holds module ids for
 * the whole org — module ids are unique across courses — so this column
 * filters it down to its own before handing it over, and folds its answer
 * back in without disturbing the other courses' entries.
 */
export const EditorCourseColumnContainer = ({
  courseBoard,
}: {
  courseBoard: CourseBoard;
}) => {
  const [expandedModuleIds, setExpandedModuleIds] = useAtom(
    expandedEditorModuleIdsAtom,
  );
  const { course, modules } = courseBoard;
  const ownIds = new Set(modules.map((m) => m.id));

  return (
    <CourseColumn
      course={course}
      expandedModuleIds={expandedModuleIds.filter((id) => ownIds.has(id))}
      onExpandedModuleIdsChange={(next) => {
        setExpandedModuleIds((prev) => [
          ...prev.filter((id) => !ownIds.has(id)),
          ...next,
        ]);
      }}
    >
      <SortableContext
        items={modules.map((m) => moduleDndId(m.id))}
        strategy={verticalListSortingStrategy}
      >
        {modules.map((mod) => (
          <EditorModuleContainer
            key={mod.id}
            module={mod}
            courseId={course.id}
          />
        ))}
      </SortableContext>
    </CourseColumn>
  );
};
