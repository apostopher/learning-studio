import { useSetAtom } from 'jotai';
import { createModuleTargetAtom } from '#/atoms/admin';
import { DropZoneEmpty } from './drop-zone-empty';
import { PaneActionButton } from './pane-action-button';

/**
 * What a course column shows before it has any modules.
 *
 * The drop target is the whole column (`EditorCourseColumnContainer`); this is
 * the visible place to aim at inside it, and the button is the way out of the
 * state, right where the reader hits it, rather than making them find the
 * subheader above.
 */
export const EditorCourseEmptyContainer = ({
  course,
  hasBorrowedModules = false,
  isOver = false,
}: {
  course: { id: number; name: string };
  /**
   * The course holds modules the rail does not draw (the flagship's, see
   * `railModules`), so "no modules yet" would be false — it has none of its
   * OWN.
   */
  hasBorrowedModules?: boolean;
  /** Whether a drag is over the column. */
  isOver?: boolean;
}) => {
  const openCreateModule = useSetAtom(createModuleTargetAtom);

  return (
    <DropZoneEmpty
      // Reserved height, so an empty course reads as space waiting to be
      // filled rather than a column that failed to load — and so there is a
      // target big enough to aim a dragged lesson at.
      className="min-h-40"
      message={`${course.name} has no modules${hasBorrowedModules ? ' of its own' : ''} yet. Drag a module or lesson here from Disciplines to start one, or create one.`}
      isOver={isOver}
      action={
        <PaneActionButton
          label="Create module"
          onClick={() => openCreateModule({ id: course.id, name: course.name })}
          className="px-3 py-2 text-xs"
        />
      }
    />
  );
};
