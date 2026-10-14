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
import { duplicateLessonNotes } from '#/lib/duplicate-lessons';
import { flagshipRailNote, railModules } from '#/lib/flagship-course';
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
 * the whole org — expanded state is SHARED across every rail a module
 * appears on (a remixed module sits on two rails with the same id, and both
 * copies render identically), so keying by id alone is enough — this column
 * filters it down to its own before handing it over, and folds its answer
 * back in without disturbing the other courses' entries.
 */
export const EditorCourseColumnContainer = ({
  courseBoard,
  canEditCourse = false,
  canDeleteCourse = false,
  flagship = null,
}: {
  courseBoard: EditorCourseBoard;
  /** `course:update` — org-level, so the route can answer it. */
  canEditCourse?: boolean;
  /** `course:delete` — likewise. */
  canDeleteCourse?: boolean;
  /**
   * The org's flagship course (`#/lib/flagship-course`), or null when none
   * carries the slug. Threaded in rather than looked up here: the editor
   * already holds the whole board and finds it once for the rail, so every
   * column reuses that one answer instead of re-scanning the board itself.
   */
  flagship?: { id: number; name: string } | null;
}) => {
  const [expandedModuleIds, setExpandedModuleIds] = useAtom(
    expandedEditorModuleIdsAtom,
  );
  const { course, modules } = courseBoard;
  /**
   * Lessons THIS course teaches more than once, across its own modules —
   * whole-course remixing makes it common that a remixer's own module
   * already teaches a lesson a borrowed module also teaches. Computed once
   * per column rather than per module, since it needs every module's
   * lessons to notice a lesson repeated across them.
   */
  const alsoIn = duplicateLessonNotes(modules);
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

  /**
   * What this column DRAWS: every module except those borrowed from the
   * flagship, which every course holds (see `railModules`). The sortable,
   * the accordion and the empty state all run on this list; the reorder
   * path runs on the full column in the cache, which keeps the hidden
   * flagship block intact (see `railModules`' doc comment).
   */
  const shown = railModules(courseBoard, flagship?.id ?? null);
  const shownIds = new Set(shown.map((m) => m.id));
  const hidesBorrowed = shown.length < modules.length;

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
      note={flagshipRailNote(flagship, courseBoard)}
      emptySlot={
        shown.length === 0 ? (
          <EditorCourseEmptyContainer
            course={course}
            hasBorrowedModules={hidesBorrowed}
          />
        ) : undefined
      }
      expandedModuleIds={expandedModuleIds.filter((id) => shownIds.has(id))}
      onExpandedModuleIdsChange={(next) => {
        setExpandedModuleIds((prev) => [
          ...prev.filter((id) => !shownIds.has(id)),
          ...next,
        ]);
      }}
    >
      <SortableContext
        items={shown.map((m) => moduleDndId(course.id, m.id))}
        strategy={verticalListSortingStrategy}
      >
        {shown.map((mod) => (
          <EditorModuleContainer
            key={mod.id}
            module={mod}
            courseId={course.id}
            posters={posters}
            alsoIn={alsoIn}
          />
        ))}
      </SortableContext>
    </CourseColumn>
  );
};
