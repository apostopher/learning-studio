import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Link } from '@tanstack/react-router';
import { useAtom, useSetAtom } from 'jotai';
import { Settings2 } from 'lucide-react';
import {
  createModuleTargetAtom,
  deleteCourseAtom,
  editCourseAtom,
  expandedEditorModuleIdsAtom,
} from '#/atoms/admin';
import { useLessonPosters } from '#/data-hooks/use-lesson-posters';
import type { EditorCourseBoard } from '#/lib/admin-schemas';
import { moduleDndId } from '#/lib/dnd-ids';
import { CourseColumn } from './course-column';
import { CourseColumnActions } from './course-column-actions';
import { EditorCourseEmptyContainer } from './editor-course-empty-container';
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
  canEditCourse = false,
  canDeleteCourse = false,
}: {
  courseBoard: EditorCourseBoard;
  /** `course:update` — org-level, so the route can answer it. */
  canEditCourse?: boolean;
  /** `course:delete` — likewise. */
  canDeleteCourse?: boolean;
}) => {
  const [expandedModuleIds, setExpandedModuleIds] = useAtom(
    expandedEditorModuleIdsAtom,
  );
  const { course, modules } = courseBoard;
  const ownIds = new Set(modules.map((m) => m.id));
  /**
   * One posters request per COURSE column, not per lesson card — the endpoint
   * answers for a whole course at once, and a card-level query would be an
   * N+1 across the rail.
   *
   * `/api/admin/courses/:id/lesson-posters` is guarded by
   * `requireCoursePermission(courseId, 'structure', 'read')`, which a
   * discipline-only SME does not hold. That is a soft failure by design: the
   * query errors, `posters` stays undefined, and `LessonVideoTile` falls back
   * to its own background — the same tile the board drew before posters
   * existed. A poster is decoration; nothing about the card depends on it.
   */
  const { data: posters } = useLessonPosters(course.id);
  const openCreateModule = useSetAtom(createModuleTargetAtom);
  const openEditCourse = useSetAtom(editCourseAtom);
  const openDeleteCourse = useSetAtom(deleteCourseAtom);

  return (
    <CourseColumn
      course={course}
      actions={
        <CourseColumnActions
          courseName={course.name}
          canEditCourse={canEditCourse}
          canDeleteCourse={canDeleteCourse}
          onAddModule={() =>
            openCreateModule({ id: course.id, name: course.name })
          }
          onEditCourse={() => openEditCourse(course)}
          onDeleteCourse={() =>
            openDeleteCourse({ id: course.id, name: course.name })
          }
        />
      }
      // The way across to the other half of the product. This pane composes
      // courses out of existing lessons; what a lesson IS — video, material,
      // quiz, gates — and a course's own modules, staff, persona and news are
      // configured on that course's board. Per-column rather than one global
      // link because the destination is course-scoped and this is the only
      // place the course id is to hand.
      configureSlot={
        <Link
          to="/admin/$courseId/editor"
          params={{ courseId: String(course.id) }}
          aria-label={`Configure ${course.name}`}
          title={`Configure ${course.name}`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" />
        </Link>
      }
      emptySlot={
        modules.length === 0 ? (
          <EditorCourseEmptyContainer course={course} />
        ) : undefined
      }
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
            posters={posters}
          />
        ))}
      </SortableContext>
    </CourseColumn>
  );
};
