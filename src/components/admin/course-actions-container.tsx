import { useSetAtom } from 'jotai';
import { Pencil, Trash2 } from 'lucide-react';

import { deleteCourseAtom, editCourseAtom } from '@/atoms/admin';
import type { BoardCourse } from '@/lib/admin-schemas';
import { CreateModuleDialogContainer } from './create-module-dialog-container';
import { DeleteCourseDialogContainer } from './delete-course-dialog-container';
import { EditCourseDialogContainer } from './edit-course-dialog-container';
import { TooltipIconButton } from './tooltip-icon-button';

/** Course-level action toolbar: add module, edit course, delete course. */
export const CourseActionsContainer = ({ course }: { course: BoardCourse }) => {
  const setEditCourse = useSetAtom(editCourseAtom);
  const setDeleteCourse = useSetAtom(deleteCourseAtom);

  return (
    <div className="flex items-center gap-1">
      <CreateModuleDialogContainer courseId={course.id} />
      <TooltipIconButton
        label="Edit course"
        onClick={() =>
          setEditCourse({
            id: course.id,
            name: course.name,
            description: course.description,
            imageUrl: course.imageUrl,
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

      <EditCourseDialogContainer />
      <DeleteCourseDialogContainer />
    </div>
  );
};
