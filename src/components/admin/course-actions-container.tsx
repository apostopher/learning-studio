import { useSetAtom } from 'jotai';
import { BrainCircuit, Pencil, Trash2 } from 'lucide-react';

// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its component test.
import {
  deleteCourseAtom,
  editCourseAtom,
  trainCourseAtom,
} from '#/atoms/admin';
import type { BoardCourse } from '#/lib/admin-schemas';
import { TooltipIconButton } from '../ui/tooltip-icon-button';
import { CourseEmbeddingsDialogContainer } from './course-embeddings-dialog-container';
import { CourseStaffContainer } from './course-staff-container';
import { CreateModuleDialogContainer } from './create-module-dialog-container';
import { DeleteCourseDialogContainer } from './delete-course-dialog-container';
import { EditCourseDialogContainer } from './edit-course-dialog-container';

/**
 * Which org-level course controls this actor may use.
 *
 * Every one of these is guarded org-level, so none has a course-scoped
 * fallback: a subject expert reaches this toolbar by design and holds none of
 * them. Resolved in the route from router context — the only place that holds
 * global permissions — and passed in, rather than re-derived here.
 */
export interface CourseToolbarCapabilities {
  /** `course:update` — renaming the course, its description and cover. */
  canEditCourse: boolean;
  /** `course:delete` — destroying the course row. */
  canDeleteCourse: boolean;
  /** The RAG corpus is org-level AI config behind `requireAdmin` (spec §4). */
  canTrainCourse: boolean;
}

/**
 * Course-level action toolbar: add module, staff, AI training, edit course,
 * delete course.
 *
 * "Add module" is course-scoped `structure:create`, which staff DO hold and
 * which no client-side check can answer — the request is the check, as
 * everywhere else on this board. The other three are org-level and are hidden
 * outright for someone who cannot use them: this task sends subject experts to
 * this editor by design, and a control guaranteed to 403 is worse than no
 * control. Nothing is said in the gap where a destructive action would have
 * been — there is no action to explain, and the two sections they CAN use
 * (modules, staff) are still there.
 */
export const CourseActionsContainer = ({
  course,
  capabilities,
}: {
  course: BoardCourse;
  capabilities: CourseToolbarCapabilities;
}) => {
  const setEditCourse = useSetAtom(editCourseAtom);
  const setDeleteCourse = useSetAtom(deleteCourseAtom);
  const setTrainCourse = useSetAtom(trainCourseAtom);

  return (
    <div className="flex items-center gap-1">
      <CreateModuleDialogContainer courseId={course.id} />
      <CourseStaffContainer course={course} />
      {capabilities.canTrainCourse && (
        <TooltipIconButton
          label="AI training"
          onClick={() => setTrainCourse({ id: course.id, name: course.name })}
        >
          <BrainCircuit className="h-4 w-4" aria-hidden="true" />
        </TooltipIconButton>
      )}
      {capabilities.canEditCourse && (
        <TooltipIconButton
          label="Edit course"
          onClick={() =>
            setEditCourse({
              id: course.id,
              name: course.name,
              description: course.description,
              imageUrlAvif: course.imageUrlAvif,
              imageUrlWebp: course.imageUrlWebp,
            })
          }
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </TooltipIconButton>
      )}
      {capabilities.canDeleteCourse && (
        <TooltipIconButton
          label="Delete course"
          variant="danger"
          onClick={() => setDeleteCourse({ id: course.id, name: course.name })}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </TooltipIconButton>
      )}

      {capabilities.canTrainCourse && <CourseEmbeddingsDialogContainer />}
      {capabilities.canEditCourse && <EditCourseDialogContainer />}
      {capabilities.canDeleteCourse && <DeleteCourseDialogContainer />}
    </div>
  );
};
