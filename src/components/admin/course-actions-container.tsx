import { useSetAtom } from 'jotai';
import { BrainCircuit, Pencil, Trash2 } from 'lucide-react';

import {
  deleteCourseAtom,
  editCourseAtom,
  trainCourseAtom,
} from '@/atoms/admin';
import type { BoardCourse } from '@/lib/admin-schemas';
import { TooltipIconButton } from '../ui/tooltip-icon-button';
import { CourseEmbeddingsDialogContainer } from './course-embeddings-dialog-container';
import { CourseStaffContainer } from './course-staff-container';
import { CreateModuleDialogContainer } from './create-module-dialog-container';
import { DeleteCourseDialogContainer } from './delete-course-dialog-container';
import { EditCourseDialogContainer } from './edit-course-dialog-container';

/** Course-level action toolbar: add module, staff, AI training, edit course, delete course. */
export const CourseActionsContainer = ({ course }: { course: BoardCourse }) => {
  const setEditCourse = useSetAtom(editCourseAtom);
  const setDeleteCourse = useSetAtom(deleteCourseAtom);
  const setTrainCourse = useSetAtom(trainCourseAtom);

  return (
    <div className="flex items-center gap-1">
      <CreateModuleDialogContainer courseId={course.id} />
      <CourseStaffContainer course={course} />
      <TooltipIconButton
        label="AI training"
        onClick={() => setTrainCourse({ id: course.id, name: course.name })}
      >
        <BrainCircuit className="h-4 w-4" aria-hidden="true" />
      </TooltipIconButton>
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
      <TooltipIconButton
        label="Delete course"
        variant="danger"
        onClick={() => setDeleteCourse({ id: course.id, name: course.name })}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </TooltipIconButton>

      <CourseEmbeddingsDialogContainer />
      <EditCourseDialogContainer />
      <DeleteCourseDialogContainer />
    </div>
  );
};
